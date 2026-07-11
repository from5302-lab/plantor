#!/usr/bin/env node
// 학습계획 세우기 안내 문자 발송 (초6↑ 대상 + 지정 추가)
// 사용: node scripts/send-plan-guide.mjs --dry-run   (미리보기)
//       node scripts/send-plan-guide.mjs             (실제 발송)
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PROJECT = "plantor-from302";
const API_BASE = "https://api.solapi.com";
const DRY = process.argv.includes("--dry-run");

function loadEnv(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return env;
}
function getSecret(name) {
  return execSync(`firebase functions:secrets:access ${name} --project ${PROJECT}`, { encoding: "utf8" }).trim();
}

const env = loadEnv(new URL("../functions/.env", import.meta.url).pathname);
const FROM = env.SENDER_PHONE;

// 대상자 (parentName, phone, student, loginId)
const RECIPIENTS = [
  { parent: "강혜란", phone: "010-6419-9584", student: "이정민", id: "loea120423" },
  { parent: "김보선", phone: "010-9896-9983", student: "정윤오", id: "sogmi79" },
  { parent: "문미희", phone: "010-8513-6327", student: "정승원", id: "jsw0810" },
  { parent: "이희천", phone: "010-5304-9293", student: "임서주", id: "izapick" },
  { parent: "정세희", phone: "010-9456-8795", student: "박지유", id: "jiyou0111" },
];

function buildText(r) {
  return [
    `[플랜토] ${r.parent}님, 안녕하세요 😊`,
    ``,
    `이제 ${r.student} 학생이 플랜토에서 직접 이번 주 학습 계획을`,
    `세울 수 있어요. 아이 계정으로 로그인해 계획부터 세워주세요!`,
    ``,
    `▶ 접속 주소: https://plantor.web.app`,
    `아이디: ${r.id}`,
    `비밀번호: 012345`,
    ``,
    `■ 계획 세우는 법 (약 2분)`,
    `1. 위 주소 접속 후 아이 계정으로 로그인`,
    `2. '학습 계획을 세워볼까요?' 화면에서`,
    `   [학습 계획 세우러 가기] 누르기`,
    `3. 이번 주에 할 과목과 요일 선택 후 저장`,
    `4. 선생님이 확인·확정하면, 매일 '오늘 할 일'에`,
    `   과제가 표시되고 완료 체크를 할 수 있어요`,
    ``,
    `궁금한 점은 편하게 문의 주세요!`,
  ].join("\n");
}

function buildAuth(apiKey, apiSecret) {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(8).toString("hex");
  const signature = crypto.createHmac("sha256", apiSecret).update(date + salt).digest("hex");
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

async function main() {
  if (!FROM) { console.error("❌ SENDER_PHONE(.env) 없음 — 발신번호 필요"); process.exit(1); }

  if (DRY) {
    console.log(`\n[DRY-RUN] 발신번호: ${FROM} · 대상 ${RECIPIENTS.length}명 (실제 발송 안 함)\n`);
    for (const r of RECIPIENTS) {
      console.log(`──────── → ${r.parent} (${r.student}) ${r.phone} ────────`);
      console.log(buildText(r));
      console.log("");
    }
    return;
  }

  const apiKey = getSecret("SOLAPI_API_KEY");
  const apiSecret = getSecret("SOLAPI_API_SECRET");

  for (const r of RECIPIENTS) {
    const to = r.phone.replace(/\D/g, "");
    const body = { message: { to, from: FROM.replace(/\D/g, ""), text: buildText(r), type: "LMS", subject: "[플랜토] 학습 계획 안내" } };
    try {
      const res = await fetch(`${API_BASE}/messages/v4/send`, {
        method: "POST",
        headers: { Authorization: buildAuth(apiKey, apiSecret), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const txt = await res.text();
      if (!res.ok) { console.log(`❌ ${r.parent}(${r.student}) ${to} 실패 ${res.status}: ${txt}`); continue; }
      const data = JSON.parse(txt);
      console.log(`✅ ${r.parent}(${r.student}) ${to} 발송 status=${data.statusCode ?? "?"} msgId=${data.messageId ?? "?"}`);
    } catch (e) {
      console.log(`❌ ${r.parent}(${r.student}) ${to} 오류: ${e.message}`);
    }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
