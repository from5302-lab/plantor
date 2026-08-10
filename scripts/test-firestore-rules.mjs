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

/**
 * 목록 조회(list) 케이스 — **resource 를 주지 않는다.**
 *
 * 실제 list 는 문서 내용을 읽지 못하고, 규칙이 쿼리 제약만으로 증명돼야 통과한다.
 * 여기에 resource 를 넣으면 통과한다고 잘못 나온다(2026-08-05 장애 때 그렇게 오진했다).
 * 그래서 "문서를 모를 때 막히는가"만 확인한다 — 안전한 방향의 검증이다.
 *
 * 경로는 컬렉션이 아니라 **문서 패턴**(children/c1)을 준다.
 * 컬렉션 경로를 주면 match /children/{childId} 에 걸리지 않고 맨 아래 catch-all 로 떨어져
 * 엉뚱한 이유로 DENY 가 나온다.
 */
const listTc = (name, expectation, uid, path, mocks, token = {}) => ({
  _name: name,
  expectation,
  request: {
    auth: { uid, token: { email: `${uid}@plantor.app`, ...token } },
    path: DOC(path),
    method: "list",
    time: new Date().toISOString(),
  },
  functionMocks: mocks,
});

/**
 * familyMail 케이스 — 규칙이 문서의 parentUid·childUid 를 uid 와 직접 비교한다.
 * 여기서 확인할 것은 "형제가 남의 편지를 못 읽는가" 다. children 하위에 뒀다면 읽혔다.
 */
const mailTc = (name, expectation, uid, data, method = "get") => ({
  _name: name,
  expectation,
  request: {
    auth: { uid, token: { email: `${uid}@plantor.app` } },
    path: DOC("familyMail/m1"),
    method,
    time: new Date().toISOString(),
  },
  resource: { data },
});

const MAIL = { parentUid: PARENT, childUid: STUDENT, familyId: MYFAM, childId: "c1" };
const SIBLING = "uid_sibling";

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

  // ── 목록 조회 ────────────────────────────────────────────────────────────
  // 좁히지 않은 children 목록 조회는 일반 사용자에게 막혀야 한다.
  // (클라이언트는 반드시 where("familyId","==",내 familyId) 로 좁힌다)
  listTc("학생 → children 목록(안 좁힘)", "DENY", STUDENT, "children/c1",
     [userMock(STUDENT, MYFAM)]),
  listTc("학부모 → children 목록(안 좁힘)", "DENY", PARENT, "children/c1",
     [userMock(PARENT, MYFAM, "parent")]),
  listTc("운영자 → children 목록", "ALLOW", ADMIN, "children/c1",
     [userMock(ADMIN, null, "admin")], { admin: true }),

  // ── 가족 편지함 ──────────────────────────────────────────────────────────
  mailTc("부모 → 내가 보낸 편지", "ALLOW", PARENT, MAIL),
  mailTc("받는 자녀 → 나에게 온 편지", "ALLOW", STUDENT, MAIL),
  mailTc("형제 → 남의 편지", "DENY", SIBLING, MAIL),
  mailTc("자녀 → 편지 직접 쓰기", "DENY", STUDENT, MAIL, "create"),
  mailTc("부모 → 편지 직접 고치기", "DENY", PARENT, MAIL, "update"),
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
