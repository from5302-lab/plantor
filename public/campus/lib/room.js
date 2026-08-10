// ══════════════════════════════════════════════════════════════════
//  개인 자습실 — 가구 카탈로그와 배치 데이터
//
//  자습실은 들어가면 '로그인한 계정의 방'이 뜬다. 가구 배치는 계정에 저장되고
//  (users/{uid}.campus.room), 그 방의 실시간 채널도 개인 채널(study:{uid})로
//  나뉜다. 남의 방에 있는 사람이 내 방에 보이면 안 되기 때문이다.
//
//  가구는 '데이터'다. 메시와 충돌 상자를 둘 다 이 데이터에서 만든다
//  (장식에서 충돌을 유추하지 않는다 — 맵 본체와 같은 규칙).
// ══════════════════════════════════════════════════════════════════

// kit = Kenney Furniture Kit 모델 이름, s = 스케일.
// w/d = 충돌 상자 크기(모델 실측 × s), h = 높이, solid = 통과 불가 여부.
// c 는 키트 로드 실패 시 상자로 그릴 때만 쓰는 폴백 색이다.
//
// ⚠ w/d 를 바꾸면 이미 저장된 배치의 충돌 상자가 달라진다. 겹쳐도 튕겨 나가진
//   않지만(배치 검사는 편집 중에만 돈다), 값은 모델과 함께 움직여야 한다.
export const FURNITURE = {
  desk:  {name:'책상',   kit:'desk',            s:2.0, w:1.46, d:0.78, h:0.76, c:0xe3d3b8},
  chair: {name:'의자',   kit:'chairDesk',       s:1.4, w:0.46, d:0.43, h:0.85, c:0xd9c3a0},
  shelf: {name:'책장',   kit:'bookcaseOpen',    s:2.0, w:0.80, d:0.50, h:1.76, c:0xf2f6f3},
  board: {name:'텔레비전', kit:'televisionModern', s:1.6, w:1.09, d:0.21, h:0.72, c:0xf7fbf7},
  sofa:  {name:'소파',   kit:'loungeSofa',      s:1.8, w:1.76, d:0.74, h:0.83, c:0x8fc9a8},
  plant: {name:'화분',   kit:'pottedPlant',     s:1.7, w:0.36, d:0.41, h:1.11, c:0x8fc79a},
  lamp:  {name:'스탠드', kit:'lampSquareFloor', s:1.6, w:0.19, d:0.19, h:1.38, c:0xf2dfa4},
  rug:   {name:'러그',   kit:'rugRectangle',    s:1.6, w:2.51, d:1.47, h:0.02, c:0xcfe8d6, solid:false},
  bed:   {name:'침대',   kit:'bedSingle',       s:1.8, w:1.03, d:2.02, h:0.68, c:0xd9c3a0},
};

// 내 방 배치 가능 범위. 룸 중심은 (x=-7.5, z=1) 이고 벽 안쪽 최대치가 아래 FULL 이다.
//
// 방은 **누적 포인트로 넓어진다.** 처음엔 문 앞 한 귀퉁이만 쓰다가,
// 학습센터에서 포인트를 모을수록 벽 끝까지 열린다.
// ⚠ 저장된 배치는 월드 절대좌표라, 범위가 줄어드는 방향으로는 절대 바꾸지 마라.
export const ROOM_FULL = {minX:-13.8, maxX:-1.2, minZ:-2.8, maxZ:4.8};

// need = 누적 포인트, grow = FULL 대비 개방 비율(문 앞 모서리에서 바깥으로)
export const ROOM_TIERS = [
  {need:     0, grow:0.42, name:'원룸'},
  {need:  1000, grow:0.60, name:'넓은 방'},
  {need:  4000, grow:0.78, name:'큰 방'},
  {need: 10000, grow:1.00, name:'풀사이즈'},
];

export function roomTier(earned = 0){
  let t = ROOM_TIERS[0], i = 0;
  ROOM_TIERS.forEach((x, k) => { if (earned >= x.need){ t = x; i = k; } });
  return {...t, index: i, next: ROOM_TIERS[i + 1] || null};
}

/** 누적 포인트에 따른 실제 배치 범위. 문(북쪽 z=-2.8) 쪽 모서리부터 열린다. */
export function roomBounds(earned = 0){
  const g = roomTier(earned).grow;
  const F = ROOM_FULL;
  const cx = (F.minX + F.maxX) / 2;
  const w = (F.maxX - F.minX) * g, d = (F.maxZ - F.minZ) * g;
  return {minX: cx - w/2, maxX: cx + w/2, minZ: F.minZ, maxZ: F.minZ + d};
}

// 기본값(포인트 0) — 예전 이름을 쓰는 곳이 있어 남겨 둔다
export const ROOM_BOUNDS = roomBounds(0);

// 처음 들어온 사람에게 주는 기본 배치
// 처음 들어온 사람에게 주는 기본 배치 — 1티어(원룸) 범위 안에 들어가야 한다
export const DEFAULT_ROOM = [
  {t:'desk',  x:-9.0, z:-1.5, r:0},
  {t:'chair', x:-9.0, z:-0.5, r:0},
  {t:'rug',   x:-6.5, z:-0.5, r:0},
];

const MAX_ITEMS = 40;

/** 저장된 배치를 정화한다. 남이 손댔거나 버전이 밀렸을 수 있다. */
export function sanitizeRoom(raw, earned = Infinity){
  if (!Array.isArray(raw)) return null;
  // 정화는 **가장 넓은 범위**로 한다. 포인트가 줄어드는 일은 없지만, 티어 계산이
  // 바뀌었을 때 이미 놓인 가구가 잘려 사라지면 유저 자산이 날아간다.
  const B = earned === Infinity ? ROOM_FULL : roomBounds(earned);
  const out = [];
  for (const it of raw.slice(0, MAX_ITEMS)){
    if (!it || !FURNITURE[it.t]) continue;
    const x = +it.x, z = +it.z, r = +it.r;
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    out.push({
      t: it.t,
      x: Math.min(B.maxX, Math.max(B.minX, x)),
      z: Math.min(B.maxZ, Math.max(B.minZ, z)),
      // 회전은 90° 단위로만 — 격자 배치라 그 사이 각도는 쓸 일이 없다
      r: Number.isFinite(r) ? (Math.round(r / (Math.PI/2)) * (Math.PI/2)) : 0,
    });
  }
  return out;
}

/** 회전을 반영한 충돌 상자. 90° 단위라 가로·세로만 뒤바뀐다. */
export function itemBox(it){
  const f = FURNITURE[it.t];
  const swap = Math.abs(Math.round(it.r / (Math.PI/2))) % 2 === 1;
  const w = swap ? f.d : f.w, d = swap ? f.w : f.d;
  return {minX: it.x - w/2, maxX: it.x + w/2, minZ: it.z - d/2, maxZ: it.z + d/2};
}
