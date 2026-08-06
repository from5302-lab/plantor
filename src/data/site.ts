// 사이트 정적 데이터. 추후 Firestore로 옮길 수 있도록 타입을 명확히 둠.

export const SITE = {
  brand: "Plantor",
  tagline: "Plan + Mentor",
  description:
    "학원이 쓰는 검증된 학습 프로그램을, 학원 없이 가정에 직접 연결합니다.",
  email: "from5302@gmail.com",
  // ⚠️ 입금 안내 메시지에 자동으로 들어가는 계좌 정보입니다.
  // 운영자(본인)만 보고 편집하세요. 사이트 페이지에는 노출되지 않습니다.
  bank: {
    name: "카카오뱅크",
    account: "3333-36-9725919",
    holder: "이충선",
  },
} as const;

// 운영자(어드민) 이메일 — Firestore 보안 규칙과 동일해야 함
export const ADMIN_EMAIL = "from5302@gmail.com";

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
    emoji: "🤖",
    key: "growth",
    title: "직접 입력하실 게 없습니다",
    description:
      "아이가 학습사이트에서 공부하면 무엇을 몇 시에 얼마나 했는지, 점수와 정답률까지 플랜토가 자동으로 가져옵니다. 확인 도장도, 인증샷도 필요 없어요.",
  },
  {
    emoji: "🖥️",
    key: "access",
    title: "등원시간 0분, 모든 곳이 교실",
    description:
      "별도의 이동 없이 집에서 편하게, 원하는 시간에 학습할 수 있습니다.",
  },
  {
    emoji: "📊",
    key: "data",
    title: "학습 현황을 한눈에 확인하세요",
    description:
      "자녀가 오늘 학습했는지, 이번 주 몇 일 공부했는지 부모님 화면에 자동으로 기록됩니다. 매일 물어보지 않아도 아이의 학습 흐름을 파악하실 수 있어요.",
  },
  {
    emoji: "🌿",
    key: "evolve",
    title: "재구독률 93% — 한번 쓰면 계속 씁니다",
    description:
      "직접 자녀와 써본 학부모들이 다시 선택한 프로그램만 엄선했어요. 93%가 다음 달도 결제합니다.",
  },
];

// ──────────────────────────────────────────────
// 서비스 라인업
// ──────────────────────────────────────────────
export type ServicePart = {
  slug: string;
  name: string;
  category?: string;  // 상위 카테고리 (파닉스, 무비, 리딩, 라이팅 등)
};

export type Service = {
  slug: string;
  emoji: string;
  iconUrl?: string;
  name: string;
  hook: string;
  pricePerMonth: number | null; // null = 별도 문의 / 무료
  priceLabel: string;
  targetGrades: string;
  category: "subscription" | "premium" | "community";
  bullets: string[];
  externalUrl?: string;
  highlight?: boolean;
  brandColor?: string;
  agencyFee?: number;  // 가맹비 (원/월)
  isOneOnOne?: boolean;  // 1:1 수업 — 라인업 서비스지만 1:1로 집계·표시 (slug "1on1-"과 동일 취급)
  status?: "active" | "coming_soon";  // 없으면 slug 기반 자동 판별
  signupType?: "new" | "renewal" | "both";  // status=active 일 때
  order?: number;  // 노출 순서 (낮을수록 앞)
  signupUrl?: string;  // 신청 버튼 커스텀 링크 (없으면 /signup)
  studentUrl?: string; // 학생 접속 링크
  parentUrl?: string;  // 학부모 접속 링크
  parts?: ServicePart[];          // 서비스 내 학습 파트
  progressLabel?: boolean;        // true면 파트 대신 진도 라벨 (n권 n유닛) 사용
};

