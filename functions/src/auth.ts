import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v2";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { solapiApiKey, solapiApiSecret, SITE_URL, KAKAO_TEMPLATES, ADMIN_EMAILS } from "./config";
import { assertAdmin, idToEmail, sendAlimtalk, sendSms, db, auth } from "./utils";
import { syncFeedName } from "./feed-events";

// ─────────────────────────────────────────────────────────
// claimAdminRole — 부트스트랩용 self-bootstrap claim 부여.
//   - 이미 token.admin === true 면 그대로 ok (멱등).
//   - 그 외에는 ADMIN_EMAILS 에 포함된 이메일로 인증된 사용자만 자기 자신에게 admin claim 부여 가능.
//   - 클라이언트는 호출 후 firebaseUser.getIdToken(true) 로 강제 새로고침해야 claim 반영됨.
// 점진 전환이 끝나 ADMIN_EMAILS 가 비워지면 이 함수도 제거하고,
// 이후 신규 admin 추가는 기존 admin 이 호출하는 별도 onCall 로 옮긴다.
// ─────────────────────────────────────────────────────────
export const claimAdminRole = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  if (request.auth.token.admin === true) {
    return { ok: true, already: true };
  }
  const email = request.auth.token.email ?? "";
  if (!ADMIN_EMAILS.includes(email)) {
    throw new HttpsError("permission-denied", "관리자 이메일이 아닙니다.");
  }
  await auth.setCustomUserClaims(request.auth.uid, { admin: true });
  functions.logger.info("[claimAdminRole] admin claim 부여 완료", { uid: request.auth.uid, email });
  return { ok: true, already: false };
});

// 서비스 가격 정보 (서버 사이드 — site.ts와 동기화 필요)
const SERVICE_PRICING: Record<string, { pricePerMonth: number; agencyFee: number }> = {
  dailykor: { pricePerMonth: 33000, agencyFee: 22000 },
  autovoca: { pricePerMonth: 5000, agencyFee: 0 },
  class5: { pricePerMonth: 15000, agencyFee: 6000 },
  "classcard-middle": { pricePerMonth: 15000, agencyFee: 4000 },
  "vibe-coding": { pricePerMonth: 150000, agencyFee: 0 },
  "great-books": { pricePerMonth: 11000, agencyFee: 0 },
};

/** 구독 종료일 = base(또는 now) 기준 +months개월의 말일. 연장(calcNewEndDate)과 동일 로직. */
function monthsEndDate(currentEndDate: Date | null, months: number, now: Date): Date {
  const base = currentEndDate && currentEndDate > now ? currentEndDate : now;
  return new Date(base.getFullYear(), base.getMonth() + months + 1, 0);
}

function toDateStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Auth 계정 생성 또는 기존 계정 조회. 실패 시 throw. */
async function getOrCreateAuthUser(
  email: string, password: string, displayName: string
): Promise<string> {
  try {
    const user = await auth.createUser({ email, password, displayName });
    return user.uid;
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "auth/email-already-exists") {
      const existing = await auth.getUserByEmail(email);
      return existing.uid;
    }
    throw e;
  }
}

