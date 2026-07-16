// 앱 공통 타입 정의

// ── 신청(Signup) ──────────────────────────────────────────────────────────────

export type SignupStatus = "pending" | "accountPending" | "confirmed";

export type SignupChild = {
  name: string;
  grade: string;
  loginId: string;
  selectedServices: string[];
  serviceMonths?: Record<string, number>;
};

export type Signup = {
  id: string;
  parentName: string;
  phone: string;
  children: SignupChild[];
  estimatedMonthly: number;
  couponCode: string | null;
  couponDiscount: number;
  finalMonthly: number;
  status: SignupStatus;
  createdAt: Date | null;
  convertedFamilyId: string | null;
  userId: string | null;
  parentId?: string | null;
  referralCode?: string | null;
  referrerId?: string | null;
  referralDiscount?: number;
  parentServices?: string[];
  parentServiceMonths?: Record<string, number>;
  depositTotal?: number;
};

// ── 가족 / 자녀 / 구독 ────────────────────────────────────────────────────────

export type Child = {
  id: string;
  name: string;
  grade: string;
  loginId: string;
  studentPhone?: string;   // 학생 연락처 (학부모 입력, 미완료 알림용)
};

/** 1:1 학습 구독의 serviceSlug 접두사 — "1on1-<과목>" (과목·금액은 어드민 수동 입력) */
export const ONE_ON_ONE_PREFIX = "1on1-";

export type Subscription = {
  id: string;
  familyId?: string;
  /** 자녀 ID. null이면 학부모 본인 서비스 (great-books 등). */
  childId: string | null;
  serviceSlug: string;
  /** 1:1 학습 등 SERVICES 라인업에 없는 구독의 표시 이름 (예: "1:1 국어") */
  customName?: string;
  monthlyPrice: number;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  discount?: number;
  agencyFee?: number;
};

// ── 학습 로그 ─────────────────────────────────────────────────────────────────

export type AutoStatus = "시작전" | "진행중" | "완료";

// 자동인증 스크래핑 상세 (오토보카/클래스카드) — 값은 원본 보존 위해 number|string 허용
export type AutoUnit = {
  type?: string;            // "문법" | "듣기" | "본문" 등 (클래스카드)
  unitLabel?: string;       // "4권 유닛 9", "감각동사+형용사"
  studyMinutes?: number;
  dateRangeRaw?: string;    // 듣기 등 자정 넘김 케이스 원본
  avgScore?: number | null; // 클래스카드 문법 평균
  testScore?: number | null;
  wrongReviewCount?: number | null;
  points?: number | null;
  completed?: boolean;
  scores?: Record<string, number | string>;
};

// 매일국어 "오늘의 학습" 지문 1개 상세 (지문코드·유형·정답률 등)
export type DailykorPassage = {
  passageCode?: string;
  type?: string;
  accuracy?: string;
  readingSpeed?: string;
  readingChars?: number;    // 지문 글자 수 (독해속도 산출 근거)
  readingElapsed?: string;  // 실제 읽은 시간 "18초"
  prepTime?: string;
  readingTime?: string;
  practiceTime?: string;
};

// 매일국어 "오늘의 학습" 일별 상세 — 하루에 여러 지문 학습 시 지문별로 배열
export type DailykorDetail = {
  passages?: DailykorPassage[];  // 오늘 학습한 지문들 (열 단위)
  xp?: string;                   // 오늘 총 획득/최대 경험치
  recommendedSpeed?: number;     // 리포트 각주의 추천 분당 독해속도 (매일국어 기준)
  // ── 레거시(단일 지문) 호환: 과거 로그의 평면 필드 ──
  passageCode?: string;
  type?: string;
  accuracy?: string;
  readingSpeed?: string;
  prepTime?: string;
  readingTime?: string;
  practiceTime?: string;
};

// 어휘력 센터 완료 세트 (누적) — { category:"문학", sets:["08","09"] }
export type DailykorVocaItem = { category: string; sets: string[] };

export type AutoScrapedData = {
  source?: string;
  units?: AutoUnit[];
  totalStudyMinutes?: number;
  detail?: DailykorDetail | null;
  voca?: DailykorVocaItem[] | null;
};

export type LearningLog = {
  id: string;
  serviceSlug: string;
  date: string;
  flagged?: boolean;
  method?: "self" | "auto";
  autoStatus?: AutoStatus;
  scrapedData?: AutoScrapedData | null;
};

// 주간 학습 로그 (가족 단위 조회) — 자동인증 결과 카드 표시를 위해 LearningLog 전체 필드 포함
export type WeeklyLog = LearningLog & { childId: string };

// ── Admin 전용 ────────────────────────────────────────────────────────────────

export type MemberFamily = {
  id: string;
  parentName: string;
  phone: string;
  signupId: string;
  userId: string | null;
  createdAt: Date | null;
  parentPlantorId?: string;
  momId?: string;
  couponCode?: string | null;
  couponDiscount?: number;
  isTest?: boolean;
  aiPackageEndDate?: string; // YYYY-MM-DD
};

export type MemberChild = {
  id: string;
  familyId: string;
  name: string;
  grade: string;
  loginId: string;
  classcardLoginId?: string;
  autovocaLoginId?: string;
  studentPhone?: string;   // 가족 학생 연락처 (미완료 알림용)
  createdAt: Date | null;
};

