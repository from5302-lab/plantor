// ══════════════════════════════════════════════════════════════════
//  멀티플랜토 아바타 빌더 — 공용 모듈
//
//  이 파일이 캐릭터의 단일 소스다. 맵(/)과 생성기(/creator.html)가 함께 쓴다.
//  이전에는 페이지마다 복사본이 있어서 손목 하나 고치려면 세 군데를 고쳐야 했다.
//
//  구성
//    ① 체형(BODY)   — 숫자 8개. 새 아트 없이 비율을 바꾼다
//    ② 헤어(HAIR)   — 슬롯. 스타일 1개 = 메시 몇 개
//    ③ 옷(TOPS/BOTTOMS) — 슬롯. 소매·바짓단 길이가 팔다리 재질을 결정한다
//    ④ 색(PALETTE)  — material.color만 바꾼다. 메시가 늘지 않는다
// ══════════════════════════════════════════════════════════════════
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

// ── 공용 재질 ─────────────────────────────────────────────────────
const ramp = new THREE.DataTexture(new Uint8Array([90, 178, 255]), 3, 1, THREE.RedFormat);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;

export const toon = c => new THREE.MeshToonMaterial({color:c, gradientMap:ramp});
export const OUTLINE_MAT = new THREE.MeshBasicMaterial({color:0x140f18, side:THREE.BackSide});
const UP = new THREE.Vector3(0, 1, 0);

// 구면에 감긴 평면 — 얼굴을 두상 곡률에 붙일 때
function curvedPlane(radius, wDeg, hDeg, seg = 14){
  const g = new THREE.PlaneGeometry(1, 1, seg, seg);
  const w = THREE.MathUtils.degToRad(wDeg), h = THREE.MathUtils.degToRad(hDeg);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++){
    const yaw = p.getX(i)*w, pitch = p.getY(i)*h;
    p.setXYZ(i, radius*Math.sin(yaw)*Math.cos(pitch), radius*Math.sin(pitch), radius*Math.cos(yaw)*Math.cos(pitch));
  }
  p.needsUpdate = true; g.computeVertexNormals();
  return g;
}

export function faceTexture(look){
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  // SD 는 눈이 크고 얼굴 아래쪽에 붙는다. 그래야 이마가 넓어 보이고 어려 보인다.
  // ⚠ 눈 y 를 옮기면 안경 메시(buildAvatar)도 같이 옮겨야 한다. 안경은 3D라
  //   텍스처를 따라오지 않는다.
  const eye = x => {
    g.fillStyle = '#241c22'; g.beginPath(); g.ellipse(x,152,29,35,0,0,7); g.fill();
    g.fillStyle = look.eye;  g.beginPath(); g.ellipse(x,160,20,25,0,0,7); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x-10,140,10,11,0,0,7); g.fill();
    g.beginPath(); g.ellipse(x+9,167,5,5,0,0,7); g.fill();          // 작은 반사 하나 더
  };
  eye(80); eye(176);

  // 안경테 윗림이 텍스처 y≈95에 걸린다. 굵은 눈썹은 반드시 그 위(y<93)에.
  if (look.brow === 'thick'){
    g.fillStyle = '#141118';
    for (const s of [-1, 1]){
      const xo = 128 + s*90, xi = 128 + s*16;
      g.beginPath(); g.moveTo(xo,70); g.lineTo(xi,80); g.lineTo(xi,92); g.lineTo(xo,84); g.closePath(); g.fill();
    }
  } else {
    g.strokeStyle = '#241c22'; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(60,118);  g.lineTo(104,111); g.stroke();
    g.beginPath(); g.moveTo(152,111); g.lineTo(196,118); g.stroke();
  }

  if (look.blush === 'hatch'){
    g.strokeStyle = 'rgba(206,122,110,.62)'; g.lineWidth = 3.4; g.lineCap = 'round';
    for (const s of [-1,1]) for (let i = 0; i < 4; i++){
      const x = 128 + s*(54 + i*9);
      g.beginPath(); g.moveTo(x-6,196); g.lineTo(x+6,180); g.stroke();
    }
  } else if (look.blush !== 'none'){
    // 'none' 은 무채색 룩(GUEST_LOOK)용이다. 회색 얼굴에 분홍 볼터치만 남으면 그것만 튄다.
    g.fillStyle = 'rgba(232,120,120,.34)';
    g.beginPath(); g.ellipse(52,188,18,12,0,0,7); g.fill();
    g.beginPath(); g.ellipse(204,188,18,12,0,0,7); g.fill();
  }

  // 입은 작게, 눈 가까이. SD 에서 입이 크면 나이 들어 보인다.
  g.strokeStyle = '#3a2029'; g.lineWidth = 7; g.lineCap = 'round';
  if (look.mouth === 'flat'){ g.beginPath(); g.moveTo(113,199); g.lineTo(143,199); g.stroke(); }
  else { g.beginPath(); g.arc(128,192,13,0.3,Math.PI-0.3); g.stroke(); }

  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ══ ① 체형 ════════════════════════════════════════════════════════
//  SD(슈퍼 데포르메) 비율 — 2등신대.
//
//  ⚠ 머리는 건드리지 않는다. 헤어 10종·얼굴 텍스처·안경이 전부 머리 반지름
//    (0.44*hd)을 기준으로 저작돼 있어서, 머리를 손대면 그 전부를 다시 맞춰야 한다.
//    몸만 줄이고 굵혀서 상대적으로 머리가 커 보이게 만든다.
//
//  마디 길이 — 여기서만 고친다. hipY/topY 와 buildAvatar 가 이 값을 함께 쓴다.
const THIGH = 0.27, SHIN = 0.26, FOOT_Y = 0.14;   // 다리
const CHEST_Y = 0.25, NECK_Y = 0.33;              // 몸통(골반→가슴→목)

