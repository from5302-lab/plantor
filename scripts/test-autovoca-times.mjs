// 오토보카 학습 시각 판정 회귀 테스트.
//
// 배경: unit_start/unit_end 는 서로 다른 날짜일 수 있다(유닛이 배정일 기준으로 묶여 온다).
// 예전엔 날짜를 버리고 시:분만 뽑아 써서 "23:47 ~ 20:12" 같은 뒤집힌 시각이 피드에 올라갔다.
//
// 실행: node scripts/test-autovoca-times.mjs   (functions 빌드 후)

import { unitTimes } from "../functions/lib/scraper-autovoca.js";

const D = "2026-08-05";
const utc = (kst) => new Date(`${kst}+09:00`).toISOString();

const cases = [
  ["같은 날 시작·종료",
    utc("2026-08-05T20:18:00"), utc("2026-08-05T20:32:00"), 600, { startAt: "20:18", endAt: "20:32" }],
  ["어제 열어 오늘 끝냄 → 종료만",
    utc("2026-08-04T23:47:00"), utc("2026-08-05T20:12:00"), 540, { startAt: undefined, endAt: "20:12" }],
  ["오늘 시작, 추정 종료가 자정을 넘김 → 시작만",
    utc("2026-08-05T23:50:00"), null, 600, { startAt: "23:50", endAt: undefined }],
  ["종료 없음 → 학습시간으로 추정",
    utc("2026-08-05T20:34:00"), null, 420, { startAt: "20:34", endAt: "20:41" }],
  ["시작·종료 모두 다른 날 → 표시 없음",
    utc("2026-08-03T10:00:00"), utc("2026-08-03T10:20:00"), 1200, { startAt: undefined, endAt: undefined }],
];

let bad = 0;
for (const [name, s, e, dur, want] of cases) {
  const got = unitTimes(s, e, dur, D);
  const ok = got.startAt === want.startAt && got.endAt === want.endAt;
  if (!ok) bad++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
}
console.log(bad ? `\n${bad}건 실패` : `\n${cases.length}/${cases.length} 통과`);
process.exit(bad ? 1 : 0);
