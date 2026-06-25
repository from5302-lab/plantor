import { HttpsError } from "firebase-functions/v2/https";
import * as nodemailer from "nodemailer";

import {
  db, auth, ADMIN_EMAILS, SITE_URL, SERVICE_META, NOTIFY_EMAIL,
} from "./config";
export { sendAlimtalk, sendSms } from "./sms";

export function idToEmail(id: string) {
  return `${id.toLowerCase()}@plantor.app`;
}

export function fmtWon(n: number) {
  return `₩${n.toLocaleString("ko-KR")}`;
}

export function fmtDate(d: import("firebase-admin").firestore.Timestamp | undefined) {
  if (!d) return "";
  return d.toDate().toLocaleDateString("ko-KR");
}

export function emailHeader() {
  return `
    <div style="margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:10px">
      <img src="${SITE_URL}/favicon.svg" width="28" height="28" alt="Plantor">
      <span style="font-size:18px;font-weight:700;color:#1a1a1a">Plantor</span>
    </div>`;
}

export function serviceIconHtml(slug: string) {
  const meta = SERVICE_META[slug];
  if (!meta?.icon) return "";
  return `<img src="${meta.icon}" width="22" height="22" style="border-radius:6px;vertical-align:middle;margin-right:6px" alt="${meta.name}">`;
}

export async function assertAdmin(
  authContext: { uid: string; token: { email?: string; admin?: boolean } } | undefined
) {
  if (!authContext) throw new HttpsError("permission-denied", "관리자만 사용할 수 있습니다.");
  // 1순위: custom claim (token.admin === true). 점진적 전환 중이며, 추후 이 한 줄만 남기는 것이 목표.
  if (authContext.token.admin === true) return;
  // 2순위(점진 전환 fallback): 하드코딩된 ADMIN_EMAILS.
  if (ADMIN_EMAILS.includes(authContext.token.email ?? "")) return;
  // 3순위(점진 전환 fallback): Firestore users/{uid}.role == "admin".
  try {
    const snap = await db.collection("users").doc(authContext.uid).get();
    if (snap.data()?.role === "admin") return;
  } catch {
    // Firestore 읽기 실패 시 무시
  }
  throw new HttpsError("permission-denied", "관리자만 사용할 수 있습니다.");
}

export async function sendAdminEmail(
  subject: string, html: string, gmailUserVal: string, gmailPassVal: string
) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUserVal, pass: gmailPassVal },
  });
  await transporter.sendMail({
    from: `"Plantor 알림" <${gmailUserVal}>`,
    to: NOTIFY_EMAIL,
    subject,
    html: `<div style="font-family:-apple-system,sans-serif;max-width:540px;margin:0 auto;padding:28px 24px;color:#1a1a1a">${emailHeader()}${html}</div>`,
  });
}

export { db, auth };
