import * as admin from "firebase-admin";
import { defineSecret } from "firebase-functions/params";

export const ADMIN_EMAIL = "from5302@gmail.com";
export const ADMIN_EMAILS = [ADMIN_EMAIL, "from302@plantor.app"];
// 휴대폰/계좌/알림 이메일은 functions/.env 에서 로드 (Functions v2 자동 로드).
// .env 는 .gitignore 처리되어 있고, 형식은 functions/.env.example 참고.
export const SENDER_PHONE = process.env.SENDER_PHONE ?? "";
export const SITE_URL = "https://plantor.web.app";
export const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL ?? "";
export const KAKAO_OPEN_CHAT = "https://open.kakao.com/o/gntJzE4h";
export const BANK_NAME = process.env.BANK_NAME ?? "";
export const BANK_ACCOUNT = process.env.BANK_ACCOUNT ?? "";
export const BANK_HOLDER = process.env.BANK_HOLDER ?? "";

export const KAKAO_PF_ID = "KA01PF2605051120092677BA4kHXSXVw";
export const KAKAO_TEMPLATES = {
  SIGNUP_PAYMENT:         "KA01TP260622061611782FSA84BIudTp", // 수강신청 입금안내 v2 (24시간 미입금 취소 고지 포함, 2026-06-23 승인)
  RENEWAL_CONFIRM:        "KA01TP260505112852386Hig920VU7V5", // 연장 완료 확인 (구독용)
  SUBSCRIPTION_EXPIRY:    "KA01TP260505112852272M2EtJj3a3Vx", // 구독 만료 안내
  LEARNING_COMPLETE:      "KA01TP260505112852434N8JejaRKlHq", // 학습 완료 알림
  DIRECT_CLASS_EXPIRY:    "KA01TP260505112852323X3Xri5zhs9e", // 1:1 수업료 안내
  LESSON_PAYMENT_CONFIRM: "KA01TP260522031622317b31iGLVTcIl", // 수업료 입금 확인 (PENDING — 검수 통과 후 admin-api에서 사용)
  PASSWORD_RESET:         "KA01TP260518085232857UYCxn63ljYJ", // 비밀번호 초기화 (INSPECTING — 승인 시 자동 활성, 그 전엔 SMS fallback)
  AI_PACKAGE_CONFIRM:     "KA01TP260518085232905tujFnlMrDoP", // AI 패키지 입금확인 (INSPECTING — 승인 시 자동 활성, 그 전엔 SMS fallback)
} as const;

export const solapiApiKey = defineSecret("SOLAPI_API_KEY");
export const solapiApiSecret = defineSecret("SOLAPI_API_SECRET");
export const gmailUser = defineSecret("GMAIL_USER");
export const gmailAppPassword = defineSecret("GMAIL_APP_PASSWORD");
export const openaiApiKey = defineSecret("OPENAI_API_KEY");

export const SERVICE_META: Record<string, { name: string; icon: string }> = {
  dailykor:           { name: "매일국어",              icon: `${SITE_URL}/service-icons/dailykor.png` },
  autovoca:           { name: "오토보카",               icon: `${SITE_URL}/service-icons/autovoca.png` },
  class5:             { name: "클래스5",           icon: `${SITE_URL}/service-icons/class5.png` },
  "classcard-middle": { name: "클래스카드",        icon: `${SITE_URL}/service-icons/classcard.png` },
  "great-books":      { name: "고전독서모임",       icon: `${SITE_URL}/service-icons/great-books.png` },
  "vibe-coding":      { name: "바이브코딩 수업",         icon: `${SITE_URL}/service-icons/vibe-coding.svg` },
  momsaipack:         { name: "엄마들을 위한 AI 패키지", icon: `${SITE_URL}/favicon.svg` },
  "mom-webinar":      { name: "[Mom&] 맘이랑 금요웨비나", icon: `${SITE_URL}/favicon.svg` },
};

export const db = admin.firestore();
export const auth = admin.auth();
