import * as admin from "firebase-admin";
admin.initializeApp();

export { approveSignup, createChildAccount, resetPassword, repairUserDocs, resetAllStudentPasswords, updateParentName, updateChildName, updateStudentPhone, sendRenewalConfirmationSms, confirmAiPackagePayment, deleteFamily, checkIdAvailability, cleanupOrphanSubscriptions, ensureDirectClassAccounts, claimAdminRole, getStudentLessonLogs, getParentLessonLogs, getStudentDirectSlugs } from "./auth";
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
export { verifyAutoProgress } from "./verify-auto";
export { classcardLog } from "./classcard-log";
export { autoVerifyScheduled, runAutoVerifyNow } from "./auto-verify-batch";
export { onTaskCheckWritten } from "./completion-notify";
export { gradeWriting } from "./writing";
export { class5Library } from "./class5-proxy";
