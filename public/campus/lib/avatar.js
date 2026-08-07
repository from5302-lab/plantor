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
import * as THREE from 'three';

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
  const eye = x => {
    g.fillStyle = '#241c22'; g.beginPath(); g.ellipse(x,132,20,26,0,0,7); g.fill();
    g.fillStyle = look.eye;  g.beginPath(); g.ellipse(x,138,13,17,0,0,7); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x-6,124,6,7,0,0,7); g.fill();
  };
  eye(88); eye(168);

  // 안경테 윗림이 텍스처 y≈76에 걸린다. 굵은 눈썹은 반드시 그 위(y<74)에.
  if (look.brow === 'thick'){
    g.fillStyle = '#141118';
    for (const s of [-1, 1]){
      const xo = 128 + s*88, xi = 128 + s*16;
      g.beginPath(); g.moveTo(xo,44); g.lineTo(xi,56); g.lineTo(xi,74); g.lineTo(xo,62); g.closePath(); g.fill();
    }
  } else {
    g.strokeStyle = '#241c22'; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(66,96);  g.lineTo(106,90); g.stroke();
    g.beginPath(); g.moveTo(150,90); g.lineTo(190,96); g.stroke();
  }

  if (look.blush === 'hatch'){
    g.strokeStyle = 'rgba(206,122,110,.62)'; g.lineWidth = 3.4; g.lineCap = 'round';
    for (const s of [-1,1]) for (let i = 0; i < 4; i++){
      const x = 128 + s*(52 + i*9);
      g.beginPath(); g.moveTo(x-6,176); g.lineTo(x+6,160); g.stroke();
    }
  } else {
    g.fillStyle = 'rgba(232,120,120,.34)';
    g.beginPath(); g.ellipse(58,170,17,10,0,0,7); g.fill();
    g.beginPath(); g.ellipse(198,170,17,10,0,0,7); g.fill();
  }

  g.strokeStyle = '#3a2029'; g.lineWidth = 7; g.lineCap = 'round';
  if (look.mouth === 'flat'){ g.beginPath(); g.moveTo(106,184); g.lineTo(150,184); g.stroke(); }
  else { g.beginPath(); g.arc(128,178,17,0.25,Math.PI-0.25); g.stroke(); }

  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ══ ① 체형 ════════════════════════════════════════════════════════
export const BODY_BASE = {height:1, head:1, girth:1, shoulder:1, limb:1, legLen:1, armLen:1, torso:1};
export const BODY_SLIDERS = [
  ['height',  '키',         0.80, 1.25],
  ['head',    '머리 크기',   0.78, 1.24],
  ['girth',   '몸통 둘레',   0.78, 1.32],
  ['shoulder','어깨 너비',   0.80, 1.30],
  ['limb',    '팔다리 굵기', 0.75, 1.30],
  ['legLen',  '다리 길이',   0.80, 1.25],
  ['armLen',  '팔 길이',     0.82, 1.20],
  ['torso',   '상체 길이',   0.85, 1.18],
];

// 골반 높이는 다리 길이에서 유도한다. 안 그러면 발이 뜨거나 바닥에 파묻힌다.
export const hipY   = B => (0.35 + 0.33)*B.legLen + 0.12;
export const topY   = B => hipY(B) + 0.70*B.torso + 0.74*B.head;
export const headsRatio = B => topY(B) / (0.88*B.head);
export const heightM    = B => topY(B) * 0.75 * B.height;

