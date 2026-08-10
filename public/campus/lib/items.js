// ══════════════════════════════════════════════════════════════════
//  아이템 카탈로그 — 채집·조합·매점이 전부 이 데이터를 읽는다
//
//  가구는 room.js FURNITURE 를 아이템으로 승격한 것이다. 매점에서 사면
//  인벤토리에 들어오고, 자습실 배치 모드에서 꺼내 놓는다.
//  sell = 매점에 파는 값 / buy = 매점에서 사는 값. 없으면 그 방향 거래 불가.
// ══════════════════════════════════════════════════════════════════
import { FURNITURE } from '/campus/lib/room.js';

//  tier = 이 물건이 상점에 풀리는 누적 포인트 구간(ROOM_TIERS 인덱스).
//  방이 넓어질수록 살 수 있는 것도 늘어난다.
export const ITEMS = {
  apple: {name:'사과',     icon:'🍎', sell:100},
  juice: {name:'사과주스', icon:'🧃', sell:400},
  chair: {name:'의자',     icon:'🪑', buy:300,  furn:true, tier:0},
  plant: {name:'화분',     icon:'🪴', buy:300,  furn:true, tier:0},
  rug:   {name:'러그',     icon:'🟩', buy:500,  furn:true, tier:0},
  desk:  {name:'책상',     icon:'🪵', buy:600,  furn:true, tier:1},
  lamp:  {name:'스탠드',   icon:'💡', buy:400,  furn:true, tier:1},
  shelf: {name:'책장',     icon:'📚', buy:700,  furn:true, tier:2},
  board: {name:'화이트보드', icon:'🖍️', buy:500, furn:true, tier:2},
  sofa:  {name:'소파',     icon:'🛋️', buy:800,  furn:true, tier:3},
};
// 가구 이름은 room.js 가 원본이다 — 두 곳이 어긋나면 배치 화면과 상점이 딴소리를 한다
for (const k in ITEMS) if (ITEMS[k].furn) ITEMS[k].name = FURNITURE[k].name;

// 조합: 재료를 소모해 결과 1개. 지금은 한 줄이지만 표로 둔다 — 레시피는 늘어난다.
export const RECIPES = [
  {id:'juice', name:'사과주스', need:{apple:3}, make:'juice'},
];

/** 인벤토리(맵)를 정화한다. 알 수 없는 키·음수·소수는 버린다. */
export function sanitizeInv(raw){
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k in raw){
    if (!ITEMS[k]) continue;
    const n = Math.floor(+raw[k]);
    if (Number.isFinite(n) && n > 0) out[k] = Math.min(n, 999);
  }
  return out;
}
/** 누적 포인트 — 쓰더라도 줄지 않는다. 방 확장·상점 해금의 기준이다. */
export function sanitizeEarned(raw){
  const n = Math.floor(+raw);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 99_999_999) : 0;
}

export function sanitizeBells(raw){
  const n = Math.floor(+raw);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 9_999_999) : 0;
}

// ── 과일나무 ────────────────────────────────────────────────────────
//  야외 나무 목록(map.js) 중 이 좌표의 나무가 과일나무다. id 는 저장 키.
// 좁아진 마을 안. 광장·건물·진입로를 비켜 잔디에만 둔다.
export const FRUIT_TREES = [
  {id:'ft-a', x:-11, z: 6}, {id:'ft-b', x: 11, z: 6}, {id:'ft-c', x:-13, z:-1},
  {id:'ft-d', x: 13, z:-2}, {id:'ft-e', x:-11, z:-13}, {id:'ft-f', x: 11, z:-13},
];
export const FRUITS_PER_TREE = 3;

/** 오늘 날짜 키 — 흔든 나무 기록이 자정에 리셋되는 기준 */
export const dayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