//  SD 는 크게 두 갈래인데(감자 / 당근) 이 캐릭터는 **감자형**이다.
//    감자 — 2.5등신, 크고 둥근 몸체, 크고 구체적인 손, 도톰한 하반신과 발.
//           봉제인형처럼 친근한 동글동글 체형
//    당근 — 2등신, 굴곡 적고 작은 몸체, 조그맣고 섬세한 손, 얇은 하반신.
//           피규어처럼 작고 알찬 오밀조밀 체형
//  한때 당근형(1.86등신·몸통 0.55×)까지 갔는데, 머리만 크고 몸이 빈약해서
//  오히려 덜 귀여웠다. 귀여움은 데포르메 정도가 아니라 '통통함'에서 온다.
const TORSO_R = 0.34, UPARM_R = 0.145, FOREARM_R = 0.135, HAND_R = 0.175;
const THIGH_R = 0.19, SHIN_R = 0.18, FOOT_R = 0.18;

//  몸통 캡슐은 z 로 눌러 놨다(납작한 가슴). 칼라·넥타이·주머니처럼 앞면에 붙는
//  장식은 이 값을 써야 한다 — 숫자로 베껴 두면 몸통을 줄였을 때 옷만 공중에 뜬다.
const TORSO_ZS = 0.98;   // 봉제인형은 앞뒤로 거의 안 눌러 — 몸통이 공에 가깝다
const TORSO_Z  = TORSO_R * TORSO_ZS;

//  팔이 몸통에서 떨어져 있어야 하는 최소 여유.
//  어깨 x 는 이 값과 몸통·팔 굵기에서 아바타마다 계산한다(buildAvatar 참고).
//  상수로 두면 몸집 슬라이더를 올렸을 때 몸통만 굵어지고 팔이 다시 파묻힌다.
const ARM_GAP = 0.02;

//  리그 좌표 → 월드 미터. 정수리 2.10 × 0.75 ≒ 1.57m
export const RIG_SCALE = 0.75;

//  체형 축은 5개다. 예전엔 8개였는데 감자형에서는 서로 겹치거나 변화가 안 보였다:
//    · '어깨 너비'  — 어깨는 이제 몸통·팔 굵기에서 유도된다. 따로 조절하면 팔이 파묻힌다
//    · '팔다리 굵기' — '몸집'과 거의 같은 축이다. 몸집이 0.7배로 함께 민다
//    · '팔 길이'    — 2.4등신에서 팔이 짧아 ±20% 를 움직여도 눈에 안 띈다
//  뺀 축은 BODY_BASE 의 1 로 고정된다. 저장값에 남아 있어도 sanitizeCharacter 가
//  BODY_SLIDERS 만 훑으므로 그냥 무시된다(마이그레이션 불필요).
export const BODY_BASE = {height:1, head:1, girth:1, legLen:1, torso:1};
export const BODY_SLIDERS = [
  ['height',  '키',        0.85, 1.20],
  ['head',    '머리 크기',  0.85, 1.20],
  ['girth',   '몸집',      0.80, 1.25],
  ['legLen',  '다리 길이',  0.85, 1.20],
  ['torso',   '상체 길이',  0.88, 1.15],
];

// 골반 높이는 다리 길이에서 유도한다. 안 그러면 발이 뜨거나 바닥에 파묻힌다.
export const hipY   = B => (THIGH + SHIN)*B.legLen + FOOT_Y;
export const topY   = B => hipY(B) + (CHEST_Y + NECK_Y)*B.torso + 0.74*B.head;
export const headsRatio = B => topY(B) / (0.88*B.head);
// 표시용 키. 모델의 기하학적 높이가 아니라 '이 캐릭터가 나타내는 키'다.
// SD 는 실제 사람 비율이 아니라서 둘이 같을 수 없다 — 165cm 를 넣으면 1.65m 로
// 읽혀야 하지, 데포르메된 모델 높이(1.50m)가 나오면 사용자가 혼란스럽다.
export const heightM    = B => 1.65 * B.height;

// 키·몸무게 → 체형. BMI는 둘레 계열을, 키는 비율 계열을 민다.
// ⚠ 청소년은 성인 BMI 기준이 안 맞는다. 실제 제품은 질병관리청
//    소아·청소년 성장도표의 BMI 백분위수를 써야 한다.
//    (나이 입력이 없어 지금 구조로는 못 쓴다 — 기준값만 중고생대로 낮춰 뒀다)
export function fromMeasurements(H, W, bmiRef = 19.5){
  const bmi = W / Math.pow(H/100, 2);
  const r = bmi / bmiRef, h = H / 165;
  const cl = (v, k) => { const s = BODY_SLIDERS.find(x => x[0] === k);
                         return +THREE.MathUtils.clamp(v, s[2], s[3]).toFixed(3); };
  // 팔다리 굵기·어깨는 이제 몸집에서 따라오므로 여기서 따로 만들지 않는다.
  const B = Object.assign({}, BODY_BASE, {
    head:   cl(1 - (h-1)*0.85, 'head'),
    girth:  cl(1 + (r-1)*1.15, 'girth'),
    legLen: cl(1 + (h-1)*0.90, 'legLen'),
    torso:  cl(1 + (h-1)*0.20, 'torso'),
  });
  // height 는 이제 '나타내는 키 / 165cm' 그대로다(heightM 과 짝을 이룬다).
  // 예전엔 목표 월드 높이를 topY 로 나눠 거꾸로 풀었는데, topY 가 바뀔 때마다
  // 이 식이 같이 틀어졌다. 등신 비율은 head 슬라이더가 따로 잡으므로
  // 여기서 키를 감쇠시킬 이유가 없다(headsRatio 는 height 와 무관하다).
  B.height = cl(h, 'height');
  return {body:B, bmi};
}

