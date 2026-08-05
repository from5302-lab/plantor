// 리워드 시스템 설정 — 레벨 곡선 · 칭호 · 뱃지 카탈로그.
// 클라이언트 표시용 사본: src/lib/rewards/catalog.ts (이름·설명·희귀도 동일하게 유지)

export type Rarity = "common" | "rare" | "epic" | "legend";

/** 뱃지 획득 시 지급하는 보너스 포인트 (희귀도별). */
export const RARITY_BONUS: Record<Rarity, number> = {
  common: 50, rare: 150, epic: 400, legend: 1000,
};

// ── 레벨 ──────────────────────────────────────────────────────────────────────
/** 해당 레벨 → 다음 레벨에 필요한 XP. 초반을 얕게 해 2주 안에 Lv10에 닿게 한다. */
export function xpToNext(level: number): number {
  if (level < 10) return 500;
  if (level < 30) return 1500;
  if (level < 60) return 4000;
  return 8000;
}

/** 누적 XP → 레벨(1부터). */
export function levelFromXp(xp: number): number {
  let level = 1;
  let acc = 0;
  while (level < 200) {
    const need = xpToNext(level);
    if (xp < acc + need) return level;
    acc += need;
    level++;
  }
  return level;
}

/** 그 레벨의 시작 누적 XP. */
export function xpAtLevelStart(level: number): number {
  let acc = 0;
  for (let l = 1; l < level; l++) acc += xpToNext(l);
  return acc;
}

const TITLES: Array<{ min: number; name: string }> = [
  { min: 80, name: "큰나무" }, { min: 60, name: "열매" }, { min: 50, name: "개화" },
  { min: 40, name: "꽃봉오리" }, { min: 30, name: "잎새" }, { min: 20, name: "줄기" },
  { min: 10, name: "떡잎" }, { min: 5, name: "새싹" }, { min: 1, name: "씨앗" },
];
export function titleFromLevel(level: number): string {
  return TITLES.find((t) => level >= t.min)?.name ?? "씨앗";
}

// ── XP 산식 상수 ──────────────────────────────────────────────────────────────
export const XP = {
  DONE: 60,             // 완료
  PARTIAL: 20,          // 진행중
  QUALITY_MAX: 40,      // 품질 만점
  VOLUME_UNIT: 15,      // 표준량 초과 1건당
  VOLUME_CAP: 45,       // 분량 보너스 상한
  LATE_FACTOR: 0.7,     // 만회 계수
  SERVICE_CAP: 250,     // 서비스·하루 상한
  DAILY_CAP: 600,       // 학생·하루 상한
  POINT_RATE: 0.2,      // 포인트 = XP × 0.2
  LEVELUP_POINT: 100,   // 레벨업 1회당 포인트
};

/** 연속 학습일 → XP 배수. */
export function streakMultiplier(streak: number): number {
  if (streak >= 30) return 1.5;
  if (streak >= 14) return 1.3;
  if (streak >= 7) return 1.2;
  if (streak >= 3) return 1.1;
  return 1.0;
}

/**
 * 품질 앵커 — 실측 분포(2026-07-29 전 학생 스크래핑) 기준으로
 * "중앙값 학생이 Q 0.5~0.6"이 되도록 잡았다. 근거는 plan-reward-system.md §2.1.
 */
export const QUALITY_ANCHOR = {
  autovocaSpell: { zero: 40, full: 90 },    // 스펠 1회정답률 (실측 중앙 71)
  autovocaTest: { zero: 60, full: 100 },    // 폴백: 테스트 평균
  classcard: { zero: 60, full: 100 },       // 유닛 평균점수 (실측 중앙 91)
  classcardListen: { zero: 50, full: 100 }, // 듣기 테스트 점수
  dailykor: { zero: 20, full: 85 },         // xp 달성률 % (실측 중앙 52)
  class5: { zero: 40, full: 90 },           // 카드 1회정답률 (실측 중앙 70)
};

/** 매일국어: 추천 독해속도의 이 배수를 넘으면 지문을 읽지 않은 것으로 보고 Q를 절반으로. */
export const SPEED_PENALTY_MULTIPLE = 2;
export const SPEED_PENALTY_FACTOR = 0.5;

/** XP·포인트·뱃지 대상 서비스 (자동인증 4종 전용 — 인증샷 서비스는 제외). */
export const REWARD_SLUGS = ["autovoca", "classcard-middle", "dailykor", "class5"];

