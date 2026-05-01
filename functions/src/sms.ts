/**
 * Solapi SMS 유틸리티 — 모든 Solapi 호출을 여기서 관리
 *
 * 주의사항:
 *  - apiKey / apiSecret 은 항상 .trim() 처리 (Secret Manager 후행 개행 버그 대응)
 *  - SolapiMessageService 는 named export (v5 기준), default 아님
 */

import * as crypto from "crypto";
import { SENDER_PHONE } from "./config";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SolapiMessageService } = require("solapi");

// ─── 내부 헬퍼 ────────────────────────────────────────────────────────────────

function buildAuth(apiKey: string, apiSecret: string): string {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(8).toString("hex");
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(date + salt)
    .digest("hex");
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

function trim(key: string): string {
  return key.trim();
}

// ─── 공개 API ─────────────────────────────────────────────────────────────────

/** 단건 SMS 발송 */
export async function sendSms(
  phone: string,
  text: string,
  apiKey: string,
  apiSecret: string
): Promise<void> {
  const service = new SolapiMessageService(trim(apiKey), trim(apiSecret));
  await service.sendOne({ to: phone.replace(/-/g, ""), from: SENDER_PHONE, text });
}

/** 다건 SMS 일괄 발송 */
export async function sendBulkSms(
  messages: Array<{ to: string; text: string }>,
  apiKey: string,
  apiSecret: string
): Promise<void> {
  const service = new SolapiMessageService(trim(apiKey), trim(apiSecret));
  await service.send(messages.map(({ to, text }) => ({ to: to.replace(/-/g, ""), from: SENDER_PHONE, text })));
}

/** 발송 내역 조회 */
export async function fetchSolapiMessages(
  limit: number,
  apiKey: string,
  apiSecret: string
): Promise<unknown> {
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
export async function uploadImageToSolapi(
  buffer: Buffer,
  apiKey: string,
  apiSecret: string
): Promise<string> {
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

  const data = (await res.json()) as { fileId: string };
  return data.fileId;
}
