import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { db } from "./utils";

// ─── 매일 새벽 2시 — 90일 지난 인증샷 Storage + Firestore URL 정리 ──────────
export const cleanupExpiredScreenshots = onSchedule(
  { schedule: "0 17 * * *", timeZone: "UTC" }, // UTC 17:00 = KST 02:00
  async () => {
    const now = admin.firestore.Timestamp.now();
    const snap = await db.collection("learningLogs")
      .where("screenshotExpiresAt", "<", now)
      .where("screenshotUrl", "!=", null)
      .get();

    if (snap.empty) return;

    for (const docSnap of snap.docs) {
      const url = docSnap.data().screenshotUrl as string;
      try {
        const path = decodeURIComponent(url.split("/o/")[1].split("?")[0]);
        await admin.storage().bucket().file(path).delete();
      } catch { /* 이미 삭제됨 */ }
      await docSnap.ref.update({ screenshotUrl: null, screenshotExpiresAt: null });
    }
  }
);
