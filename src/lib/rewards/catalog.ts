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
// 칭호는 이름만 쓴다.
// 식물 이모지는 전부 캐릭터(base 슬롯) 몫 — 칭호에도 🌱을 달면 "산 캐릭터"와 "레벨"이 뒤섞여
// 피드에서 같은 그림이 두 가지 뜻으로 읽힌다. 단계 색으로 위계를 준다.
const TITLES: Array<{ min: number; name: string; color: string }> = [
  { min: 80, name: "큰나무", color: "#166534" }, { min: 60, name: "열매", color: "#b45309" },
  { min: 50, name: "개화", color: "#be185d" }, { min: 40, name: "꽃봉오리", color: "#c2410c" },
  { min: 30, name: "잎새", color: "#15803d" }, { min: 20, name: "줄기", color: "#2f7a4e" },
  { min: 10, name: "떡잎", color: "#4d7c0f" }, { min: 5, name: "새싹", color: "#65a30d" },
  { min: 1, name: "씨앗", color: "#78716c" },
];
export function titleOf(level: number) {
  return TITLES.find((t) => level >= t.min) ?? TITLES[TITLES.length - 1];
}

// ── 상점 ──────────────────────────────────────────────────────────────────────
/**
 * 꾸미기 슬롯.
 *
 * 헤어·의상·모자·소품은 폐기했다 — 캐릭터가 식물이라 입힐 머리도 몸도 없고,
 * 무관한 이모지를 원 귀퉁이에 붙여봐야 "꾸몄다"가 성립하지 않는다.
 * 남는 건 정체성(식물 캐릭터)과 CSS 치장(테두리·이름·배경·이펙트)뿐이고, 그걸로 충분하다.
 */
export type ShopSlot = "base" | "background" | "frame" | "effect" | "nameStyle" | "cardTheme" | "xpBar";

export const SLOT_LABEL: Record<ShopSlot, string> = {
  base: "캐릭터", background: "배경",
  frame: "테두리", effect: "이펙트", nameStyle: "이름",
  cardTheme: "카드", xpBar: "경험치 바",
};

export type ShopItem = {
  id: string; slot: ShopSlot; name: string; cost: number; rarity: Rarity;
  minLevel?: number; badgeCode?: string; emoji: string;
  /** globals.css 의 꾸미기 클래스 (frame/effect/nameStyle). 없으면 기본. */
  cssClass?: string;
};

