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

  //  별 — **지평선 바로 위부터, 낮은 하늘에 몰아** 뿌린다. 부감 카메라에서
  //  보이는 하늘은 지평선 위 몇 도짜리 띠뿐이라, 반구에 고르게 뿌리면 개수를
  //  아무리 올려도 화면에는 몇십 개다(960개일 때 실측 ~15개). pow 곡선으로
  //  절반쯤을 보이는 띠 안에 내려놓는다.
  //  반짝임 — 점마다 흔들려면 셰이더가 필요하다. 대신 **4개 그룹**으로 나눠
  //  그룹 밝기를 어긋난 위상으로 흔든다. 그룹이 공간에 고루 섞여 있어
  //  눈에는 낱개가 깜빡이는 것으로 읽힌다. 크기도 그룹마다 달리해 깊이를 준다.
  const starN = 2200, STAR_GROUPS = 4;
  const starBuckets = Array.from({length: STAR_GROUPS}, () => []);
  for (let i = 0; i < starN; i++){
    const a = RND() * Math.PI * 2, y = 0.04 + 0.9 * Math.pow(RND(), 2.2), r = 120;
    const rr = Math.sqrt(Math.max(0, 1 - y * y));
    starBuckets[i % STAR_GROUPS].push(Math.cos(a) * rr * r, y * r, Math.sin(a) * rr * r);
  }
  const starMats = starBuckets.map((b, gi) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b), 3));
    const mat = new THREE.PointsMaterial({color: 0xffffff, size: 1.1 + gi * 0.3,
                                          transparent: true, opacity: 0, fog: false,
                                          sizeAttenuation: true, depthWrite: false});
    mat.userData = {phase: RND() * Math.PI * 2, speed: 0.9 + RND() * 1.6};
    root.add(new THREE.Points(geo, mat));
    return mat;
  });
  let twinkleT = 0;

  //  해와 달 — **같은 궤도를 반나절씩 나눠 탄다.** 해는 6시 동쪽에서 떠 18시
  //  서쪽으로, 달은 18시에 떠 6시에 진다. 카메라가 북쪽을 보므로 궤도는 북쪽
  //  하늘에 걸어야 보인다(진짜 태양은 남쪽을 지나지만, 안 보이는 천문학적 정확성
  //  보다 보이는 해가 낫다).
  const sunMat = new THREE.MeshBasicMaterial({color: 0xffe9a8, transparent: true,
                                              opacity: 0, fog: false, depthWrite: false});
  const sun = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32), sunMat);
  root.add(sun);
  //  달 — **오늘 날짜의 위상**을 그린다. 삭망월 29.5306일, 기준 삭은
  //  2000-01-06 18:14 UTC. 위상은 하루에 12°씩 도니 시간 단위로만 다시 그린다.
  //  초승·상현은 오른쪽이 밝고(북반구), 보름은 꽉 차고, 그믐밤엔 거의 안 보인다 —
  //  그날 진짜 하늘과 같은 모양이다.
  const moonCv = document.createElement('canvas');
  moonCv.width = moonCv.height = 128;
  const moonTex = new THREE.CanvasTexture(moonCv);
  moonTex.colorSpace = THREE.SRGBColorSpace;
  const moonPhase = () => {
    const SYNODIC = 29.530588853;
    const epoch = Date.UTC(2000, 0, 6, 18, 14) / 86400000;
    const d = Date.now() / 86400000 - epoch;
    return ((d / SYNODIC) % 1 + 1) % 1;          // 0 = 삭, 0.5 = 보름
  };
  function paintMoon(){
    const g = moonCv.getContext('2d'), c = 64, R = 58;
    g.clearRect(0, 0, 128, 128);
    const p = moonPhase();
    const waxing = p < 0.5;                       // 차오르는 달 = 오른쪽이 밝다
    const k = Math.cos(2 * Math.PI * p);          // 명암 경계선의 볼록함
    g.fillStyle = '#fdf6d8';
    g.beginPath();
    g.arc(c, c, R, -Math.PI/2, Math.PI/2, !waxing);
    g.ellipse(c, c, Math.abs(k) * R, R, 0, Math.PI/2, -Math.PI/2, (k < 0) === waxing);
    g.fill();
    moonTex.needsUpdate = true;
  }
  paintMoon();
  const moonMat = new THREE.MeshBasicMaterial({map: moonTex, transparent: true,
                                               opacity: 0, fog: false, depthWrite: false});
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), moonMat);
  root.add(moon);
  //  t: 0(뜸) → 1(짐). 동쪽(+x)→북쪽(−z)→서쪽(−x)으로 **지평선을 따라** 돈다.
  //  ⚠ 반원 궤도로 하늘 높이 올리면 안 된다. 이 카메라(부감 12°, 반시야 15°)에서
  //    보이는 하늘은 지평선 위 0~3° 띠뿐이라, 고도 24° 달은 화면 위로 지나가
  //    영영 안 보였다(실측). 높이를 지평선에 고정하고 방위만 돈다 —
  //    정오의 해는 북쪽 정면, 저녁 해는 서쪽 끝에 걸린다.
  //  방위도 압축한다. 가로 반시야가 ~17° 라 정북 ±17° 만 보이는데, 동→서 180° 를
  //  다 돌면 해가 화면을 스치는 건 정오 언저리 두 시간뿐이다. ±40° 로 눌러
  //  낮 9시~15시(달은 21시~03시)에는 화면 안에 있게 한다. 뜨고 질 때는
  //  가장자리 밖 — 뜨는 해를 보려면 카메라를 돌리면 된다(J/K).
  //  높이는 **하늘 띠 안에 띄운다.** 보이는 하늘은 지평선 위 0~3° 띠다
  //  (카메라 눈높이 ~5m, 거리 100m 기준 y 5~10.2). 그 가운데 y 8.7 에 두면
  //  아래로 지평선에 안 닿고 위로 화면 밖에 안 나간다. 크기도 띠에 맞춘다.
  const orbit = (mesh, t) => {
    const a = (0.5 + (t - 0.5) * 0.45) * Math.PI;
    mesh.position.set(Math.cos(a) * 100, 8.7, -Math.sin(a) * 100);
  };

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
      if (key !== painted){ sky.paint(s); paintMoon(); painted = key; }

      root.position.set(camera.position.x, 0, camera.position.z);
      for (const c of clouds){
        c.position.x += c.userData.drift * dt;
        if (c.position.x > 95) c.position.x = -95;
        c.lookAt(camera.position.x, c.position.y, camera.position.z + 60);
      }
      cloudMat.opacity = 0.9 - s.night * 0.55;
      cloudMat.color.setHex(lerpHex(0xffffff, 0x6a7ba8, s.night));
      //  별 밀도 곡선 — 초저녁(19시)부터 늘어 **자정에 절정**, 새벽 6시에 0.
      //  먼동은 PHASES(5→7시)가 하늘색으로 그린다 — 별은 그 전에 물러난다.
      //  그룹을 문턱 순서로 깨워 '개수가 는다'로 보이게 한다(밝기만 올리면 안 는다).
      //  반짝임 — 그룹별 위상·속도로 밝기를 흔든다. 바닥은 0.68 로 받쳐
      //  전멸하는 그룹이 없게 한다(밤하늘이 통째로 숨 쉬면 고장처럼 보인다).
      twinkleT += dt;
      const sd = h >= 12 ? h - 24 : h;                       // -12~12, 0 = 자정
      const lin = sd < 0 ? 1 + sd / 5 : 1 - sd / 6;          // 19시 → 자정 → 06시
      const f = Math.max(0, Math.min(1, lin));
      const density = f * f * (3 - 2 * f);                   // smoothstep
      const starBase = Math.max(0, s.night - 0.35) * 1.4;
      starMats.forEach((m, gi) => {
        const reveal = Math.max(0, Math.min(1, density * STAR_GROUPS - gi));
        m.opacity = starBase * reveal *
          (0.68 + 0.32 * Math.sin(twinkleT * m.userData.speed + m.userData.phase));
      });
      //  해: 6→18시. 달: 18→다음날 6시. 궤도 밖 시간엔 지평선 아래(투명)다.
      const sunT = (h - 6) / 12;
      if (sunT >= 0 && sunT <= 1){ orbit(sun, sunT); sunMat.opacity = 1 - s.night; }
      else sunMat.opacity = 0;
      const moonT = ((h + 24 - 18) % 24) / 12;
      if (moonT >= 0 && moonT <= 1){ orbit(moon, moonT); moonMat.opacity = Math.max(0, s.night - 0.15) * 1.2; }
      else moonMat.opacity = 0;
      sun.lookAt(camera.position);
      moon.lookAt(camera.position);
      return s;
    },
  };
}
