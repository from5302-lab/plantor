#!/usr/bin/env node
/**
 * Solapi 카카오 알림톡 템플릿 관리 CLI
 *
 * 사용:
 *   node scripts/solapi-template.mjs categories
 *   node scripts/solapi-template.mjs list
 *   node scripts/solapi-template.mjs status <templateId>
 *   node scripts/solapi-template.mjs register-all
 *   node scripts/solapi-template.mjs cancel <templateId>
 *
 * 인증: firebase functions:secrets:access 명령으로 Secret Manager에서 자동 조회
 *       (firebase CLI 로그인되어 있어야 함)
 *
 * 등록 후 검수는 자동으로 시작됨 (PENDING → INSPECTING → APPROVED/REJECTED).
 * 영업일 1~3일 소요.
 */

import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PROJECT = "plantor-from302";
const CHANNEL_ID = "KA01PF2605051120092677BA4kHXSXVw"; // plantor PFID
const API_BASE = "https://api.solapi.com";

// ───────────── 3개 본문 정의 ─────────────────────────────────────────────────
// categoryCode 는 `categories` 명령으로 조회 후 결정 (현재는 placeholder).
// 등록 전 적절한 카테고리 코드로 채워야 함.
const TEMPLATES = [
  {
    key: "SIGNUP_APPROVED",
    payload: {
      name: "가입 승인 안내",
      content:
        "[플랜토] #{parentName}님, 가입이 승인되었습니다.\n\n" +
        "▪ 아이디: #{parentId}\n" +
        "▪ 초기 비밀번호: 012345\n\n" +
        "로그인 후 자녀 학습 현황을 확인하실 수 있습니다.\n" +
        "사이트: plantor.web.app",
      categoryCode: "001001", // 회원가입
      messageType: "BA",
      securityFlag: true, // 초기비번 평문 노출 위해
      channelId: CHANNEL_ID,
    },
  },
  {
    key: "PASSWORD_RESET",
    payload: {
      name: "비밀번호 초기화",
      content:
        "[플랜토] #{parentName}님, 비밀번호가 초기화되었습니다.\n\n" +
        "▪ 새 비밀번호: #{password}\n\n" +
        "로그인 후 비밀번호를 변경해 주세요.\n" +
        "사이트: plantor.web.app",
      categoryCode: "001002", // 인증/비밀번호/로그인
      messageType: "BA",
      securityFlag: true, // 비번 평문 노출 필수
      channelId: CHANNEL_ID,
    },
  },
  {
    key: "AI_PACKAGE_CONFIRM",
    payload: {
      name: "AI 패키지 입금 확인",
      content:
        "[플랜토] #{parentName}님, AI 패키지 입금이 확인되었습니다.\n\n" +
        "이용 기간: ~#{endDate}\n\n" +
        "사이트에 접속하시면 상단 [AI 패키지] 메뉴에서 이용하실 수 있습니다.\n" +
        "plantor.web.app",
      categoryCode: "002001", // 구매완료
      messageType: "BA",
      securityFlag: false,
      channelId: CHANNEL_ID,
    },
  },
  {
    key: "LESSON_PAYMENT_CONFIRM",
    payload: {
      name: "수업료 입금 확인",
      content:
        "[플랜토]\n" +
        "#{studentName} 학부모님,\n" +
        "#{month}월 학습비 입금이 확인되었습니다.\n\n" +
        "감사합니다.",
      categoryCode: "002001", // 구매완료
      messageType: "BA",
      securityFlag: false,
      channelId: CHANNEL_ID,
    },
  },
];

// ───────────── 인증 & API 헬퍼 ────────────────────────────────────────────────

