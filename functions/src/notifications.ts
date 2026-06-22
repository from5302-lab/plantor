import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import {
  solapiApiKey, solapiApiSecret, gmailUser, gmailAppPassword,
  SITE_URL, BANK_NAME, BANK_ACCOUNT, BANK_HOLDER,
} from "./config";
import { sendAlimtalk, sendAdminEmail, fmtWon, fmtDate, db } from "./utils";
import { KAKAO_TEMPLATES } from "./config";
import { loadServiceMeta, iconHtmlFromInfo } from "./service-meta-loader";

// ─── 신청 접수 시 입금 안내 SMS ───────────────────────────────────────────────
export const notifyNewSignup = onDocumentCreated(
  { document: "signups/{signupId}", secrets: [solapiApiKey, solapiApiSecret] },
  async (event) => {
    const signup = event.data?.data();
    if (!signup) return;

    const {
      parentName, phone, children, parentServices,
      estimatedMonthly, couponCode, couponDiscount, referralCode, referralDiscount, finalMonthly,
    } = signup as {
      parentName: string;
      phone: string;
      estimatedMonthly: number;
      children: Array<{ name: string; grade: string; selectedServices: string[] }>;
      parentServices: string[];
      couponCode?: string | null;
      couponDiscount?: number;
      referralCode?: string | null;
      referralDiscount?: number;
      finalMonthly?: number;
    };

    if (!phone) return;

    const meta = await loadServiceMeta();

    const lines: string[] = [
      `[플랜토] ${parentName}님, 신청해 주셔서 감사합니다 🌱`,
      ``,
      `📋 신청 내역:`,
    ];

    (children ?? []).forEach((c) => {
      const svcNames = (c.selectedServices ?? [])
        .map((slug) => meta.get(slug)?.name ?? slug)
        .join(", ");
      lines.push(`· ${c.name} (${c.grade}) — ${svcNames}`);
    });

    (parentServices ?? []).forEach((slug) => {
      lines.push(`· ${meta.get(slug)?.name ?? slug} (학부모)`);
    });

    const base = estimatedMonthly ?? 0;
    const discount = (couponDiscount ?? 0) + (referralDiscount ?? 0);
    const monthly = (finalMonthly ?? 0) > 0 ? (finalMonthly ?? 0) : base;
    const won = monthly > 0 ? `${monthly.toLocaleString("ko-KR")}원` : "추후 안내";

    lines.push(``, `월 결제 합계: ${won}`);

    if (couponCode && (couponDiscount ?? 0) > 0) {
      lines.push(`쿠폰 할인 (${couponCode}): -${(couponDiscount!).toLocaleString("ko-KR")}원`);
    }
    if (referralCode && (referralDiscount ?? 0) > 0) {
      lines.push(`추천인 할인: -${(referralDiscount!).toLocaleString("ko-KR")}원`);
    }
    if (discount > 0 && monthly > 0) {
      lines.push(`최종 결제: ${(monthly - discount).toLocaleString("ko-KR")}원`);
    }

    lines.push(
      ``,
      `입금 계좌 (${BANK_NAME})`,
      `${BANK_ACCOUNT} (${BANK_HOLDER})`,
      ``,
      `입금 확인 후 안내드리겠습니다.`,
      ``,
      `※ 신청 후 24시간 이내에 입금이 확인되지 않으면 신청이 자동으로 취소될 수 있어요. 입금이 어려우시면 편하게 말씀해 주세요 🌱`,
    );

    const smsText = lines.join("\n");
    const normalizedPhone = phone.replace(/\D/g, "");

    // 알림톡 변수 구성
    const detailLines: string[] = [];
    (children ?? []).forEach((c) => {
      const svcNames = (c.selectedServices ?? []).map((slug) => meta.get(slug)?.name ?? slug).join(", ");
      detailLines.push(`· ${c.name} (${c.grade}) — ${svcNames}`);
    });
    (parentServices ?? []).forEach((slug) => {
      detailLines.push(`· ${meta.get(slug)?.name ?? slug} (학부모)`);
    });

    try {
      await sendAlimtalk(
        normalizedPhone,
        KAKAO_TEMPLATES.SIGNUP_PAYMENT,
        { "#{parentName}": parentName, "#{details}": detailLines.join("\n"), "#{amount}": won },
        smsText,
        solapiApiKey.value(),
        solapiApiSecret.value()
      );
    } catch (e) {
      console.error(`[notifyNewSignup] 발송 실패 (${phone}):`, e);
    }

    // 쿠폰 사용 즉시 처리 — 신청 접수 시점에 useCount/usedPhones 업데이트
    // (어드민 승인 전에 동일 쿠폰 중복 사용 방지)
    const couponCodeVal = signup.couponCode as string | null | undefined;
    if (couponCodeVal) {
      try {
        const couponRef = db.collection("coupons").doc(couponCodeVal.toUpperCase());
        await couponRef.update({
          useCount: admin.firestore.FieldValue.increment(1),
          usedPhones: admin.firestore.FieldValue.arrayUnion(normalizedPhone),
        });
      } catch (e) {
        console.error(`[notifyNewSignup] 쿠폰 처리 실패 (${couponCodeVal}):`, e);
      }
    }
  }
);

