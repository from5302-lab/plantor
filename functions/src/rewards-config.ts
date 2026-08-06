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
// 실물 보상 없음 · 전액 자동 지급. 아트는 전부 이모지 + CSS라 이미지 파일이 없다.
// 헤어·의상·모자·소품 슬롯은 폐기 — 캐릭터가 식물이라 입힐 몸이 없다 (catalog.ts 주석 참고).
export type ShopSlot = "base" | "background" | "frame" | "effect" | "nameStyle" | "cardTheme" | "xpBar";

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
  { id: "base-sprout",   slot: "base", name: "새싹이",   cost: 0,    rarity: "common" },
  { id: "base-herb",     slot: "base", name: "풀잎이",   cost: 200,  rarity: "common" },
  { id: "base-shamrock", slot: "base", name: "세잎이",   cost: 200,  rarity: "common" },
  { id: "base-clover",   slot: "base", name: "네잎이",   cost: 250,  rarity: "common" },
  { id: "base-leaf",     slot: "base", name: "바람잎",   cost: 250,  rarity: "common" },
  { id: "base-rice",     slot: "base", name: "벼이삭",   cost: 300,  rarity: "common" },
  { id: "base-acorn",    slot: "base", name: "도토리",   cost: 350,  rarity: "rare" },
  { id: "base-fallen",   slot: "base", name: "낙엽이",   cost: 400,  rarity: "rare" },
  { id: "base-cactus",   slot: "base", name: "선인장이", cost: 450,  rarity: "rare" },
  { id: "base-mushroom", slot: "base", name: "버섯이",   cost: 500,  rarity: "rare" },
  { id: "base-tulip",    slot: "base", name: "튤립이",   cost: 550,  rarity: "rare" },
  { id: "base-daisy",    slot: "base", name: "데이지",   cost: 600,  rarity: "rare" },
  { id: "base-rose",     slot: "base", name: "장미",     cost: 700,  rarity: "rare" },
  { id: "base-pot",      slot: "base", name: "화분이",   cost: 800,  rarity: "rare" },
  { id: "base-sunflower",slot: "base", name: "해바라기", cost: 900,  rarity: "epic" },
  { id: "base-maple",    slot: "base", name: "단풍이",   cost: 950,  rarity: "epic" },
  { id: "base-bamboo",   slot: "base", name: "대나무",   cost: 1000, rarity: "epic" },
  { id: "base-pine",     slot: "base", name: "소나무",   cost: 1050, rarity: "epic" },
  { id: "base-evergreen",slot: "base", name: "침엽수",   cost: 1100, rarity: "epic" },
  { id: "base-hibiscus", slot: "base", name: "히비스커스", cost: 1200, rarity: "epic" },
  { id: "base-palm",     slot: "base", name: "야자수",   cost: 1300, rarity: "epic" },
  { id: "base-lotus",    slot: "base", name: "연꽃",     cost: 1400, rarity: "epic" },
  { id: "base-hyacinth", slot: "base", name: "히아신스", cost: 1450, rarity: "epic" },
  { id: "base-blossom",  slot: "base", name: "벚꽃이",   cost: 1500, rarity: "epic" },
  { id: "base-bouquet",  slot: "base", name: "꽃다발",   cost: 1600, rarity: "epic" },
  { id: "base-tree",     slot: "base", name: "큰나무",   cost: 0,    rarity: "legend", minLevel: 30 },
  // ── 꾸미기 아이템 (전부 CSS · 이미지 0장) ──────────────────────────────────
  // cssClass 가 globals.css 의 클래스와 1:1로 대응한다.
  // holo 계열은 badgeCode 로만 열린다 — 돈으로 살 수 있으면 하루 만에 흔해진다.
  { id: "frame-basic",   slot: "frame", name: "기본 테두리",   cost: 0,    rarity: "common" },
  { id: "frame-dash",    slot: "frame", name: "점선 테두리",   cost: 250,  rarity: "common" },
  { id: "frame-gold",    slot: "frame", name: "황금 테두리",   cost: 400,  rarity: "rare" },
  { id: "frame-double",  slot: "frame", name: "이중 링",      cost: 350,  rarity: "common" },
  { id: "frame-glow",    slot: "frame", name: "발광 테두리",   cost: 700,  rarity: "rare" },
  { id: "frame-sunset",  slot: "frame", name: "노을 테두리",   cost: 900,  rarity: "rare" },
  { id: "frame-rainbow", slot: "frame", name: "회전 무지개",   cost: 1200, rarity: "epic" },
  { id: "frame-holo",    slot: "frame", name: "홀로그램",      cost: 0,    rarity: "legend", badgeCode: "dk-true-reader" },
  
  { id: "name-default",      slot: "nameStyle", name: "기본",        cost: 0,    rarity: "common" },
  { id: "name-teal",         slot: "nameStyle", name: "초록 이름",   cost: 300,  rarity: "common" },
  { id: "name-amber",        slot: "nameStyle", name: "호박 이름",   cost: 300,  rarity: "common" },
  { id: "name-violet",       slot: "nameStyle", name: "보라 이름",   cost: 400,  rarity: "common" },
  { id: "name-rose",         slot: "nameStyle", name: "장미 이름",   cost: 400,  rarity: "common" },
  { id: "name-grad-mint",    slot: "nameStyle", name: "민트 그라데", cost: 700,  rarity: "rare" },
  { id: "name-grad-sunset",  slot: "nameStyle", name: "노을 그라데", cost: 700,  rarity: "rare" },
  { id: "name-flow",         slot: "nameStyle", name: "흐르는 무지개", cost: 1000, rarity: "epic" },
  { id: "name-holo",         slot: "nameStyle", name: "홀로그램 이름", cost: 0,  rarity: "legend", badgeCode: "st-100" },
  
  { id: "effect-none",    slot: "effect", name: "없음",     cost: 0,    rarity: "common" },
  { id: "effect-sparkle", slot: "effect", name: "반짝임",   cost: 700,  rarity: "rare" },
  { id: "effect-aura",    slot: "effect", name: "맥동 오라", cost: 900,  rarity: "rare" },
  { id: "effect-firefly", slot: "effect", name: "반딧불",   cost: 500,  rarity: "common" },
  { id: "effect-petal",   slot: "effect", name: "꽃잎",     cost: 800,  rarity: "rare" },
  { id: "effect-leaf",    slot: "effect", name: "떨어지는 잎", cost: 1100, rarity: "epic" },
  { id: "bg-plain",   slot: "background", name: "기본",      cost: 0,   rarity: "common" },
  { id: "bg-forest",  slot: "background", name: "숲속",      cost: 300, rarity: "common" },
  { id: "bg-stripe",  slot: "background", name: "스트라이프", cost: 300, rarity: "common" },
  { id: "bg-dots",    slot: "background", name: "물방울",    cost: 300, rarity: "common" },
  { id: "bg-sakura",  slot: "background", name: "벚꽃",      cost: 500, rarity: "rare" },
  { id: "bg-space",   slot: "background", name: "우주",      cost: 700, rarity: "rare" },
  { id: "bg-aurora",  slot: "background", name: "오로라",    cost: 900, rarity: "epic" },
  { id: "bg-sprout",  slot: "background", name: "떡잎의 방", cost: 0,   rarity: "rare", minLevel: 10 },
  { id: "bg-bloom",   slot: "background", name: "개화의 방", cost: 0,   rarity: "epic", minLevel: 40 },
  { id: "bg-tree",    slot: "background", name: "큰나무의 방", cost: 0, rarity: "legend", minLevel: 80 },
  // 카드 테마 — 프로필 카드 배경 (아트는 globals.css 의 .ctm-* )
  { id: "theme-plain",  slot: "cardTheme", name: "기본",     cost: 0,    rarity: "common" },
  { id: "theme-paper",  slot: "cardTheme", name: "종이결",   cost: 300,  rarity: "common" },
  { id: "theme-mint",   slot: "cardTheme", name: "민트",     cost: 400,  rarity: "common" },
  { id: "theme-sand",   slot: "cardTheme", name: "모래",     cost: 400,  rarity: "common" },
  { id: "theme-dusk",   slot: "cardTheme", name: "해질녘",   cost: 600,  rarity: "rare" },
  { id: "theme-sakura", slot: "cardTheme", name: "벚꽃",     cost: 800,  rarity: "rare" },
  { id: "theme-forest", slot: "cardTheme", name: "숲",       cost: 1000, rarity: "epic" },
  { id: "theme-aurora", slot: "cardTheme", name: "오로라",   cost: 1400, rarity: "epic" },
  { id: "theme-holo",   slot: "cardTheme", name: "홀로그램 카드", cost: 0, rarity: "legend", badgeCode: "st-30" },
  // 경험치 바 — 채워지는 쪽 색 (.xpb-* )
  { id: "xp-default", slot: "xpBar", name: "기본",   cost: 0,    rarity: "common" },
  { id: "xp-ocean",   slot: "xpBar", name: "바다",   cost: 300,  rarity: "common" },
  { id: "xp-sunset",  slot: "xpBar", name: "노을",   cost: 400,  rarity: "common" },
  { id: "xp-grape",   slot: "xpBar", name: "포도",   cost: 500,  rarity: "rare" },
  { id: "xp-candy",   slot: "xpBar", name: "캔디",   cost: 600,  rarity: "rare" },
  { id: "xp-rainbow", slot: "xpBar", name: "흐르는 무지개", cost: 1000, rarity: "epic" },
  { id: "xp-gold",    slot: "xpBar", name: "황금",   cost: 0,    rarity: "legend", badgeCode: "x-perfect-week" },
];

