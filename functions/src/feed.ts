import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { solapiApiKey, solapiApiSecret, SERVICE_META, SITE_URL, db } from "./config";
import { sendSms } from "./utils";

// ─── 신고 처리: reportCount +1, 5건 도달 시 박제 + SMS ───────────────────────

export const onFeedReport = onDocumentCreated(
  { document: "feedReports/{reportId}", secrets: [solapiApiKey, solapiApiSecret] },
  async (event) => {
    const report = event.data?.data();
    if (!report?.logId || !report?.reporterUid) return;

    const logRef = db.collection("learningLogs").doc(report.logId as string);
    const logSnap = await logRef.get();
    if (!logSnap.exists) return;

    const logData = logSnap.data()!;
    if (logData.flagged) return; // 이미 박제된 경우 무시

    const newCount = ((logData.reportCount ?? 0) as number) + 1;

    if (newCount >= 5) {
      await logRef.update({
        reportCount: newCount,
        flagged: true,
        flaggedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await notifyOnFlag(logData);
    } else {
      await logRef.update({ reportCount: newCount });
    }
  }
);

async function notifyOnFlag(logData: FirebaseFirestore.DocumentData) {
  const childId = logData.childId as string;
  const serviceSlug = logData.serviceSlug as string;
  const serviceName = SERVICE_META[serviceSlug]?.name ?? serviceSlug;

  const childSnap = await db.collection("children").doc(childId).get();
  if (!childSnap.exists) return;
  const childData = childSnap.data()!;
  const familyId = childData.familyId as string | undefined;
  const childName = (childData.name ?? "") as string;
  if (!familyId) return;

  const familySnap = await db.collection("families").doc(familyId).get();
  if (!familySnap.exists) return;
  const phone = familySnap.data()!.phone as string | undefined;
  if (!phone) return;

  try {
    await sendSms(
      phone,
      `[플랜토] ${childName}이(가) 올린 ${serviceName} 인증샷이 신고되었어요.\n아이와 함께 확인 후 재학습해 주세요. 👉 ${SITE_URL}/learn`,
      solapiApiKey.value(),
      solapiApiSecret.value()
    );
  } catch { /* SMS 실패해도 박제는 유지 */ }
}
