import type { ScoreCategory } from "./test-types";

/* ══════════════════════════════════════════════════════════════════════════
   AI 채점 결과 합산 — 글쓰기 2편에서 6축 전부 평가
   ══════════════════════════════════════════════════════════════════════════ */

export function combineAiScores(
  aiSection1: Partial<Record<ScoreCategory, number>>,
  aiSection2: Partial<Record<ScoreCategory, number>>,
): Record<ScoreCategory, number> {
  return {
    grammar: aiSection1.grammar ?? 0,
    vocabulary: aiSection1.vocabulary ?? 0,
    sentenceComplexity: aiSection1.sentenceComplexity ?? 0,
    organization: aiSection2.organization ?? 0,
    argument: aiSection2.argument ?? 0,
    voiceStyle: aiSection2.voiceStyle ?? 0,
  };
}

export function totalScore(scores: Record<ScoreCategory, number>): number {
  return Object.values(scores).reduce((sum, v) => sum + v, 0);
}