export const SHOP_BY_ID = new Map(SHOP_ITEMS.map((i) => [i.id, i]));
/** 가입 시 기본 지급되는 무료 아이템. */
export const DEFAULT_ITEMS = SHOP_ITEMS.filter((i) => i.cost === 0 && !i.minLevel && !i.badgeCode).map((i) => i.id);

// ── 뱃지 효과 ─────────────────────────────────────────────────────────────────
// 장착한 뱃지가 실제로 작동하는 부분. 효과는 **그 뱃지를 딴 행동**에 붙는다 —
// 얼리버드를 장착하면 아침에 한 날만 오른다. 상시 증폭이 아니라서 레벨 곡선이 덜 왜곡되고,
// 학생이 자기 생활 패턴에 맞춰 무엇을 낄지 고민하게 된다.
//
// 조건 판정은 전부 computeXp 가 이미 들고 있는 값(시작 시각·요일·품질·학습 시간)으로 한다.
// '하루 두 과목 이상' 같은 조건은 그 시점에 알 수 없어 이번 판에서는 넣지 않았다.

export type BadgeCond = "earlyBird" | "weekend" | "quality80" | "long60";

export type BadgeEffect =
  | { kind: "xpWhen"; cond: BadgeCond; pct: number }
  | { kind: "points"; pct: number }
  | { kind: "shopDiscount"; pct: number }
  | { kind: "lateFactor"; value: number };