export const SERVICES: Service[] = [
  {
    slug: "dailykor",
    emoji: "📘",
    iconUrl: "/service-icons/dailykor.png",
    name: "매일국어",
    hook: "제대로 읽을 수 있어야 공부를 잘한다.",
    pricePerMonth: 33000,
    priceLabel: "₩33,000/월",
    targetGrades: "초1 ~ 중등",
    category: "subscription",
    bullets: [
      "문해력 · 독해력 · 구조분석 훈련",
      "개인별 맞춤 진단 · 자기주도학습",
      "초등 교과서 문해력 → 중등 비문학 독해",
    ],
    externalUrl: "https://www.dailykor.com/",
    brandColor: "#29affc",
    agencyFee: 22000,
    // 학부모 전용 페이지 없음(/academy는 교사 로그인) — 학부모도 학생 페이지(/front)로 접속
    studentUrl: "https://www.dailykor.com/front",
    parts: [
      { slug: "daily", name: "오늘의 학습" },
      { slug: "vocab-center", name: "어휘력 센터" },
    ],
  },
  {
    slug: "autovoca",
    emoji: "📝",
    iconUrl: "/service-icons/autovoca.png",
    name: "오토보카",
    hook: "의미연상 표현으로 단어를 자동암기",
    pricePerMonth: 5000,
    priceLabel: "₩5,000/월",
    targetGrades: "중등 ~ 고등",
    category: "subscription",
    bullets: [
      "원어민 음성 + 품사별 예문학습",
      "단기기억에서 장기기억으로 전환되는 자동오답복습",
      "온라인학습과 쓰기교재 병행",
    ],
    externalUrl: "https://www.autovoca.co.kr/",
    brandColor: "#417cd8",
    agencyFee: 0,
    studentUrl: "https://www.autovoca.co.kr/",
    parts: [
      { slug: "vol-1", name: "[1권] 240단어" },
      { slug: "vol-2", name: "[2권] 240단어" },
      { slug: "vol-3", name: "[3권] 480단어" },
      { slug: "vol-4", name: "[4권] 480단어" },
      { slug: "vol-5", name: "[5권] 480단어" },
      { slug: "vol-6", name: "[6권] 480단어" },
      { slug: "vol-7", name: "[7권] 480단어" },
      { slug: "vol-8", name: "[8권] 480단어" },
      { slug: "vol-9", name: "[9권] 750단어" },
      { slug: "vol-10", name: "[10권] 750단어 (준비중)" },
      { slug: "vol-11", name: "[11권] 750단어 (준비중)" },
      { slug: "vol-12", name: "[12권] 750단어 (준비중)" },
    ],
  },
  {
    slug: "class5",
    emoji: "🎯",
    iconUrl: "/service-icons/class5.png",
    name: "클래스5",
    hook: "아이가 즐거운 아웃풋 영어",
    pricePerMonth: 15000,
    priceLabel: "₩15,000/월",
    targetGrades: "미취학 ~ 초등",
    category: "subscription",
    bullets: [
      "Phonics · Reading · Movie · Writing · Grammar",
      "낭독, 더빙, 쓰기 교재에서 보이는 눈에 띄는 학습효과",
      "1,884 리딩 유닛 · 1,500개 영상 · AI 자동평가",
    ],
    externalUrl: "https://www.class5.co.kr/",
    highlight: true,
    brandColor: "#ebb22b",
    agencyFee: 6000,
    studentUrl: "https://play.class5.co.kr/",
    parentUrl: "https://www.class5.co.kr/login",
    parts: [
      { slug: "phonics", name: "Phonics" },
      { slug: "song", name: "Song" },
      { slug: "movie", name: "Movie" },
      { slug: "reading", name: "Reading" },
      { slug: "writing", name: "Writing" },
      { slug: "grammar", name: "Grammar" },
    ],
  },
  {
    slug: "classcard-middle",
    emoji: "🏆",
    iconUrl: "/service-icons/classcard.png",
    name: "클래스카드",
    hook: "내신대비 어휘, 문법, 듣기, 독해 완벽 마스터.",
    pricePerMonth: 15000,
    priceLabel: "₩15,000/월",
    targetGrades: "중1 ~ 중3",
    category: "subscription",
    bullets: [
      "영어쌤 1/3 선택 · 출판사 공식 26,000개 자료",
      "모의고사·수능 10년치 자료제공",
      "AI 오답분석 · 주관식 자동채점",
    ],
    externalUrl: "https://www.classcard.net/",
    brandColor: "#7fd132",
    agencyFee: 4000,
    studentUrl: "https://www.classcard.net/",
    parts: [
      { slug: "listening", name: "듣기훈련" },
      { slug: "grammar", name: "문법훈련" },
      { slug: "exam-prep", name: "내신대비" },
      { slug: "vocab", name: "어휘암기" },
    ],
  },
  {
    slug: "vibe-coding",
    emoji: "💻",
    iconUrl: "/service-icons/vibe-coding.svg",
    name: "바이브코딩 수업",
    hook: "첫 수업에 바로 웹서비스 하나 완성.",
    pricePerMonth: 150000,
    priceLabel: "₩150,000/월",
    targetGrades: "초등 ~ 중3",
    category: "premium",
    isOneOnOne: true,
    bullets: [
      "주 1회 수업 — 이론 + 실습 + 퀴즈 구성",
      "AI 협업 → UI 설계 → Firebase → 배포 전 과정 커버",
      "수업 결과물: 실제 배포된 사이트 + 수료증 발급",
    ],
    externalUrl: "https://coken-vibe.web.app/",
    brandColor: "#7f8b99",
    studentUrl: "https://coken-vibe.web.app/",
  },
  {
    slug: "great-books",
    emoji: "📖",
    iconUrl: "/service-icons/great-books.png",
    name: "고전독서모임",
    hook: "고전 한 권으로 가족 대화를 여는 월간 독서 클럽",
    pricePerMonth: 11000,
    priceLabel: "₩11,000/월",
    targetGrades: "학부모",
    category: "community",
    bullets: [
      "매주 화요일 10pm Zoom 모임",
      "월 1권 고전 읽기 · 주간 질문카드 · 대화미션",
      "완독보다 대화를 위한 독서",
    ],
    externalUrl: "https://greatbooksclub.web.app/",
    agencyFee: 0,
  },
  {
    slug: "coming-soon-math-science",
    emoji: "🔭",
    name: "수학 · 과학 프로그램",
    hook: "곧 만나요! 검증된 수학·과학 프로그램을 준비 중입니다.",
    pricePerMonth: null,
    priceLabel: "준비 중",
    targetGrades: "초등 ~ 중등",
    category: "subscription" as const,
    externalUrl: "https://www.mathflat.com/",
    bullets: [
      "개념 이해 → 실전 문제 풀이 연계 커리큘럼",
      "AI 오답 분석 · 취약 유형 집중 훈련",
      "관심 등록 시 오픈 즉시 우선 안내",
    ],
  },
];

