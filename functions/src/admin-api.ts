import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { solapiApiKey, solapiApiSecret, SITE_URL, BANK_NAME, BANK_ACCOUNT, BANK_HOLDER, KAKAO_TEMPLATES } from "./config";
import { loadServiceMeta } from "./service-meta-loader";
import { assertAdmin, auth, db } from "./utils";
import {
  fetchSolapiMessages,
  fetchSolapiBalance,
  sendBulkFriendTalk,
  uploadImageToSolapi,
  sendAlimtalk,
  getKakaoChannels,
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

    // 가계부 수입 자동 기록 (어드민 개인 가계부) — 같은 확인 중복 방지
    const students = (cls.students as Array<{ name?: string; parentPhone?: string }>) ?? [];
    const studentNames = students.map((s) => s.name ?? "").filter(Boolean).join(", ");
    const tuition = (cls.tuition as number) ?? 0;
    if (tuition > 0) {
      const paymentKey = `direct_${classId}_${newExpiry}`;
      const dup = await db.collection("vaultEntries").where("paymentKey", "==", paymentKey).limit(1).get();
      if (dup.empty) {
        const kst = new Date(Date.now() + 9 * 3600 * 1000);
        const todayKst = `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}`;
        await db.collection("vaultEntries").add({
          date: todayKst,
          type: "income",
          amount: tuition,
          category: "수업료",
          memo: `${studentNames} 수업료`,
          receiptUrl: null,
          recurringId: null,
          paymentKey,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    // 알림톡 발송 (실패 시 SMS fallback)
    const parentPhone = students[0]?.parentPhone as string | undefined;
    if (parentPhone) {
      const studentNames = students.map((s) => s.name ?? "").filter(Boolean).join(", ");
      const fallbackText = `${studentNames}학생 입금이 확인되었습니다.\n감사합니다.`;
      await sendAlimtalk(
        parentPhone,
        KAKAO_TEMPLATES.RENEWAL_CONFIRM,
        { "#{parentName}": studentNames, "#{details}": `학습비 입금 확인 완료` },
        fallbackText,
        solapiApiKey.value(),
        solapiApiSecret.value()
      );
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
        sent = await sendSubscriptionExpiryNotice(daysAhead, solapiApiKey.value(), solapiApiSecret.value());
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

      const normalizedPhones = phones.map((p: string) => p.replace(/\D/g, ""));
      await sendBulkFriendTalk(
        normalizedPhones.map((to: string) => ({ to, text })),
        solapiApiKey.value(),
        solapiApiSecret.value()
      );
      return { success: true, count: phones.length };
    } catch (e: unknown) {
      if (e instanceof HttpsError) throw e;
      const raw = e instanceof Error ? e.message : String(e);
      const msg = raw.length > 150 ? raw.slice(0, 150) + "…" : raw;
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
  const meta = await loadServiceMeta();
  const serviceNames = subsSnap.docs
    .map((d) => meta.get(d.data().serviceSlug as string)?.name ?? (d.data().serviceSlug as string))
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

// ─── Solapi 잔액 조회 (어드민 전용) ──────────────────────────────────────────
export const getSolapiBalance = onCall(
  { secrets: [solapiApiKey, solapiApiSecret] },
  async (request) => {
    await assertAdmin(request.auth);
    try {
      const data = await fetchSolapiBalance(
        solapiApiKey.value(), solapiApiSecret.value()
      );
      return data;
    } catch (e) {
      throw new HttpsError("internal", (e as Error).message);
    }
  }
);

// ─── 카카오톡 채널 목록 조회 (어드민 전용) ──────────────────────────────────────
export const getKakaoChannelList = onCall(
  { secrets: [solapiApiKey, solapiApiSecret] },
  async (request) => {
    await assertAdmin(request.auth);
    try {
      const channels = await getKakaoChannels(solapiApiKey.value(), solapiApiSecret.value());
      return { channels };
    } catch (e) {
      throw new HttpsError("internal", (e as Error).message);
    }
  }
);

// ─── 카카오톡 알림톡 테스트 발송 (어드민 전용) ─────────────────────────────────
export const sendTestKakao = onCall(
  { secrets: [solapiApiKey, solapiApiSecret] },
  async (request) => {
    await assertAdmin(request.auth);
    const { phone, templateId, variables, fallbackText } = request.data as {
      phone: string; templateId: string; variables?: Record<string, string>; fallbackText?: string;
    };
    if (!phone || !templateId) throw new HttpsError("invalid-argument", "phone, templateId가 필요합니다.");
    try {
      await sendAlimtalk(
        phone, templateId, variables ?? {}, fallbackText ?? "알림톡 테스트",
        solapiApiKey.value(), solapiApiSecret.value()
      );
      return { success: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new HttpsError("internal", `알림톡 발송 실패: ${msg}`);
    }
  }
);

// ─── 계정별 마지막 접속 시각 (어드민 전용) ───────────────────────────────────
/**
 * Auth 사용자 전원의 마지막 접속 시각. 어드민 회원 목록에서 가입일 옆에 띄운다.
 *
 * lastRefreshTime 을 먼저 쓴다 — lastSignInTime 은 '로그인 버튼을 누른 시각'이라
 * 한 번 로그인해 두고 몇 달을 쓰는 학생은 값이 옛날에 멈춰 있다. 토큰 갱신 시각이
 * 실제로 앱을 쓴 때에 가깝다. 갱신 기록이 없는 계정만 로그인 시각으로 떨어진다.
 *
 * 키는 둘 다 준다: uid(학부모는 카카오·구글 로그인이라 이메일이 제각각) 와
 * plantor 아이디(학생·학부모의 {id}@plantor.app 계정).
 */
export const getLastSignIns = onCall(async (request) => {
  await assertAdmin(request.auth as never);
  const byUid: Record<string, string> = {};
  const byLoginId: Record<string, string> = {};
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) {
      const at = u.metadata.lastRefreshTime || u.metadata.lastSignInTime;
      if (!at) continue;
      const iso = new Date(at).toISOString();
      byUid[u.uid] = iso;
      const email = (u.email ?? "").toLowerCase();
      if (email.endsWith("@plantor.app")) byLoginId[email.replace("@plantor.app", "")] = iso;
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return { byUid, byLoginId };
});
