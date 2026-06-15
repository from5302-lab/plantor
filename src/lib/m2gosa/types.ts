// m2gosa — 영어 지문 구문분석 자료 생성기
// 분석 결과의 구조화 스키마. Gemini가 이 형태로 JSON을 생성하고, 렌더러가 그대로 그린다.

/** 구문 청크의 문법 역할 라벨 (단어/구 아래에 표시) */
export type ChunkRole =
  | "S" // 주어
  | "V" // 동사
  | "O" // 목적어
  | "IO" // 간접목적어
  | "DO" // 직접목적어
  | "C" // 보어
  | "OC" // 목적격보어
  | "M" // 수식어(부사구/전치사구 등)
  | "conj" // 접속사/연결어
  | null;

/** 문장을 의미 단위로 쪼갠 한 조각 */
export interface Chunk {
  /** 영어 텍스트 조각 */
  text: string;
  /** 아래에 붙는 문법 역할 라벨 */
  role?: ChunkRole;
  /** 위에 붙는 한글 뜻풀이 */
  gloss?: string;
  /** 절/구 묶음 표시 (⟨⟩ 느낌의 미묘한 그룹) */
  bracket?: boolean;
  /** 핵심 어휘 강조(색상) */
  highlight?: boolean;
}

/** 어법 선택 CHECK 박스 */
export interface GrammarCheck {
  /** 예: "현재분사 vs. 과거분사" */
  label: string;
  /** 빈칸을 ___ 로 표시한 영어 문장 */
  prompt: string;
  /** [정답후보, 오답후보] 또는 [A/B] 순서 */
  options: [string, string];
  /** 정답 인덱스 (0 또는 1) */
  answer: 0 | 1;
}

export interface Sentence {
  num: number;
  /** 의미 단위로 쪼갠 영어 문장 (역할/뜻 주석 포함) */
  chunks: Chunk[];
  /** 한글 해석 */
  ko: string;
  /** ①②… 구문 해설 */
  notes: string[];
  /** Grammar+ 심화 설명 박스 (선택) */
  grammarPlus?: { title: string; body: string };
  /** 어법 CHECK 박스 (선택) */
  check?: GrammarCheck;
}

/** Flow Check 단계 (도입/전개/마무리/반전 등) */
export interface FlowStage {
  stage: string;
  /** 해당 문장 범위, 예: "1~2" */
  range: string;
  text: string;
}

export interface WordEntry {
  en: string;
  ko: string;
}

/** 한 지문에 대한 전체 분석 */
export interface PassageAnalysis {
  /** 상단 태그, 예: "목적" / "심경" / "주장" */
  topicTag: string;
  /** 학년 표기, 예: "고2" */
  grade: string;
  titleEn: string;
  titleKo: string;
  /** 우상단 요약 박스: 단계별 문구 (화살표로 연결됨) */
  summary: string[];
  /** 내용 한글 요약 (한 단락) */
  content: string;
  /** Flow Check */
  flow: FlowStage[];
  sentences: Sentence[];
  /** WORDS & EXPRESSIONS */
  words: WordEntry[];
  /** 원본 문제 */
  question: {
    stem: string;
    /** 원문 영어 지문 전체 */
    passage: string;
    choices: string[];
    /** 1-based 정답 번호 */
    answer: number;
    /** 정답 해설/해석 (선택) */
    explanation?: string;
  };
  /** 출제 가능 유형 (체크된 것들) */
  questionTypes: string[];
}
