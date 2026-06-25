#!/usr/bin/env node
/**
 * 솔라피 최근 발송 기록 조회
 *   node scripts/solapi-history.mjs            # 오늘 KST 00:00~now
 *   node scripts/solapi-history.mjs 2026-05-23 # 특정 날짜 (KST)
 */
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const PROJECT = "plantor-from302";
const API_BASE = "https://api.solapi.com";
const KST_OFFSET = 9 * 60 * 60 * 1000;

let _keys = null;
function getKeys() {
  if (_keys) return _keys;
  const apiKey = execSync(`firebase functions:secrets:access SOLAPI_API_KEY --project ${PROJECT}`, { encoding: "utf8" }).trim();
  const apiSecret = execSync(`firebase functions:secrets:access SOLAPI_API_SECRET --project ${PROJECT}`, { encoding: "utf8" }).trim();
  _keys = { apiKey, apiSecret };
  return _keys;
}
function buildAuth() {
  const { apiKey, apiSecret } = getKeys();
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(8).toString("hex");
  const signature = crypto.createHmac("sha256", apiSecret).update(date + salt).digest("hex");
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}
async function api(method, path) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { Authorization: buildAuth(), "Content-Type": "application/json" },
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${path} 실패 (${res.status}): ${typeof data === "string" ? data : JSON.stringify(data, null, 2)}`);
  return data;
}

function kstISO(d) {
  return new Date(d.getTime() + KST_OFFSET).toISOString().replace("T", " ").slice(0, 19);
}

async function main() {
  const arg = process.argv[2];
  let startKst, endKst;
  if (arg) {
    // YYYY-MM-DD 한국 날짜 자정~다음날 자정
    const [y, m, d] = arg.split("-").map(Number);
    startKst = new Date(Date.UTC(y, m - 1, d) - KST_OFFSET);
    endKst   = new Date(Date.UTC(y, m - 1, d + 1) - KST_OFFSET);
  } else {
    const nowKst = new Date(Date.now() + KST_OFFSET);
    const y = nowKst.getUTCFullYear();
    const m = nowKst.getUTCMonth();
    const d = nowKst.getUTCDate();
    startKst = new Date(Date.UTC(y, m, d) - KST_OFFSET);
    endKst   = new Date();
  }
  console.log(`조회 범위 (KST):  ${kstISO(startKst)} ~ ${kstISO(endKst)}`);

  // Solapi: GET /messages/v4/list  with dateType, startDate, endDate
  // startDate/endDate는 ISO 8601 (UTC). limit 최대 500.
  const params = new URLSearchParams({
    startDate: startKst.toISOString(),
    endDate: endKst.toISOString(),
    limit: "500",
  });
  const data = await api("GET", `/messages/v4/list?${params}`);

  const list = data.messageList ? Object.values(data.messageList) : (data.list ?? []);
  console.log(`총 발송 기록: ${list.length}건\n`);

  // 상태별 카운트
  const byStatus = {};
  const byTpl = {};
  for (const m of list) {
    const sc = m.statusCode || m.status || "?";
    byStatus[sc] = (byStatus[sc] || 0) + 1;
    const tpl = m.kakaoOptions?.templateId || m.type || "?";
    byTpl[tpl] = (byTpl[tpl] || 0) + 1;
  }
  console.log("상태코드별:");
  for (const [k, v] of Object.entries(byStatus)) console.log(`  ${k}: ${v}`);
  console.log("\n타입/템플릿별:");
  for (const [k, v] of Object.entries(byTpl)) console.log(`  ${k}: ${v}`);

  // 상세 (시간 오름차순)
  list.sort((a, b) => new Date(a.dateCreated) - new Date(b.dateCreated));
  console.log("\n상세 (시간 오름차순):");
  console.log("시각(KST)            | to              | type | tplId or status                                  | statusCode | reason");
  console.log("─".repeat(160));
  for (const m of list) {
    const t = m.dateCreated ? kstISO(new Date(m.dateCreated)) : "?".padEnd(19);
    const to = (m.to || "").padEnd(15);
    const type = (m.type || "").padEnd(4);
    const tpl = (m.kakaoOptions?.templateId || "").padEnd(48);
    const sc = (m.statusCode || "").padEnd(10);
    const reason = m.reason || m.statusMessage || "";
    console.log(`${t} | ${to} | ${type} | ${tpl} | ${sc} | ${reason}`);
  }
}
main().catch((e) => { console.error("\n❌", e.message); process.exit(1); });
