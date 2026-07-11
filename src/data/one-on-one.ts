// `/on` — 1:1 직강 · 프리미엄 클래스 홍보 페이지 데이터.
// ⚠️ 아래 문구/가격/강사 소개는 모두 초안(placeholder)입니다. 실제 내용으로 교체하세요.

/** 1:1 직강 아이덴티티 강조색 (관리자 "1:1수업" 배지와 동일한 보라). */
export const ON_ACCENT = "#5c4edc";

export const ON_HERO = {
  eyebrow: "1:1 DIRECT · 프리미엄 직강",
  // FitText 두 줄
  headline: ["선생님이 직접 가르치는", "1:1 프리미엄 클래스"],
  subhead:
    "혼자 하는 구독형이 아니라, 강사가 직접 진단하고 매 수업 밀착 지도합니다.",
  // TODO: 직강 상담 전용 오픈채팅 URL로 교체
  contactUrl: "https://open.kakao.com/o/gs9aP64h",
  contactLabel: "상담 신청하기",
} as const;

export type PremiumClass = {
  slug: string;
  emoji: string;
  name: string;
  target: string; // 대상 학년
  hook: string; // 한 줄 소개
  bullets: string[];
  accent: string; // 카드 강조색
  priceLabel: string; // 가격 (초안)
};

export const PREMIUM_CLASSES: PremiumClass[] = [
  {
    slug: "vibecoding",
    emoji: "💻",
    name: "바이브코딩",
    target: "초 · 중등",
    hook: "AI로 직접 만들며 배우는 코딩 — 결과물이 남는 수업",
    bullets: [
      "아이디어를 실제 앱·웹으로 완성",
      "1:1 직강으로 막힘없이 진행",
      "AI 도구 활용법까지 함께",
    ],
    accent: "#5c4edc",
    priceLabel: "가격 문의",
  },
  {
    slug: "premium-class5",
    emoji: "🎯",
    name: "프리미엄 클래스5",
    target: "초등",
    hook: "초등 학습의 기초를 1:1로 잡아주는 프리미엄 클래스",
    bullets: [
      "초등 대상 맞춤 커리큘럼",
      "강사가 직접 진도·과제 관리",
      "수업일지로 학습 현황 공유",
    ],
    accent: "#ef7d3b",
    priceLabel: "가격 문의",
  },
  {
    slug: "premium-dailykor",
    emoji: "📘",
    name: "프리미엄 매일국어",
    target: "중등",
    hook: "중등 비문학 독해, 1:1 직강으로 끝까지",
    bullets: [
      "개인 진단 기반 독해 훈련",
      "매주 첨삭 · 피드백",
      "문해력 → 비문학 독해 완성",
    ],
    accent: "#29affc",
    priceLabel: "가격 문의",
  },
  {
    slug: "premium-classcard",
    emoji: "🃏",
    name: "프리미엄 클래스카드",
    target: "중등",
    hook: "중등 어휘 · 암기를 1:1로 관리하는 프리미엄",
    bullets: [
      "개인별 단어 세트 관리",
      "암기 현황 직접 점검",
      "수업일지로 진행 공유",
    ],
    accent: "#38a848",
    priceLabel: "가격 문의",
  },
];

/** 왜 프리미엄 직강인가 — 가치 카드. */
export const ON_WHY = [
  {
    emoji: "👩‍🏫",
    title: "강사가 직접 지도합니다",
    description:
      "혼자 하는 자기주도 구독형이 아니라, 매 수업 강사가 직접 이끌고 점검합니다.",
  },
  {
    emoji: "🎯",
    title: "개인 진단 맞춤 커리큘럼",
    description:
      "아이의 현재 수준을 진단해 그에 맞는 진도와 과제를 설계합니다.",
  },
  {
    emoji: "📝",
    title: "수업일지로 매번 공유",
    description:
      "매 수업이 끝나면 학습 내용과 피드백을 기록해 부모님이 바로 열람할 수 있습니다.",
  },
] as const;

/** 진행 방식 — 4스텝. */
export const ON_STEPS = [
  { n: 1, title: "상담 신청", description: "오픈채팅으로 편하게 문의하세요." },
  { n: 2, title: "수준 진단", description: "아이의 현재 수준을 진단합니다." },
  { n: 3, title: "1:1 수업", description: "진단 결과에 맞춰 밀착 지도합니다." },
  { n: 4, title: "수업일지 피드백", description: "매 수업 기록을 부모님과 공유합니다." },
] as const;

/** 강사 소개 — TODO: 실제 경력·철학으로 교체. */
export const ON_TEACHER = {
  name: "이충선 선생님",
  role: "Plantor 대표 · 직강 강사",
  bio:
    "(강사 소개를 여기에 채워주세요 — 경력, 지도 철학, 아이들과의 수업에서 가장 중요하게 여기는 것 등.)",
} as const;