export const SHOP_ITEMS: ShopItem[] = [
  // 캐릭터 — 플랜토의 정체성. 유니코드 식물 이모지를 통째로 끌어왔다.
  // 여기가 최우선 사용처라, 레벨 칭호는 식물 이모지를 양보하고 이름만 쓴다(TITLES 주석 참고).
  { id: "base-sprout",   slot: "base", name: "새싹이",   cost: 0,    rarity: "common", emoji: "🌱" },
  { id: "base-herb",     slot: "base", name: "풀잎이",   cost: 200,  rarity: "common", emoji: "🌿" },
  { id: "base-shamrock", slot: "base", name: "세잎이",   cost: 200,  rarity: "common", emoji: "☘️" },
  { id: "base-clover",   slot: "base", name: "네잎이",   cost: 250,  rarity: "common", emoji: "🍀" },
  { id: "base-leaf",     slot: "base", name: "바람잎",   cost: 250,  rarity: "common", emoji: "🍃" },
  { id: "base-rice",     slot: "base", name: "벼이삭",   cost: 300,  rarity: "common", emoji: "🌾" },
  { id: "base-acorn",    slot: "base", name: "도토리",   cost: 350,  rarity: "rare",   emoji: "🌰" },
  { id: "base-fallen",   slot: "base", name: "낙엽이",   cost: 400,  rarity: "rare",   emoji: "🍂" },
  { id: "base-cactus",   slot: "base", name: "선인장이", cost: 450,  rarity: "rare",   emoji: "🌵" },
  { id: "base-mushroom", slot: "base", name: "버섯이",   cost: 500,  rarity: "rare",   emoji: "🍄" },
  { id: "base-tulip",    slot: "base", name: "튤립이",   cost: 550,  rarity: "rare",   emoji: "🌷" },
  { id: "base-daisy",    slot: "base", name: "데이지",   cost: 600,  rarity: "rare",   emoji: "🌼" },
  { id: "base-rose",     slot: "base", name: "장미",     cost: 700,  rarity: "rare",   emoji: "🌹" },
  { id: "base-pot",      slot: "base", name: "화분이",   cost: 800,  rarity: "rare",   emoji: "🪴" },
  { id: "base-sunflower",slot: "base", name: "해바라기", cost: 900,  rarity: "epic",   emoji: "🌻" },
  { id: "base-maple",    slot: "base", name: "단풍이",   cost: 950,  rarity: "epic",   emoji: "🍁" },
  { id: "base-bamboo",   slot: "base", name: "대나무",   cost: 1000, rarity: "epic",   emoji: "🎋" },
  { id: "base-pine",     slot: "base", name: "소나무",   cost: 1050, rarity: "epic",   emoji: "🎍" },
  { id: "base-evergreen",slot: "base", name: "침엽수",   cost: 1100, rarity: "epic",   emoji: "🌲" },
  { id: "base-hibiscus", slot: "base", name: "히비스커스", cost: 1200, rarity: "epic", emoji: "🌺" },
  { id: "base-palm",     slot: "base", name: "야자수",   cost: 1300, rarity: "epic",   emoji: "🌴" },
  { id: "base-lotus",    slot: "base", name: "연꽃",     cost: 1400, rarity: "epic",   emoji: "🪷" },
  { id: "base-hyacinth", slot: "base", name: "히아신스", cost: 1450, rarity: "epic",   emoji: "🪻" },
  { id: "base-blossom",  slot: "base", name: "벚꽃이",   cost: 1500, rarity: "epic",   emoji: "🌸" },
  { id: "base-bouquet",  slot: "base", name: "꽃다발",   cost: 1600, rarity: "epic",   emoji: "💐" },
  // 큰나무는 사는 게 아니라 자라서 되는 것 — 레벨로만 열린다
  { id: "base-tree",     slot: "base", name: "큰나무",   cost: 0,    rarity: "legend", minLevel: 30, emoji: "🌳" },
  // ── 꾸미기 아이템 (전부 CSS · 이미지 0장) ──────────────────────────────────
  // cssClass 가 globals.css 의 클래스와 1:1로 대응한다.
  // holo 계열은 badgeCode 로만 열린다 — 돈으로 살 수 있으면 하루 만에 흔해진다.
  { id: "frame-basic",   slot: "frame", name: "기본 테두리",   cost: 0,    rarity: "common", emoji: "⭕", cssClass: "" },
  { id: "frame-dash",    slot: "frame", name: "점선 테두리",   cost: 250,  rarity: "common", emoji: "⭕", cssClass: "frm-dash" },
  { id: "frame-gold",    slot: "frame", name: "황금 테두리",   cost: 400,  rarity: "rare",   emoji: "🟡", cssClass: "frm-gold" },
  { id: "frame-double",  slot: "frame", name: "이중 링",      cost: 350,  rarity: "common", emoji: "⭕", cssClass: "frm-double" },
  { id: "frame-glow",    slot: "frame", name: "발광 테두리",   cost: 700,  rarity: "rare",   emoji: "💡", cssClass: "frm-glow" },
  { id: "frame-sunset",  slot: "frame", name: "노을 테두리",   cost: 900,  rarity: "rare",   emoji: "🌇", cssClass: "frm-sunset" },
  { id: "frame-rainbow", slot: "frame", name: "회전 무지개",   cost: 1200, rarity: "epic",   emoji: "🌈", cssClass: "frm-rainbow" },
  { id: "frame-holo",    slot: "frame", name: "홀로그램",      cost: 0,    rarity: "legend", emoji: "✨", cssClass: "frm-holo", badgeCode: "dk-true-reader" },
  
  { id: "name-default",      slot: "nameStyle", name: "기본",        cost: 0,    rarity: "common", emoji: "🅰️", cssClass: "" },
  { id: "name-teal",         slot: "nameStyle", name: "초록 이름",   cost: 300,  rarity: "common", emoji: "🟢", cssClass: "nm-teal" },
  { id: "name-amber",        slot: "nameStyle", name: "호박 이름",   cost: 300,  rarity: "common", emoji: "🟠", cssClass: "nm-amber" },
  { id: "name-violet",       slot: "nameStyle", name: "보라 이름",   cost: 400,  rarity: "common", emoji: "🟣", cssClass: "nm-violet" },
  { id: "name-rose",         slot: "nameStyle", name: "장미 이름",   cost: 400,  rarity: "common", emoji: "🌹", cssClass: "nm-rose" },
  { id: "name-grad-mint",    slot: "nameStyle", name: "민트 그라데", cost: 700,  rarity: "rare",   emoji: "🌿", cssClass: "nm-grad-mint" },
  { id: "name-grad-sunset",  slot: "nameStyle", name: "노을 그라데", cost: 700,  rarity: "rare",   emoji: "🌅", cssClass: "nm-grad-sunset" },
  { id: "name-flow",         slot: "nameStyle", name: "흐르는 무지개", cost: 1000, rarity: "epic", emoji: "🌊", cssClass: "nm-flow" },
  { id: "name-holo",         slot: "nameStyle", name: "홀로그램 이름", cost: 0,  rarity: "legend", emoji: "💎", cssClass: "nm-holo", badgeCode: "st-100" },
  
  { id: "effect-none",    slot: "effect", name: "없음",     cost: 0,    rarity: "common", emoji: "🚫", cssClass: "" },
  { id: "effect-firefly", slot: "effect", name: "반딧불",   cost: 500,  rarity: "common", emoji: "🪰", cssClass: "fx-firefly" },
  { id: "effect-sparkle", slot: "effect", name: "반짝임",   cost: 700,  rarity: "rare",   emoji: "✨", cssClass: "fx-sparkle" },
  { id: "effect-petal",   slot: "effect", name: "꽃잎",     cost: 800,  rarity: "rare",   emoji: "🌸", cssClass: "fx-petal" },
  { id: "effect-aura",    slot: "effect", name: "맥동 오라", cost: 900,  rarity: "rare",   emoji: "🫧", cssClass: "fx-aura" },
  { id: "effect-leaf",    slot: "effect", name: "떨어지는 잎", cost: 1100, rarity: "epic", emoji: "🍃", cssClass: "fx-leaf" },
  { id: "bg-plain",   slot: "background", name: "기본",      cost: 0,   rarity: "common", emoji: "⬜" },
  { id: "bg-forest",  slot: "background", name: "숲속",      cost: 300, rarity: "common", emoji: "🌲" },
  { id: "bg-stripe",  slot: "background", name: "스트라이프", cost: 300, rarity: "common", emoji: "📐" },
  { id: "bg-dots",    slot: "background", name: "물방울",    cost: 300, rarity: "common", emoji: "🔵" },
  { id: "bg-sakura",  slot: "background", name: "벚꽃",      cost: 500, rarity: "rare",   emoji: "🌸" },
  { id: "bg-space",   slot: "background", name: "우주",      cost: 700, rarity: "rare",   emoji: "🌌" },
  { id: "bg-aurora",  slot: "background", name: "오로라",    cost: 900, rarity: "epic",   emoji: "🌠" },
  { id: "bg-sprout",  slot: "background", name: "떡잎의 방", cost: 0,   rarity: "rare",   emoji: "☘️", minLevel: 10 },
  { id: "bg-bloom",   slot: "background", name: "개화의 방", cost: 0,   rarity: "epic",   emoji: "🌸", minLevel: 40 },
  { id: "bg-tree",    slot: "background", name: "큰나무의 방", cost: 0, rarity: "legend", emoji: "🌳", minLevel: 80 },

  // ── 카드 테마 ── 프로필 카드 전체의 배경.
  // 아바타 밖에서 처음 파는 슬롯이다. 면적이 커서 값이 확실히 보이는 대신,
  // 카드 위의 글자를 이겨서는 안 되므로 전부 밝은 톤에서 끝낸다.
  { id: "theme-plain",  slot: "cardTheme", name: "기본",     cost: 0,    rarity: "common", emoji: "⬜", cssClass: "" },
  { id: "theme-paper",  slot: "cardTheme", name: "종이결",   cost: 300,  rarity: "common", emoji: "📄", cssClass: "ctm-paper" },
  { id: "theme-mint",   slot: "cardTheme", name: "민트",     cost: 400,  rarity: "common", emoji: "🌿", cssClass: "ctm-mint" },
  { id: "theme-sand",   slot: "cardTheme", name: "모래",     cost: 400,  rarity: "common", emoji: "🏜️", cssClass: "ctm-sand" },
  { id: "theme-dusk",   slot: "cardTheme", name: "해질녘",   cost: 600,  rarity: "rare",   emoji: "🌆", cssClass: "ctm-dusk" },
  { id: "theme-sakura", slot: "cardTheme", name: "벚꽃",     cost: 800,  rarity: "rare",   emoji: "🌸", cssClass: "ctm-sakura" },
  { id: "theme-forest", slot: "cardTheme", name: "숲",       cost: 1000, rarity: "epic",   emoji: "🌲", cssClass: "ctm-forest" },
  { id: "theme-aurora", slot: "cardTheme", name: "오로라",   cost: 1400, rarity: "epic",   emoji: "🌠", cssClass: "ctm-aurora" },
  { id: "theme-holo",   slot: "cardTheme", name: "홀로그램 카드", cost: 0, rarity: "legend", emoji: "💠", cssClass: "ctm-holo", badgeCode: "st-30" },

  // ── 경험치 바 ── 매일 조금씩 차오르는 곳이라 작아도 눈에 남는다.
  { id: "xp-default", slot: "xpBar", name: "기본",   cost: 0,    rarity: "common", emoji: "🟩", cssClass: "" },
  { id: "xp-ocean",   slot: "xpBar", name: "바다",   cost: 300,  rarity: "common", emoji: "🌊", cssClass: "xpb-ocean" },
  { id: "xp-sunset",  slot: "xpBar", name: "노을",   cost: 400,  rarity: "common", emoji: "🌅", cssClass: "xpb-sunset" },
  { id: "xp-grape",   slot: "xpBar", name: "포도",   cost: 500,  rarity: "rare",   emoji: "🍇", cssClass: "xpb-grape" },
  { id: "xp-candy",   slot: "xpBar", name: "캔디",   cost: 600,  rarity: "rare",   emoji: "🍬", cssClass: "xpb-candy" },
  { id: "xp-rainbow", slot: "xpBar", name: "흐르는 무지개", cost: 1000, rarity: "epic", emoji: "🌈", cssClass: "xpb-rainbow" },
  { id: "xp-gold",    slot: "xpBar", name: "황금",   cost: 0,    rarity: "legend", emoji: "🏅", cssClass: "xpb-gold", badgeCode: "x-perfect-week" },
];