// ──────────────────────────────────────────────
// 통계 (현재 운영 데이터 기준)
// ──────────────────────────────────────────────
export const STATS = [
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
    q: "학원 프로그램과 어떤 차이가 있나요?",
    a: "학원에서 실제로 사용하는 검증된 프로그램을, 학원 등록 없이 가정에서 직접 이용하실 수 있어요. 콘텐츠는 동일하고, 학원비 부담만 없어집니다.",
  },
  {
    q: "결제는 어떻게 진행되나요?",
    a: "신청 완료 후 카카오톡으로 계좌 정보를 안내해 드려요. 입금이 확인되면 학습 계정 정보(ID/PW)를 바로 전달드립니다. 신규·연장 모두 신청 후 24시간 이내에 입금이 확인되지 않으면 신청이 취소될 수 있습니다.",
  },
  {
    q: "환불 정책이 어떻게 되나요?",
    a: "학습 시작 전이라면 전액 환불해 드립니다. 학습 시작 후 2주 이내라면 남은 기간만큼 일할 계산으로 환불해 드려요. 다만 2주 이상 학습이 진행된 경우에는 환불이 어렵습니다. 궁금한 점은 카카오 오픈채팅으로 편하게 문의해 주세요.",
  },
  {
    q: "자녀가 둘인데 따로 신청해야 하나요?",
    a: "한 번에 함께 신청하시면 됩니다. 자녀별로 학습 계정이 따로 발급되고, 부모님은 하나의 화면에서 모든 자녀의 학습 현황을 확인하실 수 있어요.",
  },
  {
    q: "아이가 실제로 학습하고 있는지 확인할 수 있나요?",
    a: "네. 각 학습 프로그램의 진도와 성적을 플랜토가 자동으로 가져와 부모님 화면에 정리해 드려요. 무엇을 몇 시부터 몇 시까지 했는지, 점수와 정답률은 어땠는지까지 남습니다. 아이 화면에서는 같은 기록이 경험치·레벨·뱃지로 바뀌어 다음 학습의 동력이 됩니다.",
  },
  {
    q: "PC, 태블릿, 스마트폰 모두 사용 가능한가요?",
    a: "네, 모든 기기에서 이용하실 수 있습니다. 이동 중에도 스마트폰 하나로 충분히 학습할 수 있어요.",
  },
];

/**
 * 1:1 수업 여부 판정.
 * - "1on1-<과목>" 슬러그 (어드민에서 추가한 1:1 학습)
 * - 라인업 서비스지만 실제로는 1:1인 것 (isOneOnOne 플래그, 예: 바이브코딩)
 * 신청 폼으로 들어와도 자동으로 1:1로 분류되도록 슬러그 변경 대신 플래그로 판정한다.
 */
export function isOneOnOneService(slug: string): boolean {
  if (!slug) return false;
  if (slug.startsWith("1on1-")) return true;
  return SERVICES.some((s) => s.slug === slug && s.isOneOnOne === true);
}