// ── 뱃지 카탈로그 ─────────────────────────────────────────────────────────────
export type BadgeDef = {
  code: string;
  name: string;
  /** 획득 순간 처음 공개되는 조건 문구. */
  desc: string;
  rarity: Rarity;
  /** true면 미획득 시 뱃지함에 조건이 노출되지 않는다(히든). */
  hidden: boolean;
  service?: "autovoca" | "classcard-middle" | "dailykor" | "class5";
};

export const BADGES: BadgeDef[] = [
  // ── 오토보카 ──
  { code: "av-test-triple", name: "3연속 만점", desc: "테스트에서 100점을 세 번 연속으로 받았어요", rarity: "epic", hidden: true, service: "autovoca" },
  { code: "av-first-hundred", name: "한 방에", desc: "유닛 첫 테스트를 100점으로 통과했어요", rarity: "rare", hidden: true, service: "autovoca" },
  { code: "av-perfect-spell", name: "퍼펙트 스펠", desc: "스펠 학습에서 모든 단어를 한 번에 맞혔어요", rarity: "rare", hidden: true, service: "autovoca" },
  { code: "av-wrong-clear", name: "오답 소탕", desc: "그날의 누적 오답복습을 남김없이 끝냈어요", rarity: "rare", hidden: true, service: "autovoca" },
  { code: "av-point-burst", name: "포인트 폭발", desc: "하루에 오토보카 포인트 80P를 넘겼어요", rarity: "epic", hidden: true, service: "autovoca" },
  { code: "av-speedrun", name: "스피드런", desc: "10분 안에 유닛을 끝내고 테스트도 90점을 넘겼어요", rarity: "rare", hidden: true, service: "autovoca" },
  { code: "av-grit", name: "뚝심", desc: "한 유닛을 60분 넘게 붙잡고 끝냈어요", rarity: "rare", hidden: true, service: "autovoca" },
  { code: "av-book-up", name: "승급", desc: "새로운 권으로 올라가 첫 학습을 마쳤어요", rarity: "common", hidden: true, service: "autovoca" },
  { code: "av-review-master", name: "리뷰 정복", desc: "리뷰 유닛을 평균 95점 이상으로 끝냈어요", rarity: "rare", hidden: true, service: "autovoca" },
  { code: "av-never-give-up", name: "포기 안 함", desc: "네 번 넘게 틀린 단어를 끝내 맞혔어요", rarity: "common", hidden: true, service: "autovoca" },

  // ── 클래스카드 ──
  { code: "cc-all-clear", name: "올클리어", desc: "한 유닛의 모든 단계를 100점으로 통과했어요", rarity: "epic", hidden: true, service: "classcard-middle" },
  { code: "cc-real-master", name: "실전 강자", desc: "실전 문제에서 100점을 받았어요", rarity: "epic", hidden: true, service: "classcard-middle" },
  { code: "cc-essay", name: "서술형 정복", desc: "서술형 문제에서 90점을 넘겼어요", rarity: "rare", hidden: true, service: "classcard-middle" },
  { code: "cc-wrong-clean", name: "오답 청소부", desc: "누적오답 단계를 100점으로 끝냈어요", rarity: "rare", hidden: true, service: "classcard-middle" },
  { code: "cc-concept-triple", name: "개념 마스터", desc: "개념 단계를 세 유닛 연속 100점으로 통과했어요", rarity: "rare", hidden: true, service: "classcard-middle" },
  { code: "cc-long-run", name: "장기전", desc: "60분 넘게 공부해서 평균 90점을 넘겼어요", rarity: "rare", hidden: true, service: "classcard-middle" },
  { code: "cc-listen-retry", name: "다시 도전", desc: "듣기 오답 테스트에서 점수를 끌어올렸어요", rarity: "rare", hidden: true, service: "classcard-middle" },

  // ── 매일국어 ──
  { code: "dk-perfect-day", name: "완벽한 하루", desc: "그날 받을 수 있는 경험치를 전부 받았어요", rarity: "epic", hidden: true, service: "dailykor" },
  { code: "dk-prep-max", name: "준비 만점", desc: "준비 훈련에서 만점 경험치를 받았어요", rarity: "rare", hidden: true, service: "dailykor" },
  { code: "dk-read-max", name: "독해 만점", desc: "독해 훈련에서 만점 경험치를 받았어요", rarity: "epic", hidden: true, service: "dailykor" },
  { code: "dk-real-max", name: "실전 만점", desc: "실전 대비 훈련에서 만점 경험치를 받았어요", rarity: "rare", hidden: true, service: "dailykor" },
  { code: "dk-true-reader", name: "제대로 읽었다", desc: "지문을 제 속도로 읽고 정답률 80%를 넘겼어요", rarity: "legend", hidden: true, service: "dailykor" },
  { code: "dk-two-passages", name: "쌍지문", desc: "하루에 지문 두 개를 모두 끝냈어요", rarity: "common", hidden: true, service: "dailykor" },
  { code: "dk-voca-complete", name: "어휘 완전정복", desc: "어휘력 센터의 한 분류를 전부 끝냈어요", rarity: "rare", hidden: true, service: "dailykor" },
  { code: "dk-voca-perfect", name: "어휘 퍼펙트", desc: "어휘 세트를 100% 정답률로 다섯 개 연속 통과했어요", rarity: "rare", hidden: true, service: "dailykor" },

  // ── 클래스5 ──
  { code: "c5-flawless", name: "무결점", desc: "모든 카드를 한 번에 맞혔어요", rarity: "rare", hidden: true, service: "class5" },
  { code: "c5-all-steps", name: "전 단계 클리어", desc: "과제의 모든 활동을 하나도 빠짐없이 끝냈어요", rarity: "common", hidden: true, service: "class5" },
  { code: "c5-30k", name: "3만 클럽", desc: "문법 게임에서 30,000점을 넘겼어요", rarity: "rare", hidden: true, service: "class5" },
  { code: "c5-record", name: "신기록", desc: "게임에서 자기 최고 점수를 새로 썼어요", rarity: "common", hidden: true, service: "class5" },
  { code: "c5-triple-type", name: "삼종 제패", desc: "하루에 무비·리딩·문법을 모두 끝냈어요", rarity: "epic", hidden: true, service: "class5" },
  { code: "c5-focus", name: "집중 완주", desc: "5분 안에 끝내고 정답률 90%를 넘겼어요", rarity: "rare", hidden: true, service: "class5" },
  { code: "c5-marathon", name: "마라톤", desc: "하루에 30분 넘게 클래스5를 했어요", rarity: "common", hidden: true, service: "class5" },

  // ── 크로스 서비스 (연속 4종만 공개) ──
  { code: "st-3", name: "첫걸음", desc: "3일 연속으로 학습했어요", rarity: "common", hidden: false },
  { code: "st-7", name: "일주일의 힘", desc: "7일 연속으로 학습했어요", rarity: "rare", hidden: false },
  { code: "st-30", name: "한 달 개근", desc: "30일 연속으로 학습했어요", rarity: "epic", hidden: false },
  { code: "st-100", name: "100일의 기적", desc: "100일 연속으로 학습했어요", rarity: "legend", hidden: false },
  { code: "x-all-clear", name: "올클리어", desc: "하루에 듣는 과목을 전부 끝냈어요", rarity: "rare", hidden: true },
  { code: "x-perfect-week", name: "퍼펙트 위크", desc: "일주일 내내 모든 과목을 끝냈어요", rarity: "legend", hidden: true },
  { code: "x-early-bird", name: "얼리버드", desc: "아침 7시 전에 공부를 시작했어요", rarity: "rare", hidden: true },
  { code: "x-night-owl", name: "올빼미", desc: "밤 11시 넘어서까지 공부했어요", rarity: "common", hidden: true },
  { code: "x-weekend", name: "주말 전사", desc: "토요일과 일요일 모두 학습했어요", rarity: "rare", hidden: true },
  { code: "x-catchup", name: "따라잡기", desc: "밀린 과제를 세 개나 만회했어요", rarity: "rare", hidden: true },
  { code: "x-jump", name: "껑충", desc: "지난주보다 정확도가 15%p 넘게 올랐어요", rarity: "rare", hidden: true },
  { code: "x-turnaround", name: "반전", desc: "미흡에서 최우수로 뒤집었어요", rarity: "epic", hidden: true },
  { code: "x-collector-10", name: "수집가", desc: "뱃지를 10개 모았어요", rarity: "rare", hidden: true },
  { code: "x-collector-25", name: "대수집가", desc: "뱃지를 25개 모았어요", rarity: "epic", hidden: true },
];

