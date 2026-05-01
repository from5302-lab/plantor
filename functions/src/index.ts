import * as admin from "firebase-admin";
admin.initializeApp();

export { approveSignup, resetPassword, repairUserDocs, updateParentName, updateChildName, sendRenewalConfirmationSms, confirmAiPackagePayment, deleteFamily, checkIdAvailability, cleanupOrphanSubscriptions } from "./auth";
export {
  notifyNewSignup, notifyAdminOnSignup, notifyAdminOnRenewal,
  notifyExpiringDirectClassD7, notifyExpiringDirectClassD3, notifyExpiringDirectClassD0,
  notifyExpiringSubscriptionD7, notifyExpiringSubscriptionD3, notifyExpiringSubscriptionD0,
  notifyParentOnScreenshot,
} from "./notifications";
export { cleanupExpiredScreenshots } from "./cleanup";
export { getSolapiMessages, sendBulkSms, uploadImageToSolapi, confirmDirectClassPayment, triggerExpirySms, previewExpirySms } from "./admin-api";
export { onFeedReport } from "./feed";
export { autoLog } from "./auto-log";

// ─── Storage 활성화 후 아래 주석 해제 + onObjectFinalized import 추가 ─────────
// import { onObjectFinalized } from "firebase-functions/v2/storage";
// import { solapiApiKey, solapiApiSecret, SERVICE_META, SENDER_PHONE, SITE_URL } from "./config";
// import { db, sendSms, uploadImageToSolapi as uploadImg } from "./utils";
// const SolapiMessageService = require("solapi").default;
//
// export const onScreenshotUploaded = onObjectFinalized(
//   { bucket: "plantor-from302.firebasestorage.app", secrets: [solapiApiKey, solapiApiSecret] },
//   async (event) => {
//     const filePath = event.data.name;
//     if (!filePath?.startsWith("screenshots/")) return;
//     const parts = filePath.split("/");
//     if (parts.length < 3) return;
//     const childId = parts[1];
//     const serviceSlug = parts[2].split("_")[0];
//     const childSnap = await db.collection("children").doc(childId).get();
//     if (!childSnap.exists) return;
//     const childData = childSnap.data()!;
//     const familyId = childData.familyId as string | undefined;
//     const childName = (childData.name ?? "") as string;
//     if (!familyId) return;
//     const familySnap = await db.collection("families").doc(familyId).get();
//     if (!familySnap.exists) return;
//     const phone = familySnap.data()!.phone as string | undefined;
//     if (!phone) return;
//     const serviceName = SERVICE_META[serviceSlug]?.name ?? serviceSlug;
//     const bucket = admin.storage().bucket(event.data.bucket);
//     const file = bucket.file(filePath);
//     try {
//       const [buffer] = await file.download();
//       const imageId = await uploadImg(buffer, solapiApiKey.value(), solapiApiSecret.value());
//       const messageService = new SolapiMessageService(solapiApiKey.value(), solapiApiSecret.value());
//       const today = new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
//       await messageService.sendOne({
//         to: phone, from: SENDER_PHONE, type: "MMS", subject: "학습 인증",
//         text: `[플랜토] ${today} ${childName} 학습 완료!\n📚 ${serviceName}\n\n오늘도 잘했어요 🌱`,
//         imageId,
//       });
//     } catch (err) {
//       console.error("인증샷 MMS 발송 실패:", err);
//     } finally {
//       try { await file.delete(); } catch { /* noop */ }
//     }
//   }
// );
