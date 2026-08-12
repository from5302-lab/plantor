// ══════════════════════════════════════════════════════════════════
//  하늘 — 그라디언트 · 구름 · 별 · 달, 그리고 **진짜 시각**에 따른 낮과 밤.
//
//  Kenney 50팩에는 하늘 에셋이 하나도 없다(전부 지상 키트다). 그래서 직접
//  만들되 같은 화법을 지킨다: 구름은 구를 몇 개 뭉친 저폴리 덩어리고,
//  별은 점이며, 달은 원반이다. 텍스처는 안 쓴다.
//
//  시각은 시계탑과 **같은 시계**(이 컴퓨터의 Date)를 본다. 게임 안 시간을
//  따로 두면 창밖과 어긋나서, 밤에 접속했는데 화면만 대낮인 일이 생긴다.
// ══════════════════════════════════════════════════════════════════
import * as THREE from 'three';

//  하루의 색. [위, 중간, 지평선] — 지평선 색이 곧 안개 색이다.
//  경계는 '태양 고도'가 아니라 시각으로 잡는다. 위도별 일출·일몰을 흉내 내는
//  것보다, 아이가 아는 '아침·낮·저녁·밤'에 맞추는 편이 읽힌다.
const PHASES = [
  {h: 0,  top:0x0b1a3a, mid:0x14294d, low:0x24405e, night:1},
  {h: 5,  top:0x1e3a5f, mid:0x3c5f7d, low:0x8d7f86, night:0.75},
  {h: 7,  top:0x7fb6e6, mid:0xbcd9ea, low:0xf6e3cf, night:0.15},
  {h: 10, top:0x9fd2f2, mid:0xcfe6f2, low:0xf2f6ee, night:0},
  {h: 16, top:0x9fd2f2, mid:0xcfe6f2, low:0xf2f6ee, night:0},
  {h: 18, top:0x6fa8d8, mid:0xd8b9a8, low:0xf3cfa8, night:0.2},
  {h: 20, top:0x2c3f6b, mid:0x6a5170, low:0xc07a72, night:0.65},
  {h: 22, top:0x0b1a3a, mid:0x14294d, low:0x24405e, night:1},
  {h: 24, top:0x0b1a3a, mid:0x14294d, low:0x24405e, night:1},
];

const lerpHex = (a, b, t) => {
  const r = Math.round((a >> 16 & 255) + ((b >> 16 & 255) - (a >> 16 & 255)) * t);
  const g = Math.round((a >> 8 & 255) + ((b >> 8 & 255) - (a >> 8 & 255)) * t);
  const c = Math.round((a & 255) + ((b & 255) - (a & 255)) * t);
  return (r << 16) | (g << 8) | c;
};

/** 지금 시각의 하늘 색. hour 는 0~24 소수 */
export function skyAt(hour){
  let i = 0;
  while (i < PHASES.length - 2 && PHASES[i + 1].h <= hour) i++;
  const a = PHASES[i], b = PHASES[i + 1];
  const t = Math.min(1, Math.max(0, (hour - a.h) / (b.h - a.h)));
  return {
    top: lerpHex(a.top, b.top, t),
    mid: lerpHex(a.mid, b.mid, t),
    low: lerpHex(a.low, b.low, t),
    night: a.night + (b.night - a.night) * t,
  };
}

export const nowHour = () => {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
};

// ── 배경 그라디언트 ─────────────────────────────────────────────────
//  세로 128px 짜리 캔버스 한 장이면 충분하다. 색이 바뀔 때만 다시 그린다.
export function makeSkyTexture(){
  const c = document.createElement('canvas');
  c.width = 8; c.height = 128;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const hex = v => '#' + v.toString(16).padStart(6, '0');
  return {
    texture: tex,
    paint(s){
      const g = c.getContext('2d');
      const grd = g.createLinearGradient(0, 0, 0, 128);
      grd.addColorStop(0, hex(s.top));
      grd.addColorStop(0.62, hex(s.mid));
      grd.addColorStop(1, hex(s.low));
      g.fillStyle = grd; g.fillRect(0, 0, 8, 128);
      tex.needsUpdate = true;
    },
  };
}

// ── 구름·별·달 ──────────────────────────────────────────────────────
//  전부 **카메라를 따라다니는 돔** 안에 있다. 걸어가도 하늘이 뒤로 밀리지 않게.
//  ⚠ 곡면 셰이더(bend)를 태우면 안 된다 — 그건 땅을 말아 내리는 장치라
//    하늘까지 걸면 구름이 지평선 아래로 꺼진다.
const RND = (seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647)(20260812);