// ─── 신규 신청 접수 시 운영자 이메일 알림 ────────────────────────────────────
export const notifyAdminOnSignup = onDocumentCreated(
  { document: "signups/{signupId}", secrets: [gmailUser, gmailAppPassword] },
  async (event) => {
    const signup = event.data?.data();
    if (!signup) return;

    const { parentName, phone, children, parentServices } = signup as {
      parentName: string;
      phone: string;
      children: Array<{ name: string; grade: string; selectedServices: string[] }>;
      parentServices?: string[];
    };

    const meta = await loadServiceMeta();

    const childRows = (children ?? []).map((c) => {
      const svcIcons = (c.selectedServices ?? []).map((slug: string) => {
        const info = meta.get(slug);
        return `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:8px">
          ${iconHtmlFromInfo(info)}<span style="font-size:13px">${info?.name ?? slug}</span></span>`;
      }).join("");
      return `<div style="padding:10px 12px;background:#f5f5f5;border-radius:8px;margin-bottom:8px">
        <b>${c.name}</b> <span style="color:#888;font-size:13px">${c.grade}</span>
        <div style="margin-top:6px">${svcIcons || "서비스 미선택"}</div>
      </div>`;
    }).join("");

    const parentRow = (parentServices ?? []).length > 0
      ? `<div style="padding:10px 12px;background:#ede9f9;border-radius:8px;margin-bottom:8px">
          <b style="color:#6b46c1">학부모 서비스</b>
          <div style="margin-top:6px">${(parentServices ?? []).map((slug) =>
            `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:8px">
              <span style="font-size:13px">${meta.get(slug)?.name ?? slug}</span></span>`
          ).join("")}</div>
        </div>`
      : "";

    const html = `
      <h2 style="margin:0 0 20px">📋 신규 수강신청이 들어왔어요</h2>
      <p style="margin:0 0 6px"><b>학부모:</b> ${parentName}</p>
      <p style="margin:0 0 16px"><b>연락처:</b> ${phone}</p>
      <div style="margin-bottom:20px">${childRows}${parentRow}</div>
      <a href="${SITE_URL}/admin" style="color:#38a848">👉 관리자 페이지 바로가기</a>
    `;

    try {
      await sendAdminEmail(`[플랜토] 신규 신청 — ${parentName}`, html, gmailUser.value(), gmailAppPassword.value());
    } catch {
      // 이메일 실패해도 신청은 유지
    }
  }
);

