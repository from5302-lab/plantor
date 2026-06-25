import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { db } from "./config";

// ─── 신고 처리: reportCount +1, 5건 도달 시 박제 ───────────────────────

export const onFeedReport = onDocumentCreated(
  { document: "feedReports/{reportId}" },
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
    } else {
      await logRef.update({ reportCount: newCount });
    }
  }
);
