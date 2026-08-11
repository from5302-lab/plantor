// ══════════════════════════════════════════════════════════════════
//  내 방 — 크기(포인트로 확장)와 기본 배치
//
//  자습실은 들어가면 '로그인한 계정의 방'이 뜬다. 가구 배치는 계정에 저장되고
//  (users/{uid}.campus.room), 그 방의 실시간 채널도 개인 채널(study:{uid})로
//  나뉜다. 남의 방에 있는 사람이 내 방에 보이면 안 되기 때문이다.
//
//  놓을 수 있는 오브젝트 목록과 배치 정화는 decor.js 가 맡는다 — 내 방과
//  공용 공간이 같은 데이터 모양을 쓰기 때문이다.
// ══════════════════════════════════════════════════════════════════

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

// 처음 들어온 사람에게 주는 기본 배치 — 1티어(원룸) 범위 안에 들어가야 한다
export const DEFAULT_ROOM = [
  {t:'desk',  x:-9.0, z:-1.5, r:0},
  {t:'chair', x:-9.0, z:-0.5, r:0},
  {t:'rug',   x:-6.5, z:-0.5, r:0},
];