// 키·몸무게 → 체형. BMI는 둘레 계열을, 키는 비율 계열을 민다.
// ⚠ 청소년은 성인 BMI 기준이 안 맞는다. 실제 제품은 질병관리청
//    소아·청소년 성장도표의 BMI 백분위수를 써야 한다.
export function fromMeasurements(H, W, bmiRef = 20.5){
  const bmi = W / Math.pow(H/100, 2);
  const r = bmi / bmiRef, h = H / 165;
  const cl = (v, k) => { const s = BODY_SLIDERS.find(x => x[0] === k);
                         return +THREE.MathUtils.clamp(v, s[2], s[3]).toFixed(3); };
  const B = Object.assign({}, BODY_BASE, {
    head:     cl(1 - (h-1)*0.85, 'head'),
    girth:    cl(1 + (r-1)*1.15, 'girth'),
    limb:     cl(1 + (r-1)*0.85, 'limb'),
    shoulder: cl(1 + (r-1)*0.45, 'shoulder'),
    legLen:   cl(1 + (h-1)*0.90, 'legLen'),
    armLen:   cl(1 + (h-1)*0.50, 'armLen'),
    torso:    cl(1 + (h-1)*0.20, 'torso'),
  });
  // SD 키는 실제 키 편차를 60%만 반영한다. 1:1이면 등신 비율이 무너진다.
  B.height = cl((1.68 * (1 + (h-1)*0.6)) / (topY(B) * 0.75), 'height');
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

// ══ 빌드 ══════════════════════════════════════════════════════════
export function buildAvatar(look, body = BODY_BASE, opts = {}){
  const {outline = true} = opts;
  const B = Object.assign({}, BODY_BASE, body);
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
  const chest = joint(hips,  [0, 0.30*B.torso, 0]);
  const neck  = joint(chest, [0, 0.40*B.torso, 0]);
  const head  = joint(neck,  [0, 0.30*B.head, 0]);

  // 몸통
  mkIn(chest, new THREE.CapsuleGeometry(0.33*B.girth, 0.22*B.torso, 6, 24), M.top,
       [0, 0.02, 0], [0,0,0], [1, 1, 0.84], 0.045);

  if (top.extra === 'hood'){
    mkIn(chest, new THREE.SphereGeometry(0.30*B.girth, 20, 14, 0, Math.PI*2, 0, Math.PI*0.62),
         M.top, [0, 0.30*B.torso, -0.10], [-0.55,0,0], [1.05,0.9,1.0], 0.04);
    mkIn(chest, new THREE.BoxGeometry(0.40*B.girth, 0.19, 0.05), M.top, [0,-0.15,0.29*B.girth], [0.05,0,0], [1,1,1], 0.035);
    for (const s of [-1,1]){
      mkIn(chest, new THREE.CapsuleGeometry(0.016, 0.19, 3, 8), M.top, [s*0.075, 0.10, 0.285*B.girth], [0.12,0,0], [1,1,1], 0.07);
      mkIn(chest, new THREE.BoxGeometry(0.035,0.05,0.035), M.tie, [s*0.075,-0.01, 0.30*B.girth], [0,0,0], [1,1,1], 0.06);
    }
  }
  if (top.extra === 'uniform'){
    // 칼라 + 넥타이
    for (const s of [-1,1])
      mkIn(chest, new THREE.BoxGeometry(0.16*B.girth, 0.16, 0.05), M.trim,
           [s*0.11*B.girth, 0.22*B.torso, 0.26*B.girth], [0.12, 0, s*0.42], [1,1,1], 0.045);
    mkIn(chest, new THREE.BoxGeometry(0.075, 0.30, 0.045), M.tie, [0, 0.02, 0.29*B.girth], [0.06,0,0], [1,1,1], 0.05);
  }

  // 머리
  const hd = B.head;
  mkIn(head, new THREE.SphereGeometry(0.44*hd, 26, 20), M.skin, [0,0,0], [0,0,0], [1,1,0.97], 0.05);
  for (const s of [-1,1])
    mkIn(head, new THREE.SphereGeometry(0.10*hd, 12, 10), M.skin,
         [s*0.415*hd, -0.03*hd, -0.02*hd], [0,0,0], [0.55,1.15,0.85], 0.05);

  if (look.glasses){
    for (const s of [-1,1]){
      mkIn(head, new THREE.TorusGeometry(0.125*hd, 0.021*hd, 8, 24), M.glass,
           [s*0.135*hd, -0.01*hd, 0.415*hd], [0, s*0.32, 0], [1,1,1], 0.05);
      mkIn(head, new THREE.BoxGeometry(0.022, 0.022, 0.36*hd), M.glass,
           [s*0.335*hd, -0.01*hd, 0.213*hd], [0, s*2.68, 0], [1,1,1], 0.05);
    }
    mkIn(head, new THREE.BoxGeometry(0.05,0.018,0.018), M.glass, [0, 0.015*hd, 0.452*hd], [0,0,0], [1,1,1], 0.05);
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
  const arm = sx => {
    const sh = joint(chest, [sx*0.345*B.shoulder, 0.28*B.torso, 0]);
    mkIn(sh, new THREE.CapsuleGeometry(0.115*B.limb, 0.15*B.armLen, 5, 16), upperMat, [0,-0.14*B.armLen,0], [0,0,0], [1,1,1], 0.05);
    const el = joint(sh, [0,-0.27*B.armLen,0]);
    mkIn(el, new THREE.CapsuleGeometry(0.102*B.limb, 0.12*B.armLen, 5, 16), foreMat, [0,-0.12*B.armLen,0], [0,0,0], [1,1,1], 0.05);
    const wr = joint(el, [0,-0.235*B.armLen,0]);
    mkIn(wr, new THREE.SphereGeometry(0.113*B.limb, 14, 12), M.skin, [0,0,0], [0,0,0], [1,1,1], 0.05);
    const socket = new THREE.Object3D(); socket.position.set(0,-0.06,0.09); wr.add(socket);
    return {sh, el, wr, socket};
  };

  // 다리 — 치마는 골반에서 갈라지지 않으므로 한 장으로 hips에 붙인다 (RIG_4DIR.md 규칙)
  const thighMat = bot.legs === 'bare' ? M.skin : M.bottom;
  const shinMat  = bot.legs === 'full' ? M.bottom : M.skin;
  const leg = sx => {
    const hip = joint(hips, [sx*0.17*B.girth, 0, 0]);
    mkIn(hip, new THREE.CapsuleGeometry(0.145*B.limb, 0.11*B.legLen, 5, 16), thighMat, [0,-0.15*B.legLen,0], [0,0,0], [1,1,1], 0.045);
    const kn = joint(hip, [0,-0.35*B.legLen,0]);
    mkIn(kn, new THREE.CapsuleGeometry(0.132*B.limb, 0.11*B.legLen, 5, 16), shinMat, [0,-0.13*B.legLen,0], [0,0,0], [1,1,1], 0.045);
    const ft = joint(kn, [0,-0.33*B.legLen,0]);
    mkIn(ft, new THREE.CapsuleGeometry(0.12*B.limb, 0.10, 4, 14).rotateX(Math.PI/2), M.shoe, [0,-0.05,0.06], [0,0,0], [1,0.85,1.3], 0.05);
    return {hip, kn, ft};
  };
  const armL = arm(-1), armR = arm(1), legL = leg(-1), legR = leg(1);

  if (bot.skirt)
    mkIn(hips, new THREE.CylinderGeometry(0.22*B.girth, 0.36*B.girth, 0.40, 20, 1, true),
         M.bottom, [0,-0.10,0], [0,0,0], [1,1,0.9], 0.035).material.side = THREE.DoubleSide;

  root.scale.setScalar(0.75 * B.height);
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
const SIT_LIFT = (SEAT_Y + 0.055) - 0.80*0.75;

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
    r.armL.sh.rotation.set(0.05+b*0.03, 0,  0.13);
    r.armR.sh.rotation.set(0.05-b*0.03, 0, -0.13);
    r.armL.el.rotation.x = r.armR.el.rotation.x = -0.14;
    r.body.position.y = b*0.015;
    r.chest.rotation.y = b*0.03;
    r.neck.rotation.set(b*0.02, -b*0.03, b*0.02);
  },
  walk(r, t){
    const w = Math.sin(t*7), w2 = Math.sin(t*14);
    r.legL.hip.rotation.x =  w*0.66; r.legR.hip.rotation.x = -w*0.66;
    r.legL.kn.rotation.x = Math.max(0,-w)*1.00;
    r.legR.kn.rotation.x = Math.max(0, w)*1.00;
    r.legL.ft.rotation.x = -r.legL.kn.rotation.x*0.45 - w*0.10;
    r.legR.ft.rotation.x = -r.legR.kn.rotation.x*0.45 + w*0.10;
    r.armL.sh.rotation.set(-w*0.55, 0,  0.10);
    r.armR.sh.rotation.set( w*0.55, 0, -0.10);
    r.armL.el.rotation.x = -Math.max(0,-w)*0.45;
    r.armR.el.rotation.x = -Math.max(0, w)*0.45;
    r.body.position.y = Math.abs(w2)*0.026;
    r.body.rotation.z = w*0.02;
    r.hips.rotation.y = w*0.11; r.chest.rotation.y = -w*0.07;
    r.neck.rotation.z = -w*0.03;
  },
  run(r, t){
    const w = Math.sin(t*11), w2 = Math.sin(t*22);
    r.legL.hip.rotation.x =  w*1.05 + 0.18; r.legR.hip.rotation.x = -w*1.05 + 0.18;
    r.legL.kn.rotation.x = Math.max(0,-w)*1.55 + 0.30;
    r.legR.kn.rotation.x = Math.max(0, w)*1.55 + 0.30;
    r.legL.ft.rotation.x = -r.legL.kn.rotation.x*0.40 - w*0.12;
    r.legR.ft.rotation.x = -r.legR.kn.rotation.x*0.40 + w*0.12;
    r.armL.sh.rotation.set(-w*0.95, 0,  0.17);
    r.armR.sh.rotation.set( w*0.95, 0, -0.17);
    r.armL.el.rotation.x = r.armR.el.rotation.x = -1.15;
    r.body.position.y = Math.abs(w2)*0.075;
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
    r.root.position.y = SIT_LIFT * (0.75 * r.bodyParams.height) / 0.75;
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

  const body = Object.assign({}, BODY_BASE);
  for (const [key,, min, max] of BODY_SLIDERS){
    const v = +srcB[key];
    body[key] = Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : 1;
  }
  return {look, body};
}