export const SHOP_BY_ID = new Map(SHOP_ITEMS.map((i) => [i.id, i]));
export const DEFAULT_ITEMS = SHOP_ITEMS.filter((i) => i.cost === 0 && !i.minLevel && !i.badgeCode).map((i) => i.id);

/** 아바타 배경 — 색 하나가 아니라 CSS 배경 전체(그라데이션·패턴)를 담는다. */
export const BG_STYLE: Record<string, string> = {
  "bg-plain":  "#f3f4f6",
  "bg-forest": "linear-gradient(135deg,#dcfce7,#a7e8bd)",
  "bg-stripe": "repeating-linear-gradient(45deg,#f6f5f4 0 6px,#e6e3df 6px 12px)",
  "bg-dots":   "radial-gradient(#cfe9d5 1.5px, #f6f5f4 1.6px) 0 0/10px 10px",
  "bg-sakura": "linear-gradient(135deg,#ffe3ef,#ffc2dc)",
  "bg-space":  "linear-gradient(150deg,#1e1b4b,#3b357e)",
  "bg-aurora": "conic-gradient(from 180deg,#ffd6e7,#c1f0ff,#d9ffe1,#ffe9c1,#ffd6e7)",
  "bg-sprout": "linear-gradient(135deg,#e6f7e9,#c6ecd0)",
  "bg-bloom":  "linear-gradient(135deg,#fde8f3,#f9c9e4)",
  "bg-tree":   "linear-gradient(135deg,#e7f0e2,#bcd9b6)",
};