export type Referral = {
  id: string;
  referrerId: string;
  referrerName: string;
  referralCode: string;
  refereeSignupId: string;
  refereeName: string;
  refereeFamilyId: string | null;
  referralDiscount: number;
  rewardAmount: number;
  status: "pending" | "rewarded";
  createdAt: Date | null;
  rewardedAt: Date | null;
};

export type RenewalRequest = {
  id: string;
  familyId: string;
  childId: string | null;
  subscriptionId: string | null;
  childName: string;
  serviceName: string;
  serviceSlug: string;
  months: number;
  amount: number;
  couponCode: string | null;
  couponNote: string | null;
  couponDiscount: number;
  referralCode: string | null;
  referralDiscount: number;
  walletCouponIds: string[];
  walletDiscount: number;
  finalAmount: number;
  currentEndDate: Date | null;
  isParentService?: boolean;
  isNewChild?: boolean;
  newChildGrade?: string;
  newChildLoginId?: string;
  status: string;
  createdAt: Date | null;
};

export type WalletCoupon = {
  id: string;
  discountPercent: number;
  note: string;
  used: boolean;
  createdAt: Date | null;
};

// ── 학생 프로필 (문진표) ──────────────────────────────────────────────────────

export type StudyLevel = "상" | "중" | "하";

export type StudentProfile = {
  childId: string;
  goals: string[];              // ["국어강화", "영어어휘", "독해력"]
  level: StudyLevel;
  availableDays: number[];      // 0=월 ~ 6=일
  dailyMinutes: number;         // 30 | 60 | 90 | 120
  notes: string;
  schedule?: DaySchedule[];     // 요일별 학습 시간 (0=월 ~ 6=일)
  updatedAt: Date | null;
};

// ── 직강 수업 ─────────────────────────────────────────────────────────────────

export type DirectClassStudent = {
  name: string;
  grade?: string;
  serviceSlugs?: string[];   // 학생별 이용 서비스
  studentPhone: string;
  studentLoginId: string;
  studentClasscardId?: string;  // 외부 클래스카드 아이디 (자동인증용)
  studentAutovocaId?: string;   // 외부 오토보카 아이디 (자동인증용)
  parentPhone: string;
  parentLoginId: string;
};

export type DaySchedule = { day: number; time: string; serviceSlug?: string };

export type DirectClass = {
  id: string;
  name: string;
  parentName?: string;       // 입금자 확인용 엄마 이름
  serviceSlugs: string[];    // 다중 서비스 선택
  agencyFee: number;         // 선택 서비스 가맹비 합계
  grades: string[];
  schedule: DaySchedule[];   // 요일별 시각
  tuition: number;
  students: DirectClassStudent[];
  notes: string;
  status: "active" | "inactive";
  serviceExpiry?: Record<string, string | null>;  // slug → "YYYY-MM-DD"
  expiry?: string | null;                          // 수업 만료일 (단일)
  createdAt: Date | null;
};

// ── 학습 계획 과제 ─────────────────────────────────────────────────────────────

export type TaskStatus = "draft" | "confirmed";

export type Task = {
  id: string;
  childId: string;
  serviceSlug: string;
  partSlug: string | null;       // 서비스 내 세부 파트 (null이면 서비스 전체)
  title: string;
  scheduleDays: number[];        // 0=월 ~ 6=일
  externalUrl: string | null;
  progressLabel: string | null;  // 오토보카용 "3권 12유닛" 등
  level: number | null;          // 클래스5 레벨 (Lv.1~7)
  setName: string | null;        // 클래스5 세트명 (교재)
  deleteRequested: boolean;      // 학생 삭제 요청
  order: number;
  active: boolean;
  createdBy: "student" | "admin";
  status: TaskStatus;
  adminComment: string | null;
  createdAt: Date | null;
  confirmedAt: Date | null;
};

// ── 과제 검사 결과 (co-work 에이전트 + 학생 사유) ─────────────────────────────

export type TaskCheckStatus = "done" | "not_done" | "made_up" | "error";

export type TaskCheck = {
  id: string;
  taskId: string;
  childId: string;
  date: string;                  // YYYY-MM-DD
  status: TaskCheckStatus;       // made_up = 제 날짜엔 못 했지만 나중에 만회 완료
  detail: string | null;         // 에이전트가 남기는 메모
  reason: string | null;         // 6Hdl slug (미완료 시 학생 선택)
  reasonNote: string | null;     // 추가 메모 (선택)
  checkedBy: "agent" | "student" | "admin";
  checkedAt: Date | null;
  makeupDate?: string | null;    // 학생이 정한 만회 예정일 (6hdl 직후 선택)
  madeUpAt?: Date | null;        // 만회 완료 시각
};

// ── 6Hdl self-assessment ──────────────────────────────────────────────────────

export type Reason6Hdl = {
  slug: string;
  name: string;
  icon: string;
};

export const REASONS_6HDL: Reason6Hdl[] = [
  { slug: "goal", name: "목표의식", icon: "🎯" },
  { slug: "desire", name: "욕구통제", icon: "🎮" },
  { slug: "time", name: "시간관리", icon: "⏰" },
  { slug: "health", name: "건강관리", icon: "💪" },
  { slug: "environment", name: "학습환경", icon: "🏠" },
  { slug: "relation", name: "인간관계", icon: "👥" },
];