// ─── 연장신청 접수 시 운영자 이메일 알림 ─────────────────────────────────────
export const notifyAdminOnRenewal = onDocumentCreated(
  { document: "renewalRequests/{requestId}", secrets: [gmailUser, gmailAppPassword] },
  async (event) => {
    const req = event.data?.data();
    if (!req) return;

    const familyId = req.familyId as string;
    if (!familyId) return;

    // 동일 (familyId, childId, serviceSlug, status=pending) 중복 doc 청소.
    // 같은 키의 pending이 여러 개면, 이 새 doc보다 오래된 것을 삭제하여
    // 어드민 페이지 중복 표시 + 이메일 중복 항목을 방지.
    try {
      const requestId = event.params.requestId;
      const myCreatedMs = (req.createdAt as admin.firestore.Timestamp | undefined)?.toMillis?.();
      const childIdVal = req.childId ?? null;
      const dupSnap = await db.collection("renewalRequests")
        .where("familyId", "==", familyId)
        .where("childId", "==", childIdVal)
        .where("serviceSlug", "==", req.serviceSlug as string)
        .where("status", "==", "pending")
        .get();
      for (const d of dupSnap.docs) {
        if (d.id === requestId) continue;
        const otherMs = (d.data().createdAt as admin.firestore.Timestamp | undefined)?.toMillis?.();
        if (myCreatedMs != null && otherMs != null && otherMs < myCreatedMs) {
          await d.ref.delete();
        }
      }
    } catch (e) {
      console.error(`[notifyAdminOnRenewal] 중복 doc 청소 실패 (family=${familyId}):`, e);
    }

    // 중복 방지: 2분 이내 동일 familyId 메일 이미 발송됐으면 스킵
    const lockRef = db.doc(`renewalEmailLocks/${familyId}`);
    try {
      await db.runTransaction(async (t) => {
        const lock = await t.get(lockRef);
        if (lock.exists) {
          const age = Date.now() - (lock.data()!.sentAt as admin.firestore.Timestamp).toMillis();
          if (age < 2 * 60 * 1000) throw new Error("duplicate");
        }
        t.set(lockRef, { sentAt: admin.firestore.FieldValue.serverTimestamp() });
      });
    } catch (e: unknown) {
      if ((e as Error).message === "duplicate") return;
      throw e;
    }

    let parentName = familyId;
    let familyPhone = "";
    try {
      const snap = await db.collection("families").doc(familyId).get();
      parentName = snap.data()?.parentName ?? familyId;
      familyPhone = (snap.data()?.phone as string ?? "").replace(/\D/g, "");
    } catch { /* 무시 */ }

    // 쿠폰 사용 카운트 — 연장 신청 접수 시점에 즉시 반영 (admin 권한)
    const couponCode = req.couponCode as string | null | undefined;
    if (couponCode) {
      try {
        const couponRef = db.collection("coupons").doc(couponCode.toUpperCase());
        const updateData: Record<string, unknown> = {
          useCount: admin.firestore.FieldValue.increment(1),
        };
        if (familyPhone) {
          updateData.usedPhones = admin.firestore.FieldValue.arrayUnion(familyPhone);
        }
        await couponRef.update(updateData);
      } catch (e) {
        console.error(`[notifyAdminOnRenewal] 쿠폰 처리 실패 (${couponCode}):`, e);
      }
    }

    const reqsSnap = await db.collection("renewalRequests")
      .where("familyId", "==", familyId)
      .where("status", "==", "pending")
      .get();

    if (reqsSnap.empty) return;

    type ReqData = {
      childName: string; serviceSlug: string; serviceName?: string; months: number;
      finalAmount: number; totalPrice?: number;
      couponCode?: string; couponNote?: string; couponDiscount?: number;
      walletDiscount?: number; referralCode?: string; referralDiscount?: number;
      endDate?: admin.firestore.Timestamp; newEndDate?: admin.firestore.Timestamp;
    };
    const items = reqsSnap.docs.map((d) => d.data() as ReqData);
    const grandTotal = items.reduce((s, i) => s + (i.finalAmount ?? i.totalPrice ?? 0), 0);
    const createdAt = new Date().toLocaleDateString("ko-KR", {
      year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
    });

    const meta = await loadServiceMeta();

    const rows = items.map((item) => {
      const info = meta.get(item.serviceSlug);
      const icon = iconHtmlFromInfo(info);
      // serviceOverrides 기반 동적 이름 우선, 그 다음 doc에 저장된 snapshot (rename 전 보호), 마지막 slug
      const name = info?.name || item.serviceName || item.serviceSlug;
      const endStr = item.endDate ? fmtDate(item.endDate) : "";
      const newEndStr = item.newEndDate ? `<span style="color:#38a848;font-weight:600">${fmtDate(item.newEndDate)}</span>` : "";
      const dateRow = endStr ? `<div style="font-size:12px;color:#888;margin-top:4px">${endStr} → ${newEndStr}</div>` : "";
      const discountParts: string[] = [];
      if (item.couponCode && item.couponDiscount) {
        const label = item.couponNote ? `${item.couponCode} · ${item.couponNote}` : item.couponCode;
        discountParts.push(`쿠폰 [${label}] −${fmtWon(item.couponDiscount)}`);
      }
      if (item.referralCode && item.referralDiscount) discountParts.push(`추천 −${fmtWon(item.referralDiscount)}`);
      if (item.walletDiscount) discountParts.push(`쿠폰함 −${fmtWon(item.walletDiscount)}`);
      const discountRow = discountParts.length > 0
        ? `<div style="font-size:11px;color:#1a7f4b;margin-top:4px">${discountParts.join("  ")}</div>` : "";
      const hasChild = !!item.childName && item.childName !== "null";
      const label = hasChild ? `${item.childName} · ${name}` : `학부모 · ${name}`;
      return `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:12px;background:#f5f7fa;border-radius:8px;margin-bottom:8px">
          <div>
            <div style="font-size:14px;font-weight:600">${icon}${label}</div>
            ${dateRow}
            ${discountRow}
          </div>
          <div style="font-size:14px;font-weight:600;white-space:nowrap;padding-left:12px">${item.months}개월 · ${fmtWon(item.finalAmount ?? item.totalPrice ?? 0)}</div>
        </div>`;
    }).join("");

    const html = `
      <h2 style="margin:0 0 20px">🎉 연장신청이 들어왔어요!!</h2>
      <div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
          <div>
            <div style="font-size:16px;font-weight:700">${parentName}</div>
            <div style="font-size:13px;color:#888;margin-top:2px">신청일 ${createdAt}</div>
          </div>
          <div style="font-size:20px;font-weight:700">${fmtWon(grandTotal)}</div>
        </div>
        ${rows}
      </div>
      <a href="${SITE_URL}/admin" style="color:#38a848;font-weight:600">👉 관리자 페이지 바로가기</a>
    `;

    try {
      await sendAdminEmail(
        `[플랜토] 연장신청 — ${parentName} ${fmtWon(grandTotal)}`,
        html, gmailUser.value(), gmailAppPassword.value()
      );
    } catch {
      // 이메일 실패해도 신청은 유지
    }
  }
);


