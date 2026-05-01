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
exports.sendBulkRenewalSms = void 0;
const https_1 = require("firebase-functions/v2/https");
const config_1 = require("./config");
const utils_1 = require("./utils");
const sms_1 = require("./sms");
const admin = __importStar(require("firebase-admin"));
function calcNewEndDate(currentEndDate, months) {
    const now = new Date();
    const base = currentEndDate ? currentEndDate.toDate() : now;
    const from = base > now ? base : now;
    // base 기준 +months개월 후의 말일
    return new Date(from.getFullYear(), from.getMonth() + months + 1, 0);
}
function fmtKoDate(d) {
    return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}
/**
 * 특정 날짜 범위 내 승인된 연장신청자에게 일괄 SMS 발송
 * data: { fromDate: "2026-04-20", toDate: "2026-04-21" }
 */
exports.sendBulkRenewalSms = (0, https_1.onCall)({ secrets: [config_1.solapiApiKey, config_1.solapiApiSecret] }, async (request) => {
    var _a;
    await (0, utils_1.assertAdmin)(request.auth);
    const { fromDate, toDate } = request.data;
    const from = new Date(fromDate + "T00:00:00+09:00");
    const to = new Date(toDate + "T23:59:59+09:00");
    const snap = await utils_1.db.collection("renewalRequests")
        .where("status", "==", "approved")
        .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(from))
        .where("createdAt", "<=", admin.firestore.Timestamp.fromDate(to))
        .get();
    if (snap.empty)
        return { sent: 0, skipped: 0 };
    // familyId별 묶음
    const grouped = {};
    for (const d of snap.docs) {
        const fid = d.data().familyId;
        ((_a = grouped[fid]) !== null && _a !== void 0 ? _a : (grouped[fid] = [])).push(d);
    }
    const messages = [];
    let skipped = 0;
    for (const [familyId, docs] of Object.entries(grouped)) {
        const familySnap = await utils_1.db.collection("families").doc(familyId).get();
        if (!familySnap.exists) {
            skipped++;
            continue;
        }
        const { parentName, phone } = familySnap.data();
        if (!phone) {
            skipped++;
            continue;
        }
        const serviceLines = docs.map((d) => {
            var _a, _b, _c, _d, _e;
            const data = d.data();
            const serviceName = (_c = (_b = (_a = config_1.SERVICE_META[data.serviceSlug]) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : data.serviceName) !== null && _c !== void 0 ? _c : data.serviceSlug;
            const newEnd = calcNewEndDate((_d = data.currentEndDate) !== null && _d !== void 0 ? _d : null, (_e = data.months) !== null && _e !== void 0 ? _e : 1);
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
        await (0, sms_1.sendBulkSms)(messages, config_1.solapiApiKey.value(), config_1.solapiApiSecret.value());
    }
    return { sent: messages.length, skipped };
});
//# sourceMappingURL=bulk-renewal-sms.js.map