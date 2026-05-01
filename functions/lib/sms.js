"use strict";
/**
 * Solapi SMS 유틸리티 — 모든 Solapi 호출을 여기서 관리
 *
 * 주의사항:
 *  - apiKey / apiSecret 은 항상 .trim() 처리 (Secret Manager 후행 개행 버그 대응)
 *  - SolapiMessageService 는 named export (v5 기준), default 아님
 */
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
exports.sendSms = sendSms;
exports.sendBulkSms = sendBulkSms;
exports.fetchSolapiMessages = fetchSolapiMessages;
exports.uploadImageToSolapi = uploadImageToSolapi;
const crypto = __importStar(require("crypto"));
const config_1 = require("./config");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SolapiMessageService } = require("solapi");
// ─── 내부 헬퍼 ────────────────────────────────────────────────────────────────
function buildAuth(apiKey, apiSecret) {
    const date = new Date().toISOString();
    const salt = crypto.randomBytes(8).toString("hex");
    const signature = crypto
        .createHmac("sha256", apiSecret)
        .update(date + salt)
        .digest("hex");
    return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}
function trim(key) {
    return key.trim();
}
// ─── 공개 API ─────────────────────────────────────────────────────────────────
/** 단건 SMS 발송 */
async function sendSms(phone, text, apiKey, apiSecret) {
    const service = new SolapiMessageService(trim(apiKey), trim(apiSecret));
    await service.sendOne({ to: phone.replace(/-/g, ""), from: config_1.SENDER_PHONE, text });
}
/** 다건 SMS 일괄 발송 */
async function sendBulkSms(messages, apiKey, apiSecret) {
    const service = new SolapiMessageService(trim(apiKey), trim(apiSecret));
    await service.send(messages.map(({ to, text }) => ({ to: to.replace(/-/g, ""), from: config_1.SENDER_PHONE, text })));
}
/** 발송 내역 조회 */
async function fetchSolapiMessages(limit, apiKey, apiSecret) {
    const authorization = buildAuth(trim(apiKey), trim(apiSecret));
    const res = await fetch(`https://api.solapi.com/messages/v4/list?limit=${limit}`, {
        headers: { Authorization: authorization },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Solapi 조회 실패: ${text}`);
    }
    return res.json();
}
/** MMS용 이미지 업로드 → fileId 반환 */
async function uploadImageToSolapi(buffer, apiKey, apiSecret) {
    const authorization = buildAuth(trim(apiKey), trim(apiSecret));
    const formData = new FormData();
    formData.append("file", new Blob([new Uint8Array(buffer)], { type: "image/jpeg" }), "screenshot.jpg");
    formData.append("type", "MMS");
    const res = await fetch("https://api.solapi.com/storage/v1/files", {
        method: "POST",
        headers: { Authorization: authorization },
        body: formData,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Solapi 파일 업로드 실패: ${text}`);
    }
    const data = (await res.json());
    return data.fileId;
}
//# sourceMappingURL=sms.js.map