// ══ ② 헤어 ════════════════════════════════════════════════════════
// build(ctx) — ctx.mk(geo, mat, pos, rot, scl, out) 로 메시를 얹는다. hd = 머리 배율.
const SPIKES = [
  [.58,.112, 0.00,0.62,.55],[.51,.098,-0.72,0.55,.55],[.51,.098, 0.72,0.55,.55],
  [.55,.104,-1.42,0.42,.60],[.55,.104, 1.42,0.42,.60],[.47,.093,-2.16,0.38,.62],
  [.47,.093, 2.16,0.38,.62],[.44,.089, 3.14,0.45,.60],[.49,.098,-0.36,0.16,.30],
  [.49,.098, 0.36,0.16,.30],[.42,.086,-1.02,0.05,.32],[.42,.086, 1.02,0.05,.32],
];
const cap = (c, cover = 0.52, r = 0.463) =>
  c.mk(new THREE.SphereGeometry(r*c.hd, 28, 20, 0, Math.PI*2, 0, Math.PI*cover),
       c.hair, [0, 0.015*c.hd, -0.012*c.hd], [0.12,0,0], [1,1,1], 0.03);
// 앞머리 — 박스로 붙이면 평평한 모서리가 두상 곡면을 뚫는다.
// 캡을 하나 더 만들어 앞으로 기울이면 곡면을 따라 자연스럽게 내려온다.
const fringe = (c, cover = 0.30, tilt = 0.55, r = 0.474) =>
  c.mk(new THREE.SphereGeometry(r*c.hd, 24, 14, 0, Math.PI*2, 0, Math.PI*cover), c.hair,
       [0, 0.01*c.hd, 0], [tilt, 0, 0], [1, 1, 1], 0.028);
const backMass = (c, sy = 1.05, sz = 0.72) =>
  c.mk(new THREE.SphereGeometry(0.43*c.hd, 22, 18), c.hair,
       [0, -0.05*c.hd, -0.115*c.hd], [0,0,0], [1.03, sy, sz], 0.03);

export const HAIR_STYLES = [
  {id:'spiky', name:'스파이크', build(c){
    cap(c); backMass(c);
    for (const [len,rad,yawA,pitchA,lift] of SPIKES){
      const g = new THREE.ConeGeometry(rad*c.hd, len*c.hd, 6, 1); g.translate(0, len*c.hd/2, 0);
      const dir = new THREE.Vector3(Math.sin(yawA)*Math.cos(pitchA), Math.sin(pitchA), Math.cos(yawA)*Math.cos(pitchA));
      const h = new THREE.Group();
      h.position.copy(dir).multiplyScalar(0.39*c.hd);
      h.quaternion.setFromUnitVectors(UP, dir.clone().lerp(UP, lift).normalize());
      c.group.add(h);
      c.mkIn(h, g, c.hair, [0,0,0], [0,0,0], [1,1,1], 0.10);
    }
  }},
  {id:'crop', name:'짧은 단정', build(c){ cap(c, 0.56); backMass(c, 1.0, 0.66); }},
  {id:'twoblock', name:'투블럭', build(c){
    cap(c, 0.40, 0.478); backMass(c, 0.86, 0.62);
    c.mk(new THREE.SphereGeometry(0.452*c.hd, 22, 14, 0, Math.PI*2, 0, Math.PI*0.30), c.hair,
         [0, 0.10*c.hd, 0.03*c.hd], [0.22,0,0], [1.02,1,1], 0.03);
  }},
  {id:'bob', name:'단발', build(c){
    cap(c, 0.58); backMass(c, 1.06, 0.80);
    for (const s of [-1,1])
      c.mk(new THREE.CapsuleGeometry(0.115*c.hd, 0.30*c.hd, 5, 14), c.hair,
           [s*0.375*c.hd, -0.24*c.hd, -0.02*c.hd], [0.06, 0, s*0.10], [1,1,0.85], 0.04);
    fringe(c);
  }},
  {id:'long', name:'장발', build(c){
    cap(c, 0.58); backMass(c, 1.06, 0.82);
    c.mk(new THREE.CapsuleGeometry(0.28*c.hd, 0.62*c.hd, 6, 16), c.hair,
         [0, -0.42*c.hd, -0.20*c.hd], [0.10,0,0], [1.25, 1, 0.55], 0.035);
    for (const s of [-1,1])
      c.mk(new THREE.CapsuleGeometry(0.10*c.hd, 0.46*c.hd, 5, 12), c.hair,
           [s*0.36*c.hd, -0.34*c.hd, 0.06*c.hd], [0.05,0,s*0.07], [1,1,0.8], 0.04);
    fringe(c);
  }},
  {id:'pony', name:'포니테일', build(c){
    cap(c, 0.56); backMass(c, 1.0, 0.70);
    c.mk(new THREE.SphereGeometry(0.10*c.hd, 12, 10), c.hair, [0, 0.16*c.hd, -0.44*c.hd], [0,0,0], [1,1,1], 0.05);
    c.mk(new THREE.CapsuleGeometry(0.11*c.hd, 0.52*c.hd, 6, 14), c.hair,
         [0, -0.10*c.hd, -0.56*c.hd], [0.46,0,0], [1,1,1], 0.04);
  }},
  {id:'twin', name:'양갈래', build(c){
    cap(c, 0.56); backMass(c, 1.0, 0.72);
    for (const s of [-1,1]){
      c.mk(new THREE.SphereGeometry(0.085*c.hd, 12, 10), c.hair, [s*0.40*c.hd, 0.10*c.hd, -0.14*c.hd], [0,0,0], [1,1,1], 0.05);
      c.mk(new THREE.CapsuleGeometry(0.105*c.hd, 0.40*c.hd, 6, 12), c.hair,
           [s*0.50*c.hd, -0.16*c.hd, -0.20*c.hd], [0.20, 0, s*0.34], [1,1,1], 0.04);
    }
  }},
  {id:'curly', name:'곱슬 볼륨', build(c){
    cap(c, 0.50, 0.44); backMass(c, 1.0, 0.72);
    const P = [[0,0.42,0.10],[-0.34,0.30,0.02],[0.34,0.30,0.02],[-0.24,0.18,-0.34],[0.24,0.18,-0.34],
               [0,0.26,-0.40],[-0.44,0.06,-0.06],[0.44,0.06,-0.06],[0,0.34,0.34]];
    for (const [x,y,z] of P)
      c.mk(new THREE.SphereGeometry(0.155*c.hd, 12, 10), c.hair,
           [x*c.hd, y*c.hd, z*c.hd], [0,0,0], [1,0.92,1], 0.05);
  }},
  {id:'bangs', name:'앞머리 단발', build(c){
    cap(c, 0.54); backMass(c, 1.02, 0.76);
    fringe(c, 0.34, 0.68);
    for (const s of [-1,1])
      c.mk(new THREE.CapsuleGeometry(0.10*c.hd, 0.22*c.hd, 5, 12), c.hair,
           [s*0.38*c.hd, -0.16*c.hd, 0.06*c.hd], [0,0,s*0.06], [1,1,0.85], 0.04);
  }},
  {id:'bald', name:'민머리', build(){}},
];