export const BADGE_BY_CODE = new Map(BADGES.map((b) => [b.code, b]));

// ── 상점 (아바타 꾸미기) ──────────────────────────────────────────────────────
// 실물 보상 없음 · 전액 자동 지급. 아트는 /public/avatar/{slot}/{id}.png 레이어로 합성한다.
export type ShopSlot = "base" | "hair" | "outfit" | "hat" | "prop" | "background" | "frame" | "effect";

export type ShopItem = {
  id: string;
  slot: ShopSlot;
  name: string;
  /** 0이면 기본 지급(구매 불필요). */
  cost: number;
  rarity: Rarity;
  /** 레벨 해금: 이 레벨부터 구매 가능. */
  minLevel?: number;
  /** 뱃지 전용 보상: 이 뱃지를 따야만 얻는다(포인트로 살 수 없음). */
  badgeCode?: string;
};

export const SHOP_ITEMS: ShopItem[] = [
  // 베이스
  { id: "base-sprout", slot: "base", name: "새싹이", cost: 0, rarity: "common" },
  { id: "base-cactus", slot: "base", name: "선인장이", cost: 400, rarity: "rare" },
  { id: "base-mushroom", slot: "base", name: "버섯이", cost: 600, rarity: "rare" },
  // 헤어
  { id: "hair-short", slot: "hair", name: "단발", cost: 0, rarity: "common" },
  { id: "hair-curly", slot: "hair", name: "곱슬", cost: 250, rarity: "common" },
  { id: "hair-long", slot: "hair", name: "장발", cost: 250, rarity: "common" },
  // 의상
  { id: "outfit-tee", slot: "outfit", name: "기본 티셔츠", cost: 0, rarity: "common" },
  { id: "outfit-hoodie", slot: "outfit", name: "후드티", cost: 350, rarity: "common" },
  { id: "outfit-uniform", slot: "outfit", name: "교복", cost: 500, rarity: "rare" },
  { id: "outfit-astronaut", slot: "outfit", name: "우주복", cost: 1200, rarity: "epic" },
  // 모자
  { id: "hat-cap", slot: "hat", name: "야구모자", cost: 200, rarity: "common" },
  { id: "hat-beanie", slot: "hat", name: "비니", cost: 250, rarity: "common" },
  { id: "hat-crown", slot: "hat", name: "왕관", cost: 600, rarity: "rare" },
  // 소품
  { id: "prop-book", slot: "prop", name: "책", cost: 150, rarity: "common" },
  { id: "prop-pencil", slot: "prop", name: "연필", cost: 150, rarity: "common" },
  { id: "prop-cat", slot: "prop", name: "고양이", cost: 500, rarity: "rare" },
  { id: "prop-trophy", slot: "prop", name: "게임 트로피", cost: 0, rarity: "rare", badgeCode: "c5-30k" },
  // 배경
  { id: "bg-plain", slot: "background", name: "기본", cost: 0, rarity: "common" },
  { id: "bg-forest", slot: "background", name: "숲속", cost: 300, rarity: "common" },
  { id: "bg-space", slot: "background", name: "우주", cost: 700, rarity: "rare" },
  { id: "bg-sprout", slot: "background", name: "떡잎의 방", cost: 0, rarity: "rare", minLevel: 10 },
  { id: "bg-bloom", slot: "background", name: "개화의 방", cost: 0, rarity: "epic", minLevel: 40 },
  { id: "bg-tree", slot: "background", name: "큰나무의 방", cost: 0, rarity: "legend", minLevel: 80 },
  // 프레임
  { id: "frame-basic", slot: "frame", name: "기본 테두리", cost: 0, rarity: "common" },
  { id: "frame-gold", slot: "frame", name: "황금 테두리", cost: 400, rarity: "rare" },
  { id: "frame-reader", slot: "frame", name: "독서가의 테두리", cost: 0, rarity: "legend", badgeCode: "dk-true-reader" },
  // 이펙트
  { id: "effect-sparkle", slot: "effect", name: "반짝임", cost: 700, rarity: "rare" },
  { id: "effect-aurora", slot: "effect", name: "오로라", cost: 1400, rarity: "epic" },
];

export const SHOP_BY_ID = new Map(SHOP_ITEMS.map((i) => [i.id, i]));
/** 가입 시 기본 지급되는 무료 아이템. */
export const DEFAULT_ITEMS = SHOP_ITEMS.filter((i) => i.cost === 0 && !i.minLevel && !i.badgeCode).map((i) => i.id);
