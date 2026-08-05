// 리워드 표시용 카탈로그 — 서버(functions/src/rewards-config.ts)의 클라이언트 사본.
// 판정은 전부 서버가 하고, 여기서는 '이름·설명·희귀도·아트'만 쓴다.
// 뱃지 코드/희귀도가 바뀌면 양쪽을 같이 고쳐야 한다.

export type Rarity = "common" | "rare" | "epic" | "legend";

export const RARITY: Record<Rarity, { label: string; fg: string; bg: string; ring: string }> = {
  common: { label: "일반", fg: "#5b6470", bg: "#f1f3f5", ring: "#d7dbe0" },
  rare: { label: "희귀", fg: "#1a6fd4", bg: "#eaf3ff", ring: "#9dc6f5" },
  epic: { label: "영웅", fg: "#7c3aed", bg: "#f4edff", ring: "#c9b0f7" },
  legend: { label: "전설", fg: "#b45309", bg: "#fff6e5", ring: "#f0c274" },
};

export type BadgeDef = {
  code: string;
  name: string;
  desc: string;
  rarity: Rarity;
  hidden: boolean;
  emoji: string;
  service?: string;
};

export const BADGES: BadgeDef[] = [
  // 오토보카
  { code: "av-test-triple", name: "3연속 만점", desc: "테스트에서 100점을 세 번 연속으로 받았어요", rarity: "epic", hidden: true, emoji: "🎯", service: "autovoca" },
  { code: "av-first-hundred", name: "한 방에", desc: "유닛 첫 테스트를 100점으로 통과했어요", rarity: "rare", hidden: true, emoji: "💯", service: "autovoca" },
  { code: "av-perfect-spell", name: "퍼펙트 스펠", desc: "스펠 학습에서 모든 단어를 한 번에 맞혔어요", rarity: "rare", hidden: true, emoji: "✍️", service: "autovoca" },
  { code: "av-wrong-clear", name: "오답 소탕", desc: "그날의 누적 오답복습을 남김없이 끝냈어요", rarity: "rare", hidden: true, emoji: "🧹", service: "autovoca" },
  { code: "av-point-burst", name: "포인트 폭발", desc: "하루에 오토보카 포인트 80P를 넘겼어요", rarity: "epic", hidden: true, emoji: "💥", service: "autovoca" },
  { code: "av-speedrun", name: "스피드런", desc: "10분 안에 유닛을 끝내고 테스트도 90점을 넘겼어요", rarity: "rare", hidden: true, emoji: "⚡", service: "autovoca" },
  { code: "av-grit", name: "뚝심", desc: "한 유닛을 60분 넘게 붙잡고 끝냈어요", rarity: "rare", hidden: true, emoji: "🪨", service: "autovoca" },
  { code: "av-book-up", name: "승급", desc: "새로운 권으로 올라가 첫 학습을 마쳤어요", rarity: "common", hidden: true, emoji: "📚", service: "autovoca" },
  { code: "av-review-master", name: "리뷰 정복", desc: "리뷰 유닛을 평균 95점 이상으로 끝냈어요", rarity: "rare", hidden: true, emoji: "🔁", service: "autovoca" },
  { code: "av-never-give-up", name: "포기 안 함", desc: "네 번 넘게 틀린 단어를 끝내 맞혔어요", rarity: "common", hidden: true, emoji: "🔥", service: "autovoca" },
  // 클래스카드
  { code: "cc-all-clear", name: "올클리어", desc: "한 유닛의 모든 단계를 100점으로 통과했어요", rarity: "epic", hidden: true, emoji: "🏅", service: "classcard-middle" },
  { code: "cc-real-master", name: "실전 강자", desc: "실전 문제에서 100점을 받았어요", rarity: "epic", hidden: true, emoji: "⚔️", service: "classcard-middle" },
  { code: "cc-essay", name: "서술형 정복", desc: "서술형 문제에서 90점을 넘겼어요", rarity: "rare", hidden: true, emoji: "📝", service: "classcard-middle" },
  { code: "cc-wrong-clean", name: "오답 청소부", desc: "누적오답 단계를 100점으로 끝냈어요", rarity: "rare", hidden: true, emoji: "🧽", service: "classcard-middle" },
  { code: "cc-concept-triple", name: "개념 마스터", desc: "개념 단계를 세 유닛 연속 100점으로 통과했어요", rarity: "rare", hidden: true, emoji: "🧠", service: "classcard-middle" },
  { code: "cc-long-run", name: "장기전", desc: "60분 넘게 공부해서 평균 90점을 넘겼어요", rarity: "rare", hidden: true, emoji: "⏳", service: "classcard-middle" },
  { code: "cc-listen-retry", name: "다시 도전", desc: "듣기 오답 테스트에서 점수를 끌어올렸어요", rarity: "rare", hidden: true, emoji: "🎧", service: "classcard-middle" },
  // 매일국어
  { code: "dk-perfect-day", name: "완벽한 하루", desc: "그날 받을 수 있는 경험치를 전부 받았어요", rarity: "epic", hidden: true, emoji: "🌟", service: "dailykor" },
  { code: "dk-prep-max", name: "준비 만점", desc: "준비 훈련에서 만점 경험치를 받았어요", rarity: "rare", hidden: true, emoji: "🧩", service: "dailykor" },
  { code: "dk-read-max", name: "독해 만점", desc: "독해 훈련에서 만점 경험치를 받았어요", rarity: "epic", hidden: true, emoji: "📖", service: "dailykor" },
  { code: "dk-real-max", name: "실전 만점", desc: "실전 대비 훈련에서 만점 경험치를 받았어요", rarity: "rare", hidden: true, emoji: "🎓", service: "dailykor" },
  { code: "dk-true-reader", name: "제대로 읽었다", desc: "지문을 제 속도로 읽고 정답률 80%를 넘겼어요", rarity: "legend", hidden: true, emoji: "🦉", service: "dailykor" },
  { code: "dk-two-passages", name: "쌍지문", desc: "하루에 지문 두 개를 모두 끝냈어요", rarity: "common", hidden: true, emoji: "📄", service: "dailykor" },
  { code: "dk-voca-complete", name: "어휘 완전정복", desc: "어휘력 센터의 한 분류를 전부 끝냈어요", rarity: "rare", hidden: true, emoji: "🗂️", service: "dailykor" },
  { code: "dk-voca-perfect", name: "어휘 퍼펙트", desc: "어휘 세트를 100% 정답률로 다섯 개 연속 통과했어요", rarity: "rare", hidden: true, emoji: "🔤", service: "dailykor" },
  // 클래스5
  { code: "c5-flawless", name: "무결점", desc: "모든 카드를 한 번에 맞혔어요", rarity: "rare", hidden: true, emoji: "💎", service: "class5" },
  { code: "c5-all-steps", name: "전 단계 클리어", desc: "과제의 모든 활동을 하나도 빠짐없이 끝냈어요", rarity: "common", hidden: true, emoji: "✅", service: "class5" },
  { code: "c5-30k", name: "3만 클럽", desc: "문법 게임에서 30,000점을 넘겼어요", rarity: "rare", hidden: true, emoji: "🕹️", service: "class5" },
  { code: "c5-record", name: "신기록", desc: "게임에서 자기 최고 점수를 새로 썼어요", rarity: "common", hidden: true, emoji: "📈", service: "class5" },
  { code: "c5-triple-type", name: "삼종 제패", desc: "하루에 무비·리딩·문법을 모두 끝냈어요", rarity: "epic", hidden: true, emoji: "🎬", service: "class5" },
  { code: "c5-focus", name: "집중 완주", desc: "5분 안에 끝내고 정답률 90%를 넘겼어요", rarity: "rare", hidden: true, emoji: "🎯", service: "class5" },
  { code: "c5-marathon", name: "마라톤", desc: "하루에 30분 넘게 클래스5를 했어요", rarity: "common", hidden: true, emoji: "🏃", service: "class5" },
  // 크로스
  { code: "st-3", name: "첫걸음", desc: "3일 연속으로 학습했어요", rarity: "common", hidden: false, emoji: "👟" },
  { code: "st-7", name: "일주일의 힘", desc: "7일 연속으로 학습했어요", rarity: "rare", hidden: false, emoji: "🗓️" },
  { code: "st-30", name: "한 달 개근", desc: "30일 연속으로 학습했어요", rarity: "epic", hidden: false, emoji: "🏆" },
  { code: "st-100", name: "100일의 기적", desc: "100일 연속으로 학습했어요", rarity: "legend", hidden: false, emoji: "👑" },
  { code: "x-all-clear", name: "올클리어", desc: "하루에 듣는 과목을 전부 끝냈어요", rarity: "rare", hidden: true, emoji: "🌈" },
  { code: "x-perfect-week", name: "퍼펙트 위크", desc: "일주일 내내 모든 과목을 끝냈어요", rarity: "legend", hidden: true, emoji: "🌠" },
  { code: "x-early-bird", name: "얼리버드", desc: "아침 7시 전에 공부를 시작했어요", rarity: "rare", hidden: true, emoji: "🐦" },
  { code: "x-night-owl", name: "올빼미", desc: "밤 11시 넘어서까지 공부했어요", rarity: "common", hidden: true, emoji: "🌙" },
  { code: "x-weekend", name: "주말 전사", desc: "토요일과 일요일 모두 학습했어요", rarity: "rare", hidden: true, emoji: "🛡️" },
  { code: "x-catchup", name: "따라잡기", desc: "밀린 과제를 세 개나 만회했어요", rarity: "rare", hidden: true, emoji: "🏇" },
  { code: "x-jump", name: "껑충", desc: "지난주보다 정확도가 15%p 넘게 올랐어요", rarity: "rare", hidden: true, emoji: "🦘" },
  { code: "x-turnaround", name: "반전", desc: "미흡에서 최우수로 뒤집었어요", rarity: "epic", hidden: true, emoji: "🔄" },
  { code: "x-collector-10", name: "수집가", desc: "뱃지를 10개 모았어요", rarity: "rare", hidden: true, emoji: "🎒" },
  { code: "x-collector-25", name: "대수집가", desc: "뱃지를 25개 모았어요", rarity: "epic", hidden: true, emoji: "🧳" },
];

