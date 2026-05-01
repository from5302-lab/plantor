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
exports.cleanupExpiredScreenshots = void 0;
const admin = __importStar(require("firebase-admin"));
const scheduler_1 = require("firebase-functions/v2/scheduler");
const utils_1 = require("./utils");
// ─── 매일 새벽 2시 — 90일 지난 인증샷 Storage + Firestore URL 정리 ──────────
exports.cleanupExpiredScreenshots = (0, scheduler_1.onSchedule)({ schedule: "0 17 * * *", timeZone: "UTC" }, // UTC 17:00 = KST 02:00
async () => {
    const now = admin.firestore.Timestamp.now();
    const snap = await utils_1.db.collection("learningLogs")
        .where("screenshotExpiresAt", "<", now)
        .where("screenshotUrl", "!=", null)
        .get();
    if (snap.empty)
        return;
    for (const docSnap of snap.docs) {
        const url = docSnap.data().screenshotUrl;
        try {
            const path = decodeURIComponent(url.split("/o/")[1].split("?")[0]);
            await admin.storage().bucket().file(path).delete();
        }
        catch ( /* 이미 삭제됨 */_a) { /* 이미 삭제됨 */ }
        await docSnap.ref.update({ screenshotUrl: null, screenshotExpiresAt: null });
    }
});
//# sourceMappingURL=cleanup.js.map