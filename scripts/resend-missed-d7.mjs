#!/usr/bin/env node
/**
 * 2026-05-23 D-7 알림 누락분 재발송
 *
 * 대상 4가족 (great-books 구독자, childId="__parent__"로 인해 Firestore
 * INVALID_ARGUMENT → notifications.ts:533 빈 catch에서 사일런트로 실패):
 *   - 정세희   (notion_zose1aos)
 *   - 수현     (notion_camellia124)
 *   - 이혜진   (notion_green4cat)
 *   - 김민주   (notion_binghongcha21)
 *
 * 솔라피 키는 Firebase Secret Manager에서 로드. functions/.env 에서 SENDER_PHONE 등 로드.
 */
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import admin from "firebase-admin";

const PROJECT = "plantor-from302";
const API_BASE = "https://api.solapi.com";
const KAKAO_PF_ID = "KA01PF2605051120092677BA4kHXSXVw";
const TEMPLATE_ID = "KA01TP260505112852272M2EtJj3a3Vx";
const SITE_URL = "https://plantor.web.app";

const SERVICE_META = {
  dailykor: { name: "매일국어" },
  autovoca: { name: "오토보카" },
  class5: { name: "클래스5" },
  "classcard-middle": { name: "클래스카드" },
  "great-books": { name: "위대한 책들 클럽" },
};

const TARGET_FAMILY_IDS = [
  "notion_zose1aos",        // 정세희
  "notion_camellia124",     // 수현
  "notion_green4cat",       // 이혜진
  "notion_binghongcha21",   // 김민주
];

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

// functions/.env 파싱
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
const BANK_NAME = env.BANK_NAME;
const BANK_ACCOUNT = env.BANK_ACCOUNT;
const BANK_HOLDER = env.BANK_HOLDER;

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
  return Object.entries(vars).reduce(
    (t, [k, v]) => t.replace(new RegExp(`\\{${k}\\}`, "g"), v),
    tpl
  );
}

admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();

async function loadFallback() {
  try {
    const snap = await db.collection("smsTemplates").doc("subscription_d7").get();
    if (snap.exists) return snap.data().body || SUBSCRIPTION_FALLBACK;
  } catch {}
  return SUBSCRIPTION_FALLBACK;
}

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  if (!SENDER_PHONE) throw new Error("SENDER_PHONE 누락 (functions/.env 확인)");
  console.log(DRY_RUN ? "🧪 DRY RUN — 실제 발송 안 함\n" : "🚀 실제 발송 모드\n");

  const tpl = await loadFallback();

  const KST_OFFSET = 9 * 60 * 60 * 1000;
  const nowKst = new Date(Date.now() + KST_OFFSET);
  const targetDay = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate() + 7) - KST_OFFSET);
  const targetDayEnd = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate() + 8));

  let sent = 0;
  for (const familyId of TARGET_FAMILY_IDS) {
    try {
      const familySnap = await db.collection("families").doc(familyId).get();
      if (!familySnap.exists) { console.log(`❌ ${familyId}: family 없음`); continue; }
      const family = familySnap.data();
      const phone = family.phone?.replace?.(/\D/g, "");
      if (!phone) { console.log(`❌ ${familyId}: phone 없음`); continue; }
      const parentName = family.parentName ?? "";

      let parentId = "";
      if (family.userId) {
        const u = await db.collection("users").doc(family.userId).get();
        parentId = u.data()?.plantor_id ?? "";
      }

      const subsSnap = await db.collection("subscriptions")
        .where("familyId", "==", familyId).where("status", "==", "active").get();
      const inWindow = subsSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .filter((s) => {
          const ms = s.endDate?.toDate?.()?.getTime();
          return ms != null && ms >= targetDay.getTime() && ms < targetDayEnd.getTime();
        });
      if (inWindow.length === 0) { console.log(`⚠️ ${familyId} (${parentName}): D-7 윈도우 sub 없음`); continue; }

      // __parent__ 등 invalid childId 스킵 (수정된 notifications.ts 로직과 동일)
      const childIds = [...new Set(
        inWindow.map((s) => s.childId)
          .filter((c) => typeof c === "string" && c.length > 0 && c !== "__parent__")
      )];
      const childNames = [];
      for (const cid of childIds) {
        const c = await db.collection("children").doc(cid).get();
        if (c.exists) childNames.push(c.data().name ?? "");
      }
      const childNamesStr = childNames.filter(Boolean).join(", ");

      const serviceNames = inWindow.map((s) => SERVICE_META[s.serviceSlug]?.name ?? s.serviceSlug).join(", ");
      const endDate = inWindow[0].endDate.toDate().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });

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

      console.log(`\n→ ${parentName} (${phone})`);
      console.log(`  childNames: ${JSON.stringify(childNamesStr)} / serviceNames: ${serviceNames} / endDate: ${endDate}`);
      console.log(`  알림톡 variables: ${JSON.stringify(variables)}`);
      console.log(`  SMS 폴백 본문:\n----\n${text}\n----`);

      if (DRY_RUN) { sent++; continue; }

      try {
        await solapi("POST", "/messages/v4/send", {
          message: {
            to: phone, from: SENDER_PHONE,
            kakaoOptions: { pfId: KAKAO_PF_ID, templateId: TEMPLATE_ID, variables },
          },
        });
        console.log(`  ✅ 알림톡 발송 완료`);
        sent++;
      } catch (e) {
        console.log(`  ⚠️ 알림톡 실패, SMS 폴백: ${e.message?.slice(0, 200)}`);
        await solapi("POST", "/messages/v4/send", {
          message: { to: phone, from: SENDER_PHONE, text },
        });
        console.log(`  ✅ SMS 폴백 발송 완료`);
        sent++;
      }
    } catch (e) {
      console.log(`💥 ${familyId} 실패: ${e.message ?? e}`);
    }
  }

  console.log(`\n총 ${sent} / ${TARGET_FAMILY_IDS.length}가족 발송`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