// ══ ③ 옷 ══════════════════════════════════════════════════════════
// sleeve / legs 값이 팔·다리 각 마디의 재질(옷 vs 맨살)을 결정한다.
export const TOPS = [
  {id:'uniform', name:'교복',   sleeve:'long',  extra:'uniform'},
  {id:'hood',    name:'후드',   sleeve:'long',  extra:'hood'},
  {id:'tee',     name:'반팔',   sleeve:'short'},
  {id:'longtee', name:'긴팔',   sleeve:'long'},
];
export const BOTTOMS = [
  {id:'pants',  name:'긴바지', legs:'full'},
  {id:'shorts', name:'반바지', legs:'half'},
  {id:'skirt',  name:'치마',   legs:'bare', skirt:true},
];

// 색 팔레트 — 자유 입력 대신 고정 스와치. 조합이 무너지지 않는다.
export const PALETTE = {
  skin:  [0xf6d3b4, 0xf7dcc2, 0xecc19c, 0xd9a578, 0xbe8659, 0x8d5f3c],
  hair:  [0x2a2330, 0x4a3527, 0x7b5230, 0xb98a3a, 0xd9d3c6, 0x2b4a6b, 0x6d4560, 0x9a3b3b],
  cloth: [0x4f7fd4, 0x3fb0a8, 0x4fa36b, 0xd48a4f, 0xd45f7f, 0x8b6ee0,
          0x2b3350, 0x1b1b20, 0xe9ecf2, 0x9aa3b4],
  shoe:  [0xdfe4ef, 0x1b1b20, 0x8a5f3c, 0xd45f7f, 0x3fb0a8, 0xf5c518],
};

// 기본 학생 — 게스트도, 갓 가입한 계정도 이 모습으로 시작한다.
// 삐죽머리는 개성이 너무 강해 '기본값'으로 맞지 않는다. 단정한 머리 + 교복.
export const DEFAULT_LOOK = {
  hairStyle:'crop', topStyle:'uniform', bottomStyle:'pants',
  skin:0xf6d3b4, hair:0x4a3527, top:0x2b3350, bottom:0x2b3350, shoe:0xdfe4ef,
  trim:0xe9ecf2, tie:0x8e2b3a, eye:'#26324f', glasses:false,
};

// 방문자(비로그인) — '아직 아무도 아닌 상태'를 그린다. DEFAULT_LOOK 과 역할이 다르다:
// 저건 갓 가입한 계정의 출발점(꾸밀 수 있는 사람의 기본값)이고, 이건 꾸밀 수 없는 상태의 표현이다.
//
//   · 무채색  — 색을 고른 흔적이 없어야 '커스텀 안 됨'으로 읽힌다
//   · 민머리  — 어떤 헤어를 얹어도 그건 이미 '고른 것'이다. 마네킹처럼 비워 둔다
//   · 긴팔    — 교복 칼라와 넥타이는 성별·소속 신호를 만든다
//   · 볼터치 없음
//
// 값을 skin > top > bottom > shoe 순으로 어둡게 벌려 놨다. 다 같은 회색이면
// 실루엣이 뭉개져 사람이 아니라 덩어리로 보인다.
// hair 색은 민머리라 쓰이지 않지만, sanitizeCharacter 가 채우는 슬롯이라 남겨 둔다.
export const GUEST_LOOK = {
  hairStyle:'bald', topStyle:'longtee', bottomStyle:'pants',
  skin:0xdedbd7, hair:0x9c9995, top:0xc4c2bf, bottom:0xaeaba8, shoe:0x908d8a,
  trim:0xd2d0cd, tie:0xc4c2bf, eye:'#3a3a3e', glasses:false, blush:'none',
};

