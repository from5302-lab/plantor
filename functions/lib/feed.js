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
exports.onFeedReport = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = __importStar(require("firebase-admin"));
const config_1 = require("./config");
const utils_1 = require("./utils");
// ─── 신고 처리: reportCount +1, 5건 도달 시 박제 + SMS ───────────────────────
exports.onFeedReport = (0, firestore_1.onDocumentCreated)({ document: "feedReports/{reportId}", secrets: [config_1.solapiApiKey, config_1.solapiApiSecret] }, async (event) => {
    var _a, _b;
    const report = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!(report === null || report === void 0 ? void 0 : report.logId) || !(report === null || report === void 0 ? void 0 : report.reporterUid))
        return;
    const logRef = config_1.db.collection("learningLogs").doc(report.logId);
    const logSnap = await logRef.get();
    if (!logSnap.exists)
        return;
    const logData = logSnap.data();
    if (logData.flagged)
        return; // 이미 박제된 경우 무시
    const newCount = ((_b = logData.reportCount) !== null && _b !== void 0 ? _b : 0) + 1;
    if (newCount >= 5) {
        await logRef.update({
            reportCount: newCount,
            flagged: true,
            flaggedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await notifyOnFlag(logData);
    }
    else {
        await logRef.update({ reportCount: newCount });
    }
});
async function notifyOnFlag(logData) {
    var _a, _b, _c;
    const childId = logData.childId;
    const serviceSlug = logData.serviceSlug;
    const serviceName = (_b = (_a = config_1.SERVICE_META[serviceSlug]) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : serviceSlug;
    const childSnap = await config_1.db.collection("children").doc(childId).get();
    if (!childSnap.exists)
        return;
    const childData = childSnap.data();
    const familyId = childData.familyId;
    const childName = ((_c = childData.name) !== null && _c !== void 0 ? _c : "");
    if (!familyId)
        return;
    const familySnap = await config_1.db.collection("families").doc(familyId).get();
    if (!familySnap.exists)
        return;
    const phone = familySnap.data().phone;
    if (!phone)
        return;
    try {
        await (0, utils_1.sendSms)(phone, `[플랜토] ${childName}이(가) 올린 ${serviceName} 인증샷이 신고되었어요.\n아이와 함께 확인 후 재학습해 주세요. 👉 ${config_1.SITE_URL}/learn`, config_1.solapiApiKey.value(), config_1.solapiApiSecret.value());
    }
    catch ( /* SMS 실패해도 박제는 유지 */_d) { /* SMS 실패해도 박제는 유지 */ }
}
//# sourceMappingURL=feed.js.map