// ─── 템플릿 로드 + 플레이스홀더 치환 ──────────────────────────────────────────

async function loadTemplate(
  templateId: string,
  fallback: string
): Promise<string> {
  try {
    const snap = await db.collection("smsTemplates").doc(templateId).get();
    if (snap.exists) return (snap.data()!.body as string) || fallback;
  } catch { /* 템플릿 로드 실패 시 폴백 */ }
  return fallback;
}

function fillTemplate(
  tpl: string,
  vars: Record<string, string>
): string {
  return Object.entries(vars).reduce(
    (text, [key, val]) => text.replace(new RegExp(`\\{${key}\\}`, "g"), val),
    tpl
  );
}

// ─── 1:1 수업 만료 안내 공통 로직 ───────────────────────────────────────────────

const DIRECT_CLASS_FALLBACK = [
  `안녕하세요^^`,
  `충쌤입니다,`,
  ``,
  `{childNames} 다음달 학습비 입금 기간입니다`,
  `매달 1일 전까지 익월 학습비 {amount}원을`,
  `아래계좌에 학생이름으로 입금해주세요,`,
  ``,
  `감사합니다.`,
  ``,
  `3333 36 972 5919`,
  `카카오뱅크 이충선`,
].join("\n");

export async function sendDirectClassExpiryNotice(
  daysAhead: number,
  apiKey: string,
  apiSecret: string
) {
  const now = new Date();
  const from = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  const to   = new Date(now.getTime() + (daysAhead + 1) * 24 * 60 * 60 * 1000);

  const fromStr = from.toISOString().slice(0, 10);
  const toStr   = to.toISOString().slice(0, 10);

  const snap = await db.collection("directClasses")
    .where("status", "==", "active")
    .where("expiry", ">=", fromStr)
    .where("expiry", "<",  toStr)
    .get();

  if (snap.empty) return;

  const tpl = await loadTemplate(`directClass_d${daysAhead}`, DIRECT_CLASS_FALLBACK);

  for (const doc of snap.docs) {
    try {
      const cls = doc.data();
      const students: Array<{ parentPhone?: string; name?: string }> = cls.students ?? [];
      const firstStudent = students[0];
      const parentPhone = firstStudent?.parentPhone as string | undefined;
      if (!parentPhone) continue;

      const studentNames = students.map((s) => s.name ?? "").filter(Boolean).join(", ");
      const tuition = (cls.tuition as number) ?? 0;

      const text = fillTemplate(tpl, {
        childNames: studentNames,
        amount: tuition.toLocaleString("ko-KR"),
        bankInfo: `3333 36 972 5919\n카카오뱅크 이충선`,
      });

      await sendAlimtalk(
        parentPhone,
        KAKAO_TEMPLATES.DIRECT_CLASS_EXPIRY,
        { "#{childNames}": studentNames, "#{amount}": tuition.toLocaleString("ko-KR") },
        text,
        apiKey,
        apiSecret
      );
    } catch {
      // 한 건 실패해도 계속
    }
  }
}

