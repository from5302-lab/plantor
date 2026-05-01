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
exports.auth = exports.db = exports.SERVICE_META = exports.openaiApiKey = exports.gmailAppPassword = exports.gmailUser = exports.solapiApiSecret = exports.solapiApiKey = exports.BANK_HOLDER = exports.BANK_ACCOUNT = exports.BANK_NAME = exports.KAKAO_OPEN_CHAT = exports.NOTIFY_EMAIL = exports.SITE_URL = exports.SENDER_PHONE = exports.ADMIN_EMAILS = exports.ADMIN_EMAIL = void 0;
const admin = __importStar(require("firebase-admin"));
const params_1 = require("firebase-functions/params");
exports.ADMIN_EMAIL = "from5302@gmail.com";
exports.ADMIN_EMAILS = [exports.ADMIN_EMAIL, "from302@plantor.app"];
exports.SENDER_PHONE = "01075425302";
exports.SITE_URL = "https://plantor.web.app";
exports.NOTIFY_EMAIL = "from302@kakao.com";
exports.KAKAO_OPEN_CHAT = "https://open.kakao.com/o/gntJzE4h";
exports.BANK_NAME = "카카오뱅크";
exports.BANK_ACCOUNT = "3333-36-9725919";
exports.BANK_HOLDER = "이*선";
exports.solapiApiKey = (0, params_1.defineSecret)("SOLAPI_API_KEY");
exports.solapiApiSecret = (0, params_1.defineSecret)("SOLAPI_API_SECRET");
exports.gmailUser = (0, params_1.defineSecret)("GMAIL_USER");
exports.gmailAppPassword = (0, params_1.defineSecret)("GMAIL_APP_PASSWORD");
exports.openaiApiKey = (0, params_1.defineSecret)("OPENAI_API_KEY");
exports.SERVICE_META = {
    dailykor: { name: "매일국어", icon: `${exports.SITE_URL}/service-icons/dailykor.png` },
    autovoca: { name: "오토보카", icon: `${exports.SITE_URL}/service-icons/autovoca.png` },
    class5: { name: "초등 클래스5", icon: `${exports.SITE_URL}/service-icons/class5.png` },
    "classcard-middle": { name: "중등 클래스카드", icon: `${exports.SITE_URL}/service-icons/classcard.png` },
    momsaipack: { name: "엄마들을 위한 AI 패키지", icon: `${exports.SITE_URL}/favicon.svg` },
    "mom-webinar": { name: "[Mom&] 맘이랑 금요웨비나", icon: `${exports.SITE_URL}/favicon.svg` },
};
exports.db = admin.firestore();
exports.auth = admin.auth();
//# sourceMappingURL=config.js.map