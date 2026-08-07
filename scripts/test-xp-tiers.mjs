// 점수 구간 보너스 · 클래스카드 기준선 · XP 근거 문장 회귀 테스트.
//
// 2026-08-07: 점수에 따른 차등은 있었지만 (a) 화면 어디에도 안 보였고
// (b) 클래스카드만 기준선(60~100)이 실제 분포(P10 81 · 중앙 91 · P90 99)와 어긋나
// 잘한 날과 못한 날 차이가 8% 밖에 안 났다. 여기서 문턱 경계와 문장을 고정한다.
//
// 실행: npm --prefix functions run build && node scripts/test-xp-tiers.mjs

import { createRequire } from "node:module";
createRequire(new URL("../functions/package.json", import.meta.url))("firebase-admin")
  .initializeApp({ projectId: "plantor-from302" });
const { computeXp, xpWhy } = await import("../functions/lib/rewards.js");
const { scoreTier } = await import("../functions/lib/rewards-config.js");

const results = [];
const check = (name, got, want) => {
  results.push([JSON.stringify(got) === JSON.stringify(want), name, got, want]);
};

// ── 문턱 경계값 — 1점 차이로 갈리는 곳만 본다 ────────────────────────────────
check("[문턱] 클래스카드 94점 → 아래 칸", scoreTier("classcard-middle", 94), { min: 90, xp: 10 });
check("[문턱] 클래스카드 95점 → 윗 칸", scoreTier("classcard-middle", 95), { min: 95, xp: 20 });
check("[문턱] 클래스카드 89점 → 없음", scoreTier("classcard-middle", 89), null);
check("[문턱] 매일국어 80점 → 윗 칸", scoreTier("dailykor", 80), { min: 80, xp: 20 });
check("[문턱] 매일국어 79점 → 아래 칸", scoreTier("dailykor", 79), { min: 65, xp: 10 });
check("[문턱] 점수 없는 로그 → 없음", scoreTier("class5", null), null);
check("[문턱] 리워드 대상 아닌 서비스 → 없음", scoreTier("great-books", 100), null);

// ── 클래스카드 기준선 교정 ──────────────────────────────────────────────────
// 유닛 평균 91점(실측 중앙) — 예전 기준(60~100)이면 품질 31점이었다
const cc = (score) => ({ units: [{ type: "문법", unitLabel: "Unit 1", scores: { 실전: score } }] });
const opts = { streak: 0, late: false, date: "2026-08-07" };
const at = (score) => computeXp("classcard-middle", "완료", cc(score), opts);

check("[기준선] 91점 품질 XP (80~99 기준)", at(91).breakdown.quality, 23);
check("[기준선] 81점(P10)은 바닥 근처", at(81).breakdown.quality, 2);
check("[기준선] 99점(P90)이 만점", at(99).breakdown.quality, 40);
check("[기준선] 80점 이하는 전부 0", at(70).breakdown.quality, 0);

// ── 합산: 구간 보너스는 품질과 함께 연속배수·상한을 받는다 ────────────────
const hi = at(96);
check("[합산] 96점 = 기본60 + 품질34 + 구간20", hi.xp, 114);
check("[합산] 구간 내역이 breakdown 에 남는다", [hi.breakdown.tier, hi.breakdown.tierMin], [20, 95]);
const streaked = computeXp("classcard-middle", "완료", cc(96), { ...opts, streak: 7 });
check("[합산] 연속 ×1.2 는 구간 보너스에도 걸린다", streaked.xp, Math.round(114 * 1.2));

// 상한을 뚫지 않는다 — 구간 보너스가 상한 밖에 있으면 250을 넘긴다
const many = { units: Array.from({ length: 40 }, (_, i) => ({ type: "문법", unitLabel: `U${i}`, scores: { 실전: 100 } })) };
check("[합산] 서비스 상한 250 유지",
  computeXp("classcard-middle", "완료", many, { ...opts, streak: 30 }).xp <= 250, true);

// ── 근거 문장 ───────────────────────────────────────────────────────────────
check("[문장] 점수·구간·연속이 순서대로", xpWhy(streaked), "점수 96 → +34 · 95점↑ 보너스 +20 · 연속 ×1.2");
check("[문장] 구간에 못 닿으면 점수만", xpWhy(at(85)), "점수 85 → +11");
check("[문장] 미완료(기본 0)는 문장 없음", xpWhy(computeXp("classcard-middle", "시작전", cc(90), opts)), null);

let failed = 0;
for (const [ok, name, got, want] of results) {
  console.log(`${ok ? "✅" : "❌"} ${name}`);
  if (!ok) { failed++; console.log("   got :", JSON.stringify(got)); console.log("   want:", JSON.stringify(want)); }
}
console.log(`\n${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);