// ─── D-7 1:1 수업료 만료 알림 ─────────────────────────────────────────────────
export const notifyExpiringDirectClassD7 = onSchedule(
  { schedule: "0 2 * * *", timeZone: "UTC", secrets: [solapiApiKey, solapiApiSecret] },
  async () => {
    await sendDirectClassExpiryNotice(7, solapiApiKey.value(), solapiApiSecret.value());
  }
);

// ─── D-3 1:1 수업료 만료 알림 ─────────────────────────────────────────────────
export const notifyExpiringDirectClassD3 = onSchedule(
  { schedule: "0 2 * * *", timeZone: "UTC", secrets: [solapiApiKey, solapiApiSecret] },
  async () => {
    await sendDirectClassExpiryNotice(3, solapiApiKey.value(), solapiApiSecret.value());
  }
);

// ─── D-0 1:1 수업료 만료 당일 알림 ───────────────────────────────────────────
export const notifyExpiringDirectClassD0 = onSchedule(
  { schedule: "0 2 * * *", timeZone: "UTC", secrets: [solapiApiKey, solapiApiSecret] },
  async () => {
    await sendDirectClassExpiryNotice(0, solapiApiKey.value(), solapiApiSecret.value());
  }
);


// ─── 구독 만료 안내 공통 로직 ────────────────────────────────────────────────────

