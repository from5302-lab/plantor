import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { solapiApiKey, solapiApiSecret, SITE_URL } from "./config";
import { assertAdmin, idToEmail, sendSms, db, auth } from "./utils";

// 학부모 + 자녀 계정 생성 + SMS 발송 (승인 시)
export const approveSignup = onCall(
  { secrets: [solapiApiKey, solapiApiSecret] },
  async (request) => {
    await assertAdmin(request.auth);

    const { signupId, momsaipackEndDate } = request.data as { signupId: string; momsaipackEndDate?: string };
    const snap = await db.collection("signups").doc(signupId).get();
    if (!snap.exists) throw new HttpsError("not-found", "신청서를 찾을 수 없습니다.");

    const signup = snap.data()!;
    const { parentId, password, parentName, phone, children, parentServices } = signup as {
      parentId: string;
      password: string;
      parentName: string;
      phone: string;
      children: Array<{ name: string; loginId: string; grade: string; selectedServices: string[] }>;
      parentServices?: string[];
    };

    // 학부모 계정 생성
    let parentUid: string;
    try {
      const parentUser = await auth.createUser({
        email: idToEmail(parentId),
        password,
        displayName: parentName,
      });
      parentUid = parentUser.uid;
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "auth/email-already-exists") {
        const existing = await auth.getUserByEmail(idToEmail(parentId));
        parentUid = existing.uid;
      } else {
        throw e;
      }
    }

    await db.collection("users").doc(parentUid).set({
      name: parentName,
      plantor_id: parentId.toLowerCase(),
      role: "parent",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // 자녀 계정 생성
    for (const child of children) {
      let childUid: string;
      try {
        const childUser = await auth.createUser({
          email: idToEmail(child.loginId),
          password,
          displayName: child.name,
        });
        childUid = childUser.uid;
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "auth/email-already-exists") {
          const existing = await auth.getUserByEmail(idToEmail(child.loginId));
          childUid = existing.uid;
        } else {
          throw e;
        }
      }

      await db.collection("users").doc(childUid).set({
        name: child.name,
        plantor_id: child.loginId.toLowerCase(),
        role: "student",
        grade: child.grade,
        parentUid,
        selectedServices: child.selectedServices,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    // 비밀번호 즉시 삭제 (보안) + 승인 시각 기록
    await db.collection("signups").doc(signupId).update({
      password: admin.firestore.FieldValue.delete(),
      confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 쿠폰 useCount/usedPhones는 notifyNewSignup 트리거에서 신청 접수 시점에 이미 처리됨

    // 서비스별 접속 링크 조회
    const allSlugs = [...new Set(children.flatMap((c) => c.selectedServices))];
    const svcDocs = await Promise.all(
      allSlugs.map((slug) => db.collection("serviceOverrides").doc(slug).get())
    );
    const svcMap: Record<string, { name?: string; studentUrl?: string; parentUrl?: string }> = {};
    svcDocs.forEach((d, i) => {
      if (d.exists) svcMap[allSlugs[i]] = d.data() as { name?: string; studentUrl?: string; parentUrl?: string };
    });

    // 자녀별 아이디 + 서비스 접속 링크
    const childBlocks = children.map((c) => {
      const lines = [`자녀 아이디: ${c.loginId}`];
      const urlSet = new Map<string, { studentUrl?: string; parentUrl?: string; name?: string }>();
      c.selectedServices.forEach((slug) => {
        const svc = svcMap[slug];
        if (svc?.studentUrl || svc?.parentUrl) urlSet.set(slug, svc);
      });
      urlSet.forEach((svc) => {
        if (svc.studentUrl) lines.push(`학생 접속: ${svc.studentUrl}`);
        if (svc.parentUrl) lines.push(`학부모 접속: ${svc.parentUrl}`);
      });
      return lines.join("\n");
    });

    const hasAiPack = (parentServices ?? []).includes("momsaipack");
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
      lines.push(``, `👉 ${SITE_URL} 로그인 후`, `상단 [AI 패키지] 탭을 확인해 주세요!`);
      return lines;
    })() : [];

    const smsLines = [
      `[플랜토] ${parentName}님, 가입이 승인됐어요!`,
      ``,
      `학부모 아이디: ${parentId}`,
      `비밀번호: ${password}`,
      ...(childBlocks.length > 0 ? [``, ...childBlocks] : []),
      ...aiPackBlock,
      ``,
      `[Mom&] 맘이랑 멤버십 오픈톡방`,
      `https://open.kakao.com/o/gs9aP64h`,
    ];
    const smsText = smsLines.join("\n");

    try {
      await sendSms(phone, smsText, solapiApiKey.value(), solapiApiSecret.value());
    } catch {
      // SMS 실패해도 승인은 완료
    }

    return { success: true, parentUid };
  }
);

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
      } catch { /* 계정 없으면 무시 */ }
    }

    for (const loginId of childLoginIds) {
      if (!loginId) continue;
      try {
        const childUser = await auth.getUserByEmail(idToEmail(loginId));
        await auth.updateUser(childUser.uid, { password: newPassword });
      } catch { /* 계정 없으면 무시 */ }
    }

    const smsText = `[플랜토] ${parentName}님, 비밀번호가 초기화됐어요.\n\n새 비밀번호: ${newPassword}\n\n👉 plantor.web.app`;
    try {
      await sendSms(phone, smsText, solapiApiKey.value(), solapiApiSecret.value());
    } catch { /* SMS 실패해도 리셋은 완료 */ }

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
    } catch { /* Auth 계정 없으면 무시 */ }
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

  const userId = childSnap.data()!.userId as string | undefined;

  await db.collection("children").doc(childId).update({ name: newName.trim() });

  if (userId) {
    try {
      await auth.updateUser(userId, { displayName: newName.trim() });
    } catch { /* Auth 계정 없으면 무시 */ }
  }

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

    const serviceLines = services.map((s) => `· ${s.childName} · ${s.serviceName} → ${s.newEndDate}까지`).join("\n");
    const smsText = [
      `[플랜토] ${parentName}님, 입금이 확인되었습니다 ✅`,
      ``,
      `구독이 연장되었어요:`,
      serviceLines,
      ``,
      `감사합니다 🌱`,
    ].join("\n");

    await sendSms(phone, smsText, solapiApiKey.value(), solapiApiSecret.value());
    return { success: true };
  }
);

