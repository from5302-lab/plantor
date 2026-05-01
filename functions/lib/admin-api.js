"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.previewExpirySms = exports.sendBulkSms = exports.triggerExpirySms = exports.confirmDirectClassPayment = exports.getSolapiMessages = exports.uploadImageToSolapi = void 0;
const https_1 = require("firebase-functions/v2/https");
const config_1 = require("./config");
const utils_1 = require("./utils");
const sms_1 = require("./sms");
Object.defineProperty(exports, "uploadImageToSolapi", { enumerable: true, get: function () { return sms_1.uploadImageToSolapi; } });
const notifications_1 = require("./notifications");
// ─── Solapi 발송 내역 조회 (어드민 전용) ─────────────────────────────────────
exports.getSolapiMessages = (0, https_1.onCall)({ secrets: [config_1.solapiApiKey, config_1.solapiApiSecret] }, async (request) => {
    var _a, _b;
    await (0, utils_1.assertAdmin)(request.auth);
    const { limit = 30 } = ((_a = request.data) !== null && _a !== void 0 ? _a : {});
    try {
        const data = await (0, sms_1.fetchSolapiMessages)(limit, config_1.solapiApiKey.value(), config_1.solapiApiSecret.value());
        // messageList는 { id: message } 형태의 객체로 반환됨 → 배열로 변환
        const messageList = ((_b = data.messageList) !== null && _b !== void 0 ? _b : {});
        return Object.assign(Object.assign({}, data), { messages: Object.values(messageList) });
    }
    catch (e) {
        throw new https_1.HttpsError("internal", e.message);
    }
});
// ─── 1:1 수업 입금확인 + 만료일 연장 + SMS ────────────────────────────────────
exports.confirmDirectClassPayment = (0, https_1.onCall)({ secrets: [config_1.solapiApiKey, config_1.solapiApiSecret] }, async (request) => {
    var _a, _b;
    await (0, utils_1.assertAdmin)(request.auth);
    const { classId, months = 1 } = request.data;
    if (!classId)
        throw new https_1.HttpsError("invalid-argument", "classId가 필요합니다.");
    const docRef = utils_1.db.collection("directClasses").doc(classId);
    const snap = await docRef.get();
    if (!snap.exists)
        throw new https_1.HttpsError("not-found", "수업을 찾을 수 없습니다.");
    const cls = snap.data();
    const currentExpiry = cls.expiry;
    // 새 만료일: 현재 만료일(또는 오늘) 기준 +months개월의 말일
    const base = currentExpiry ? new Date(currentExpiry + "T00:00:00+09:00") : new Date();
    const now = new Date();
    const from = base > now ? base : now;
    const newExpiryDate = new Date(from.getFullYear(), from.getMonth() + months + 1, 0);
    const pad = (n) => String(n).padStart(2, "0");
    const newExpiry = `${newExpiryDate.getFullYear()}-${pad(newExpiryDate.getMonth() + 1)}-${pad(newExpiryDate.getDate())}`;
    await docRef.update({ expiry: newExpiry });
    // SMS 발송
    const students = (_a = cls.students) !== null && _a !== void 0 ? _a : [];
    const parentPhone = (_b = students[0]) === null || _b === void 0 ? void 0 : _b.parentPhone;
    if (parentPhone) {
        const studentNames = students.map((s) => { var _a; return (_a = s.name) !== null && _a !== void 0 ? _a : ""; }).filter(Boolean).join(", ");
        const text = [
            `안녕하세요^^`,
            `충쌤입니다,`,
            ``,
            `${studentNames} 학습비 입금이 확인되었습니다 ✅`,
            ``,
            `감사합니다.`,
        ].join("\n");
        await (0, sms_1.sendSms)(parentPhone, text, config_1.solapiApiKey.value(), config_1.solapiApiSecret.value());
    }
    return { newExpiry };
});
// ─── 만료 알림 수동 발송 (어드민 전용) ───────────────────────────────────────
exports.triggerExpirySms = (0, https_1.onCall)({ secrets: [config_1.solapiApiKey, config_1.solapiApiSecret] }, async (request) => {
    await (0, utils_1.assertAdmin)(request.auth);
    const { templateId } = request.data;
    if (!templateId)
        throw new https_1.HttpsError("invalid-argument", "templateId가 필요합니다.");
    const match = templateId.match(/^(directClass|subscription)_d(\d+)$/);
    if (!match)
        throw new https_1.HttpsError("invalid-argument", `잘못된 templateId: ${templateId}`);
    const [, type, days] = match;
    const daysAhead = parseInt(days, 10);
    try {
        let sent = 0;
        if (type === "directClass") {
            await (0, notifications_1.sendDirectClassExpiryNotice)(daysAhead, config_1.solapiApiKey.value(), config_1.solapiApiSecret.value());
        }
        else {
            // 임시 디버그: 매칭된 구독의 전체 필드 확인
            sent = await (0, notifications_1.sendSubscriptionExpiryNotice)(daysAhead, config_1.solapiApiKey.value(), config_1.solapiApiSecret.value());
            const allSnap2 = await utils_1.db.collection("subscriptions").where("status", "==", "active").get();
            const KST = 9 * 60 * 60 * 1000;
            const nk = new Date(Date.now() + KST);
            const tgt = nk.getUTCDate() + daysAhead;
            const f = new Date(Date.UTC(nk.getUTCFullYear(), nk.getUTCMonth(), tgt) - KST);
            const t = new Date(Date.UTC(nk.getUTCFullYear(), nk.getUTCMonth(), tgt + 1));
            const matched = allSnap2.docs.filter((d) => {
                const ed = d.data().endDate;
                if (!(ed === null || ed === void 0 ? void 0 : ed.toDate))
                    return false;
                const ms = ed.toDate().getTime();
                return ms >= f.getTime() && ms < t.getTime();
            });
            const info = matched.slice(0, 3).map((d) => {
                var _a, _b;
                const data = d.data();
                return `${d.id}: fam=${(_a = data.familyId) !== null && _a !== void 0 ? _a : "없음"}, child=${(_b = data.childId) !== null && _b !== void 0 ? _b : "없음"}, keys=${Object.keys(data).join(",")}`;
            });
            return { success: true, sent, debug: `매칭${matched.length}건, 발송${sent}건\n${info.join("\n")}` };
        }
        return { success: true, sent };
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new https_1.HttpsError("internal", msg);
    }
});
// ─── 단체 문자 발송 (어드민 전용) ────────────────────────────────────────────
exports.sendBulkSms = (0, https_1.onCall)({ secrets: [config_1.solapiApiKey, config_1.solapiApiSecret] }, async (request) => {
    try {
        await (0, utils_1.assertAdmin)(request.auth);
        const { phones, text } = request.data;
        if (!(phones === null || phones === void 0 ? void 0 : phones.length) || !(text === null || text === void 0 ? void 0 : text.trim()))
            throw new https_1.HttpsError("invalid-argument", "수신자와 메시지가 필요합니다.");
        const normalizedPhones = phones.map((p) => p.replace(/-/g, ""));
        await (0, sms_1.sendBulkSms)(normalizedPhones.map((to) => ({ to, text })), config_1.solapiApiKey.value(), config_1.solapiApiSecret.value());
        return { success: true, count: phones.length };
    }
    catch (e) {
        if (e instanceof https_1.HttpsError)
            throw e;
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[sendBulkSms] 오류:`, msg);
        throw new https_1.HttpsError("internal", `발송 실패: ${msg}`);
    }
});
// ─── 만료 알림 문자 미리보기 (어드민 전용) ──────────────────────────────────────
exports.previewExpirySms = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d;
    await (0, utils_1.assertAdmin)(request.auth);
    const { familyId, templateId } = request.data;
    if (!familyId)
        throw new https_1.HttpsError("invalid-argument", "familyId가 필요합니다.");
    const familySnap = await utils_1.db.collection("families").doc(familyId).get();
    if (!familySnap.exists)
        throw new https_1.HttpsError("not-found", "가족 정보를 찾을 수 없습니다.");
    const family = familySnap.data();
    const phone = (_a = family.phone) !== null && _a !== void 0 ? _a : "";
    const parentName = (_b = family.parentName) !== null && _b !== void 0 ? _b : "";
    let parentId = "";
    const userId = family.userId;
    if (userId) {
        const userSnap = await utils_1.db.collection("users").doc(userId).get();
        parentId = (_d = (_c = userSnap.data()) === null || _c === void 0 ? void 0 : _c.plantor_id) !== null && _d !== void 0 ? _d : "";
    }
    const childrenSnap = await utils_1.db.collection("children").where("familyId", "==", familyId).get();
    const childNames = childrenSnap.docs.map((d) => { var _a; return (_a = d.data().name) !== null && _a !== void 0 ? _a : ""; }).filter(Boolean);
    const subsSnap = await utils_1.db.collection("subscriptions").where("familyId", "==", familyId).where("status", "==", "active").get();
    const serviceNames = subsSnap.docs
        .map((d) => { var _a, _b; return (_b = (_a = config_1.SERVICE_META[d.data().serviceSlug]) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : d.data().serviceSlug; })
        .join(", ");
    const endDates = subsSnap.docs
        .map((d) => { var _a, _b; return (_b = (_a = d.data().endDate) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a); })
        .filter(Boolean);
    const earliestEnd = endDates.length > 0
        ? new Date(Math.min(...endDates.map((d) => d.getTime())))
        : new Date();
    const endDate = earliestEnd.toLocaleDateString("ko-KR");
    const tplId = templateId !== null && templateId !== void 0 ? templateId : "subscription_d7";
    let tpl;
    try {
        const tplSnap = await utils_1.db.collection("smsTemplates").doc(tplId).get();
        tpl = tplSnap.exists ? (tplSnap.data().body || "") : "";
    }
    catch (_e) {
        tpl = "";
    }
    if (!tpl) {
        tpl = [
            `[플랜토] {parentName}님, 구독 만료 안내드립니다.`,
            ``,
            `{childNames}의 {serviceNames} 구독이 {endDate}에 만료됩니다.`,
            ``,
            `연장을 원하시면 사이트에 로그인해서`,
            `연장신청을 해주세요.`,
            ``,
            `👉 {siteUrl}`,
            `아이디: {parentId}`,
            ``,
            `감사합니다 🌱`,
        ].join("\n");
    }
    const vars = {
        parentName, parentId, childNames: childNames.join(", "), serviceNames, endDate,
        amount: "", bankInfo: `${config_1.BANK_ACCOUNT}\n${config_1.BANK_NAME} ${config_1.BANK_HOLDER}`, siteUrl: config_1.SITE_URL,
    };
    const text = Object.entries(vars).reduce((t, [key, val]) => t.replace(new RegExp(`\\{${key}\\}`, "g"), val), tpl);
    return { phone, text, parentName };
});
//# sourceMappingURL=admin-api.js.map