// ══ 빌드 ══════════════════════════════════════════════════════════
export function buildAvatar(look, body = BODY_BASE, opts = {}){
  const {outline = true} = opts;
  const B = Object.assign({}, BODY_BASE, body);
  // 팔다리 굵기는 '몸집'을 따라간다. 다만 1:1 로 따라가면 통통한 체형에서
  // 팔다리가 몸통만큼 굵어져 실루엣이 뭉갠다 — 0.7 배만 반영한다.
  const limbR = 1 + (B.girth - 1) * 0.7;
  const hair = HAIR_STYLES.find(h => h.id === look.hairStyle) || HAIR_STYLES[0];
  const top  = TOPS.find(t => t.id === look.topStyle)         || TOPS[3];
  const bot  = BOTTOMS.find(b => b.id === look.bottomStyle)   || BOTTOMS[0];

  const M = {
    top:  toon(look.top),  bottom: toon(look.bottom), shoe: toon(look.shoe),
    skin: toon(look.skin), hair:   toon(look.hair),   glass: toon(0x17141a),
    trim: toon(look.trim ?? 0xe9ecf2), tie: toon(look.tie ?? 0x8e2b3a),
  };
  const owned = Object.values(M);

  const mkIn = (parent, geo, mat, pos=[0,0,0], rot=[0,0,0], scl=[1,1,1], out=0.055) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos); m.rotation.set(...rot); m.scale.set(...scl);
    m.castShadow = true; m.userData.mat = mat; parent.add(m);
    if (outline && out > 0){
      const o = new THREE.Mesh(geo, OUTLINE_MAT);
      o.position.set(...pos); o.rotation.set(...rot);
      o.scale.set(scl[0]*(1+out), scl[1]*(1+out), scl[2]*(1+out));
      o.userData.outline = true; parent.add(o);
    }
    return m;
  };
  const joint = (p, pos) => { const j = new THREE.Group(); j.position.set(...pos); p.add(j); return j; };

  const root  = new THREE.Group();
  const bodyG = new THREE.Group(); root.add(bodyG);
  const hips  = joint(bodyG, [0, hipY(B), 0]);
  const chest = joint(hips,  [0, CHEST_Y*B.torso, 0]);
  const neck  = joint(chest, [0, NECK_Y*B.torso, 0]);
  const head  = joint(neck,  [0, 0.30*B.head, 0]);

  // 몸통 — 작고 둥글게. 길이보다 반지름이 커서 캡슐이 거의 구로 읽힌다(SD).
  mkIn(chest, new THREE.CapsuleGeometry(TORSO_R*B.girth, 0.09*B.torso, 6, 24), M.top,
       [0, 0.01, 0], [0,0,0], [1, 1, TORSO_ZS], 0.045);

  // 앞면 장식의 z 는 전부 TORSO_Z 에서 잡는다. 몸통을 줄였을 때 옷만 공중에 뜨지 않게.
  const frontZ = (out = 0) => (TORSO_Z + out) * B.girth;

  if (top.extra === 'hood'){
    mkIn(chest, new THREE.SphereGeometry(0.30*B.girth, 20, 14, 0, Math.PI*2, 0, Math.PI*0.62),
         M.top, [0, 0.20*B.torso, -0.10], [-0.55,0,0], [1.05,0.9,1.0], 0.04);
    mkIn(chest, new THREE.BoxGeometry(0.30*B.girth, 0.15, 0.05), M.top, [0,-0.12, frontZ(0.02)], [0.05,0,0], [1,1,1], 0.035);
    for (const s of [-1,1]){
      mkIn(chest, new THREE.CapsuleGeometry(0.014, 0.15, 3, 8), M.top, [s*0.062, 0.04, frontZ(0.015)], [0.12,0,0], [1,1,1], 0.07);
      mkIn(chest, new THREE.BoxGeometry(0.03,0.045,0.03), M.tie, [s*0.062,-0.04, frontZ(0.03)], [0,0,0], [1,1,1], 0.06);
    }
  }
  if (top.extra === 'uniform'){
    // 칼라 + 넥타이.
    // SD 는 목이 없어서 머리 구가 몸통 위쪽을 덮는다(머리 밑면 = 가슴 + 0.10).
    // 칼라를 그 위에 두면 통째로 머리 속에 묻혀 안 보인다.
    for (const s of [-1,1])
      mkIn(chest, new THREE.BoxGeometry(0.13*B.girth, 0.11, 0.05), M.trim,
           [s*0.11*B.girth, 0.10*B.torso, frontZ()], [0.12, 0, s*0.42], [1,1,1], 0.045);
    mkIn(chest, new THREE.BoxGeometry(0.075, 0.26, 0.04), M.tie, [0, -0.02, frontZ(0.02)], [0.06,0,0], [1,1,1], 0.05);
  }

  // 머리
  const hd = B.head;
  mkIn(head, new THREE.SphereGeometry(0.44*hd, 26, 20), M.skin, [0,0,0], [0,0,0], [1,1,0.97], 0.05);
  for (const s of [-1,1])
    mkIn(head, new THREE.SphereGeometry(0.10*hd, 12, 10), M.skin,
         [s*0.415*hd, -0.03*hd, -0.02*hd], [0,0,0], [0.55,1.15,0.85], 0.05);

  if (look.glasses){
    // y = -0.065 는 faceTexture 의 눈 위치(캔버스 y=150)를 구면에 되돌린 값이다.
    // 눈을 옮기면 여기도 같이 옮겨야 한다 — 안경은 3D라 텍스처를 안 따라온다.
    const EYE_Y = -0.065*hd;
    for (const s of [-1,1]){
      mkIn(head, new THREE.TorusGeometry(0.125*hd, 0.021*hd, 8, 24), M.glass,
           [s*0.135*hd, EYE_Y, 0.415*hd], [0, s*0.32, 0], [1,1,1], 0.05);
      mkIn(head, new THREE.BoxGeometry(0.022, 0.022, 0.36*hd), M.glass,
           [s*0.335*hd, EYE_Y, 0.213*hd], [0, s*2.68, 0], [1,1,1], 0.05);
    }
    mkIn(head, new THREE.BoxGeometry(0.05,0.018,0.018), M.glass, [0, EYE_Y + 0.025*hd, 0.452*hd], [0,0,0], [1,1,1], 0.05);
  }

  const faceMat = new THREE.MeshToonMaterial({map:faceTexture(look), gradientMap:ramp,
    transparent:true, alphaTest:0.35, side:THREE.DoubleSide});
  mkIn(head, curvedPlane(0.447*hd, 96, 74), faceMat, [0, -0.015*hd, 0], [0,0,0], [1,1,1], 0);

  const hairG = new THREE.Group(); head.add(hairG);
  hair.build({group:hairG, hair:M.hair, hd,
              mk:(...a) => mkIn(hairG, ...a), mkIn});

  // 팔 — 어깨 → 팔꿈치 → 손목 → 손 소켓
  const upperMat = top.sleeve === 'none' ? M.skin : M.top;
  const foreMat  = top.sleeve === 'long' ? M.top  : M.skin;
  // 팔은 짧고 굵게. 어깨 x 는 이 아바타의 실제 몸통·팔 굵기에서 매번 계산한다 —
  // 모듈 상수로 두면 몸집을 올렸을 때 몸통만 굵어지고 팔이 다시 옆구리에 파묻힌다
  // (girth 1.32 에서 0.076 파고들었다).
  const shoulderX = TORSO_R*B.girth + UPARM_R*limbR + ARM_GAP;
  const arm = sx => {
    const sh = joint(chest, [sx*shoulderX, 0.22*B.torso, 0]);
    mkIn(sh, new THREE.CapsuleGeometry(UPARM_R*limbR, 0.09, 5, 16), upperMat, [0,-0.085,0], [0,0,0], [1,1,1], 0.05);
    const el = joint(sh, [0,-0.17,0]);
    mkIn(el, new THREE.CapsuleGeometry(FOREARM_R*limbR, 0.07, 5, 16), foreMat, [0,-0.07,0], [0,0,0], [1,1,1], 0.05);
    const wr = joint(el, [0,-0.15,0]);
    mkIn(wr, new THREE.SphereGeometry(HAND_R*limbR, 14, 12), M.skin, [0,0,0], [0,0,0], [1,1,1], 0.05);
    const socket = new THREE.Object3D(); socket.position.set(0,-0.06,0.09); wr.add(socket);
    return {sh, el, wr, socket};
  };

  // 다리 — 치마는 골반에서 갈라지지 않으므로 한 장으로 hips에 붙인다 (RIG_4DIR.md 규칙)
  const thighMat = bot.legs === 'bare' ? M.skin : M.bottom;
  const shinMat  = bot.legs === 'full' ? M.bottom : M.skin;
  // 다리도 짧고 굵게. 두 다리 사이는 좁힌다 — SD 는 다리가 붙어 있어야 귀엽다.
  const leg = sx => {
    const hip = joint(hips, [sx*0.15*B.girth, 0, 0]);
    mkIn(hip, new THREE.CapsuleGeometry(THIGH_R*limbR, 0.07*B.legLen, 5, 16), thighMat, [0,-0.115*B.legLen,0], [0,0,0], [1,1,1], 0.045);
    const kn = joint(hip, [0,-THIGH*B.legLen,0]);
    mkIn(kn, new THREE.CapsuleGeometry(SHIN_R*limbR, 0.065*B.legLen, 5, 16), shinMat, [0,-0.11*B.legLen,0], [0,0,0], [1,1,1], 0.045);
    const ft = joint(kn, [0,-SHIN*B.legLen,0]);
    // 발도 봉제인형처럼 뭉툭하게 — 앞뒤로 길쭉하면 신발이 되고 둥글면 인형 발이 된다
    mkIn(ft, new THREE.CapsuleGeometry(FOOT_R*limbR, 0.09, 4, 14).rotateX(Math.PI/2), M.shoe, [0,-0.04,0.045], [0,0,0], [1,0.85,1.15], 0.05);
    return {hip, kn, ft};
  };
  const armL = arm(-1), armR = arm(1), legL = leg(-1), legR = leg(1);

  if (bot.skirt)
    mkIn(hips, new THREE.CylinderGeometry(0.24*B.girth, 0.40*B.girth, 0.28, 20, 1, true),
         M.bottom, [0,-0.10,0], [0,0,0], [1,1,0.9], 0.035).material.side = THREE.DoubleSide;

  root.scale.setScalar(RIG_SCALE * B.height);
  return {root, body:bodyG, hips, chest, neck, head, armL, armR, legL, legR,
          materials:M, owned, faceMat, look, bodyParams:B};
}

