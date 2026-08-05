#!/usr/bin/env node
// 구독 만료 → 연장신청 안내 문자 발송 (개별 대상 지정)
// 계좌번호는 문자에 적지 않는다 — 연장신청 화면에서 입금 계좌·총액이 함께 안내되므로
// "로그인 → 연장신청" 동선으로 유도하는 편이 금액 착오가 없다.
//
// 사용: node scripts/send-renewal-guide.mjs --dry-run   (미리보기)
//       node scripts/send-renewal-guide.mjs             (실제 발송)
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
  } catch { /* .env 없으면 아래에서 걸러진다 */ }
  return env;
}
function getSecret(name) {
  return execSync(`firebase functions:secrets:access ${name} --project ${PROJECT}`, { encoding: "utf8" }).trim();
}

const env = loadEnv(new URL("../functions/.env", import.meta.url).pathname);
const FROM = env.SENDER_PHONE;

// 대상: parent(학부모명) · phone · student(자녀) · service · endDate · parentId(학부모 로그인 아이디)
// correction: true → 직전에 잘못 안내한 만료일을 정정하는 문구로 발송
const RECIPIENTS = [
  { parent: "문미희", phone: "010-8513-6327", student: "정승원", service: "매일국어", endDate: "7월 31일", parentId: "mmh1216", correction: "8월 31일" },
];

function buildText(r) {
  const head = r.correction
    ? [
      `[플랜토] ${r.parent}님, 조금 전 문자 내용을 정정드립니다 🙏`,
      ``,
      `${r.student} 학생의 ${r.service} 구독 만료일은 ${r.endDate}입니다.`,
      `앞서 ${r.correction}로 잘못 안내드려 죄송합니다.`,
    ]
    : [
      `[플랜토] ${r.parent}님, 안녕하세요 😊`,
      ``,
      `${r.student} 학생의 ${r.service} 구독이 ${r.endDate}에 만료됩니다.`,
    ];
  return [
    ...head,
    ``,
    `연장을 원하시면 아래에서 로그인 후 연장신청을 해주세요.`,
    ``,
    `▶ https://plantor.web.app`,
    `아이디: ${r.parentId}`,
    ``,
    `■ 연장신청 방법 (약 1분)`,
    `1. 위 주소 접속 후 학부모 계정으로 로그인`,
    `2. [연장신청] 눌러 과목·기간 선택`,
    `3. 화면에 입금 계좌와 총 입금액이 안내됩니다`,
    `4. 입금 후 확인되면 연장 완료 문자를 보내드려요`,
    ``,
    `문의 주시면 언제든 도와드리겠습니다. 감사합니다 🌱`,
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
    console.log(`\n[DRY-RUN] 대상 ${RECIPIENTS.length}명 (실제 발송 안 함)\n`);
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
    const body = { message: { to, from: FROM.replace(/\D/g, ""), text: buildText(r), type: "LMS", subject: "[플랜토] 구독 연장 안내" } };
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
