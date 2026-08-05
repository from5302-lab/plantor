/**
 * 규칙 실전 검증 — Firestore 에뮬레이터에 진짜 쿼리를 던진다.
 *
 * Rules 테스트 API 로는 "좁힌 목록 조회가 통과하는가"를 증명할 수 없다.
 * 그 API 는 문서를 직접 주입해 평가하므로, list 의 쿼리 제약 분석을 흉내내지 못한다.
 * (2026-08-05 장애 때 그 API 만 믿고 통과로 오진했다.)
 * 여기서는 에뮬레이터에 REST 로 실제 get/list 를 실행해 ALLOW/DENY 를 그대로 받는다.
 *
 * 실행 (에뮬레이터를 먼저 띄운다):
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" \
 *     npx firebase-tools emulators:start --only firestore --project plantor-test
 *   node scripts/test-rules-live.mjs
 *
 * 에뮬레이터 포트는 8099 로 맞춘다(firebase.json 의 emulators.firestore.port).
 * 규칙을 손대면 test-firestore-rules.mjs 와 **둘 다** 돌린다:
 *   전자는 목록 조회의 통과 여부까지, 후자는 배포 없이 빠른 확인용.
 */
const PROJ = "plantor-test", BASE = "http://127.0.0.1:8099/v1/projects/" + PROJ + "/databases/(default)/documents";
const S = (v) => ({ stringValue: v });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const tokenFor = (uid, claims = {}) =>
  `${b64({ alg: "none", typ: "JWT" })}.${b64({
    iss: `https://securetoken.google.com/${PROJ}`, aud: PROJ, sub: uid, user_id: uid,
    iat: 0, exp: 9999999999, auth_time: 0, email: `${uid}@plantor.app`,
    firebase: { sign_in_provider: "password", identities: {} }, ...claims,
  })}.`;

async function seed(path, fields) {
  const r = await fetch(`${BASE}/${path}`, { method: "PATCH",
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error(`seed ${path}: ${r.status}`);
}
const get = (uid, path, claims) =>
  fetch(`${BASE}/${path}`, { headers: { Authorization: `Bearer ${tokenFor(uid, claims)}` } });
const list = (uid, field, value, claims) =>
  fetch(`${BASE}:runQuery`, { method: "POST",
    headers: { Authorization: `Bearer ${tokenFor(uid, claims)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: "children" }],
      ...(field ? { where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: S(value) } } } : {}),
    } }) });

await seed("users/stu1", { plantor_id: S("kid1"), familyId: S("famA"), role: S("student") });
await seed("users/par1", { plantor_id: S("mom1"), familyId: S("famA"), role: S("parent") });
await seed("users/stu9", { plantor_id: S("kid9"), familyId: S("famB"), role: S("student") });
await seed("users/adm1", { plantor_id: S("adm"), role: S("admin") });
await seed("children/c1", { loginId: S("kid1"), familyId: S("famA"), name: S("내자녀") });
await seed("children/c2", { loginId: S("sib1"), familyId: S("famA"), name: S("형제") });
await seed("children/c9", { loginId: S("kid9"), familyId: S("famB"), name: S("남의자녀") });
await seed("children/c1/stats/summary", { xpTotal: { integerValue: "100" } });
await seed("children/c9/stats/summary", { xpTotal: { integerValue: "999" } });

const out = [];
const run = async (name, expect, fn) => {
  const r = await fn();
  const got = r.ok ? "ALLOW" : "DENY";
  let n = "";
  if (r.ok) { const t = await r.text(); const m = t.match(/"document"/g); n = m ? `${m.length}건` : ""; }
  out.push([got === expect, name, expect, got, n]);
};

await run("학생 → familyId 로 좁힌 목록 (앱이 쓰는 쿼리)", "ALLOW", () => list("stu1", "familyId", "famA"));
await run("학생 → loginId 로 조회 (어제 깨진 옛 방식)", "DENY", () => list("stu1", "loginId", "kid1"));
await run("학생 → 안 좁힌 전체 목록", "DENY", () => list("stu1", null, null));
await run("학생 → 남의 가족으로 좁힌 목록", "DENY", () => list("stu1", "familyId", "famB"));
await run("학생 → 내 문서 단건", "ALLOW", () => get("stu1", "children/c1"));
await run("학생 → 남의 문서 단건", "DENY", () => get("stu1", "children/c9"));
await run("학생 → 내 리워드 하위", "ALLOW", () => get("stu1", "children/c1/stats/summary"));
await run("학생 → 남의 리워드 하위", "DENY", () => get("stu1", "children/c9/stats/summary"));
await run("학부모 → 내 가족 목록", "ALLOW", () => list("par1", "familyId", "famA"));
await run("타가족 학생 → 자기 가족 목록", "ALLOW", () => list("stu9", "familyId", "famB"));
await run("타가족 학생 → 우리 가족 훔쳐보기", "DENY", () => list("stu9", "familyId", "famA"));
await run("운영자 → 안 좁힌 전체 목록", "ALLOW", () => list("adm1", null, null, { admin: true }));
await run("비로그인 → 목록", "DENY", () =>
  fetch(`${BASE}:runQuery`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "children" }] } }) }));

let fail = 0;
for (const [ok, name, exp, got, n] of out) {
  if (!ok) fail++;
  console.log(`${ok ? "✅" : "❌"} ${name}  (기대 ${exp} · 결과 ${got}${n ? " · " + n : ""})`);
}
console.log(`\n통과 ${out.length - fail} / 실패 ${fail}`);
process.exit(fail ? 1 : 0);