export function disposeAvatar(rig){
  if (!rig) return;
  rig.root.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
  rig.owned.forEach(m => m.dispose());
  if (rig.faceMat){ rig.faceMat.map && rig.faceMat.map.dispose(); rig.faceMat.dispose(); }
  rig.root.parent && rig.root.parent.remove(rig.root);
}

// ══ 애니메이션 ═════════════════════════════════════════════════════
// 하체 액션이 전신을 쓴 뒤, 상체 액션이 팔·목만 덮어쓴다(레이어 분리).
export const SEAT_Y = 0.40;
// 앉을 때 골반이 의자면에 오도록 루트를 올린다. 예전엔 0.80(골반)·0.75(스케일)가
// 그대로 박혀 있어서 비율을 바꾸면 엉덩이가 의자에서 떴다. 이제 상수에서 유도한다.
const SIT_LIFT = (SEAT_Y + 0.055) - hipY(BODY_BASE)*RIG_SCALE;

export function restPose(r){
  for (const l of [r.legL, r.legR]){ l.hip.rotation.set(0,0,0); l.kn.rotation.set(0,0,0); l.ft.rotation.set(0,0,0); }
  for (const a of [r.armL, r.armR]){ a.sh.rotation.set(0,0,0); a.el.rotation.set(0,0,0); a.wr.rotation.set(0,0,0); }
  r.body.position.set(0,0,0); r.body.rotation.set(0,0,0);
  r.hips.rotation.set(0,0,0); r.chest.rotation.set(0,0,0); r.neck.rotation.set(0,0,0);
  r.root.position.y = 0;
}