export const BADGE_BY_CODE = new Map(BADGES.map((b) => [b.code, b]));
export const TOTAL_BADGES = BADGES.length;

// ── 레벨 ──────────────────────────────────────────────────────────────────────
export function xpToNext(level: number): number {
  if (level < 10) return 500;
  if (level < 30) return 1500;
  if (level < 60) return 4000;
  return 8000;
}
export function levelFromXp(xp: number): number {
  let level = 1, acc = 0;
  while (level < 200) {
    const need = xpToNext(level);
    if (xp < acc + need) return level;
    acc += need; level++;
  }
  return level;
}
export function xpAtLevelStart(level: number): number {
  let acc = 0;
  for (let l = 1; l < level; l++) acc += xpToNext(l);
  return acc;
}
const TITLES: Array<{ min: number; name: string; emoji: string }> = [
  { min: 80, name: "큰나무", emoji: "🌳" }, { min: 60, name: "열매", emoji: "🍎" },
  { min: 50, name: "개화", emoji: "🌸" }, { min: 40, name: "꽃봉오리", emoji: "🌷" },
  { min: 30, name: "잎새", emoji: "🍃" }, { min: 20, name: "줄기", emoji: "🌿" },
  { min: 10, name: "떡잎", emoji: "☘️" }, { min: 5, name: "새싹", emoji: "🌱" },
  { min: 1, name: "씨앗", emoji: "🌰" },
];
export function titleOf(level: number) {
  return TITLES.find((t) => level >= t.min) ?? TITLES[TITLES.length - 1];
}

