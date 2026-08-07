// 매일국어 피드 요약 회귀 테스트 (중등 지문 · 초등 회차 · 얼리버드 판정).
//
// 2026-08-07: 중등은 스크래퍼가 독해속도·훈련시간·단계별 경험치를 다 긁어오는데
// 피드에는 '정답률' 하나만 실려 초등(5개)의 1/5 밀도로 보였다. 여기서 표시 범위를 고정한다.
// 픽스처는 learningLogs 실제 문서(2026-08-07)에서 그대로 가져왔다.
//
// 실행: npm --prefix functions run build && node scripts/test-dailykor-summary.mjs

// rewards.js는 config.js를 거쳐 admin 앱을 요구한다 — 계산만 쓰므로 빈 앱만 세운다(네트워크 없음).
// functions 쪽 firebase-admin 인스턴스여야 같은 앱으로 잡힌다.
import { createRequire } from "node:module";
createRequire(new URL("../functions/package.json", import.meta.url))("firebase-admin")
  .initializeApp({ projectId: "plantor-from302" });
const { studySummary, computeXp } = await import("../functions/lib/rewards.js");

const results = [];
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  results.push([ok, name, got, want]);
};

// ── 중등: 지문 1개 (이○민 중2) ──────────────────────────────────────────────
const mh1 = {
  units: [{ unitLabel: "매일국어", completed: true, scores: { 등급: "양호", 점수: 10 } }],
  detail: {
    passages: [{
      passageCode: "A000253", type: "비문학 > 과학", accuracy: "33%",
      readingSpeed: "1265/분", readingChars: 1033, readingElapsed: "49초",
      prepTime: "2분 18초", readingTime: "2분 6초", practiceTime: "56초",
    }],
    xpGot: 10, xpMax: 30, recommendedSpeed: 600,
    stepXp: [{ step: "준비", got: 3, max: 10 }, { step: "독해", got: 2, max: 12 }, { step: "실전", got: 5, max: 8 }],
  },
};
const s1 = studySummary("dailykor", mh1.units, mh1.detail, mh1);
check("[중등] 지문 1개 → 지문줄 + 단계 요약", s1.items, [
  {
    kind: null, label: "비문학 > 과학",
    stats: [
      { name: "정답률", value: "33%" },
      { name: "독해속도", value: "1,265자/분" },   // 판정("너무 빠름")은 /learn 에만
      { name: "학습", value: "5분 20초" },          // 2분18초 + 2분6초 + 56초
    ],
  },
  {
    kind: null, label: "단계별 경험치",
    stats: [{ name: "준비", value: "3/10" }, { name: "독해", value: "2/12" }, { name: "실전", value: "5/8" }],
  },
]);
check("[중등] note는 획득 경험치 그대로", s1.note, "경험치 10/30");

// ── 중등: 지문 2개 → 몇 번째 지문인지 붙는다 (정○원 중2) ────────────────────
const mh2 = {
  units: [{ unitLabel: "매일국어", completed: true, scores: { 등급: "최우수", 점수: 29 } }],
  detail: {
    passages: [
      { passageCode: "A000518", type: "비문학 > 기술", accuracy: "80%", readingSpeed: "1435/분", prepTime: "2분 15초", readingTime: "1분 14초", practiceTime: "3분 28초" },
      // 독해훈련을 건너뛴 지문 — readingTime 없음
      { passageCode: "A000313", type: "문학 > 운문", accuracy: "67%", readingSpeed: "1183/분", prepTime: "25초", practiceTime: "1분 9초" },
    ],
    xpGot: 29, xpMax: 30, recommendedSpeed: 600,
  },
};
const s2 = studySummary("dailykor", mh2.units, mh2.detail, mh2);
check("[중등] 지문 2개 → 1지문·2지문", s2.items.map((i) => i.kind), ["1지문", "2지문"]);
check("[중등] stepXp 없는 과거 로그 → 요약 줄 없음", s2.items.length, 2);
check("[중등] 독해훈련 건너뛴 지문도 시간 합산", s2.items[1].stats.at(-1), { name: "학습", value: "1분 34초" });

// ── 중등: 정답률만 있고 나머지가 없는 아주 오래된 로그 ──────────────────────
const mhOld = { units: [], detail: { passages: [{ type: "비문학 > 사회", accuracy: "50%" }] } };
check("[중등] 구형 로그 → 정답률만",
  studySummary("dailykor", [], mhOld.detail, mhOld).items,
  [{ kind: null, label: "비문학 > 사회", stats: [{ name: "정답률", value: "50%" }] }]);

// ── 초등: 기존 표기가 그대로인지 (임○주 초5) ────────────────────────────────
const el = {
  units: [{ unitLabel: "매일국어", completed: true, scores: { 등급: "완료" } }],
  elementary: [{
    date: "2026-08-07", round: 38, subject: "국어",
    wordStars: null, bookStars: null, testStars: null,
    wordScore: 65, bookScore: 72, testScore: 90, firstPoint: 78, reviewPoint: null,
    startAt: "09:35", endAt: "09:45",
  }],
};
check("[초등] 회차·점수·시각 그대로", studySummary("dailykor", el.units, null, el).items, [{
  kind: "38회차", label: "국어",
  stats: [
    { name: "단어", value: "65점" }, { name: "교과서", value: "72점" },
    { name: "실전", value: "90점" }, { name: "최초", value: "78점" },
    { name: "", value: "오전 9:35 ~ 오전 9:45" },
  ],
}]);

// ── 얼리버드: 매일국어는 units에 startHour가 없다 ────────────────────────────
// 예전에는 units[].startHour만 봐서 매일국어만 하는 학생이 조건에 도달할 수 없었다.
const earlyEl = {
  units: [{ unitLabel: "매일국어", completed: true, scores: { 등급: "완료" } }],
  elementary: [{ subject: "국어", round: 1, firstPoint: 90, startAt: "06:20", endAt: "06:41" }],
  detail: null,
};
const opts = { streak: 0, late: false, date: "2026-08-07", equippedBadges: ["x-early-bird"] };
check("[얼리버드] 초등 06:20 → 장착 효과 +20% 적용",
  computeXp("dailykor", "완료", earlyEl, opts).breakdown.badgePct, 20);
check("[얼리버드] 초등 09:35 → 효과 없음",
  computeXp("dailykor", "완료", el, opts).breakdown.badgePct, 0);
check("[얼리버드] 시각 없는 중등 → 효과 없음",
  computeXp("dailykor", "완료", mh1, opts).breakdown.badgePct, 0);

// ── 출력 ────────────────────────────────────────────────────────────────────
let failed = 0;
for (const [ok, name, got, want] of results) {
  console.log(`${ok ? "✅" : "❌"} ${name}`);
  if (!ok) { failed++; console.log("   got :", JSON.stringify(got)); console.log("   want:", JSON.stringify(want)); }
}
console.log(`\n${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);