export const LOWER = {
  idle(r, t){
    const b = Math.sin(t*2.0);
    // z = 팔 벌림. 어깨가 몸통 바로 위에 있어서 이 각이 작으면 팔이 옆구리에 붙는다.
    r.armL.sh.rotation.set(0.05+b*0.03, 0,  0.17);
    r.armR.sh.rotation.set(0.05-b*0.03, 0, -0.17);
    r.armL.el.rotation.x = r.armR.el.rotation.x = -0.14;
    r.body.position.y = b*0.015;
    r.chest.rotation.y = b*0.03;
    r.neck.rotation.set(b*0.02, -b*0.03, b*0.02);
  },
  // 좌표 약속: 캐릭터는 +z 를 본다. hip.rotation.x 가 양수면 다리가 뒤로,
  // ft.rotation.x 가 양수면 발끝이 아래로 간다.
  walk(r, t){
    const p = t*7;
    const w = Math.sin(p);

    for (const [lg, s] of [[r.legL, 1], [r.legR, -1]]){
      const ws    = w*s;
      const swing = Math.max(0, -ws);      // 앞으로 내딛는 구간
      const push  = Math.max(0,  ws);      // 뒤로 미는 구간

      lg.hip.rotation.x = ws*0.62;
      // 디딤 다리도 0.10 은 굽혀 둔다. 완전히 편 다리로 번갈아 딛으면 죽마처럼 뻣뻣하다.
      lg.kn.rotation.x  = swing*0.95 + 0.10;
      // 발목이 무릎 굴곡을 '전부' 상쇄하면 발바닥이 늘 바닥과 평행이라, 딛는 게
      // 아니라 미끄러지는 것처럼 보인다. 일부만 상쇄하고 발끝을 굴린다.
      lg.ft.rotation.x  = -lg.kn.rotation.x*0.32   // 정강이를 일부만 따라간다
                          + push*0.44               // 토오프 — 발끝으로 민다
                          - swing*0.18;             // 힐스트라이크 — 발끝을 든다
    }

    r.armL.sh.rotation.set(-w*0.60, 0,  0.18);
    r.armR.sh.rotation.set( w*0.60, 0, -0.18);
    // 팔꿈치는 걷는 내내 조금 접혀 있고, 앞으로 나갈 때 더 접힌다.
    r.armL.el.rotation.x = -0.16 - Math.max(0,-w)*0.38;
    r.armR.el.rotation.x = -0.16 - Math.max(0, w)*0.38;

    // 상하 운동. 예전엔 sin(2p) 를 써서 한 걸음에 두 번 튀었다(보폭의 4배 주기).
    // 실제 보행은 다리가 벌어질 때(|w|=1) 골반이 가장 낮고, 두 다리가 모일 때 가장 높다.
    //
    // 0.085 는 눈대중이 아니라 리그 치수에서 푼 값이다. 이게 없으면 다리를 벌릴
    // 때마다 디딤발이 떠올라 미끄러지듯 보인다(편차 0.025 로 준다).
    // ⚠ 다리 마디(THIGH/SHIN)를 바꾸면 이 값도 다시 풀어야 한다.
    r.body.position.y = -Math.abs(w)*0.075;
    r.body.rotation.z = w*0.03;
    r.hips.rotation.y = w*0.13; r.hips.rotation.z = -w*0.04;   // 좌우 체중 이동
    r.chest.rotation.y = -w*0.09;
    r.neck.rotation.z = -w*0.03;
  },
  run(r, t){
    const w = Math.sin(t*11);
    for (const [lg, s] of [[r.legL, 1], [r.legR, -1]]){
      const ws    = w*s;
      const swing = Math.max(0, -ws);
      const push  = Math.max(0,  ws);
      lg.hip.rotation.x = ws*1.05 + 0.18;
      lg.kn.rotation.x  = swing*1.55 + 0.30;
      lg.ft.rotation.x  = -lg.kn.rotation.x*0.30 + push*0.55 - swing*0.20;
    }
    r.armL.sh.rotation.set(-w*0.95, 0,  0.22);
    r.armR.sh.rotation.set( w*0.95, 0, -0.22);
    r.armL.el.rotation.x = r.armR.el.rotation.x = -1.15;
    // 달리기는 두 발이 다 뜨는 구간이 있어 걷기와 반대로 벌어질 때 몸이 뜬다.
    r.body.position.y = Math.abs(w)*0.05;
    r.body.rotation.z = w*0.03;
    r.hips.rotation.y = w*0.17;
    r.chest.rotation.x = -0.30; r.chest.rotation.y = -w*0.12;
    r.neck.rotation.x = 0.22;
  },
  sit(r, t){
    const b = Math.sin(t*1.7);
    for (const l of [r.legL, r.legR]){ l.hip.rotation.x = -1.50; l.kn.rotation.x = 1.42; l.ft.rotation.x = 0.16; }
    r.legL.hip.rotation.z = 0.09; r.legR.hip.rotation.z = -0.09;
    r.armL.sh.rotation.set(0.55, 0,  0.22); r.armL.el.rotation.x = -0.55;
    r.armR.sh.rotation.set(0.55, 0, -0.22); r.armR.el.rotation.x = -0.55;
    r.chest.rotation.x = 0.10 + b*0.015;
    r.neck.rotation.x = -0.06;
    r.root.position.y = SIT_LIFT * r.bodyParams.height;
  },
};