// 학부모 + 자녀 계정 생성 + 가족/구독 생성 + SMS 발송 (승인 시)
// Auth + Firestore를 원자적으로 처리하여 불일치 방지
export const approveSignup = onCall(
  { secrets: [solapiApiKey, solapiApiSecret] },
  async (request) => {
    await assertAdmin(request.auth);

    const { signupId, momsaipackEndDate } = request.data as { signupId: string; momsaipackEndDate?: string };
    const snap = await db.collection("signups").doc(signupId).get();
    if (!snap.exists) throw new HttpsError("not-found", "신청서를 찾을 수 없습니다.");

    const signup = snap.data()!;
    // 이중 승인 방지: 이미 승인된 신청서면 중단 (가족/자녀/구독 중복 생성 차단)
    if (signup.status === "confirmed") {
      throw new HttpsError("failed-precondition", "이미 승인된 신청서입니다.");
    }
    const { parentId, password, parentName, phone, children, parentServices, parentServiceMonths } = signup as {
      parentId: string;
      password: string;
      parentName: string;
      phone: string;
      children: Array<{ name: string; loginId: string; grade: string; selectedServices: string[]; serviceMonths?: Record<string, number> }>;
      parentServices?: string[];
      parentServiceMonths?: Record<string, number>;
    };

    // ── 0. 선택 서비스 가격표 사전 검증 ──
    // 가격표(SERVICE_PRICING)에 없는 서비스는 아래 루프에서 조용히 건너뛰어
    // "확정됐는데 구독은 안 생기는" 사각지대를 만든다. 무엇도 생성하기 전에 즉시 중단한다.
    // (momsaipack은 가격표가 아니라 aiPackageEndDate로 처리하므로 제외)
    const selectedSlugs = [
      ...children.flatMap((c) => c.selectedServices ?? []),
      ...(parentServices ?? []).filter((s) => s !== "momsaipack"),
    ];
    const unpriced = [...new Set(selectedSlugs)].filter((s) => !SERVICE_PRICING[s]);
    if (unpriced.length > 0) {
      throw new HttpsError(
        "failed-precondition",
        `가격표에 없는 서비스: ${unpriced.join(", ")}. 코드(SERVICE_PRICING)에 가격을 추가한 뒤 다시 승인하세요.`
      );
    }

    // ── 1. Auth 계정 생성 (실패 시 즉시 중단) ──
    const parentUid = await getOrCreateAuthUser(
      idToEmail(parentId), password, parentName
    );

    const childAuthUids: Array<{ loginId: string; uid: string; name: string; grade: string; selectedServices: string[]; serviceMonths?: Record<string, number> }> = [];
    for (const child of children) {
      const childUid = await getOrCreateAuthUser(
        idToEmail(child.loginId), "012345", child.name
      );
      childAuthUids.push({ ...child, uid: childUid });
    }

    // ── 2. Firestore 일괄 생성 (batch로 원자적 처리) ──
    const batch = db.batch();

    // 2-1. users 문서 (parent)
    batch.set(db.collection("users").doc(parentUid), {
      name: parentName,
      plantor_id: parentId.toLowerCase(),
      role: "parent",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // 2-2. 기존 가족 확인 (머지 케이스)
    const existingFamilySnap = await db.collection("families")
      .where("userId", "==", parentUid).limit(1).get();
    const isNewFamily = existingFamilySnap.empty;
    let familyId: string;

    if (isNewFamily) {
      // 2-3. families 문서 생성 (결정적 ID = parentUid → 동시 이중승인 시 중복 차단)
      const familyRef = db.collection("families").doc(parentUid);
      familyId = familyRef.id;
      batch.set(familyRef, {
        parentName,
        phone,
        signupId,
        userId: parentUid,
        parentPlantorId: parentId.toLowerCase(),
        couponCode: signup.couponCode ?? null,
        couponDiscount: signup.couponDiscount ?? 0,
        referralCode: signup.referralCode ?? null,
        referrerId: signup.referrerId ?? null,
        referralDiscount: signup.referralDiscount ?? 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // referralCodes 문서
      if (parentId) {
        batch.set(db.collection("referralCodes").doc(parentId.toLowerCase()), {
          familyId,
          referrerName: parentName,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    } else {
      familyId = existingFamilySnap.docs[0].id;
    }

    const now = new Date();

    // AI 패키지 endDate — admin이 momsaipackEndDate를 넘기면 그대로, 없으면 개월수 기반 계산
    const hasAiPack = (parentServices ?? []).includes("momsaipack");
    if (hasAiPack) {
      const aiEnd = momsaipackEndDate ?? toDateStr(monthsEndDate(null, parentServiceMonths?.momsaipack ?? 1, now));
      batch.update(db.collection("families").doc(familyId), { aiPackageEndDate: aiEnd });
      batch.set(db.collection("users").doc(parentUid), { aiPackageEndDate: aiEnd }, { merge: true });
    }

    // 2-4. children + users + subscriptions
    const childIds: string[] = [];
    const loginIdToChildRef = new Map<string, string>();
    let mergeCache: {
      childByLoginId: Map<string, FirebaseFirestore.QueryDocumentSnapshot>;
      subsByChildAndSlug: Map<string, FirebaseFirestore.QueryDocumentSnapshot>;
    } | null = null;

    // 보안 규칙이 "내 가족"을 판정하는 기준 — users.familyId 로 비정규화해 둔다.
    // (규칙은 쿼리를 못 하므로 uid로 바로 get 할 수 있어야 한다)
    batch.set(db.collection("users").doc(parentUid), { familyId }, { merge: true });

    for (const child of childAuthUids) {
      // users 문서 (child)
      batch.set(db.collection("users").doc(child.uid), {
        name: child.name,
        plantor_id: child.loginId.toLowerCase(),
        role: "student",
        grade: child.grade,
        parentUid,
        familyId,
        selectedServices: child.selectedServices,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      if (isNewFamily) {
        const normalizedId = child.loginId.toLowerCase();
        let childDocId = loginIdToChildRef.get(normalizedId);

        if (!childDocId) {
          // children 문서 — authUid 포함
          const childRef = db.collection("children").doc(child.uid);
          childDocId = childRef.id;
          loginIdToChildRef.set(normalizedId, childDocId);
          batch.set(childRef, {
            familyId,
            userId: parentUid,
            authUid: child.uid,
            name: child.name,
            grade: child.grade,
            loginId: normalizedId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        childIds.push(childDocId);

        // subscriptions
        for (const slug of child.selectedServices) {
          const pricing = SERVICE_PRICING[slug];
          if (!pricing) continue;
          const subEnd = monthsEndDate(null, child.serviceMonths?.[slug] ?? 1, now);
          const subRef = db.collection("subscriptions").doc(`${childDocId}_${slug}`);
          batch.set(subRef, {
            familyId,
            childId: childDocId,
            serviceSlug: slug,
            monthlyPrice: pricing.pricePerMonth,
            agencyFee: pricing.agencyFee,
            status: "active",
            startDate: admin.firestore.Timestamp.fromDate(now),
            endDate: admin.firestore.Timestamp.fromDate(subEnd),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      } else {
        // 머지 케이스: 기존 자녀/구독을 한 번에 조회 (첫 자녀에서만)
        if (!mergeCache) {
          const [childrenSnap, subsSnap] = await Promise.all([
            db.collection("children").where("familyId", "==", familyId).get(),
            db.collection("subscriptions").where("familyId", "==", familyId).get(),
          ]);
          mergeCache = {
            childByLoginId: new Map(childrenSnap.docs.map(d => [d.data().loginId as string, d])),
            subsByChildAndSlug: new Map(subsSnap.docs.map(d => [`${d.data().childId}:${d.data().serviceSlug}`, d])),
          };
        }

        const normalizedId = child.loginId.toLowerCase();
        const existingChild = mergeCache.childByLoginId.get(normalizedId);

        let childDocId: string;
        if (existingChild) {
          childDocId = existingChild.id;
          batch.update(db.collection("children").doc(childDocId), { authUid: child.uid });
        } else {
          const childRef = db.collection("children").doc(child.uid);
          childDocId = childRef.id;
          batch.set(childRef, {
            familyId,
            userId: parentUid,
            authUid: child.uid,
            name: child.name,
            grade: child.grade,
            loginId: normalizedId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        childIds.push(childDocId);

        for (const slug of child.selectedServices) {
          const existingSub = mergeCache.subsByChildAndSlug.get(`${childDocId}:${slug}`);
          const months = child.serviceMonths?.[slug] ?? 1;

          if (existingSub) {
            const currentEnd = (existingSub.data().endDate as admin.firestore.Timestamp)?.toDate() ?? null;
            const newEnd = monthsEndDate(currentEnd, months, now);
            batch.update(existingSub.ref, {
              endDate: admin.firestore.Timestamp.fromDate(newEnd),
              status: "active",
            });
          } else {
            const pricing = SERVICE_PRICING[slug];
            if (!pricing) continue;
            const subEnd = monthsEndDate(null, months, now);
            const subRef = db.collection("subscriptions").doc(`${childDocId}_${slug}`);
            batch.set(subRef, {
              familyId,
              childId: childDocId,
              serviceSlug: slug,
              monthlyPrice: pricing.pricePerMonth,
              agencyFee: pricing.agencyFee,
              status: "active",
              startDate: admin.firestore.Timestamp.fromDate(now),
              endDate: admin.firestore.Timestamp.fromDate(subEnd),
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }
      }
    }

    // 학부모 서비스 구독 (childId: null). momsaipack은 위에서 aiPackageEndDate로 처리하므로 제외.
    for (const slug of (parentServices ?? [])) {
      if (slug === "momsaipack") continue;
      const pricing = SERVICE_PRICING[slug];
      if (!pricing) continue;
      const months = parentServiceMonths?.[slug] ?? 1;

      // 머지 케이스: 기존 학부모 sub(childId=null, 같은 slug)가 있으면 연장
      let existingParentSub: FirebaseFirestore.QueryDocumentSnapshot | undefined;
      if (!isNewFamily) {
        const snap = await db.collection("subscriptions")
          .where("familyId", "==", familyId)
          .where("serviceSlug", "==", slug)
          .where("childId", "==", null)
          .limit(1).get();
        if (!snap.empty) existingParentSub = snap.docs[0];
      }

      if (existingParentSub) {
        const currentEnd = (existingParentSub.data().endDate as admin.firestore.Timestamp)?.toDate() ?? null;
        const newEnd = monthsEndDate(currentEnd, months, now);
        batch.update(existingParentSub.ref, {
          endDate: admin.firestore.Timestamp.fromDate(newEnd),
          status: "active",
        });
      } else {
        const subEnd = monthsEndDate(null, months, now);
        const subRef = db.collection("subscriptions").doc();
        batch.set(subRef, {
          familyId,
          childId: null,
          serviceSlug: slug,
          monthlyPrice: pricing.pricePerMonth,
          agencyFee: pricing.agencyFee,
          status: "active",
          startDate: admin.firestore.Timestamp.fromDate(now),
          endDate: admin.firestore.Timestamp.fromDate(subEnd),
          discount: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    // 추천 보상
    if (signup.referrerId && signup.referralCode) {
      const referrerFamilySnap = await db.collection("families").doc(signup.referrerId as string).get();
      const referrerName = referrerFamilySnap.exists ? (referrerFamilySnap.data()!.parentName ?? "") : "";
      const walletRef = db.collection("families").doc(signup.referrerId as string)
        .collection("couponWallet").doc(signupId);
      batch.set(walletRef, {
        discountPercent: 10,
        note: `${parentName} 추천 보상`,
        used: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      const referralRef = db.collection("referrals").doc(signupId);
      batch.set(referralRef, {
        referrerId: signup.referrerId,
        referrerName,
        referralCode: signup.referralCode,
        refereeSignupId: signupId,
        refereeName: parentName,
        refereeFamilyId: familyId,
        referralDiscount: signup.referralDiscount ?? 0,
        rewardAmount: 0,
        status: "rewarded",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        rewardedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // 2-5. signup 상태 갱신
    batch.update(db.collection("signups").doc(signupId), {
      status: "confirmed",
      convertedFamilyId: familyId,
      password: admin.firestore.FieldValue.delete(),
      confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // ── 3. Batch 커밋 (원자적) ──
    await batch.commit();

    // ── 4. SMS 발송 (실패해도 OK — 위 batch는 이미 커밋됨) ──
    const DEFAULT_URLS: Record<string, { name: string; studentUrl?: string; parentUrl?: string }> = {
      "dailykor": { name: "매일국어", studentUrl: "https://www.dailykor.com/front", parentUrl: "https://www.dailykor.com/academy" },
      "autovoca": { name: "오토보카", studentUrl: "https://www.autovoca.co.kr/" },
      "class5": { name: "클래스5", studentUrl: "https://play.class5.co.kr/", parentUrl: "https://www.class5.co.kr/login" },
      "classcard-middle": { name: "클래스카드", studentUrl: "https://www.classcard.net/" },
      "vibe-coding": { name: "바이브코딩", studentUrl: "https://coken-vibe.web.app/" },
    };
    const allSlugs = [...new Set(children.flatMap((c) => c.selectedServices))];
    const svcDocs = await Promise.all(
      allSlugs.map((slug) => db.collection("serviceOverrides").doc(slug).get())
    );
    const svcMap: Record<string, { name?: string; studentUrl?: string; parentUrl?: string }> = {};
    allSlugs.forEach((slug, i) => {
      const defaults = DEFAULT_URLS[slug] ?? {};
      const overrides = svcDocs[i].exists ? svcDocs[i].data() as Record<string, string> : {};
      svcMap[slug] = { ...defaults, ...overrides };
    });

    const hasClass5 = children.some((c) => c.selectedServices.includes("class5"));
    const aiPackBlock: string[] = hasAiPack ? (() => {
      const lines = [
        ``,
        `🤖 Mom& AI 패키지`,
        `ChatGPT · 제미나이 · 캔바 공유 계정 이용 가능`,
      ];
      if (momsaipackEndDate) {
        const [y, m, d] = momsaipackEndDate.split("-");
        lines.push(`이용 기간: ~${y}.${m}.${d}`);
      }
      lines.push(``, `👉 로그인 후 상단 [AI 패키지] 탭을 확인해 주세요!`);
      return lines;
    })() : [];

    const extraLines: string[] = [];
    if (hasClass5) {
      extraLines.push(
        `클래스5 레벨테스트를 먼저 해보시고 결과를 공유해주시면 추천진도를 짜드립니다!`,
        `https://www.alist.co.kr/leveltest/all_skill.asp`,
      );
    }
    if (aiPackBlock.length > 0) extraLines.push(...aiPackBlock);
    extraLines.push(
      ``,
      `📢 카카오톡 '플랜토' 채널을 추가해 주세요!`,
      `추가하시면 학습 알림과 만료 안내를 카카오톡으로 편하게 받아보실 수 있어요.`,
      `https://pf.kakao.com/_xlxgxdTX`,
    );
    extraLines.push(``, `[Mom&] 맘이랑 멤버십 오픈톡방`, `https://open.kakao.com/o/gs9aP64h`);

    // 자녀별 로그인 안내 — 어느 사이트에 어떤 아이디로 접속하는지 (과목별 접속 링크)
    const childBlocks = children.flatMap((c) => {
      const svcLines: string[] = [];
      c.selectedServices.forEach((slug) => {
        const svc = svcMap[slug];
        if (!svc) return;
        const label = svc.name ?? slug;
        if (svc.studentUrl) svcLines.push(`· ${label} 학생용: ${svc.studentUrl}`);
        if (svc.parentUrl) svcLines.push(`· ${label} 학부모용: ${svc.parentUrl}`);
      });
      return [``, `📚 ${c.name} 학습사이트 로그인 (아이디 ${c.loginId} / 비번 012345)`, ...svcLines];
    });

    const smsText = [
      `[플랜토] ${parentName}님, 가입이 승인됐어요!`,
      ``, `👉 ${SITE_URL}`, `아이디: ${parentId} / 비번: 012345`,
      ``, `로그인 후 학습 사이트 접속과 자녀 학습 현황을 확인하실 수 있어요.`,
      ...childBlocks,
      ...extraLines,
    ].join("\n");

    try {
      await sendSms(
        phone,
        smsText,
        solapiApiKey.value(),
        solapiApiSecret.value()
      );
    } catch (e) {
      functions.logger.warn("승인 SMS 발송 실패", { signupId, error: String(e) });
    }

    return { success: true, parentUid, familyId, childIds, isNewFamily };
  }
);

// 연장 시 신규 자녀 Auth + Firestore 계정 동시 생성
export const createChildAccount = onCall(async (request) => {
  await assertAdmin(request.auth);

  const { familyId, name, grade, loginId } = request.data as {
    familyId: string; name: string; grade: string; loginId: string;
  };
  if (!familyId || !loginId) {
    throw new HttpsError("invalid-argument", "familyId와 loginId가 필요합니다.");
  }

  const normalizedLoginId = loginId.toLowerCase();

  // 가족 정보에서 parentUid 가져오기
  const familySnap = await db.collection("families").doc(familyId).get();
  if (!familySnap.exists) throw new HttpsError("not-found", "가족 정보를 찾을 수 없습니다.");
  const parentUid = familySnap.data()!.userId as string | null;

  // Auth 계정 생성
  const childUid = await getOrCreateAuthUser(
    idToEmail(normalizedLoginId), "012345", name
  );

  // 멱등성: 같은 (familyId, loginId) 자녀가 이미 있으면 재사용 (이중 제출 중복 차단)
  const existingChild = await db.collection("children")
    .where("familyId", "==", familyId)
    .where("loginId", "==", normalizedLoginId)
    .limit(1)
    .get();

  // Firestore 일괄 생성
  const batch = db.batch();

  let childId: string;
  if (existingChild.empty) {
    const childRef = db.collection("children").doc(childUid); // 결정적 ID → 동시호출 중복 차단
    childId = childRef.id;
    batch.set(childRef, {
      familyId,
      userId: parentUid,
      authUid: childUid,
      name,
      grade,
      loginId: normalizedLoginId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    childId = existingChild.docs[0].id;
    batch.set(existingChild.docs[0].ref, { authUid: childUid, name, grade }, { merge: true });
  }

  batch.set(db.collection("users").doc(childUid), {
    name,
    plantor_id: normalizedLoginId,
    role: "student",
    grade,
    parentUid,
    familyId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  await batch.commit();

  return { success: true, childId, childUid };
});

// 비밀번호 리셋 (어드민 전용)
export const resetPassword = onCall(
  { secrets: [solapiApiKey, solapiApiSecret] },
  async (request) => {
    await assertAdmin(request.auth);

    const { signupId, familyId, directClassId, newPassword } = request.data as {
      signupId?: string; familyId?: string; directClassId?: string; newPassword: string;
    };
    if (!newPassword || newPassword.length < 6) {
      throw new HttpsError("invalid-argument", "비밀번호는 6자 이상이어야 합니다.");
    }

    let parentId = "";
    let phone = "";
    let parentName = "";
    let childLoginIds: string[] = [];

    if (directClassId) {
      const classSnap = await db.collection("directClasses").doc(directClassId).get();
      if (!classSnap.exists) throw new HttpsError("not-found", "수업 정보를 찾을 수 없습니다.");
      const cls = classSnap.data()!;
      const students = (cls.students ?? []) as Array<{ name: string; studentLoginId?: string; parentLoginId?: string; parentPhone?: string }>;
      const first = students[0];
      phone = first?.parentPhone ?? cls.parentPhone ?? "";
      parentName = cls.parentName ?? (first ? `${first.name}맘` : cls.name);
      parentId = first?.parentLoginId ?? "";
      childLoginIds = students.map((s) => s.studentLoginId ?? "").filter(Boolean);
    } else if (familyId) {
      const familySnap = await db.collection("families").doc(familyId).get();
      if (!familySnap.exists) throw new HttpsError("not-found", "가족 정보를 찾을 수 없습니다.");
      const family = familySnap.data()!;
      phone = family.phone ?? "";
      parentName = family.parentName ?? "";
      if (family.userId) {
        const userSnap = await db.collection("users").doc(family.userId).get();
        parentId = userSnap.data()?.plantor_id ?? "";
      }
      const childrenSnap = await db.collection("children").where("familyId", "==", familyId).get();
      childLoginIds = childrenSnap.docs.map((d) => d.data().loginId as string);
    } else if (signupId) {
      const snap = await db.collection("signups").doc(signupId).get();
      if (!snap.exists) throw new HttpsError("not-found", "신청서를 찾을 수 없습니다.");
      const signup = snap.data()!;
      parentId = signup.parentId ?? "";
      phone = signup.phone ?? "";
      parentName = signup.parentName ?? "";
      childLoginIds = (signup.children as Array<{ loginId: string }> ?? []).map((c) => c.loginId);
    } else {
      throw new HttpsError("invalid-argument", "signupId 또는 familyId가 필요합니다.");
    }

    if (parentId) {
      try {
        const parentUser = await auth.getUserByEmail(idToEmail(parentId));
        await auth.updateUser(parentUser.uid, { password: newPassword });
      } catch (e) {
        functions.logger.warn("비밀번호 리셋 실패 (parent)", { parentId, error: String(e) });
      }
    }

    for (const loginId of childLoginIds) {
      if (!loginId) continue;
      try {
        const childUser = await auth.getUserByEmail(idToEmail(loginId));
        await auth.updateUser(childUser.uid, { password: newPassword });
      } catch (e) {
        functions.logger.warn("비밀번호 리셋 실패 (child)", { loginId, error: String(e) });
      }
    }

    const smsText = `[플랜토] ${parentName}님, 비밀번호가 초기화됐어요.\n\n새 비밀번호: ${newPassword}\n\n👉 plantor.web.app`;
    try {
      // 알림톡 우선 (승인 전/실패 시 smsText로 문자 fallback)
      await sendAlimtalk(
        phone,
        KAKAO_TEMPLATES.PASSWORD_RESET,
        { "#{parentName}": parentName as string, "#{password}": newPassword },
        smsText,
        solapiApiKey.value(),
        solapiApiSecret.value()
      );
    } catch (e) {
      functions.logger.warn("비밀번호 리셋 발송 실패", { phone, error: String(e) });
    }

    return { success: true };
  }
);

// 학부모 이름 수정 (어드민 전용) — Firestore + Auth displayName 동시 업데이트
export const updateParentName = onCall(async (request) => {
  await assertAdmin(request.auth);

  const { familyId, newName } = request.data as { familyId: string; newName: string };
  if (!familyId || !newName?.trim()) {
    throw new HttpsError("invalid-argument", "familyId와 newName이 필요합니다.");
  }

  const familySnap = await db.collection("families").doc(familyId).get();
  if (!familySnap.exists) throw new HttpsError("not-found", "가족 정보를 찾을 수 없습니다.");

  const userId = familySnap.data()!.userId as string | undefined;

  await db.collection("families").doc(familyId).update({ parentName: newName.trim() });

  if (userId) {
    try {
      await auth.updateUser(userId, { displayName: newName.trim() });
    } catch (e) {
      functions.logger.warn("학부모 Auth displayName 업데이트 실패", { userId, error: String(e) });
    }
  }

  return { success: true };
});

// 학생 이름 수정 (어드민 전용) — Firestore children + Auth displayName 동시 업데이트
export const updateChildName = onCall(async (request) => {
  await assertAdmin(request.auth);

  const { childId, newName } = request.data as { childId: string; newName: string };
  if (!childId || !newName?.trim()) {
    throw new HttpsError("invalid-argument", "childId와 newName이 필요합니다.");
  }

  const childSnap = await db.collection("children").doc(childId).get();
  if (!childSnap.exists) throw new HttpsError("not-found", "학생 정보를 찾을 수 없습니다.");

  // authUid 우선, 없으면 loginId로 조회
  const authUid = childSnap.data()!.authUid as string | undefined;
  const loginId = (childSnap.data()!.loginId as string | undefined)?.toLowerCase();

  await db.collection("children").doc(childId).update({ name: newName.trim() });

  // 이미 쌓인 피드 카드의 가린 이름도 함께 맞춘다 (실패해도 이름 변경은 되돌리지 않는다)
  await syncFeedName(childId, newName.trim())
    .catch((e) => functions.logger.warn("[auth] 피드 이름 동기화 실패", { childId, error: String(e) }));

  const uidToUpdate = authUid ?? (loginId ? await auth.getUserByEmail(idToEmail(loginId)).then((u) => u.uid).catch(() => null) : null);
  if (uidToUpdate) {
    try {
      await auth.updateUser(uidToUpdate, { displayName: newName.trim() });
    } catch (e) {
      functions.logger.warn("학생 Auth displayName 업데이트 실패", { childId, error: String(e) });
    }
  }

  return { success: true };
});

// ─────────────────────────────────────────────────────────
// updateChildLoginId — 자녀 로그인 아이디 변경.
//   children.loginId + Auth 이메일({id}@plantor.app) + users.plantor_id 를 함께 전환.
//   (셋을 함께 바꾸지 않으면 학생이 새 아이디로 로그인·조회를 못 해 학생페이지가 깨짐)
//   어드민 폼에서 loginId를 직접 updateDoc하면 안 되는 이유가 이것이다 —
//   반드시 이 콜러블을 거칠 것. 복원 경위는 docs/archive/updateChildLoginId.md 참고.
// ─────────────────────────────────────────────────────────
export const updateChildLoginId = onCall(async (request) => {
  await assertAdmin(request.auth);

  const { childId, newLoginId } = request.data as { childId: string; newLoginId: string };
  const next = (newLoginId ?? "").trim().toLowerCase();
  if (!childId || next.length < 4) {
    throw new HttpsError("invalid-argument", "childId와 4자 이상 아이디가 필요합니다.");
  }

  const childSnap = await db.collection("children").doc(childId).get();
  if (!childSnap.exists) throw new HttpsError("not-found", "학생 정보를 찾을 수 없습니다.");
  const child = childSnap.data()!;
  const oldLoginId = (child.loginId as string | undefined)?.toLowerCase() ?? "";
  if (next === oldLoginId) return { success: true };

  // 중복 검사: 다른 자녀 loginId / 학부모 plantor_id 가 이미 쓰는 아이디면 차단
  const [childDup, parentDup] = await Promise.all([
    db.collection("children").where("loginId", "==", next).limit(1).get(),
    db.collection("users").where("plantor_id", "==", next).limit(1).get(),
  ]);
  if ((!childDup.empty && childDup.docs[0].id !== childId) || !parentDup.empty) {
    throw new HttpsError("already-exists", "이미 사용 중인 아이디입니다.");
  }

  // Auth uid 해석: authUid 우선, 없으면 기존 아이디 이메일로 조회
  const authUid = child.authUid as string | undefined;
  const uid = authUid ?? (oldLoginId
    ? await auth.getUserByEmail(idToEmail(oldLoginId)).then((u) => u.uid).catch(() => null)
    : null);

  if (uid) {
    try {
      await auth.updateUser(uid, { email: idToEmail(next) });
      await db.collection("users").doc(uid).update({ plantor_id: next });
    } catch (e) {
      functions.logger.error("학생 로그인 계정(Auth/plantor_id) 전환 실패", { childId, uid, error: String(e) });
      throw new HttpsError("internal", "로그인 계정 전환에 실패했습니다. 아이디를 확인해주세요.");
    }
  } else {
    functions.logger.warn("학생 Auth 계정 없음 — children.loginId 만 갱신", { childId, next });
  }

  await db.collection("children").doc(childId).update({ loginId: next });
  return { success: true };
});

// 학생 연락처 수정 — 본인 자녀(학부모) 또는 어드민. 미완료 알림 발송용.
export const updateStudentPhone = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const { childId, phone } = request.data as { childId: string; phone: string };
  if (!childId) throw new HttpsError("invalid-argument", "childId가 필요합니다.");

  const childSnap = await db.collection("children").doc(childId).get();
  if (!childSnap.exists) throw new HttpsError("not-found", "학생 정보를 찾을 수 없습니다.");
  const child = childSnap.data()!;
  const uid = request.auth.uid;

  // 권한: 학생 본인(authUid) · 자녀 소유 학부모(children.userId 또는 가족 소유자) · 어드민
  // children.userId가 병합·재승인으로 stale일 수 있어 가족 소유자(families.userId)까지 확인한다.
  let allowed = child.authUid === uid || child.userId === uid;
  if (!allowed && child.familyId) {
    const famSnap = await db.collection("families").doc(child.familyId as string).get();
    if (famSnap.exists && famSnap.data()!.userId === uid) allowed = true;
  }
  if (!allowed) await assertAdmin(request.auth);

  const clean = String(phone ?? "").replace(/[^\d]/g, "");
  if (clean && (clean.length < 9 || clean.length > 11)) {
    throw new HttpsError("invalid-argument", "전화번호 형식이 올바르지 않습니다.");
  }
  await db.collection("children").doc(childId).update({ studentPhone: clean });
  return { success: true };
});

// 입금 확인 후 연장 완료 SMS 발송 (어드민 전용)
export const sendRenewalConfirmationSms = onCall(
  { secrets: [solapiApiKey, solapiApiSecret] },
  async (request) => {
    await assertAdmin(request.auth);

    const { familyId, services } = request.data as {
      familyId: string;
      services: Array<{ childName: string; serviceName: string; newEndDate: string }>;
    };

    const familySnap = await db.collection("families").doc(familyId).get();
    if (!familySnap.exists) throw new HttpsError("not-found", "가족을 찾을 수 없습니다.");
    const { parentName, phone } = familySnap.data()!;
    if (!phone) throw new HttpsError("failed-precondition", "전화번호가 없습니다.");

    const serviceLines = services.map((s) => {
      const who = (s.childName && s.childName !== "null") ? s.childName : "학부모";
      return `· ${who} · ${s.serviceName} → ${s.newEndDate}까지`;
    }).join("\n");
    const smsText = [
      `[플랜토] ${parentName}님, 입금이 확인되었습니다 ✅`,
      ``,
      `구독이 연장되었어요:`,
      serviceLines,
      ``,
      `감사합니다 🌱`,
    ].join("\n");

    await sendAlimtalk(
      phone,
      KAKAO_TEMPLATES.RENEWAL_CONFIRM,
      { "#{parentName}": parentName as string, "#{details}": serviceLines },
      smsText,
      solapiApiKey.value(),
      solapiApiSecret.value()
    );
    return { success: true };
  }
);

// AI 패키지 입금확인 — endDate 설정 + SMS 발송
export const confirmAiPackagePayment = onCall(
  { secrets: [solapiApiKey, solapiApiSecret] },
  async (request) => {
    await assertAdmin(request.auth);

    const { familyId, endDate, silent } = request.data as { familyId: string; endDate: string; silent?: boolean };
    if (!familyId || !endDate) throw new HttpsError("invalid-argument", "familyId와 endDate가 필요합니다.");

    const familySnap = await db.collection("families").doc(familyId).get();
    if (!familySnap.exists) throw new HttpsError("not-found", "가족 정보를 찾을 수 없습니다.");
    const { parentName, phone, userId } = familySnap.data()!;

    await db.collection("families").doc(familyId).update({ aiPackageEndDate: endDate });
    if (userId) {
      await db.collection("users").doc(userId).update({ aiPackageEndDate: endDate });
    }

    // silent=true(연장 일괄승인 흐름): 알림톡은 sendRenewalConfirmationSms가 통합 발송하므로 생략
    if (!silent) {
      const [y, m, d] = endDate.split("-");
      const formatted = `${y}.${m}.${d}`;
      const smsText = `[플랜토] ${parentName}님, Mom& AI 패키지 입금이 확인되었어요! ✅\n\nChatGPT · 제미나이 · 캔바 공유 계정을 이용하실 수 있습니다.\n\n이용 기간: ~${formatted}\n\n👉 plantor.web.app 에서 학부모 계정으로 로그인하시면 상단 메뉴에 [AI 패키지] 탭이 생성됩니다.`;

      try {
        // 알림톡 우선 (승인 전/실패 시 smsText로 문자 fallback)
        await sendAlimtalk(
          phone,
          KAKAO_TEMPLATES.AI_PACKAGE_CONFIRM,
          { "#{parentName}": parentName as string, "#{endDate}": formatted },
          smsText,
          solapiApiKey.value(),
          solapiApiSecret.value()
        );
      } catch (e) {
        functions.logger.warn("AI패키지 발송 실패", { familyId, error: String(e) });
      }
    }

    return { success: true };
  }
);

// 직강 학생 계정 자동 생성 (어드민 전용)
// studentLoginId가 있지만 Auth 계정이 없는 학생에 대해 Auth + users + children 문서 생성
export const ensureDirectClassAccounts = onCall(async (request) => {
  await assertAdmin(request.auth);

  const { classId } = request.data as { classId: string };
  if (!classId) throw new HttpsError("invalid-argument", "classId가 필요합니다.");

  const classSnap = await db.collection("directClasses").doc(classId).get();
  if (!classSnap.exists) throw new HttpsError("not-found", "수업 정보를 찾을 수 없습니다.");

  const cls = classSnap.data()!;
  const students = (cls.students ?? []) as Array<{
    name: string;
    studentLoginId?: string;
    studentClasscardId?: string;
    studentAutovocaId?: string;
    parentLoginId?: string;
    parentPhone?: string;
    serviceSlugs?: string[];
  }>;
  const grades = (cls.grades ?? []) as string[];

  let created = 0;
  let parentUid: string | null = null;

  for (const student of students) {
    // 학부모 계정
    if (student.parentLoginId) {
      const parentId = student.parentLoginId.toLowerCase();
      const parentName = cls.parentName ?? (student.name ? `${student.name}맘` : cls.name);
      parentUid = await getOrCreateAuthUser(idToEmail(parentId), "012345", parentName);
      await db.collection("users").doc(parentUid).set({
        name: parentName,
        plantor_id: parentId,
        role: "parent",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      created++;
    }

    // 학생 계정
    if (student.studentLoginId) {
      const loginId = student.studentLoginId.toLowerCase();
      const uid = await getOrCreateAuthUser(idToEmail(loginId), "012345", student.name);
      await db.collection("users").doc(uid).set({
        name: student.name,
        plantor_id: loginId,
        role: "student",
        parentUid: parentUid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // 외부 자동인증 아이디 (있을 때만 기록)
      const externalIds: Record<string, string> = {};
      if (student.studentClasscardId?.trim()) externalIds.classcardLoginId = student.studentClasscardId.trim();
      if (student.studentAutovocaId?.trim()) externalIds.autovocaLoginId = student.studentAutovocaId.trim();

      // children 문서도 생성 (이미 있으면 스킵)
      const existingChild = await db.collection("children")
        .where("loginId", "==", loginId).limit(1).get();
      if (existingChild.empty) {
        await db.collection("children").doc().set({
          familyId: classId,
          userId: parentUid,
          authUid: uid,
          name: student.name,
          grade: grades[0] ?? "",
          loginId,
          directClassId: classId,
          ...externalIds,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        // authUid + 외부 아이디 보강
        await existingChild.docs[0].ref.update({ authUid: uid, ...externalIds });
      }
      created++;
    }
  }

  return { success: true, created };
});

// 기존 전체 학생 비밀번호 012345로 통일 (어드민 전용, 1회성)
export const resetAllStudentPasswords = onCall(async (request) => {
  await assertAdmin(request.auth);

  const usersSnap = await db.collection("users").where("role", "==", "student").get();
  let updated = 0;
  let skipped = 0;

  for (const userDoc of usersSnap.docs) {
    try {
      await auth.updateUser(userDoc.id, { password: "012345" });
      updated++;
    } catch {
      skipped++;
    }
  }

  return { success: true, updated, skipped };
});

// childId가 null 또는 빈 문자열인 orphan 구독 삭제 (어드민 전용)
export const cleanupOrphanSubscriptions = onCall(async (request) => {
  await assertAdmin(request.auth);
  const [nullSnap, emptySnap] = await Promise.all([
    db.collection("subscriptions").where("childId", "==", null).get(),
    db.collection("subscriptions").where("childId", "==", "").get(),
  ]);
  const batch = db.batch();
  [...nullSnap.docs, ...emptySnap.docs].forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return { success: true, deleted: nullSnap.size + emptySnap.size };
});

// 전수 복구 — Auth 누락 시 생성, users 문서 복구, children에 authUid 보강
export const repairUserDocs = onCall(async (request) => {
  await assertAdmin(request.auth);

  const childrenSnap = await db.collection("children").get();
  let fixed = 0;
  let authCreated = 0;
  let skipped = 0;

  for (const childDoc of childrenSnap.docs) {
    const data = childDoc.data();
    const loginId = (data.loginId as string | undefined)?.toLowerCase();
    if (!loginId) { skipped++; continue; }

    let uid: string;
    try {
      // Auth 계정 있으면 가져오고, 없으면 새로 생성
      uid = await getOrCreateAuthUser(idToEmail(loginId), "012345", data.name ?? "");
    } catch (e) {
      functions.logger.warn("repairUserDocs: Auth 생성 실패", { loginId, error: String(e) });
      skipped++;
      continue;
    }

    // 새로 생성된 건지 기존 건지 확인
    if (!data.authUid) {
      authCreated++;
    }

    // children 문서에 authUid 보강
    await db.collection("children").doc(childDoc.id).update({ authUid: uid });

    // users 문서 복구
    await db.collection("users").doc(uid).set({
      name: data.name ?? "",
      plantor_id: loginId,
      role: "student",
      grade: data.grade ?? "",
      parentUid: data.userId ?? null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    fixed++;
  }

  return { success: true, fixed, authCreated, skipped };
});

// ID/전화번호 중복 체크 (비인증 허용 — 회원가입 폼에서 호출)
export const checkIdAvailability = onCall({ invoker: "public" }, async (request) => {
  const { type, id } = request.data as { type: "parent" | "child" | "phone"; id: string };
  const trimmed = (id ?? "").trim().toLowerCase();

  if (type === "phone") {
    const phone = (id ?? "").trim();
    if (!phone) throw new HttpsError("invalid-argument", "전화번호가 필요합니다.");
    const [signupSnap, familySnap] = await Promise.all([
      db.collection("signups").where("phone", "==", phone).where("status", "==", "pending").limit(1).get(),
      db.collection("families").where("phone", "==", phone).limit(1).get(),
    ]);
    if (!signupSnap.empty) return { available: false, reason: "signup" };
    if (!familySnap.empty) return { available: false, reason: "family" };
    return { available: true };
  }

  if (!trimmed || trimmed.length < 4) {
    throw new HttpsError("invalid-argument", "ID가 너무 짧습니다.");
  }

  if (type === "parent") {
    const snap = await db.collection("users").where("plantor_id", "==", trimmed).limit(1).get();
    return { available: snap.empty };
  } else if (type === "child") {
    const snap = await db.collection("children").where("loginId", "==", trimmed).limit(1).get();
    return { available: snap.empty };
  } else {
    throw new HttpsError("invalid-argument", "type은 parent, child, phone 중 하나여야 합니다.");
  }
});

// 직강(1:1) 학생의 활성 수강 과목 슬러그 — directClasses는 어드민 전용 컬렉션이라 서버에서 대신 조회
export const getStudentDirectSlugs = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const { loginId } = request.data as { loginId?: string };
  const target = (loginId ?? "").toLowerCase().trim();
  if (!target) return { slugs: [] };

  // 본인 확인: users.plantor_id 또는 @plantor.app 이메일 → 불일치 시 어드민만 허용 (미리보기)
  const userSnap = await db.collection("users").doc(request.auth.uid).get();
  let plantorId = ((userSnap.data()?.plantor_id as string | undefined) ?? "").toLowerCase();
  if (!plantorId) {
    const email = (request.auth.token.email as string | undefined) ?? "";
    if (email.endsWith("@plantor.app")) plantorId = email.replace("@plantor.app", "").toLowerCase();
  }
  if (plantorId !== target) await assertAdmin(request.auth);

  const todayKst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dcSnap = await db.collection("directClasses").where("status", "==", "active").get();
  const slugs = new Set<string>();
  for (const dc of dcSnap.docs) {
    const cls = dc.data();
    if (cls.expiry && cls.expiry < todayKst) continue; // 만료된 수업 제외
    const me = ((cls.students ?? []) as Array<{ studentLoginId?: string; serviceSlugs?: string[] }>)
      .find((s) => (s.studentLoginId ?? "").toLowerCase() === target);
    if (!me) continue;
    ((me.serviceSlugs ?? cls.serviceSlugs ?? []) as string[]).forEach((slug) => slugs.add(slug));
  }
  return { slugs: [...slugs] };
});

// 가족 전체 삭제 — Firestore + Auth 계정 완전 제거 (어드민 전용)
export const deleteFamily = onCall(async (request) => {
  await assertAdmin(request.auth);

  const { familyId } = request.data as { familyId: string };
  if (!familyId) throw new HttpsError("invalid-argument", "familyId가 필요합니다.");

  const batch = db.batch();

  // 독립 쿼리 병렬 실행
  const [childrenSnap, subsSnap, familySnap, renewalSnap] = await Promise.all([
    db.collection("children").where("familyId", "==", familyId).get(),
    db.collection("subscriptions").where("familyId", "==", familyId).get(),
    db.collection("families").doc(familyId).get(),
    db.collection("renewalRequests").where("familyId", "==", familyId).get(),
  ]);

  // 자녀 Auth 계정 + Firestore 삭제
  for (const childDoc of childrenSnap.docs) {
    const loginId = (childDoc.data().loginId as string | undefined)?.toLowerCase();
    if (loginId) {
      try {
        const userRecord = await auth.getUserByEmail(idToEmail(loginId));
        await auth.deleteUser(userRecord.uid);
        batch.delete(db.collection("users").doc(userRecord.uid));
      } catch {
        functions.logger.info("deleteFamily: 자녀 Auth 없음 (정상)", { loginId });
      }
    }
    batch.delete(db.collection("studentProfiles").doc(childDoc.id));
    batch.delete(childDoc.ref);
  }

  subsSnap.forEach((d) => batch.delete(d.ref));
  renewalSnap.forEach((d) => batch.delete(d.ref));

  // 학부모 Auth + users + signups 삭제
  let familyPhone = "";
  if (familySnap.exists) {
    const familyData = familySnap.data()!;
    familyPhone = (familyData.phone as string) ?? "";
    const userId = familyData.userId as string | undefined;
    if (userId) {
      try { await auth.deleteUser(userId); } catch {
        functions.logger.info("deleteFamily: 학부모 Auth 없음 (정상)", { userId });
      }
      batch.delete(db.collection("users").doc(userId));
    }
    batch.delete(familySnap.ref);
  }

  if (familyPhone) {
    const signupsSnap = await db.collection("signups").where("phone", "==", familyPhone).get();
    signupsSnap.forEach((d) => batch.delete(d.ref));
  }

  await batch.commit();
  return { success: true };
});