// ── 상점 ──────────────────────────────────────────────────────────────────────
export type ShopSlot = "base" | "hair" | "outfit" | "hat" | "prop" | "background" | "frame" | "effect";

export const SLOT_LABEL: Record<ShopSlot, string> = {
  base: "캐릭터", hair: "헤어", outfit: "의상", hat: "모자",
  prop: "소품", background: "배경", frame: "테두리", effect: "이펙트",
};

export type ShopItem = {
  id: string; slot: ShopSlot; name: string; cost: number; rarity: Rarity;
  minLevel?: number; badgeCode?: string; emoji: string;
};

export const SHOP_ITEMS: ShopItem[] = [
  { id: "base-sprout", slot: "base", name: "새싹이", cost: 0, rarity: "common", emoji: "🌱" },
  { id: "base-cactus", slot: "base", name: "선인장이", cost: 400, rarity: "rare", emoji: "🌵" },
  { id: "base-mushroom", slot: "base", name: "버섯이", cost: 600, rarity: "rare", emoji: "🍄" },
  { id: "hair-short", slot: "hair", name: "단발", cost: 0, rarity: "common", emoji: "💇" },
  { id: "hair-curly", slot: "hair", name: "곱슬", cost: 250, rarity: "common", emoji: "🦱" },
  { id: "hair-long", slot: "hair", name: "장발", cost: 250, rarity: "common", emoji: "🦰" },
  { id: "outfit-tee", slot: "outfit", name: "기본 티셔츠", cost: 0, rarity: "common", emoji: "👕" },
  { id: "outfit-hoodie", slot: "outfit", name: "후드티", cost: 350, rarity: "common", emoji: "🧥" },
  { id: "outfit-uniform", slot: "outfit", name: "교복", cost: 500, rarity: "rare", emoji: "🎽" },
  { id: "outfit-astronaut", slot: "outfit", name: "우주복", cost: 1200, rarity: "epic", emoji: "👨‍🚀" },
  { id: "hat-cap", slot: "hat", name: "야구모자", cost: 200, rarity: "common", emoji: "🧢" },
  { id: "hat-beanie", slot: "hat", name: "비니", cost: 250, rarity: "common", emoji: "🎩" },
  { id: "hat-crown", slot: "hat", name: "왕관", cost: 600, rarity: "rare", emoji: "👑" },
  { id: "prop-book", slot: "prop", name: "책", cost: 150, rarity: "common", emoji: "📕" },
  { id: "prop-pencil", slot: "prop", name: "연필", cost: 150, rarity: "common", emoji: "✏️" },
  { id: "prop-cat", slot: "prop", name: "고양이", cost: 500, rarity: "rare", emoji: "🐱" },
  { id: "prop-trophy", slot: "prop", name: "게임 트로피", cost: 0, rarity: "rare", badgeCode: "c5-30k", emoji: "🏆" },
  { id: "bg-plain", slot: "background", name: "기본", cost: 0, rarity: "common", emoji: "⬜" },
  { id: "bg-forest", slot: "background", name: "숲속", cost: 300, rarity: "common", emoji: "🌲" },
  { id: "bg-space", slot: "background", name: "우주", cost: 700, rarity: "rare", emoji: "🌌" },
  { id: "bg-sprout", slot: "background", name: "떡잎의 방", cost: 0, rarity: "rare", minLevel: 10, emoji: "☘️" },
  { id: "bg-bloom", slot: "background", name: "개화의 방", cost: 0, rarity: "epic", minLevel: 40, emoji: "🌸" },
  { id: "bg-tree", slot: "background", name: "큰나무의 방", cost: 0, rarity: "legend", minLevel: 80, emoji: "🌳" },
  { id: "frame-basic", slot: "frame", name: "기본 테두리", cost: 0, rarity: "common", emoji: "⭕" },
  { id: "frame-gold", slot: "frame", name: "황금 테두리", cost: 400, rarity: "rare", emoji: "🟡" },
  { id: "frame-reader", slot: "frame", name: "독서가의 테두리", cost: 0, rarity: "legend", badgeCode: "dk-true-reader", emoji: "🦉" },
  { id: "effect-sparkle", slot: "effect", name: "반짝임", cost: 700, rarity: "rare", emoji: "✨" },
  { id: "effect-aurora", slot: "effect", name: "오로라", cost: 1400, rarity: "epic", emoji: "🌈" },
];

export const SHOP_BY_ID = new Map(SHOP_ITEMS.map((i) => [i.id, i]));
export const DEFAULT_ITEMS = SHOP_ITEMS.filter((i) => i.cost === 0 && !i.minLevel && !i.badgeCode).map((i) => i.id);

/** 배경색 — 아바타 아트가 붙기 전까지 배경 슬롯을 색으로 표현한다. */
export const BG_COLORS: Record<string, string> = {
  "bg-plain": "#f3f4f6", "bg-forest": "#dcfce7", "bg-space": "#1e1b4b",
  "bg-sprout": "#e6f7e9", "bg-bloom": "#fde8f3", "bg-tree": "#e7f0e2",
};