function cloudBlob(){
  //  구 대여섯 개를 겹쳐 하나로 합친다. 낱개로 두면 드로우콜이 늘고
  //  반투명 정렬이 매 프레임 바뀌어 깜빡인다.
  const g = new THREE.Group();
  const n = 4 + Math.floor(RND() * 3);
  for (let i = 0; i < n; i++){
    const r = 2.6 + RND() * 2.2;
    const m = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 1),          // 저폴리 — 각이 살아야 톤이 맞는다
      null);
    m.position.set((i - n / 2) * 3.4 + RND() * 1.4, RND() * 1.2, RND() * 2.2 - 1.1);
    m.scale.y = 0.62;
    g.add(m);
  }
  return g;
}

/**
 * 하늘을 만든다. scene 에 붙이고, 프레임마다 update(camera, dt) 를 부른다.
 * 실내에서는 visible=false 로 꺼 둔다(별이 천장을 뚫고 보이면 안 된다).
 */
export function createSky(scene){
  const root = new THREE.Group();
  root.renderOrder = -1;
  scene.add(root);

  const cloudMat = new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true,
                                                opacity: 0.9, depthWrite: false, fog: false});
  const clouds = [];
  for (let i = 0; i < 9; i++){
    const b = cloudBlob();
    b.traverse(o => { if (o.isMesh) o.material = cloudMat; });
    const a = RND() * Math.PI * 2, r = 52 + RND() * 34;
    b.position.set(Math.cos(a) * r, 24 + RND() * 12, Math.sin(a) * r);
    b.userData.drift = 0.35 + RND() * 0.5;
    root.add(b);
    clouds.push(b);
  }

  // 별 — 돔 위쪽 절반에만 뿌린다. 지평선 아래 별은 땅 밑에서 뜬 것처럼 보인다.
  const starN = 260, pos = new Float32Array(starN * 3);
  for (let i = 0; i < starN; i++){
    const a = RND() * Math.PI * 2, y = 0.18 + RND() * 0.8, r = 120;
    const rr = Math.sqrt(Math.max(0, 1 - y * y));
    pos[i*3] = Math.cos(a) * rr * r; pos[i*3+1] = y * r; pos[i*3+2] = Math.sin(a) * rr * r;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const starMat = new THREE.PointsMaterial({color: 0xffffff, size: 1.15,
                                            transparent: true, opacity: 0, fog: false,
                                            sizeAttenuation: true, depthWrite: false});
  const stars = new THREE.Points(starGeo, starMat);
  root.add(stars);

  // 달 — 원반 하나. 밤에만 뜬다.
  const moonMat = new THREE.MeshBasicMaterial({color: 0xfdf6d8, transparent: true,
                                               opacity: 0, fog: false, depthWrite: false});
  const moon = new THREE.Mesh(new THREE.CircleGeometry(3.4, 28), moonMat);
  moon.position.set(-58, 62, -78);
  root.add(moon);

  const sky = makeSkyTexture();
  let painted = -1;

  return {
    root, texture: sky.texture, hour: nowHour(),
    /** @returns {{low:number, night:number}} 안개 색·밤 정도 (호출자가 조명에 쓴다) */
    update(camera, dt, visible){
      root.visible = visible;
      const h = nowHour();
      this.hour = h;                    // 해의 방향을 map.js 가 이 값으로 돌린다
      const s = skyAt(h);
      // 1분 단위로만 다시 칠한다 — 프레임마다 캔버스를 다시 그릴 이유가 없다
      const key = Math.floor(h * 60);
      if (key !== painted){ sky.paint(s); painted = key; }

      root.position.set(camera.position.x, 0, camera.position.z);
      for (const c of clouds){
        c.position.x += c.userData.drift * dt;
        if (c.position.x > 95) c.position.x = -95;
        c.lookAt(camera.position.x, c.position.y, camera.position.z + 60);
      }
      cloudMat.opacity = 0.9 - s.night * 0.55;
      cloudMat.color.setHex(lerpHex(0xffffff, 0x6a7ba8, s.night));
      starMat.opacity = Math.max(0, s.night - 0.35) * 1.4;
      moonMat.opacity = Math.max(0, s.night - 0.25) * 1.2;
      moon.lookAt(camera.position);
      return s;
    },
  };
}
