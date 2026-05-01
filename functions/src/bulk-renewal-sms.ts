import { onCall } from "firebase-functions/v2/https";
import { solapiApiKey, solapiApiSecret, SERVICE_META } from "./config";
import { assertAdmin, db } from "./utils";
import { sendBulkSms } from "./sms";
import * as admin from "firebase-admin";

function calcNewEndDate(currentEndDate: admin.firestore.Timestamp | null, months: number): Date {
  const now = new Date();
  const base = currentEndDate ? currentEndDate.toDate() : now;
  const from = base > now ? base : now;
  // base 기준 +months개월 후의 말일
  return new Date(from.getFullYear(), from.getMonth() + months + 1, 0);
}

function fmtKoDate(d: Date): string {
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

/**
 * 특정 날짜 범위 내 승인된 연장신청자에게 일괄 SMS 발송
 * data: { fromDate: "2026-04-20", toDate: "2026-04-21" }
 */
export const sendBulkRenewalSms = onCall(
  { secrets: [solapiApiKey, solapiApiSecret] },
  async (request) => {
    await assertAdmin(request.auth);

    const { fromDate, toDate } = request.data as { fromDate: string; toDate: string };

    const from = new Date(fromDate + "T00:00:00+09:00");
    const to = new Date(toDate + "T23:59:59+09:00");

    const snap = await db.collection("renewalRequests")
      .where("status", "==", "approved")
      .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(from))
      .where("createdAt", "<=", admin.firestore.Timestamp.fromDate(to))
      .get();

    if (snap.empty) return { sent: 0, skipped: 0 };

    // familyId별 묶음
    const grouped: Record<string, typeof snap.docs> = {};
    for (const d of snap.docs) {
      const fid = d.data().familyId as string;
      (grouped[fid] ??= []).push(d);
    }

    const messages: Array<{ to: string; text: string }> = [];
    let skipped = 0;

    for (const [familyId, docs] of Object.entries(grouped)) {
      const familySnap = await db.collection("families").doc(familyId).get();
      if (!familySnap.exists) { skipped++; continue; }
      const { parentName, phone } = familySnap.data()!;
      if (!phone) { skipped++; continue; }

      const serviceLines = docs.map((d) => {
        const data = d.data();
        const serviceName = SERVICE_META[data.serviceSlug as string]?.name ?? data.serviceName ?? data.serviceSlug;
        const newEnd = calcNewEndDate(data.currentEndDate ?? null, data.months ?? 1);
        return `· ${data.childName} · ${serviceName} → ${fmtKoDate(newEnd)}까지`;
      }).join("\n");

      messages.push({
        to: phone,
        text: [
          `[플랜토] ${parentName}님, 입금이 확인되었습니다 ✅`,
          ``,
          `구독이 연장되었어요:`,
          serviceLines,
          ``,
          `감사합니다 🌱`,
        ].join("\n"),
      });
    }

    if (messages.length > 0) {
      await sendBulkSms(messages, solapiApiKey.value(), solapiApiSecret.value());
    }

    return { sent: messages.length, skipped };
  }
);