const SUBSCRIPTION_FALLBACK = [
  `[플랜토] {parentName}님, 구독 만료 안내드립니다.`,
  ``,
  `{childNames}의 {serviceNames} 구독이 {endDate}에 만료됩니다.`,
  ``,
  `연장을 원하시면 사이트에 로그인해서`,
  `연장신청을 해주세요.`,
  ``,
  `👉 {siteUrl}`,
  `아이디: {parentId}`,
  ``,
  `감사합니다 🌱`,
].join("\n");

export async function sendSubscriptionExpiryNotice(
  daysAhead: number,
  apiKey: string,
  apiSecret: string
) {
  // endDate 저장 시간대가 코드경로마다 다를 수 있으므로 넓은 범위로 조회
  // 대상일의 KST 자정(=UTC-9h) ~ 대상일 다음날 UTC 자정까지 (33시간 윈도우)
  const KST_OFFSET = 9 * 60 * 60 * 1000;
  const nowKst = new Date(Date.now() + KST_OFFSET);
  const targetYear = nowKst.getUTCFullYear();
  const targetMonth = nowKst.getUTCMonth();
  const targetDay = nowKst.getUTCDate() + daysAhead;

  const from = new Date(Date.UTC(targetYear, targetMonth, targetDay) - KST_OFFSET); // 대상일 00:00 KST
  const to   = new Date(Date.UTC(targetYear, targetMonth, targetDay + 1));            // 대상일+1 00:00 UTC

  // Firestore 복합 쿼리 대신 status만 필터 후 코드에서 날짜 필터링
  const allActive = await db.collection("subscriptions")
    .where("status", "==", "active")
    .get();

  const matching = allActive.docs.filter((d) => {
    const ed = d.data().endDate;
    if (!ed?.toDate) return false;
    const ms = ed.toDate().getTime();
    return ms >= from.getTime() && ms < to.getTime();
  });

  if (matching.length === 0) return 0;

  // familyId 기준 그룹핑
  const grouped = new Map<string, Array<{ childId: string | null; serviceSlug: string; endDate: admin.firestore.Timestamp; docId: string }>>();
  for (const d of matching) {
    const data = d.data();
    const fid = data.familyId as string | undefined;
    if (!fid) continue; // familyId 없으면 스킵
    if (!grouped.has(fid)) grouped.set(fid, []);
    grouped.get(fid)!.push({
      childId: (data.childId as string | null | undefined) ?? null,
      serviceSlug: data.serviceSlug as string,
      endDate: data.endDate as admin.firestore.Timestamp,
      docId: d.id,
    });
  }

  const tpl = await loadTemplate(`subscription_d${daysAhead}`, SUBSCRIPTION_FALLBACK);
  const meta = await loadServiceMeta();
  let sentCount = 0;

  for (const [familyId, subs] of grouped) {
    try {
      const familySnap = await db.collection("families").doc(familyId).get();
      if (!familySnap.exists) continue;
      const family = familySnap.data()!;
      const phone = (family.phone as string | undefined)?.replace(/\D/g, "");
      if (!phone) continue;

      const parentName = (family.parentName as string) ?? "";
      const userId = family.userId as string | undefined;
      let parentId = "";
      if (userId) {
        const userSnap = await db.collection("users").doc(userId).get();
        parentId = (userSnap.data()?.plantor_id as string) ?? "";
      }

      // childId가 null(학부모 본인 서비스)이거나 빈 문자열이면 children 조회 스킵.
      // 과거 데이터 호환을 위해 "__parent__" sentinel도 함께 거름 (마이그레이션 완료 후 제거 가능).
      const childIds = [...new Set(
        subs.map((s) => s.childId).filter((c): c is string => typeof c === "string" && c.length > 0 && c !== "__parent__")
      )];
      const childNames: string[] = [];
      for (const cid of childIds) {
        const cSnap = await db.collection("children").doc(cid).get();
        if (cSnap.exists) childNames.push((cSnap.data()!.name as string) ?? "");
      }

      const serviceNames = subs
        .map((s) => meta.get(s.serviceSlug)?.name ?? s.serviceSlug)
        .join(", ");

      const endDate = subs[0].endDate.toDate().toLocaleDateString("ko-KR");

      const text = fillTemplate(tpl, {
        parentName,
        parentId,
        childNames: childNames.filter(Boolean).join(", "),
        serviceNames,
        endDate,
        amount: "",
        bankInfo: `${BANK_ACCOUNT}\n${BANK_NAME} ${BANK_HOLDER}`,
        siteUrl: SITE_URL,
      });

      await sendAlimtalk(
        phone,
        KAKAO_TEMPLATES.SUBSCRIPTION_EXPIRY,
        {
          "#{parentName}": parentName,
          "#{childNames}": childNames.filter(Boolean).join(", "),
          "#{serviceNames}": serviceNames,
          "#{endDate}": endDate,
          "#{parentId}": parentId,
        },
        text,
        apiKey,
        apiSecret
      );
      sentCount++;
    } catch (e) {
      // 한 가족 실패해도 계속 — 단, 추적 가능하도록 로깅
      console.error(`[D${daysAhead}] family=${familyId} 발송 실패:`, (e as Error)?.message ?? e);
    }
  }
  return sentCount;
}

