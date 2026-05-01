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
exports.auth = exports.db = exports.sendSms = void 0;
exports.idToEmail = idToEmail;
exports.fmtWon = fmtWon;
exports.fmtDate = fmtDate;
exports.emailHeader = emailHeader;
exports.serviceIconHtml = serviceIconHtml;
exports.assertAdmin = assertAdmin;
exports.sendAdminEmail = sendAdminEmail;
const https_1 = require("firebase-functions/v2/https");
const nodemailer = __importStar(require("nodemailer"));
const config_1 = require("./config");
Object.defineProperty(exports, "db", { enumerable: true, get: function () { return config_1.db; } });
Object.defineProperty(exports, "auth", { enumerable: true, get: function () { return config_1.auth; } });
var sms_1 = require("./sms");
Object.defineProperty(exports, "sendSms", { enumerable: true, get: function () { return sms_1.sendSms; } });
function idToEmail(id) {
    return `${id.toLowerCase()}@plantor.app`;
}
function fmtWon(n) {
    return `₩${n.toLocaleString("ko-KR")}`;
}
function fmtDate(d) {
    if (!d)
        return "";
    return d.toDate().toLocaleDateString("ko-KR");
}
function emailHeader() {
    return `
    <div style="margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:10px">
      <img src="${config_1.SITE_URL}/favicon.svg" width="28" height="28" alt="Plantor">
      <span style="font-size:18px;font-weight:700;color:#1a1a1a">Plantor</span>
    </div>`;
}
function serviceIconHtml(slug) {
    const meta = config_1.SERVICE_META[slug];
    if (!(meta === null || meta === void 0 ? void 0 : meta.icon))
        return "";
    return `<img src="${meta.icon}" width="22" height="22" style="border-radius:6px;vertical-align:middle;margin-right:6px" alt="${meta.name}">`;
}
async function assertAdmin(authContext) {
    var _a, _b;
    if (!authContext)
        throw new https_1.HttpsError("permission-denied", "관리자만 사용할 수 있습니다.");
    if (config_1.ADMIN_EMAILS.includes((_a = authContext.token.email) !== null && _a !== void 0 ? _a : ""))
        return;
    try {
        const snap = await config_1.db.collection("users").doc(authContext.uid).get();
        if (((_b = snap.data()) === null || _b === void 0 ? void 0 : _b.role) === "admin")
            return;
    }
    catch (_c) {
        // Firestore 읽기 실패 시 무시
    }
    throw new https_1.HttpsError("permission-denied", "관리자만 사용할 수 있습니다.");
}
async function sendAdminEmail(subject, html, gmailUserVal, gmailPassVal) {
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: gmailUserVal, pass: gmailPassVal },
    });
    const NOTIFY_EMAIL = "from302@kakao.com";
    await transporter.sendMail({
        from: `"Plantor 알림" <${gmailUserVal}>`,
        to: NOTIFY_EMAIL,
        subject,
        html: `<div style="font-family:-apple-system,sans-serif;max-width:540px;margin:0 auto;padding:28px 24px;color:#1a1a1a">${emailHeader()}${html}</div>`,
    });
}
//# sourceMappingURL=utils.js.map