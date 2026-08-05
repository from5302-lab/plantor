// 학습 시각 판정 회귀 테스트 (오토보카 · 클래스카드).
//
// 2026-08-05 사고: 시작·종료 시각에서 날짜를 버리고 시:분만 뽑아 써서
// "23:47 ~ 20:12"(오토보카), "21:40 ~ 19:54"(클래스카드) 같은 뒤집힌 시각이 피드에 올라갔다.
// 두 스크래퍼의 시각 판정을 여기서 고정한다.
//
// 실행: npm --prefix functions run build && node scripts/test-study-times.mjs

import { unitTimes } from "../functions/lib/scraper-autovoca.js";
import { unitSpan } from "../functions/lib/scraper-classcard.js";

const D = "2026-08-05";
const utc = (kst) => new Date(`${kst}+09:00`).toISOString();
const results = [];
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  results.push([ok, name, got, want]);
};

// ── 오토보카: unit_start / unit_end 는 서로 다른 날짜일 수 있다 ──
check("[오토보카] 같은 날 시작·종료",
  unitTimes(utc("2026-08-05T20:18:00"), utc("2026-08-05T20:32:00"), 600, D),
  { startAt: "20:18", endAt: "20:32" });
check("[오토보카] 어제 열어 오늘 끝냄 → 종료만",
  unitTimes(utc("2026-08-04T23:47:00"), utc("2026-08-05T20:12:00"), 540, D),
  { startAt: undefined, endAt: "20:12" });
check("[오토보카] 추정 종료가 자정을 넘김 → 시작만",
  unitTimes(utc("2026-08-05T23:50:00"), null, 600, D),
  { startAt: "23:50", endAt: undefined });
check("[오토보카] 종료 없음 → 학습시간으로 추정",
  unitTimes(utc("2026-08-05T20:34:00"), null, 420, D),
  { startAt: "20:34", endAt: "20:41" });
check("[오토보카] 둘 다 다른 날 → 표시 없음",
  unitTimes(utc("2026-08-03T10:00:00"), utc("2026-08-03T10:20:00"), 1200, D),
  { startAt: undefined, endAt: undefined });

// ── 클래스카드: 리포트가 두 값을 뒤집어 주는 경우가 있다 ──
check("[클래스카드] 정상 순서",
  unitSpan("2026-08-05 20:18", "2026-08-05 20:32", D),
  { startAt: "20:18", endAt: "20:32", minutes: 14 });
check("[클래스카드] 뒤집힘 → 이른 쪽이 시작",
  unitSpan("2026-08-05 21:40", "2026-08-05 19:54", D),
  { startAt: "19:54", endAt: "21:40", minutes: 106 });
check("[클래스카드] 한쪽만 그날 → 시작만",
  unitSpan("2026-08-05 21:40", "2026-08-04 19:54", D),
  { startAt: "21:40", minutes: 0 });
check("[클래스카드] 그날 값 없음 → 표시 없음",
  unitSpan("2026-08-03 10:00", "2026-08-03 10:20", D),
  { minutes: 0 });

let bad = 0;
for (const [ok, name, got, want] of results) {
  if (!ok) bad++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`      got=${JSON.stringify(got)}\n      want=${JSON.stringify(want)}`);
}
console.log(bad ? `\n${bad}건 실패` : `\n${results.length}/${results.length} 통과`);
process.exit(bad ? 1 : 0);
