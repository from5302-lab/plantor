#!/usr/bin/env node
/**
 * 특정 가족에게 D-7 구독 만료 알림 테스트 발송.
 * 배포된 service-meta-loader와 동일 로직으로 서비스명/아이콘 해결.
 *
 * 사용:
 *   node scripts/test-send-to-family.mjs <familyId> --dry-run
 *   node scripts/test-send-to-family.mjs <familyId>
 */
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import admin from "firebase-admin";

const PROJECT = "plantor-from302";
const API_BASE = "https://api.solapi.com";
const KAKAO_PF_ID = "KA01PF2605051120092677BA4kHXSXVw";
const TEMPLATE_ID = "KA01TP260505112852272M2EtJj3a3Vx"; // 구독 만료 안내
const SITE_URL = "https://plantor.web.app";

// 정적 base (functions/src/config.ts의 SERVICE_META 미러)
const STATIC_BASE = {
  dailykor:           { name: "매일국어",              icon: `${SITE_URL}/service-icons/dailykor.png` },
  autovoca:           { name: "오토보카",               icon: `${SITE_URL}/service-icons/autovoca.png` },
  class5:             { name: "클래스5",           icon: `${SITE_URL}/service-icons/class5.png` },
  "classcard-middle": { name: "클래스카드",        icon: `${SITE_URL}/service-icons/classcard.png` },
  "great-books":      { name: "고전독서모임",       icon: `${SITE_URL}/service-icons/great-books.png` },
  "vibe-coding":      { name: "바이브코딩 수업",     icon: `${SITE_URL}/service-icons/vibe-coding.svg` },
  momsaipack:         { name: "엄마들을 위한 AI 패키지", icon: `${SITE_URL}/favicon.svg` },
  "mom-webinar":      { name: "[Mom&] 맘이랑 금요웨비나", icon: `${SITE_URL}/favicon.svg` },
};

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
const env = loadEnv(new URL("../functions/.env", import.meta.url).pathname);
const SENDER_PHONE = env.SENDER_PHONE;
const BANK_NAME = env.BANK_NAME, BANK_ACCOUNT = env.BANK_ACCOUNT, BANK_HOLDER = env.BANK_HOLDER;

function getSecret(name) {
  return execSync(`firebase functions:secrets:access ${name} --project ${PROJECT}`, { encoding: "utf8" }).trim();
}
const apiKey = getSecret("SOLAPI_API_KEY");
const apiSecret = getSecret("SOLAPI_API_SECRET");