// ── 뱃지 효과 ─────────────────────────────────────────────────────────────────
// functions/src/rewards-config.ts 의 사본. 여기서는 **표시용**으로만 쓴다 —
// 실제 적용은 전부 서버가 한다(클라이언트 값을 믿으면 조작된다).
// 효과 정의가 서버와 어긋나면 학생이 본 설명과 실제 적립이 달라진다.

export type BadgeCond = "earlyBird" | "weekend" | "quality80" | "long60";

export type BadgeEffect =
  | { kind: "xpWhen"; cond: BadgeCond; pct: number }
  | { kind: "points"; pct: number }
  | { kind: "shopDiscount"; pct: number }
  | { kind: "lateFactor"; value: number };

const BADGE_EFFECT: Record<string, BadgeEffect> = {
  "x-early-bird":   { kind: "xpWhen", cond: "earlyBird", pct: 20 },
  "x-weekend":      { kind: "xpWhen", cond: "weekend",   pct: 20 },
  "dk-true-reader": { kind: "xpWhen", cond: "quality80", pct: 15 },
  "av-grit":        { kind: "xpWhen", cond: "long60",    pct: 15 },
  "cc-long-run":    { kind: "xpWhen", cond: "long60",    pct: 15 },
  "x-catchup":      { kind: "lateFactor", value: 0.85 },
  "x-night-owl":    { kind: "points", pct: 5 },
};

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

const COND_LABEL: Record<BadgeCond, string> = {
  earlyBird: "오전 7시 전에 시작한 날",
  weekend: "토·일에 학습한 날",
  quality80: "잘한 날(정확도 높은 날)",
  long60: "60분 넘게 한 날",
};

/** 학생에게 보여줄 한 줄. 히든 뱃지의 획득 조건과는 별개다(그건 계속 감춘다). */
export function effectLabel(code: string): string | null {
  const e = effectOf(code);
  if (!e) return null;
  if (e.kind === "xpWhen") return `${COND_LABEL[e.cond]} 경험치 +${e.pct}%`;
  if (e.kind === "points") return `포인트 +${e.pct}%`;
  if (e.kind === "shopDiscount") return `상점 ${e.pct}% 할인`;
  return "밀린 과제를 만회할 때 경험치를 더 받아요";
}

/** 장착 슬롯 수 — 레벨로 열린다 (서버 badgeSlots 와 같은 값). */
export function badgeSlots(level: number): number {
  return level >= 30 ? 3 : level >= 10 ? 2 : 1;
}
