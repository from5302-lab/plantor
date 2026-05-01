// 앱 공통 타입 정의

// ── 신청(Signup) ──────────────────────────────────────────────────────────────

export type SignupStatus = "pending" | "accountPending" | "confirmed";

export type SignupChild = {
  name: string;
  grade: string;
  loginId: string;
  selectedServices: string[];
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
};

// ── 가족 / 자녀 / 구독 ────────────────────────────────────────────────────────

export type Child = {
  id: string;
  name: string;
  grade: string;
  loginId: string;
};

export type Subscription = {
  id: string;
  familyId?: string;
  childId: string;
  serviceSlug: string;
  monthlyPrice: number;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  discount?: number;
  agencyFee?: number;
};

// ── 학습 로그 ─────────────────────────────────────────────────────────────────

export type AutoStatus = "시작전" | "진행중" | "완료";

export type LearningLog = {
  id: string;
  serviceSlug: string;
  date: string;
  flagged?: boolean;
  method?: "self" | "auto";
  autoStatus?: AutoStatus;
};

export type WeeklyLog = {
  childId: string;
  date: string;
};

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
  title: string;
  scheduleDays: number[];        // 0=월 ~ 6=일
  externalUrl: string | null;
  order: number;
  active: boolean;
  createdBy: "student" | "admin";
  status: TaskStatus;
  adminComment: string | null;
  createdAt: Date | null;
  confirmedAt: Date | null;
};
