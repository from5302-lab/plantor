import * as admin from "firebase-admin";
admin.initializeApp();

export { approveSignup, createChildAccount, resetPassword, repairUserDocs, resetAllStudentPasswords, updateParentName, updateChildName, updateChildLoginId, updateStudentPhone, sendRenewalConfirmationSms, confirmAiPackagePayment, deleteFamily, checkIdAvailability, cleanupOrphanSubscriptions, ensureDirectClassAccounts, claimAdminRole, getStudentDirectSlugs } from "./auth";
export {
  notifyNewSignup, notifyAdminOnSignup, notifyAdminOnRenewal, notifyAdminOnPlanDraft,
  notifyExpiringDirectClassD7, notifyExpiringDirectClassD3, notifyExpiringDirectClassD0,
  notifyExpiringSubscriptionD7, notifyExpiringSubscriptionD3, notifyExpiringSubscriptionD0,
  notifyExpiring20260730,
  notifyParentOnScreenshot,
} from "./notifications";
export { cleanupExpiredScreenshots } from "./cleanup";
export { getSolapiMessages, getSolapiBalance, sendBulkSms, uploadImageToSolapi, confirmDirectClassPayment, triggerExpirySms, previewExpirySms, getKakaoChannelList, sendTestKakao, getLastSignIns } from "./admin-api";
export { onFeedLike, onFeedUnlike } from "./feed-events";
export { autoLog } from "./auto-log";
export { verifyAutoProgress } from "./verify-auto";
export { classcardLog } from "./classcard-log";
export { autoVerifyScheduled, runAutoVerifyNow } from "./auto-verify-batch";
export { onTaskCheckWritten } from "./completion-notify";
export { gradeWriting } from "./writing";
export { class5Library } from "./class5-proxy";
export { purchaseShopItem, equipAvatarItem, markBadgesSeen, equipBadges, setFeedOptOut } from "./rewards-api";
export { sendFamilyMail, openFamilyMail } from "./family-mail";
export { publishCampusLook } from "./campus-look";
export { getCampusWardrobe, buyCampusItem } from "./campus-shop";
