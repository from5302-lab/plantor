"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.autoLog = exports.onFeedReport = exports.previewExpirySms = exports.triggerExpirySms = exports.confirmDirectClassPayment = exports.uploadImageToSolapi = exports.sendBulkSms = exports.getSolapiMessages = exports.cleanupExpiredScreenshots = exports.notifyParentOnScreenshot = exports.notifyExpiringSubscriptionD0 = exports.notifyExpiringSubscriptionD3 = exports.notifyExpiringSubscriptionD7 = exports.notifyExpiringDirectClassD0 = exports.notifyExpiringDirectClassD3 = exports.notifyExpiringDirectClassD7 = exports.notifyAdminOnRenewal = exports.notifyAdminOnSignup = exports.notifyNewSignup = exports.cleanupOrphanSubscriptions = exports.checkIdAvailability = exports.deleteFamily = exports.confirmAiPackagePayment = exports.sendRenewalConfirmationSms = exports.updateChildName = exports.updateParentName = exports.repairUserDocs = exports.resetPassword = exports.approveSignup = void 0;
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
var auth_1 = require("./auth");
Object.defineProperty(exports, "approveSignup", { enumerable: true, get: function () { return auth_1.approveSignup; } });
Object.defineProperty(exports, "resetPassword", { enumerable: true, get: function () { return auth_1.resetPassword; } });
Object.defineProperty(exports, "repairUserDocs", { enumerable: true, get: function () { return auth_1.repairUserDocs; } });
Object.defineProperty(exports, "updateParentName", { enumerable: true, get: function () { return auth_1.updateParentName; } });
Object.defineProperty(exports, "updateChildName", { enumerable: true, get: function () { return auth_1.updateChildName; } });
Object.defineProperty(exports, "sendRenewalConfirmationSms", { enumerable: true, get: function () { return auth_1.sendRenewalConfirmationSms; } });
Object.defineProperty(exports, "confirmAiPackagePayment", { enumerable: true, get: function () { return auth_1.confirmAiPackagePayment; } });
Object.defineProperty(exports, "deleteFamily", { enumerable: true, get: function () { return auth_1.deleteFamily; } });
Object.defineProperty(exports, "checkIdAvailability", { enumerable: true, get: function () { return auth_1.checkIdAvailability; } });
Object.defineProperty(exports, "cleanupOrphanSubscriptions", { enumerable: true, get: function () { return auth_1.cleanupOrphanSubscriptions; } });
var notifications_1 = require("./notifications");
Object.defineProperty(exports, "notifyNewSignup", { enumerable: true, get: function () { return notifications_1.notifyNewSignup; } });
Object.defineProperty(exports, "notifyAdminOnSignup", { enumerable: true, get: function () { return notifications_1.notifyAdminOnSignup; } });
Object.defineProperty(exports, "notifyAdminOnRenewal", { enumerable: true, get: function () { return notifications_1.notifyAdminOnRenewal; } });
Object.defineProperty(exports, "notifyExpiringDirectClassD7", { enumerable: true, get: function () { return notifications_1.notifyExpiringDirectClassD7; } });
Object.defineProperty(exports, "notifyExpiringDirectClassD3", { enumerable: true, get: function () { return notifications_1.notifyExpiringDirectClassD3; } });
Object.defineProperty(exports, "notifyExpiringDirectClassD0", { enumerable: true, get: function () { return notifications_1.notifyExpiringDirectClassD0; } });
Object.defineProperty(exports, "notifyExpiringSubscriptionD7", { enumerable: true, get: function () { return notifications_1.notifyExpiringSubscriptionD7; } });
Object.defineProperty(exports, "notifyExpiringSubscriptionD3", { enumerable: true, get: function () { return notifications_1.notifyExpiringSubscriptionD3; } });
Object.defineProperty(exports, "notifyExpiringSubscriptionD0", { enumerable: true, get: function () { return notifications_1.notifyExpiringSubscriptionD0; } });
Object.defineProperty(exports, "notifyParentOnScreenshot", { enumerable: true, get: function () { return notifications_1.notifyParentOnScreenshot; } });
var cleanup_1 = require("./cleanup");
Object.defineProperty(exports, "cleanupExpiredScreenshots", { enumerable: true, get: function () { return cleanup_1.cleanupExpiredScreenshots; } });
var admin_api_1 = require("./admin-api");
Object.defineProperty(exports, "getSolapiMessages", { enumerable: true, get: function () { return admin_api_1.getSolapiMessages; } });
Object.defineProperty(exports, "sendBulkSms", { enumerable: true, get: function () { return admin_api_1.sendBulkSms; } });
Object.defineProperty(exports, "uploadImageToSolapi", { enumerable: true, get: function () { return admin_api_1.uploadImageToSolapi; } });
Object.defineProperty(exports, "confirmDirectClassPayment", { enumerable: true, get: function () { return admin_api_1.confirmDirectClassPayment; } });
Object.defineProperty(exports, "triggerExpirySms", { enumerable: true, get: function () { return admin_api_1.triggerExpirySms; } });
Object.defineProperty(exports, "previewExpirySms", { enumerable: true, get: function () { return admin_api_1.previewExpirySms; } });
var feed_1 = require("./feed");
Object.defineProperty(exports, "onFeedReport", { enumerable: true, get: function () { return feed_1.onFeedReport; } });
var auto_log_1 = require("./auto-log");
Object.defineProperty(exports, "autoLog", { enumerable: true, get: function () { return auto_log_1.autoLog; } });
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
//# sourceMappingURL=index.js.map