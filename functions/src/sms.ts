/**
 * Solapi SMS 유틸리티 — 모든 Solapi 호출을 여기서 관리
 *
 * 주의사항:
 *  - apiKey / apiSecret 은 항상 .trim() 처리 (Secret Manager 후행 개행 버그 대응)
 *  - SolapiMessageService 는 named export (v5 기준), default 아님
 */

import * as crypto from "crypto";
import { SENDER_PHONE, KAKAO_PF_ID } from "./config";

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
  await service.sendOne({ to: phone.replace(/\D/g, ""), from: SENDER_PHONE, text });
}

/** 다건 SMS 일괄 발송 */
export async function sendBulkSms(
  messages: Array<{ to: string; text: string }>,
  apiKey: string,
  apiSecret: string
): Promise<void> {
  const service = new SolapiMessageService(trim(apiKey), trim(apiSecret));
  await service.send(messages.map(({ to, text }) => ({ to: to.replace(/\D/g, ""), from: SENDER_PHONE, text })));
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

/** 알림톡 발송 (실패 시 SMS fallback) */
export async function sendAlimtalk(
  phone: string,
  templateId: string,
  variables: Record<string, string>,
  fallbackText: string,
  apiKey: string,
  apiSecret: string
): Promise<void> {
  const service = new SolapiMessageService(trim(apiKey), trim(apiSecret));
  const to = phone.replace(/\D/g, "");
  try {
    await service.sendOne({
      to,
      from: SENDER_PHONE,
      kakaoOptions: {
        pfId: KAKAO_PF_ID,
        templateId,
        variables,
      },
    });
  } catch (e) {
    console.warn(`[알림톡 실패 → SMS fallback] ${to}:`, (e as Error).message ?? e);
    await service.sendOne({ to, from: SENDER_PHONE, text: fallbackText });
  }
}

/** 솔라피 잔액 조회 — `/cash/v1/balance` */
export async function fetchSolapiBalance(
  apiKey: string,
  apiSecret: string
): Promise<unknown> {
  const authorization = buildAuth(trim(apiKey), trim(apiSecret));
  const res = await fetch("https://api.solapi.com/cash/v1/balance", {
    headers: { Authorization: authorization },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Solapi 잔액 조회 실패: ${text}`);
  }
  return res.json();
}

/** 솔라피에 등록된 카카오톡 채널 목록 조회 */
export async function getKakaoChannels(
  apiKey: string,
  apiSecret: string
): Promise<unknown> {
  const authorization = buildAuth(trim(apiKey), trim(apiSecret));
  const res = await fetch("https://api.solapi.com/kakao/v2/channels", {
    headers: { Authorization: authorization },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`카카오 채널 조회 실패: ${text}`);
  }
  return res.json();
}

/** 친구톡 단건 발송 — 실패(채널친구 아님 등) 시 SMS fallback */
export async function sendFriendTalk(
  phone: string,
  text: string,
  apiKey: string,
  apiSecret: string
): Promise<void> {
  const service = new SolapiMessageService(trim(apiKey), trim(apiSecret));
  const to = phone.replace(/\D/g, "");
  try {
    const res = await service.sendOne({
      to,
      from: SENDER_PHONE,
      text,
      kakaoOptions: { pfId: KAKAO_PF_ID },
    }) as { statusCode?: string };
    // statusCode 2000 = 정상 접수, 그 외 = 실패 → SMS fallback
    if (res.statusCode && res.statusCode !== "2000") {
      console.warn(`[친구톡 실패(${res.statusCode}) → SMS fallback] ${to}`);
      await service.sendOne({ to, from: SENDER_PHONE, text });
    }
  } catch (e) {
    console.warn(`[친구톡 에러 → SMS fallback] ${to}:`, (e as Error).message ?? e);
    try {
      await service.sendOne({ to, from: SENDER_PHONE, text });
    } catch (e2) {
      console.error(`[SMS fallback도 실패] ${to}:`, (e2 as Error).message ?? e2);
      const raw = (e2 as Error).message ?? String(e2);
      throw new Error(`SMS 발송 실패 (${to}): ${raw.length > 120 ? raw.slice(0, 120) + "…" : raw}`);
    }
  }
}

/** 친구톡 다건 발송 (개별 실패 시 SMS fallback) */
export async function sendBulkFriendTalk(
  messages: Array<{ to: string; text: string }>,
  apiKey: string,
  apiSecret: string
): Promise<void> {
  await Promise.all(
    messages.map(({ to, text }) => sendFriendTalk(to, text, apiKey, apiSecret))
  );
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
