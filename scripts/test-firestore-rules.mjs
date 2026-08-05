/**
 * firestore.rules 검증 — 로컬 에뮬레이터 없이, 배포 전에 돌린다.
 *
 * Firebase Security Rules 테스트 API에 규칙 파일 원문을 그대로 올려
 * 시뮬레이션 요청의 ALLOW/DENY를 확인한다. 실제 계정·비밀번호가 필요 없다.
 * (get() 호출은 functionMocks로 대신한다)
 *
 * 사용법:  node scripts/test-firestore-rules.mjs
 * 필요:    gcloud 로그인 (액세스 토큰 사용)
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const PROJ = "plantor-from302";
const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const token = execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();

const DOC = (p) => `/databases/(default)/documents/${p}`;
const STUDENT = "uid_student", PARENT = "uid_parent", ADMIN = "uid_admin";
const MYFAM = "famA", OTHERFAM = "famB";

// users/{uid} get() 목업 — 규칙의 myFamilyId()가 읽는 문서
const userMock = (uid, familyId, role = "student") => ({
  function: "get",
  args: [{ exactValue: DOC(`users/${uid}`) }],
  result: { value: { data: { familyId, role } } },
});
const childMock = (childId, familyId) => ({
  function: "get",
  args: [{ exactValue: DOC(`children/${childId}`) }],
  result: { value: { data: { familyId } } },
});

const tc = (name, expectation, uid, path, resourceFamily, mocks, token = {}) => ({
  _name: name,
  expectation,
  request: {
    auth: { uid, token: { email: `${uid}@plantor.app`, ...token } },
    path: DOC(path),
    method: "get",
    time: new Date().toISOString(),
  },
  functionMocks: mocks,
  resource: resourceFamily ? { data: { familyId: resourceFamily } } : undefined,
});

const cases = [
  tc("학생 → 내 가족 자녀", "ALLOW", STUDENT, "children/c1", MYFAM, [userMock(STUDENT, MYFAM)]),
  tc("학생 → 남의 자녀", "DENY", STUDENT, "children/c9", OTHERFAM, [userMock(STUDENT, MYFAM)]),
  tc("학부모 → 내 가족 자녀", "ALLOW", PARENT, "children/c1", MYFAM, [userMock(PARENT, MYFAM, "parent")]),
  tc("학부모 → 남의 자녀", "DENY", PARENT, "children/c9", OTHERFAM, [userMock(PARENT, MYFAM, "parent")]),
  tc("학생 → 내 자녀 리워드(하위)", "ALLOW", STUDENT, "children/c1/stats/summary", null,
     [userMock(STUDENT, MYFAM), childMock("c1", MYFAM)]),
  tc("학생 → 남의 자녀 리워드(하위)", "DENY", STUDENT, "children/c9/stats/summary", null,
     [userMock(STUDENT, MYFAM), childMock("c9", OTHERFAM)]),
  tc("운영자 → 남의 자녀", "ALLOW", ADMIN, "children/c9", OTHERFAM,
     [userMock(ADMIN, null, "admin")], { admin: true }),
];

const body = {
  source: { files: [{ name: "firestore.rules", content: rules }] },
  testSuite: { testCases: cases.map(({ _name, ...c }) => c) },
};

const r = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJ}:test`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "x-goog-user-project": PROJ },
  body: JSON.stringify(body),
});
const j = await r.json();
if (j.error) { console.error("API 오류:", JSON.stringify(j.error).slice(0, 400)); process.exit(1); }
if (j.issues?.length) console.log("규칙 이슈:", JSON.stringify(j.issues).slice(0, 400));

let pass = 0, fail = 0;
(j.testResults ?? []).forEach((res, i) => {
  const ok = res.state === "SUCCESS";
  ok ? pass++ : fail++;
  console.log(`${ok ? "✅" : "❌"} ${cases[i]._name}  (기대 ${cases[i].expectation} · 결과 ${res.state})`);
  if (!ok && res.errorPosition) console.log("     ", JSON.stringify(res.errorPosition));
});
console.log(`\n통과 ${pass} / 실패 ${fail}`);