// AI 패키지 입금확인 — endDate 설정 + SMS 발송
export const confirmAiPackagePayment = onCall(
  { secrets: [solapiApiKey, solapiApiSecret] },
  async (request) => {
    await assertAdmin(request.auth);

    const { familyId, endDate } = request.data as { familyId: string; endDate: string };
    if (!familyId || !endDate) throw new HttpsError("invalid-argument", "familyId와 endDate가 필요합니다.");

    const familySnap = await db.collection("families").doc(familyId).get();
    if (!familySnap.exists) throw new HttpsError("not-found", "가족 정보를 찾을 수 없습니다.");
    const { parentName, phone, userId } = familySnap.data()!;

    await db.collection("families").doc(familyId).update({ aiPackageEndDate: endDate });
    if (userId) {
      await db.collection("users").doc(userId).update({ aiPackageEndDate: endDate });
    }

    const [y, m, d] = endDate.split("-");
    const formatted = `${y}.${m}.${d}`;
    const smsText = `[플랜토] ${parentName}님, Mom& AI 패키지 입금이 확인되었어요! ✅\n\nChatGPT · 제미나이 · 캔바 공유 계정을 이용하실 수 있습니다.\n\n이용 기간: ~${formatted}\n\n👉 plantor.web.app 에서 학부모 계정으로 로그인하시면 상단 메뉴에 [AI 패키지] 탭이 생성됩니다.`;

    try {
      await sendSms(phone, smsText, solapiApiKey.value(), solapiApiSecret.value());
    } catch {
      // SMS 실패해도 활성화는 완료
    }

    return { success: true };
  }
);

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

// users 문서 복구 — children 컬렉션 기반으로 role/plantor_id 동기화
export const repairUserDocs = onCall(async (request) => {
  await assertAdmin(request.auth);

  const childrenSnap = await db.collection("children").get();
  let fixed = 0;

  for (const childDoc of childrenSnap.docs) {
    const data = childDoc.data();
    const loginId = (data.loginId as string | undefined)?.toLowerCase();
    if (!loginId) continue;
    try {
      const userRecord = await auth.getUserByEmail(idToEmail(loginId));
      await db.collection("users").doc(userRecord.uid).set({
        name: data.name ?? "",
        plantor_id: loginId,
        role: "student",
        grade: data.grade ?? "",
        parentUid: data.userId ?? null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      fixed++;
    } catch {
      // Auth 계정 없으면 무시
    }
  }

  return { success: true, fixed };
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
      } catch { /* Auth 계정 없으면 무시 */ }
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
      try { await auth.deleteUser(userId); } catch { /* Auth 계정 없으면 무시 */ }
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
