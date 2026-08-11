// 클래스5 카테고리 판정 · 피드 요약 회귀 테스트.
//
// 2026-08-07 사고: movie_type "grammar" 를 판정에서 빠뜨려 **문법 과제가 전부 Movie 로** 잡혔다.
// grammar 파트 자동체크가 세 학생에게 단 한 번도 찍히지 않았고, 학부모 화면엔 ✗ 로 보였다.
// 같은 날, 피드의 클래스5 줄은 시각만 실어 클래스카드 줄(단계별 점수) 옆에서 빈 줄처럼 보였다.
// 픽스처는 class5 reportHomeworkDate 실제 응답(박지유 2026-08-05)에서 가져왔다.
//
// 실행: npm --prefix functions run build && node scripts/test-class5-summary.mjs

import { createRequire } from "node:module";
createRequire(new URL("../functions/package.json", import.meta.url))("firebase-admin")
  .initializeApp({ projectId: "plantor-from302" });
const { studySummary } = await import("../functions/lib/rewards.js");
const { class5DonePartSlugs, class5DonePartCounts } = await import("../functions/lib/scraper-class5.js");

const results = [];
const check = (name, got, want) => {
  results.push([JSON.stringify(got) === JSON.stringify(want), name, got, want]);
};

// 스크래퍼가 만들어 저장하는 실제 units 모양
const units = [
  { type: "Movie", unitLabel: "Peppa Pig 1 / George Catches a Cold", completed: true, cardFirstTry: 100, durationSec: 679, movieType: "movie", startHour: 10, startAt: "10:49", endAt: "11:01" },
  { type: "Grammar", unitLabel: "Unit 04 지시대명사: this, that", completed: true, cardFirstTry: 99, durationSec: 520, movieType: "grammar", startHour: 11, startAt: "11:03", endAt: "11:12" },
];

const out = studySummary("class5", units, null, { units });
check("[피드] 문법 줄에 정답률과 시각이 함께 뜬다", out.items[1], {
  kind: "Grammar",
  label: "Unit 04 지시대명사: this, that",
  stats: [{ name: "정답률", value: "99%" }, { name: "", value: "오전 11:03 ~ 오전 11:12" }],
});
check("[피드] 무비 줄도 같은 규칙", out.items[0].stats, [
  { name: "정답률", value: "100%" }, { name: "", value: "오전 10:49 ~ 오전 11:01" },
]);

// 클래스5 리포트의 단계 항목을 그대로 싣는다(2026-08-10) — 사이트에는 보이는데 카드에는 없었다.
// 정답률은 활동별로 적는다 — 하나로 뭉치면 어느 단계에서 막혔는지가 사라진다.
const withSteps = [{
  type: "Movie", unitLabel: "Bluey / Dad Tries to Teach", completed: true, cardFirstTry: 96,
  steps: [{ n: "암기", p: 100 }, { n: "무비보기" }, { n: "쉐도잉" }, { n: "더빙" }],
  startAt: "15:06", endAt: "15:19",
}];
check("[피드] 활동별 정답률 · 채점 안 하는 활동은 이름만 · 전체 정답률은 뺀다",
  studySummary("class5", withSteps, null, { units: withSteps }).items[0].stats, [
    { name: "암기", value: "100%" },
    { name: "", value: "무비보기" }, { name: "", value: "쉐도잉" }, { name: "", value: "더빙" },
    { name: "", value: "오후 3:06 ~ 오후 3:19" },
  ]);

// 리포트에 10개가 있으면 10개 다 나와야 한다 — 예전 상한 6개 때문에 뒤쪽 점수가 잘렸다
const tenSteps = [{ type: "Reading", unitLabel: "30-word READING 1 / Unit 05", completed: true, cardFirstTry: 83,
  steps: [{n:"암기",p:100},{n:"리콜",p:83},{n:"스펠",p:17},{n:"문장익히기"},{n:"어순배열"},
          {n:"쉐도잉",p:100},{n:"문장만들기",p:67},{n:"본문듣기",p:100},{n:"본문익히기",p:92},{n:"낭독"}] }];
check("[피드] 활동이 10개면 10개 다 싣는다(상한 없음)",
  studySummary("class5", tenSteps, null, { units: tenSteps }).items[0].stats.length, 10);

// 활동별 값이 하나도 없으면(옛 로그는 문자열 배열이다) 전체 정답률을 대신 적는다
const oldSteps = [{ type: "Reading", unitLabel: "Easy Link Starter 3", completed: true, cardFirstTry: 52, steps: ["암기", "본문듣기"] }];
check("[피드] 옛 로그(문자열 steps)는 전체 정답률로 폴백",
  studySummary("class5", oldSteps, null, { units: oldSteps }).items[0].stats, [
    { name: "", value: "암기" }, { name: "", value: "본문듣기" },
    { name: "정답률", value: "52%" },
  ]);

// 문법 게임은 백분율이 아니라 raw 점수 — % 를 붙이면 안 된다
const withGame = [{ type: "Grammar", unitLabel: "Unit 05", completed: true, cardFirstTry: 88, gameScore: 32400 }];
check("[피드] 게임 점수는 점, 천단위 쉼표", studySummary("class5", withGame, null, { units: withGame }).items[0].stats, [
  { name: "정답률", value: "88%" }, { name: "게임", value: "32,400점" },
]);

// 아직 안 끝낸 과제는 상세가 없다 — 제목만 남는다
const notDone = [{ type: "Grammar", unitLabel: "Unit 06", completed: false }];
check("[피드] 미완료 과제는 점수 없이 제목만", studySummary("class5", notDone, null, { units: notDone }).items[0].stats, []);

// ── 파트 자동체크: 문법이 Movie 로 새지 않는지 ──────────────────────────────
check("[체크] 완료 파트가 grammar 로 잡힌다", class5DonePartSlugs(units).sort(), ["grammar", "movie"]);
check("[체크] 파트별 개수", class5DonePartCounts(units), { movie: 1, grammar: 1 });
// 이번 사고의 핵심: 문법만 끝낸 날 movie 가 딸려 들어가면 안 된다
const onlyGrammar = [
  { type: "Movie", unitLabel: "Peppa Pig 1 / Jelly", completed: false },
  { type: "Grammar", unitLabel: "Unit 03", completed: true, cardFirstTry: 94 },
];
check("[체크] 문법만 한 날 → movie 는 안 찍힌다", class5DonePartSlugs(onlyGrammar), ["grammar"]);

let failed = 0;
for (const [ok, name, got, want] of results) {
  console.log(`${ok ? "✅" : "❌"} ${name}`);
  if (!ok) { failed++; console.log("   got :", JSON.stringify(got)); console.log("   want:", JSON.stringify(want)); }
}
console.log(`\n${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);