function buildAuth() {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(8).toString("hex");
  const signature = crypto.createHmac("sha256", apiSecret).update(date + salt).digest("hex");
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}
async function solapi(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { Authorization: buildAuth(), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let data; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  if (!res.ok) throw new Error(`${method} ${path} (${res.status}): ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return data;
}
function fillTemplate(tpl, vars) {
  return Object.entries(vars).reduce((t, [k, v]) => t.replace(new RegExp(`\\{${k}\\}`, "g"), v), tpl);
}

admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();

function resolveIcon(iconUrl, fallback) {
  if (!iconUrl) return fallback;
  if (iconUrl.startsWith("http")) return iconUrl;
  if (iconUrl.startsWith("/")) return `${SITE_URL}${iconUrl}`;
  return iconUrl;
}

async function loadServiceMeta() {
  const result = new Map();
  for (const [slug, m] of Object.entries(STATIC_BASE)) result.set(slug, { ...m });
  const snap = await db.collection("serviceOverrides").get();
  for (const doc of snap.docs) {
    const data = doc.data();
    const existing = result.get(doc.id);
    const fallbackIcon = existing?.icon ?? `${SITE_URL}/favicon.svg`;
    const fallbackName = existing?.name ?? doc.id;
    result.set(doc.id, {
      name: data.name || fallbackName,
      icon: resolveIcon(data.iconUrl, fallbackIcon),
    });
  }
  return result;
}

const SUBSCRIPTION_FALLBACK = [
  `[플랜토] {parentName}님, 구독 만료 안내드립니다.`,
  ``,
  `{childNames} {serviceNames} 구독이 {endDate}에 만료됩니다.`,
  ``,
  `연장을 원하시면 사이트에 로그인해서`,
  `연장신청을 해주세요.`,
  ``,
  `👉 {siteUrl}`,
].join("\n");

async function loadFallback() {
  try {
    const snap = await db.collection("smsTemplates").doc("subscription_d7").get();
    if (snap.exists) return snap.data().body || SUBSCRIPTION_FALLBACK;
  } catch {}
  return SUBSCRIPTION_FALLBACK;
}

async function main() {
  const args = process.argv.slice(2);
  const familyId = args.find((a) => !a.startsWith("--"));
  const DRY_RUN = args.includes("--dry-run");
  if (!familyId) { console.error("사용: node scripts/test-send-to-family.mjs <familyId> [--dry-run]"); process.exit(1); }
  if (!SENDER_PHONE) throw new Error("SENDER_PHONE 누락");

  console.log(DRY_RUN ? "🧪 DRY RUN\n" : "🚀 실제 발송\n");

  const meta = await loadServiceMeta();
  const tpl = await loadFallback();

  const familySnap = await db.collection("families").doc(familyId).get();
  if (!familySnap.exists) { console.error(`family ${familyId} 없음`); process.exit(1); }
  const family = familySnap.data();
  const phone = family.phone?.replace?.(/\D/g, "");
  if (!phone) { console.error(`phone 없음`); process.exit(1); }
  const parentName = family.parentName ?? "";

  let parentId = "";
  if (family.userId) {
    const u = await db.collection("users").doc(family.userId).get();
    parentId = u.data()?.plantor_id ?? "";
  }

  const subsSnap = await db.collection("subscriptions")
    .where("familyId", "==", familyId).where("status", "==", "active").get();
  const subs = subsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (subs.length === 0) { console.error("active sub 없음"); process.exit(1); }

  const childIds = [...new Set(
    subs.map((s) => s.childId).filter((c) => typeof c === "string" && c.length > 0 && c !== "__parent__")
  )];
  const childNames = [];
  for (const cid of childIds) {
    const c = await db.collection("children").doc(cid).get();
    if (c.exists) childNames.push(c.data().name ?? "");
  }
  const childNamesStr = childNames.filter(Boolean).join(", ");

  // ⭐ 새 loader 기반 서비스명 (홈페이지와 동일)
  const serviceNames = subs.map((s) => meta.get(s.serviceSlug)?.name ?? s.serviceSlug).join(", ");

  const earliestEnd = subs
    .map((s) => s.endDate?.toDate?.())
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const endDate = earliestEnd?.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) ?? "?";

  const text = fillTemplate(tpl, {
    parentName, parentId, childNames: childNamesStr, serviceNames, endDate,
    amount: "", bankInfo: `${BANK_ACCOUNT}\n${BANK_NAME} ${BANK_HOLDER}`, siteUrl: SITE_URL,
  });
  const variables = {
    "#{parentName}": parentName,
    "#{childNames}": childNamesStr,
    "#{serviceNames}": serviceNames,
    "#{endDate}": endDate,
    "#{parentId}": parentId,
  };

  console.log(`→ ${parentName} (${phone}) [${familyId}]`);
  console.log(`  childNames: ${JSON.stringify(childNamesStr)}`);
  console.log(`  serviceNames: ${serviceNames}`);
  console.log(`  endDate: ${endDate}`);
  console.log(`  alimtalk variables: ${JSON.stringify(variables)}`);
  console.log(`  SMS 폴백:\n----\n${text}\n----`);

  if (DRY_RUN) { console.log("\n(dry-run 종료)"); process.exit(0); }

  try {
    await solapi("POST", "/messages/v4/send", {
      message: { to: phone, from: SENDER_PHONE, kakaoOptions: { pfId: KAKAO_PF_ID, templateId: TEMPLATE_ID, variables } },
    });
    console.log(`\n✅ 알림톡 발송 완료`);
  } catch (e) {
    console.log(`\n⚠️ 알림톡 실패, SMS 폴백: ${e.message?.slice(0, 200)}`);
    await solapi("POST", "/messages/v4/send", { message: { to: phone, from: SENDER_PHONE, text } });
    console.log(`✅ SMS 폴백 발송 완료`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