/** 뱃지별 지정 효과. 여기 없는 뱃지는 희귀도 기본값을 받는다. */
const BADGE_EFFECT: Record<string, BadgeEffect> = {
  "x-early-bird":   { kind: "xpWhen", cond: "earlyBird", pct: 20 },
  "x-weekend":      { kind: "xpWhen", cond: "weekend",   pct: 20 },
  "dk-true-reader": { kind: "xpWhen", cond: "quality80", pct: 15 },
  "av-grit":        { kind: "xpWhen", cond: "long60",    pct: 15 },
  "cc-long-run":    { kind: "xpWhen", cond: "long60",    pct: 15 },
  "x-catchup":      { kind: "lateFactor", value: 0.85 },
  "x-night-owl":    { kind: "points", pct: 5 },
};

/** 지정 효과가 없으면 희귀도로 정한다. */
const RARITY_EFFECT: Record<Rarity, BadgeEffect> = {
  common: { kind: "points", pct: 5 },
  rare:   { kind: "points", pct: 10 },
  epic:   { kind: "shopDiscount", pct: 10 },
  legend: { kind: "points", pct: 15 },
};

export function effectOf(code: string): BadgeEffect | null {
  const fixed = BADGE_EFFECT[code];
  if (fixed) return fixed;
  const b = BADGE_BY_CODE.get(code);
  return b ? RARITY_EFFECT[b.rarity] : null;
}

/** 장착 슬롯 수 — 레벨로 열린다. 레벨업 보상이 포인트 100 뿐이었다. */
export function badgeSlots(level: number): number {
  return level >= 30 ? 3 : level >= 10 ? 2 : 1;
}

/** 장착 뱃지들을 하나의 효과 묶음으로 (같은 종류는 합산). */
export function bundleEffects(codes: string[]): {
  xpWhen: Partial<Record<BadgeCond, number>>;
  pointPct: number;
  shopDiscountPct: number;
  lateFactor: number | null;
} {
  const out = { xpWhen: {} as Partial<Record<BadgeCond, number>>, pointPct: 0, shopDiscountPct: 0, lateFactor: null as number | null };
  for (const code of codes) {
    const e = effectOf(code);
    if (!e) continue;
    if (e.kind === "xpWhen") out.xpWhen[e.cond] = (out.xpWhen[e.cond] ?? 0) + e.pct;
    else if (e.kind === "points") out.pointPct += e.pct;
    else if (e.kind === "shopDiscount") out.shopDiscountPct += e.pct;
    else if (e.kind === "lateFactor") out.lateFactor = Math.max(out.lateFactor ?? 0, e.value);
  }
  // 폭주 방지 — 슬롯이 늘어도 무한히 쌓이지 않게
  out.pointPct = Math.min(out.pointPct, 30);
  out.shopDiscountPct = Math.min(out.shopDiscountPct, 20);
  return out;
}
