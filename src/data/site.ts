// 사이트 정적 데이터. 추후 Firestore로 옮길 수 있도록 타입을 명확히 둠.

export const SITE = {
  brand: "Plantor",
  tagline: "Plan + Mentor",
  description:
    "학원이 쓰는 검증된 학습 프로그램을, 학원 없이 가정에 직접 연결합니다.",
  kakaoOpenChat: "https://open.kakao.com/o/gs9aP64h",
  email: "from5302@gmail.com",
} as const;

// ──────────────────────────────────────────────
// THiNK — 코어밸류 4개
// ──────────────────────────────────────────────
export type CoreValue = {
  emoji: string;
  key: string;
  title: string;
  description: string;
};

export const CORE_VALUES: CoreValue[] = [
  {
    emoji: "🚀",
    key: "growth",
    title: "학원 한 명의 효과를, 집에서 한 명에게",
    description:
      "1:1 맞춤이 기본. 학원 그룹 수업이 아닌 우리 아이 진도에 맞춘 학습.",
  },
  {
    emoji: "🖥️",
    key: "access",
    title: "학원비 1/10, 시간은 부모 일정대로",
    description:
      "월 1.5만원부터. 등원 시간·교통 시간 없이 집에서 바로 시작합니다.",
  },
  {
    emoji: "📊",
    key: "data",
    title: "공부했는지 보이는 학습",
    description:
      "학습 결과와 진도가 부모에게 매일 보입니다. '했지?' 가 사라집니다.",
  },
  {
    emoji: "🌱",
    key: "evolve",
    title: "엄마들의 피드백으로 큐레이션이 자란다",
    description:
      "Mom& 커뮤니티에서 검증된 도구만 라인업에 올립니다. 부모가 큐레이션의 일부입니다.",
  },
];

// ──────────────────────────────────────────────
// 서비스 라인업
// ──────────────────────────────────────────────
export type Service = {
  slug: string;
  emoji: string;
  name: string;
  hook: string;
  pricePerMonth: number | null; // null = 별도 문의 / 무료
  priceLabel: string;
  targetGrades: string;
  category: "subscription" | "premium" | "community";
  bullets: string[];
  externalUrl?: string;
  highlight?: boolean;
};

export const SERVICES: Service[] = [
  {
    slug: "class5",
    emoji: "🎯",
    name: "초등 클래스5",
    hook: "초등 핵심 5과목, 매일 짧게",
    pricePerMonth: 15000,
    priceLabel: "월 15,000원",
    targetGrades: "미취학 ~ 초등",
    category: "subscription",
    bullets: ["국어·수학·영어·사회·과학", "하루 15분 루틴", "초등 가장 인기"],
    highlight: true,
  },
  {
    slug: "dailykor",
    emoji: "📘",
    name: "매일국어",
    hook: "문해력은 영어쌤도 인정한 솔루션",
    pricePerMonth: 33000,
    priceLabel: "월 33,000원",
    targetGrades: "초등 ~ 중등",
    category: "subscription",
    bullets: ["좋은 글감 매일 1편", "독해 + 어휘 동시", "꾸준히 → 단단해짐"],
    externalUrl: "https://www.dailykor.com/",
  },
  {
    slug: "classcard-middle",
    emoji: "🏆",
    name: "중등 클래스카드 (내신본문암기)",
    hook: "중간·기말 본문 암기를 게임처럼",
    pricePerMonth: 15000,
    priceLabel: "월 15,000원",
    targetGrades: "중1 ~ 중3",
    category: "subscription",
    bullets: ["교과서 본문 자동 변환", "암기·테스트·게임 모드", "내신 직전 폭주 가능"],
  },
  {
    slug: "english-1on1",
    emoji: "💯",
    name: "1:1 온라인 영어과외",
    hook: "수학할 시간을 벌어주는 영어수업",
    pricePerMonth: null,
    priceLabel: "별도 문의",
    targetGrades: "중등 내신반",
    category: "premium",
    bullets: ["빡세지만 효율적인 내신대비", "선생님 직접 매칭", "주 단위 진도 보고"],
  },
  {
    slug: "mom-webinar",
    emoji: "🙋‍♀️",
    name: "[Mom&] 맘이랑 금요웨비나",
    hook: "AI시대 성장을 원하는 맘들의 모임",
    pricePerMonth: 0,
    priceLabel: "무료",
    targetGrades: "학부모",
    category: "community",
    bullets: ["매주 금요일", "아이가 혼자 학습할 수 있는 시대?", "참여만 해도 인사이트"],
  },
];

// ──────────────────────────────────────────────
// 통계 (현재 운영 데이터 기준)
// ──────────────────────────────────────────────
export const STATS = [
  { value: "27", label: "가족과 함께" },
  { value: "5", label: "큐레이션 라인업" },
  { value: "1.5만~", label: "월 시작 가격" },
  { value: "초1~중3", label: "커버 학년" },
];

// ──────────────────────────────────────────────
// FAQ
// ──────────────────────────────────────────────
export type Faq = { q: string; a: string };

export const FAQS: Faq[] = [
  {
    q: "학원이랑 뭐가 달라요?",
    a: "학원이 쓰는 검증된 도구를, 학원을 거치지 않고 가정에 직접 연결합니다. 같은 도구를 학원비의 1/10 가격으로, 우리 아이 일정에 맞춰 사용할 수 있습니다.",
  },
  {
    q: "결제는 어떻게 하나요?",
    a: "현재는 계좌이체로만 진행합니다. 신청 후 카카오톡으로 입금 안내를 드리고, 입금 확인되면 즉시 학습 도구 ID/PW를 발송해 드립니다. 자동결제 모듈은 추후 추가될 예정입니다.",
  },
  {
    q: "환불 되나요?",
    a: "사용 시작 전에는 100% 환불됩니다. 사용 중 환불은 사용 일수를 제외하고 일할 계산됩니다. 자세한 내용은 신청 전 카카오톡으로 문의해 주세요.",
  },
  {
    q: "여러 자녀를 한 계정으로 등록할 수 있나요?",
    a: "네, 가족 단위로 운영됩니다. 자녀별로 학습 도구가 발급되고, 부모님 한 분이 모든 자녀의 학습 현황을 한 화면에서 보실 수 있습니다.",
  },
  {
    q: "금요웨비나는 정말 무료인가요?",
    a: "네, 100% 무료입니다. AI시대 자기주도학습, 우리 아이 미래에 대한 이야기를 매주 금요일에 나눕니다. 카카오 오픈채팅에 들어오시면 안내드립니다.",
  },
];
