import { onCall, HttpsError } from "firebase-functions/v2/https";
import { solapiApiKey, solapiApiSecret, SITE_URL, BANK_NAME, BANK_ACCOUNT, BANK_HOLDER, SERVICE_META } from "./config";
import { assertAdmin, db } from "./utils";
import {
  fetchSolapiMessages,
  sendBulkSms as solapiBulkSend,
  uploadImageToSolapi,
  sendSms,
} from "./sms";
import { sendDirectClassExpiryNotice, sendSubscriptionExpiryNotice } from "./notifications";

export { uploadImageToSolapi };

// ─── Solapi 발송 내역 조회 (어드민 전용) ─────────────────────────────────────
export const getSolapiMessages = onCall(
  { secrets: [solapiApiKey, solapiApiSecret] },
  async (request) => {
    await assertAdmin(request.auth);
    const { limit = 30 } = (request.data ?? {}) as { limit?: number };

    try {
      const data = await fetchSolapiMessages(
        limit, solapiApiKey.value(), solapiApiSecret.value()
      ) as Record<string, unknown>;
      // messageList는 { id: message } 형태의 객체로 반환됨 → 배열로 변환
      const messageList = (data.messageList ?? {}) as Record<string, unknown>;
      return { ...data, messages: Object.values(messageList) };
    } catch (e) {
      throw new HttpsError("internal", (e as Error).message);
    }
  }
);