export const UPPER = {
  none(){},
  // 대두라 팔이 머리 위로 못 올라간다. 옆으로 벌리고 팔꿈치를 접어 손을 머리 옆에.
  wave(r, t){
    const s = Math.sin(t*7);
    r.armR.sh.rotation.set(-0.10, 0, 1.55);
    r.armR.el.rotation.set(0, 0, 1.05 + s*0.12);
    r.armR.wr.rotation.z = s*0.55;
    r.neck.rotation.z = -0.05;
  },
  bow(r, t){
    const p = (Math.sin(t*1.6) + 1)/2;
    r.chest.rotation.x = 0.42*p;
    r.neck.rotation.x  = 0.22*p;
    r.armL.sh.rotation.set(0.30*p, 0,  0.16); r.armL.el.rotation.x = -0.30*p;
    r.armR.sh.rotation.set(0.30*p, 0, -0.16); r.armR.el.rotation.x = -0.30*p;
  },
  // 물건 건네기 — 손 소켓에 붙은 물건이 팔을 따라온다
  offer(r, t){
    const e = (Math.sin(t*1.5 - Math.PI/2) + 1)/2;
    r.armR.sh.rotation.set(-1.25*e, 0, -0.16 - 0.16*e);
    r.armR.el.rotation.x = -0.95 + 0.80*e;
    r.armR.wr.rotation.x = -0.30*e;
    r.chest.rotation.y = -0.16*e;
    r.neck.rotation.y  = -0.10*e;
  },
};

export function poseAvatar(rig, lower, upper, t){
  restPose(rig);
  (LOWER[lower] || LOWER.idle)(rig, t);
  (UPPER[upper] || UPPER.none)(rig, t);
}

// ══ 저장값 검증 ══════════════════════════════════════════════════
//  저장/불러오기 구현은 store.js가 갖는다(여긴 순수 함수만).
//  저장값은 사용자가 손댈 수 있고 버전이 밀릴 수도 있으므로 읽을 때 반드시 정화한다.
const isColor = v => Number.isInteger(v) && v >= 0 && v <= 0xffffff;

export function sanitizeCharacter(raw){
  if (!raw || typeof raw !== 'object') return null;
  const src = raw.look || {}, srcB = raw.body || {};
  const pickId = (list, v, fb) => list.some(x => x.id === v) ? v : fb;

  const look = {
    hairStyle:   pickId(HAIR_STYLES, src.hairStyle,   DEFAULT_LOOK.hairStyle),
    topStyle:    pickId(TOPS,        src.topStyle,    DEFAULT_LOOK.topStyle),
    bottomStyle: pickId(BOTTOMS,     src.bottomStyle, DEFAULT_LOOK.bottomStyle),
    glasses: !!src.glasses,
    eye: (typeof src.eye === 'string' && /^#[0-9a-f]{3,8}$/i.test(src.eye)) ? src.eye : DEFAULT_LOOK.eye,
  };
  for (const k of ['skin','hair','top','bottom','shoe','trim','tie'])
    look[k] = isColor(src[k]) ? src[k] : DEFAULT_LOOK[k];
  for (const k of ['brow','mouth','blush']) if (typeof src[k] === 'string') look[k] = src[k];

  // ⚠ Kenney(GLB) 캐릭터의 필드를 여기서 흘리면 안 된다.
  //   이 함수는 예전 코드-아바타 시절 필드만 화이트리스트로 통과시키는데,
  //   그 뒤로 model·colors·aid 가 생겼다. 걸러 버리면 **저장은 됐는데 읽을 때
  //   사라져** 새로고침마다 기본 캐릭터로 돌아간다.
  //   값의 유효성은 avatar-kenney 가 볼 때 판단한다(모르는 id 는 무시하고 기본값).
  //   여기서는 모양만 본다 — 남의 문서에서 온 값이 그대로 DOM 에 닿지 않게.
  if (typeof src.model === 'string' && /^[a-z]+-[a-z]$/.test(src.model)) look.model = src.model;
  if (typeof src.aid === 'string' && /^[a-z]+$/.test(src.aid)) look.aid = src.aid;
  if (src.colors && typeof src.colors === 'object' && !Array.isArray(src.colors)){
    const colors = {};
    for (const [k, v] of Object.entries(src.colors))
      if (/^[a-z]+$/.test(k) && typeof v === 'string' && /^[a-z]+$/.test(v)) colors[k] = v;
    if (Object.keys(colors).length) look.colors = colors;
  }

  const body = Object.assign({}, BODY_BASE);
  for (const [key,, min, max] of BODY_SLIDERS){
    const v = +srcB[key];
    body[key] = Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : 1;
  }
  return {look, body};
}
