"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.autoLog = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const firestore_1 = require("firebase-admin/firestore");
const config_1 = require("./config");
const coworkSecret = (0, params_1.defineSecret)("COWORK_SECRET");
/**
 * Cowork 스크래퍼가 Classcard 학습 결과를 기록하는 엔드포인트.
 *
 * POST /autoLog
 * Authorization: Bearer {COWORK_SECRET}
 * Body: {
 *   childId: string
 *   serviceSlug: string          // "classcard-middle" 등
 *   date: string                 // YYYY-MM-DD
 *   autoStatus: "시작전" | "진행중" | "완료"
 *   scrapedData?: {
 *     scores?: Record<string, number | string>
 *     studyMinutes?: number
 *     rawSummary?: string
 *   }
 * }
 */
exports.autoLog = (0, https_1.onRequest)({ secrets: [coworkSecret], cors: true, invoker: "public" }, async (req, res) => {
    var _a;
    if (req.method !== "POST") {
        res.status(405).json({ error: "POST only" });
        return;
    }
    const token = (_a = req.headers.authorization) === null || _a === void 0 ? void 0 : _a.replace("Bearer ", "");
    if (!token || token !== coworkSecret.value()) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    const { childId, serviceSlug, date, autoStatus, scrapedData } = req.body;
    if (!childId || !serviceSlug || !date || !autoStatus) {
        res.status(400).json({ error: "childId, serviceSlug, date, autoStatus 필수" });
        return;
    }
    if (!["시작전", "진행중", "완료"].includes(autoStatus)) {
        res.status(400).json({ error: "autoStatus는 시작전|진행중|완료 중 하나" });
        return;
    }
    // 오늘 동일 서비스의 auto 로그가 있으면 update, 없으면 create
    const existing = await config_1.db.collection("learningLogs")
        .where("childId", "==", childId)
        .where("serviceSlug", "==", serviceSlug)
        .where("date", "==", date)
        .where("method", "==", "auto")
        .get();
    if (!existing.empty) {
        await existing.docs[0].ref.update({
            autoStatus,
            scrapedData: scrapedData !== null && scrapedData !== void 0 ? scrapedData : null,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        res.json({ result: "updated" });
        return;
    }
    await config_1.db.collection("learningLogs").add({
        childId,
        serviceSlug,
        date,
        method: "auto",
        autoStatus,
        scrapedData: scrapedData !== null && scrapedData !== void 0 ? scrapedData : null,
        confirmedAt: firestore_1.FieldValue.serverTimestamp(),
        flagged: false,
        reportCount: 0,
    });
    res.json({ result: "created" });
});
//# sourceMappingURL=auto-log.js.map