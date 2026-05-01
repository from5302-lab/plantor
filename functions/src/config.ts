import * as admin from "firebase-admin";
import { defineSecret } from "firebase-functions/params";

export const ADMIN_EMAIL = "from5302@gmail.com";
export const ADMIN_EMAILS = [ADMIN_EMAIL, "from302@plantor.app"];
export const SENDER_PHONE = "01075425302";
export const SITE_URL = "https://plantor.web.app";
export const NOTIFY_EMAIL = "from302@kakao.com";
export const KAKAO_OPEN_CHAT = "https://open.kakao.com/o/gntJzE4h";
export const BANK_NAME = "카카오뱅크";
export const BANK_ACCOUNT = "3333-36-9725919";
export const BANK_HOLDER = "이*선";

export const solapiApiKey = defineSecret("SOLAPI_API_KEY");
export const solapiApiSecret = defineSecret("SOLAPI_API_SECRET");
export const gmailUser = defineSecret("GMAIL_USER");
export const gmailAppPassword = defineSecret("GMAIL_APP_PASSWORD");
export const openaiApiKey = defineSecret("OPENAI_API_KEY");

export const SERVICE_META: Record<string, { name: string; icon: string }> = {
  dailykor:           { name: "매일국어",              icon: `${SITE_URL}/service-icons/dailykor.png` },
  autovoca:           { name: "오토보카",               icon: `${SITE_URL}/service-icons/autovoca.png` },
  class5:             { name: "초등 클래스5",           icon: `${SITE_URL}/service-icons/class5.png` },
  "classcard-middle": { name: "중등 클래스카드",        icon: `${SITE_URL}/service-icons/classcard.png` },
  momsaipack:         { name: "엄마들을 위한 AI 패키지", icon: `${SITE_URL}/favicon.svg` },
  "mom-webinar":      { name: "[Mom&] 맘이랑 금요웨비나", icon: `${SITE_URL}/favicon.svg` },
};

export const db = admin.firestore();
export const auth = admin.auth();