// ─── D-7 구독 만료 알림 ─────────────────────────────────────────────────────────
export const notifyExpiringSubscriptionD7 = onSchedule(
  { schedule: "0 2 * * *", timeZone: "UTC", secrets: [solapiApiKey, solapiApiSecret] },
  async () => {
    await sendSubscriptionExpiryNotice(7, solapiApiKey.value(), solapiApiSecret.value());
  }
);

// ─── D-3 구독 만료 알림 ─────────────────────────────────────────────────────────
export const notifyExpiringSubscriptionD3 = onSchedule(
  { schedule: "0 2 * * *", timeZone: "UTC", secrets: [solapiApiKey, solapiApiSecret] },
  async () => {
    await sendSubscriptionExpiryNotice(3, solapiApiKey.value(), solapiApiSecret.value());
  }
);

// ─── D-0 구독 만료 당일 알림 ────────────────────────────────────────────────────
export const notifyExpiringSubscriptionD0 = onSchedule(
  { schedule: "0 2 * * *", timeZone: "UTC", secrets: [solapiApiKey, solapiApiSecret] },
  async () => {
    await sendSubscriptionExpiryNotice(0, solapiApiKey.value(), solapiApiSecret.value());
  }
);


// ─── 인증샷 제출 시 학부모 SMS 발송 ──────────────────────────────────────────
export const notifyParentOnScreenshot = onDocumentCreated(
  { document: "learningLogs/{logId}", secrets: [solapiApiKey, solapiApiSecret] },
  async (event) => {
    const log = event.data?.data();
    if (!log?.screenshotUrl || !log?.childId) return;

    const childSnap = await db.collection("children").doc(log.childId).get();
    if (!childSnap.exists) return;
    const childData = childSnap.data()!;
    const familyId = childData.familyId as string | undefined;
    const childName = (childData.name ?? "") as string;
    if (!familyId) return;

    const familySnap = await db.collection("families").doc(familyId).get();
    if (!familySnap.exists) return;
    const phone = familySnap.data()!.phone as string | undefined;
    if (!phone) return;

    const meta = await loadServiceMeta();
    const serviceName = meta.get(log.serviceSlug as string)?.name ?? (log.serviceSlug as string);
    const smsText = `[플랜토] ${childName}이(가) ${serviceName} 학습을 완료했어요! 📚\n확인하기 👉 ${SITE_URL}/parent`;

    try {
      await sendAlimtalk(
        phone,
        KAKAO_TEMPLATES.LEARNING_COMPLETE,
        { "#{childName}": childName, "#{serviceName}": serviceName },
        smsText,
        solapiApiKey.value(),
        solapiApiSecret.value()
      );
    } catch { /* 발송 실패해도 로그는 유지 */ }
  }
);