// ─── 1:1 수업 입금확인 + 만료일 연장 + SMS ────────────────────────────────────
export const confirmDirectClassPayment = onCall(
  { secrets: [solapiApiKey, solapiApiSecret] },
  async (request) => {
    await assertAdmin(request.auth);
    const { classId, months = 1 } = request.data as { classId: string; months?: number };
    if (!classId) throw new HttpsError("invalid-argument", "classId가 필요합니다.");

    const docRef = db.collection("directClasses").doc(classId);
    const snap = await docRef.get();
    if (!snap.exists) throw new HttpsError("not-found", "수업을 찾을 수 없습니다.");

    const cls = snap.data()!;
    const currentExpiry = cls.expiry as string | null;

    // 새 만료일: 현재 만료일(또는 오늘) 기준 +months개월의 말일
    const base = currentExpiry ? new Date(currentExpiry + "T00:00:00+09:00") : new Date();
    const now = new Date();
    const from = base > now ? base : now;
    const newExpiryDate = new Date(from.getFullYear(), from.getMonth() + months + 1, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    const newExpiry = `${newExpiryDate.getFullYear()}-${pad(newExpiryDate.getMonth() + 1)}-${pad(newExpiryDate.getDate())}`;

    await docRef.update({ expiry: newExpiry });

    // SMS 발송
    const students = (cls.students as Array<{ name?: string; parentPhone?: string }>) ?? [];
    const parentPhone = students[0]?.parentPhone as string | undefined;
    if (parentPhone) {
      const studentNames = students.map((s) => s.name ?? "").filter(Boolean).join(", ");
      const text = [
        `안녕하세요^^`,
        `충쌤입니다,`,
        ``,
        `${studentNames} 학습비 입금이 확인되었습니다 ✅`,
        ``,
        `감사합니다.`,
      ].join("\n");
      await sendSms(parentPhone, text, solapiApiKey.value(), solapiApiSecret.value());
    }

    return { newExpiry };
  }
);

// ─── 만료 알림 수동 발송 (어드민 전용) ───────────────────────────────────────
export const triggerExpirySms = onCall(
  { secrets: [solapiApiKey, solapiApiSecret] },
  async (request) => {
    await assertAdmin(request.auth);
    const { templateId } = request.data as { templateId: string };
    if (!templateId) throw new HttpsError("invalid-argument", "templateId가 필요합니다.");

    const match = templateId.match(/^(directClass|subscription)_d(\d+)$/);
    if (!match) throw new HttpsError("invalid-argument", `잘못된 templateId: ${templateId}`);

    const [, type, days] = match;
    const daysAhead = parseInt(days, 10);

    try {
      let sent = 0;
      if (type === "directClass") {
        await sendDirectClassExpiryNotice(daysAhead, solapiApiKey.value(), solapiApiSecret.value());
      } else {
        // 임시 디버그: 매칭된 구독의 전체 필드 확인
        sent = await sendSubscriptionExpiryNotice(daysAhead, solapiApiKey.value(), solapiApiSecret.value());

        const allSnap2 = await db.collection("subscriptions").where("status", "==", "active").get();
        const KST = 9 * 60 * 60 * 1000;
        const nk = new Date(Date.now() + KST);
        const tgt = nk.getUTCDate() + daysAhead;
        const f = new Date(Date.UTC(nk.getUTCFullYear(), nk.getUTCMonth(), tgt) - KST);
        const t = new Date(Date.UTC(nk.getUTCFullYear(), nk.getUTCMonth(), tgt + 1));
        const matched = allSnap2.docs.filter((d) => {
          const ed = d.data().endDate;
          if (!ed?.toDate) return false;
          const ms = ed.toDate().getTime();
          return ms >= f.getTime() && ms < t.getTime();
        });
        const info = matched.slice(0, 3).map((d) => {
          const data = d.data();
          return `${d.id}: fam=${data.familyId ?? "없음"}, child=${data.childId ?? "없음"}, keys=${Object.keys(data).join(",")}`;
        });
        return { success: true, sent, debug: `매칭${matched.length}건, 발송${sent}건\n${info.join("\n")}` };
      }
      return { success: true, sent };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new HttpsError("internal", msg);
    }
  }
);

// ─── 단체 문자 발송 (어드민 전용) ────────────────────────────────────────────
export const sendBulkSms = onCall(
  { secrets: [solapiApiKey, solapiApiSecret] },
  async (request) => {
    try {
      await assertAdmin(request.auth);
      const { phones, text } = request.data as { phones: string[]; text: string };
      if (!phones?.length || !text?.trim())
        throw new HttpsError("invalid-argument", "수신자와 메시지가 필요합니다.");

      const normalizedPhones = phones.map((p: string) => p.replace(/-/g, ""));
      await solapiBulkSend(
        normalizedPhones.map((to: string) => ({ to, text })),
        solapiApiKey.value(),
        solapiApiSecret.value()
      );
      return { success: true, count: phones.length };
    } catch (e: unknown) {
      if (e instanceof HttpsError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[sendBulkSms] 오류:`, msg);
      throw new HttpsError("internal", `발송 실패: ${msg}`);
    }
  }
);

// ─── 만료 알림 문자 미리보기 (어드민 전용) ──────────────────────────────────────
export const previewExpirySms = onCall(async (request) => {
  await assertAdmin(request.auth);

  const { familyId, templateId } = request.data as { familyId: string; templateId?: string };
  if (!familyId) throw new HttpsError("invalid-argument", "familyId가 필요합니다.");

  const familySnap = await db.collection("families").doc(familyId).get();
  if (!familySnap.exists) throw new HttpsError("not-found", "가족 정보를 찾을 수 없습니다.");
  const family = familySnap.data()!;
  const phone = (family.phone as string) ?? "";
  const parentName = (family.parentName as string) ?? "";

  let parentId = "";
  const userId = family.userId as string | undefined;
  if (userId) {
    const userSnap = await db.collection("users").doc(userId).get();
    parentId = (userSnap.data()?.plantor_id as string) ?? "";
  }

  const childrenSnap = await db.collection("children").where("familyId", "==", familyId).get();
  const childNames = childrenSnap.docs.map((d) => (d.data().name as string) ?? "").filter(Boolean);

  const subsSnap = await db.collection("subscriptions").where("familyId", "==", familyId).where("status", "==", "active").get();
  const serviceNames = subsSnap.docs
    .map((d) => SERVICE_META[d.data().serviceSlug as string]?.name ?? (d.data().serviceSlug as string))
    .join(", ");

  const endDates = subsSnap.docs
    .map((d) => d.data().endDate?.toDate?.() as Date | undefined)
    .filter(Boolean) as Date[];
  const earliestEnd = endDates.length > 0
    ? new Date(Math.min(...endDates.map((d) => d.getTime())))
    : new Date();
  const endDate = earliestEnd.toLocaleDateString("ko-KR");

  const tplId = templateId ?? "subscription_d7";
  let tpl: string;
  try {
    const tplSnap = await db.collection("smsTemplates").doc(tplId).get();
    tpl = tplSnap.exists ? ((tplSnap.data()!.body as string) || "") : "";
  } catch { tpl = ""; }

  if (!tpl) {
    tpl = [
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
  }

  const vars: Record<string, string> = {
    parentName, parentId, childNames: childNames.join(", "), serviceNames, endDate,
    amount: "", bankInfo: `${BANK_ACCOUNT}\n${BANK_NAME} ${BANK_HOLDER}`, siteUrl: SITE_URL,
  };
  const text = Object.entries(vars).reduce(
    (t, [key, val]) => t.replace(new RegExp(`\\{${key}\\}`, "g"), val), tpl
  );

  return { phone, text, parentName };
});
