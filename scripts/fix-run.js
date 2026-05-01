/**
 * 최도윤: class5 discount→5000, autovoca discount→5000, 만료일 Dec 31 KST
 * 정윤오: autovoca 만료일 Dec 31 KST 수정 (discount:5000 유지)
 */
const fs = require("fs"), os = require("os");
const PROJECT = "plantor-from302";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const TOKEN = JSON.parse(fs.readFileSync(os.homedir() + "/.config/configstore/firebase-tools.json", "utf8")).tokens.access_token;
const END_KST = "2026-12-31T14:59:59Z"; // = 2026-12-31 23:59:59 KST

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
  return method === "DELETE" ? null : res.json();
}

async function queryDocs(col, filters) {
  const where = filters.length === 1 ? fieldFilter(filters[0]) : { compositeFilter: { op: "AND", filters: filters.map(fieldFilter) } };
  const r = await req("POST", ":runQuery", { structuredQuery: { from: [{ collectionId: col }], where } });
  return (r || []).filter(x => x.document).map(x => x.document);
}

function fieldFilter([field,, value]) {
  return { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue: String(value) } } };
}

function docId(name) { return String(name).split("/").pop(); }

async function patch(docName, fields) {
  const path = docName.replace(`projects/${PROJECT}/databases/(default)/documents`, "");
  const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join("&");
  const body = { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => {
    if (v instanceof Date || (typeof v === "string" && v.includes("T"))) return [k, { timestampValue: v instanceof Date ? v.toISOString() : v }];
    if (typeof v === "number") return [k, { integerValue: String(v) }];
    return [k, { stringValue: String(v) }];
  })) };
  await req("PATCH", `${path}?${mask}`, body);
}

async function main() {
  // ── 최도윤: class5 discount→5000, autovoca endDate→Dec31 KST ──
  console.log("\n▶ 최도윤");
  const [dodalove] = await queryDocs("children", [["name", "==", "최도윤"]]);
  if (!dodalove) { console.log("  ❌ 못 찾음"); }
  else {
    const cId = docId(dodalove.name);
    const subs = await queryDocs("subscriptions", [["childId", "==", cId]]);
    for (const sub of subs) {
      const slug = sub.fields.serviceSlug?.stringValue;
      if (slug === "class5") {
        await patch(sub.name, { discount: 5000, endDate: END_KST });
        console.log(`  ✅ class5 → discount:5000, endDate:2026-12-31`);
      } else if (slug === "autovoca") {
        await patch(sub.name, { discount: 5000, endDate: END_KST });
        console.log(`  ✅ autovoca → discount:5000, endDate:2026-12-31`);
      }
    }
  }

  // ── 정윤오: autovoca endDate→Dec31 KST ──
  console.log("\n▶ 정윤오");
  const [sogmi] = await queryDocs("children", [["name", "==", "정윤오"]]);
  if (!sogmi) { console.log("  ❌ 못 찾음"); }
  else {
    const cId = docId(sogmi.name);
    const subs = await queryDocs("subscriptions", [["childId", "==", cId]]);
    const autovoca = subs.find(s => s.fields.serviceSlug?.stringValue === "autovoca");
    if (autovoca) {
      await patch(autovoca.name, { endDate: END_KST });
      console.log(`  ✅ autovoca endDate → 2026-12-31`);
    }
  }

  console.log("\n✅ 완료");
}

main().catch(console.error);
