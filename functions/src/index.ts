import * as admin from "firebase-admin";
admin.initializeApp();

export { approveSignup, createChildAccount, resetPassword, repairUserDocs, resetAllStudentPasswords, updateParentName, updateChildName, sendRenewalConfirmationSms, confirmAiPackagePayment, deleteFamily, checkIdAvailability, cleanupOrphanSubscriptions, ensureDirectClassAccounts, claimAdminRole, getStudentLessonLogs, getParentLessonLogs } from "./auth";
export {
  notifyNewSignup, notifyAdminOnSignup, notifyAdminOnRenewal, notifyAdminOnPlanDraft,
  notifyExpiringDirectClassD7, notifyExpiringDirectClassD3, notifyExpiringDirectClassD0,
  notifyExpiringSubscriptionD7, notifyExpiringSubscriptionD3, notifyExpiringSubscriptionD0,
  notifyParentOnScreenshot,
} from "./notifications";
export { cleanupExpiredScreenshots } from "./cleanup";
export { getSolapiMessages, getSolapiBalance, sendBulkSms, uploadImageToSolapi, confirmDirectClassPayment, triggerExpirySms, previewExpirySms, getKakaoChannelList, sendTestKakao } from "./admin-api";
export { onFeedReport } from "./feed";
export { autoLog } from "./auto-log";
export { gradeWriting } from "./writing";
export { class5Library } from "./class5-proxy";
