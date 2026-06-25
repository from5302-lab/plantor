/* ── Writing Level Test Types ──────────────────────────────────────────── */

/** 서술형 문제 */
export interface WritingPromptQ {
  id: string;
  instruction: string;
  prompt: string;
  minWords: number;
  timeLimitSec: number;
}

/** 섹션 구분 (글쓰기 2편만) */
export type SectionType = "short" | "essay";

/** 6축 채점 카테고리 */
export type ScoreCategory =
  | "grammar"
  | "vocabulary"
  | "sentenceComplexity"
  | "organization"
  | "argument"
  | "voiceStyle";

export const SCORE_LABELS: Record<ScoreCategory, string> = {
  grammar: "Grammar & Mechanics",
  vocabulary: "Vocabulary Range",
  sentenceComplexity: "Sentence Complexity",
  organization: "Organization",
  argument: "Argument & Evidence",
  voiceStyle: "Voice & Style",
};

/** 레벨 정의 */
export interface LevelDef {
  level: number;
  name: string;
  label: string;
  minScore: number;
  maxScore: number;
  description: string;
}

export const LEVELS: LevelDef[] = [
  { level: 1, name: "Emerging", label: "Level 1", minScore: 0, maxScore: 20, description: "문장 단위 기초부터 시작해요" },
  { level: 2, name: "Developing", label: "Level 2", minScore: 21, maxScore: 35, description: "문단 구성 훈련이 필요해요" },
  { level: 3, name: "Expanding", label: "Level 3", minScore: 36, maxScore: 45, description: "에세이 구조를 잡아가는 단계예요" },
  { level: 4, name: "Bridging", label: "Level 4", minScore: 46, maxScore: 55, description: "문체와 논증을 다듬을 차례예요" },
  { level: 5, name: "Commanding", label: "Level 5", minScore: 56, maxScore: 60, description: "AP/SAT 에세이에 도전할 수 있어요" },
];

export function getLevel(totalScore: number): LevelDef {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (totalScore >= LEVELS[i].minScore) return LEVELS[i];
  }
  return LEVELS[0];
}

/** AI 채점 결과 */
export interface AiGradingResult {
  scores: Partial<Record<ScoreCategory, number>>;
  feedback: Partial<Record<ScoreCategory, string>>;
  errorPatterns: string[];
  strengths: string[];
  overallComment: string;
}

/** 전체 테스트 결과 */
export interface TestResult {
  completedAt: string;
  totalScore: number;
  level: number;
  levelName: string;
  scores: Record<ScoreCategory, number>;
  feedback: Record<string, string>;
  errorPatterns: string[];
  strengths: string[];
  overallComment: string;
  sections: {
    short: { response: string; aiResult: AiGradingResult };
    essay: { response: string; aiResult: AiGradingResult };
  };
}

/** 사용자 응답 (진행 중) */
export interface TestAnswers {
  shortResponse: string;
  essayResponse: string;
}

export const INITIAL_ANSWERS: TestAnswers = {
  shortResponse: "",
  essayResponse: "",
};