let _cachedKeys = null;
function getKeys() {
  if (_cachedKeys) return _cachedKeys;
  const apiKey = execSync(`firebase functions:secrets:access SOLAPI_API_KEY --project ${PROJECT}`, {
    encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  const apiSecret = execSync(`firebase functions:secrets:access SOLAPI_API_SECRET --project ${PROJECT}`, {
    encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  _cachedKeys = { apiKey, apiSecret };
  return _cachedKeys;
}

function buildAuth() {
  const { apiKey, apiSecret } = getKeys();
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(8).toString("hex");
  const signature = crypto.createHmac("sha256", apiSecret).update(date + salt).digest("hex");
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

async function api(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: buildAuth(),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    throw new Error(`${method} ${path} 실패 (${res.status}): ${typeof data === "string" ? data : JSON.stringify(data, null, 2)}`);
  }
  return data;
}

// ───────────── 서브커맨드 ─────────────────────────────────────────────────────

async function cmdCategories() {
  const data = await api("GET", "/kakao/v2/templates/categories");
  console.log("카테고리 목록 (categoryCode를 본문에 매핑할 때 사용):\n");
  const list = Array.isArray(data) ? data : (data?.categories ?? data);
  for (const c of list) {
    console.log(`  ${c.code ?? c.categoryCode}  ${c.name ?? c.categoryName ?? ""}`);
  }
}

async function cmdList() {
  const data = await api("GET", `/kakao/v2/templates?channelId=${CHANNEL_ID}&limit=100`);
  const items = data.templateList ? Object.values(data.templateList) : (data.list ?? data);
  console.log(`총 ${items.length}건 (channelId=${CHANNEL_ID})\n`);
  console.log("ID                                            | 상태       | 이름");
  console.log("─".repeat(90));
  for (const t of items) {
    const id = (t.templateId ?? "").padEnd(44);
    const status = (t.status ?? "?").padEnd(10);
    console.log(`${id} | ${status} | ${t.name ?? ""}`);
  }
}

async function cmdStatus(templateId) {
  if (!templateId) throw new Error("templateId 인자 필요");
  const data = await api("GET", `/kakao/v2/templates/${templateId}`);
  console.log(JSON.stringify(data, null, 2));
}

async function cmdCancel(templateId) {
  if (!templateId) throw new Error("templateId 인자 필요");
  const data = await api("POST", `/kakao/v2/templates/${templateId}/inspection/cancel`);
  console.log("검수 취소 완료:", data.templateId, data.status);
}

async function cmdDelete(templateId) {
  if (!templateId) throw new Error("templateId 인자 필요");
  // 주의: channelGroupId 소속(채널 그룹/기본 샘플) 템플릿은 API 삭제 불가 → 콘솔에서 삭제.
  const data = await api("DELETE", `/kakao/v2/templates/${templateId}`);
  console.log("삭제 완료:", templateId, JSON.stringify(data));
}

async function cmdRegister(key) {
  if (!key) throw new Error("template key 인자 필요 (예: LESSON_PAYMENT_CONFIRM)");
  const t = TEMPLATES.find((x) => x.key === key);
  if (!t) throw new Error(`키를 찾을 수 없음: ${key}. 유효: ${TEMPLATES.map((x) => x.key).join(", ")}`);
  process.stdout.write(`등록: ${t.key} (${t.payload.name}) ... `);
  const data = await api("POST", "/kakao/v2/templates", t.payload);
  console.log(`✅ ${data.templateId} (status=${data.status})`);
}

async function cmdRegisterAll() {
  // categoryCode placeholder 검증
  const missing = TEMPLATES.filter((t) => t.payload.categoryCode === "PLACEHOLDER");
  if (missing.length > 0) {
    console.error("❌ categoryCode가 PLACEHOLDER로 비어 있음. 다음 단계로:");
    console.error("   1) node scripts/solapi-template.mjs categories  로 카테고리 목록 조회");
    console.error("   2) 이 파일의 TEMPLATES 배열에서 각 categoryCode 채우기");
    console.error("   3) 다시 register-all 실행");
    process.exit(1);
  }

  for (const t of TEMPLATES) {
    process.stdout.write(`등록: ${t.key} (${t.payload.name}) ... `);
    try {
      const data = await api("POST", "/kakao/v2/templates", t.payload);
      console.log(`✅ ${data.templateId} (status=${data.status})`);
    } catch (e) {
      console.log(`❌`);
      console.error(`   ${e.message}`);
    }
  }
}

// ───────────── 엔트리 ─────────────────────────────────────────────────────────

const CMDS = {
  categories: cmdCategories,
  list: cmdList,
  status: cmdStatus,
  cancel: cmdCancel,
  delete: cmdDelete,
  register: cmdRegister,
  "register-all": cmdRegisterAll,
};

async function main() {
  const [, , cmd, ...args] = process.argv;
  if (!cmd || !CMDS[cmd]) {
    console.error("사용:");
    for (const c of Object.keys(CMDS)) console.error(`  node ${process.argv[1]} ${c}`);
    process.exit(1);
  }
  try {
    await CMDS[cmd](...args);
  } catch (e) {
    console.error(`\n❌ ${e.message}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${fileURLToPath(import.meta.url).replace("file://", "")}`) {
  main();
} else {
  main();
}
