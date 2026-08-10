// ══════════════════════════════════════════════════════════════════
//  캠퍼스 맵 — Next 라우트(/campus)가 마운트한다.
//  상단 네비바를 캠퍼스에서도 유지하려고 정적 HTML에서 앱 라우트로 옮겼다.
//  DOM(캔버스·HUD)은 페이지가 그리고, 이 모듈은 그 위에서 돌기만 한다.
// ══════════════════════════════════════════════════════════════════
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import * as CodeAvatar from '/campus/lib/avatar.js';
import { DEFAULT_LOOK, GUEST_LOOK, BODY_BASE } from '/campus/lib/avatar.js';
import { mountCustomizer } from '/campus/lib/customizer.js';
import { loadCharacter, saveCharacter, loadRoom, saveRoom, loadInv, saveInv, whenReady }
  from '/campus/lib/store.js';
import { FURNITURE, itemBox, ROOM_BOUNDS } from '/campus/lib/room.js';
import { ITEMS, RECIPES, FRUIT_TREES } from '/campus/lib/items.js';
import { joinCampus } from '/campus/lib/net.js';
import { CURVE, FOCUS, CURVE_K, bend } from '/campus/lib/curve.js';

export async function mountCampus(){
  // ══════════════════════════════════════════════════════════════════
  //  멀티플랜토 3D 캠퍼스 — 수직 슬라이스 2
  //  범위: 야외 캠퍼스 + 건물 진입. 이동·카메라·충돌은 슬라이스 1에서 가져온다.
  //
  //  레이어 분리 원칙 (author-game-levels):
  //    ① 저작 데이터(LEVELS/ROOMS/PROPS) — 안정적인 id를 가진 단일 소스
  //    ② 시각 지오메트리 — 데이터에서 생성, 카메라 쪽 벽은 낮게 그린다
  //    ③ 충돌 지오메트리 — 데이터에서 별도 생성. 장식에서 유추하지 않는다
  //    ④ 존 트리거 — 룸/입구 앵커 기준 별도 AABB
  //  모든 게임플레이는 y=0 단일 평면. 계단·단차 없음.
  //
  //  ⚠ 실내 룸의 x/z 는 슬라이스 1과 **똑같이 유지한다.**
  //    자습실 가구 배치가 월드 절대좌표로 저장돼 있어서(room.js ROOM_BOUNDS,
  //    DEFAULT_ROOM), 룸을 옮기면 이미 저장된 배치가 벽 밖으로 나간다.
  //    레벨을 나누되 좌표는 건드리지 않는다.
  // ══════════════════════════════════════════════════════════════════

  // ── 캐릭터 구현 선택 ───────────────────────────────────────────────
  //  기본은 Kenney Mini Characters (CC0) — 12종·애니메이션 30개 내장.
  //  ?code 를 붙이면 예전 코드 아바타로 되돌린다(비교·비상용).
  //  구현들이 buildAvatar / poseAvatar / disposeAvatar 같은 API 를 제공한다.
  const USE_CODE = new URLSearchParams(location.search).has('code');
  let Avatar = CodeAvatar;
  if (!USE_CODE){
    try {
      const k = await import('/campus/lib/avatar-kenney.js');
      await k.preload();                   // buildAvatar 가 동기라 미리 받아 둔다
      Avatar = k;
    } catch (e){
      console.warn('[campus] Kenney 캐릭터 로드 실패 — 코드 아바타로 돌아갑니다', e);
    }
  }
  const { buildAvatar, poseAvatar, disposeAvatar } = Avatar;
  const IS_GLB = Avatar !== CodeAvatar;

  const cv = document.getElementById('cv');
  const renderer = new THREE.WebGLRenderer({canvas:cv, antialias:true});
  const MOBILE = matchMedia('(max-width:760px)').matches || navigator.maxTouchPoints > 1;
  const PR_CAP = MOBILE ? 1.5 : 2;                          // 모바일 GPU 보호
  renderer.setPixelRatio(Math.min(devicePixelRatio, PR_CAP));
  // 그림자 없음 — 실내에 그림자가 지면 천장 어딘가에 광원이 있다는 뜻이 된다.
  // 여기 조명은 형태를 읽히게 하는 용도지 방 안의 전등이 아니다.
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4f8f5);            // 거의 흰색
  scene.fog = new THREE.Fog(0xf4f8f5, 44, 84);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 200);   // 긴 렌즈 = 디오라마 느낌

  // ── 재질 헬퍼 ──────────────────────────────────────────────────────

  function tileTex(rep){
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0,0,128,128);
    g.strokeStyle = 'rgba(0,0,0,.11)'; g.lineWidth = 3; g.strokeRect(1.5,1.5,125,125);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function labelTexture(text, bg, fg = '#ffffff'){
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.beginPath(); g.roundRect(0,0,512,128,22); g.fill();
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0,110,512,18);
    g.fillStyle = fg; g.font = '800 60px "Pretendard","Apple SD Gothic Neo",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 60);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function nameTag(text){
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(15,17,23,.78)'; g.beginPath(); g.roundRect(28,10,200,44,10); g.fill();
    g.fillStyle = '#fff'; g.font = '700 26px "Pretendard","Apple SD Gothic Neo",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 33);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({map:t, transparent:true, depthTest:false}));
    s.scale.set(1.5, 0.375, 1); s.renderOrder = 10;
    return s;
  }

  // lift = 자체발광 비율. 조명을 올리지 않고 재질만 밝힌다
  // (조명을 올리면 캐릭터 툰 셰이딩이 흰색으로 포화된다).
  const lam = (c, map, lift = 0) => track(bend(new THREE.MeshLambertMaterial({
    color: c, map: map || null,
    emissive: new THREE.Color(c).multiplyScalar(lift),
  })));
  // flat = 조명을 아예 무시한다. 지정한 색 그대로 나온다.
  const flat = (c, map) => track(bend(new THREE.MeshBasicMaterial({color:c, map:map || null})));

  // ══ ① 저작 레벨 데이터 ═════════════════════════════════════════════
  //
  // ⚠ id 는 저장·네트워크 경로에 쓰인다. 바꾸지 말 것.
  //   (name 은 화면 표기 전용이라 언제든 고쳐도 된다)
  //
  //  outdoor ── 캠퍼스 야외. 첫 화면.
  //    ├ main   본관     : 교실 · 원장실
  //    ├ study  자습동   : 개인 자습실
  //    └ union  학생회관 : 휴게실

  const LEVELS = {
    // 야외는 건물 세 채가 한 화면에 들어와야 '캠퍼스'로 읽힌다. 그래서 카메라가
    // 실내보다 멀고, 스폰도 정문이 아니라 광장 한복판이다(정문에서 시작하면
    // 건물이 전부 저 멀리 점으로 보인다).
    // fog 는 레벨마다 다르다. 실내 값(44~84)을 야외에 그대로 쓰면 카메라가
    // 두 배 멀어진 만큼 건물이 통째로 안개에 잠겨 하얗게 날아간다.
    outdoor: {id:'outdoor', name:'캠퍼스',   outdoor:true, spawn:{x:0,   z:9,    yaw:Math.PI}, camR:42.0, camH:24.5, fog:[78, 165]},
    main:    {id:'main',    name:'본관',     spawn:{x:0,    z:-4.2, yaw:Math.PI}, camR:21.8, camH:14.2, fog:[44, 84]},
    study:   {id:'study',   name:'자습동',   spawn:{x:-7.5, z:-4.6, yaw:0},       camR:21.8, camH:14.2, fog:[44, 84]},
    union:   {id:'union',   name:'학생회관', spawn:{x: 7.5, z:-4.6, yaw:0},       camR:21.8, camH:14.2, fog:[44, 84]},
  };

  const ROOMS = [
    {id:'class',  level:'main',  name:'교실',       sub:'클래스카드 · 오토보카 · 매일국어', x:-7.5, z:-13.5, w:13, d:8, door:'s', hue:0x1f7a33},
    {id:'office', level:'main',  name:'원장실',     sub:'입회 상담 · 레벨 테스트',         x: 7.5, z:-13.5, w:13, d:8, door:'s', hue:0x1f7a33},
    {id:'study',  level:'study', name:'개인 자습실', sub:'플래닝 · 자습 인증',              x:-7.5, z:  1,   w:13, d:8, door:'n', hue:0x1f7a33,
     personal:true, go:'/campus/planning-room'},
    {id:'lounge', level:'union', name:'휴게실',     sub:'쉬는 시간 · 잡담',                x: 7.5, z:  1,   w:13, d:8, door:'n', hue:0x1f7a33},
  ];

  // 실내 현관/복도. 여기서 건물 밖으로 나간다.
  //  main  은 룸 둘 사이의 복도가 그대로 현관을 겸한다(문 = 남쪽 z=-3).
  //  study/union 은 룸이 하나뿐이라 문 앞에 현관 한 칸만 둔다(문 = 북쪽 z=-6).
  const HALLS = {
    main:  {minX:-14, maxX: 14, minZ:-9, maxZ:-3, exitZ:-3, exitX:0,    exitSide:'s'},
    study: {minX:-14, maxX: -1, minZ:-6, maxZ:-3, exitZ:-6, exitX:-7.5, exitSide:'n'},
    union: {minX:  1, maxX: 14, minZ:-6, maxZ:-3, exitZ:-6, exitX: 7.5, exitSide:'n'},
  };

  // 룸과 룸 사이에 남는 구간. 안 채우면 복도에서 들여다보이는 2칸짜리 막다른
  // 골목이 생긴다(들어갈 수는 있는데 아무것도 없는 곳이라 버그처럼 보인다).
  const FILLERS = {
    main: [{x:0, z:-13.5, w:2, d:8}],
  };

  const DOOR_W = 3.2, WALL_T = 0.35, LOW_H = 1.15;
  // 벽은 전부 허리 높이다. 카메라를 Q/E로 돌릴 수 있으므로, 어느 각도에서도
  // 벽이 플레이어를 가리지 않으려면 높은 배경벽을 두면 안 된다.

  // ── 야외 건물 ──────────────────────────────────────────────────────
  // 실내 좌표와 무관한 별도 공간이다. 문은 전부 남향(+z) — 진입 동선을
  // 한 방향으로 통일해야 어느 건물이든 같은 감각으로 들어간다.
  const BUILDINGS = [
    {level:'main',  name:'본관',     x:  0, z:-12, w:22, d:12, h:4.2, c:0xf3f0e8, roof:0xa8c0a8},
    {level:'study', name:'자습동',   x:-14, z: -1, w:13, d:10, h:3.6, c:0xf1f4ef, roof:0x93b4a4},
    {level:'union', name:'학생회관', x: 14, z: -1, w:13, d:10, h:3.6, c:0xf4f1ec, roof:0xbdb694},
  ];

  // ── 가구 ───────────────────────────────────────────────────────────
  // 저작 데이터에서 시각·충돌을 함께 생성한다(장식에서 유추 금지)
  const PROPS = [];
  const prop = (level, id, x, z, w, d, h, c, solid = true, round = false) =>
    PROPS.push({level,id,x,z,w,d,h,c,solid,round});
  // 교실: 화이트보드 + 책상 6
  prop('main', 'class-board', -7.5, -17.2, 6.4, 0.28, 1.45, 0xeef2ee);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++)
    prop('main', `class-desk-${r}${c}`, -11.6 + c*4.1, -15.1 + r*2.8, 2.8, 1.0, 0.72, 0xdfd9cd);
  // 원장실: 책상 + 소파 + 책장
  prop('main', 'office-desk', 7.5, -15.8, 4.0, 1.5, 0.74, 0xdfd9cd);
  prop('main', 'office-sofa', 7.5, -11.6, 3.6, 1.2, 0.66, 0xb3cbb8);
  prop('main', 'office-shelf', 13.2, -13.5, 0.8, 4.8, 1.9, 0xe9eeea);
  // 개인 자습실은 고정 가구가 없다 — 로그인 계정의 배치를 불러와 그린다(아래 applyRoom)
  // 휴게실: 소파 2 + 테이블 + 자판기
  prop('union', 'lounge-sofa-a', 5.0, -1.2, 4.0, 1.1, 0.66, 0xb3cbb8);
  prop('union', 'lounge-sofa-b', 5.0,  2.8, 4.0, 1.1, 0.66, 0xb3cbb8);
  prop('union', 'lounge-table', 5.0, 0.8, 2.6, 1.3, 0.46, 0xe9eeea);
  prop('union', 'lounge-vending', 12.6, -1.2, 1.0, 1.6, 1.8, 0x7fae95);
  // 야외: 벤치 — 앉는 기능은 아직 없다. 광장이 비어 보이지 않게 두는 랜드마크다
  prop('outdoor', 'bench-a', -7, 7,  2.6, 0.7, 0.45, 0xd9cdb4);
  prop('outdoor', 'bench-b',  7, 7,  2.6, 0.7, 0.45, 0xd9cdb4);
  prop('outdoor', 'fountain', 0, 2,  3.6, 3.6, 0.55, 0xbdd8d2, true, true);
  // 휴게실 매점 카운터 — 점원(매점쌤)이 뒤에 선다
  prop('union', 'shop-counter', 11.5, 3.2, 2.8, 1.0, 0.95, 0xd9b98c);

  // 로컬 광원(천장 전등) 없음 — 전역 조명만 쓴다.
  // 밝기는 조명 세기가 아니라 재질의 밝은 색에서 나온다. 세기를 올려 밝히면
  // 툰 셰이딩이 흰색으로 포화돼 캐릭터 얼굴이 날아간다(민머리에서 특히 드러난다).
  scene.add(new THREE.HemisphereLight(0xffffff, 0xf0f5f1, 0.76));
  const sun = new THREE.DirectionalLight(0xfffdf7, 0.58);
  sun.position.set(14, 24, 14); sun.target.position.set(0, 0, -8);
  scene.add(new THREE.AmbientLight(0xffffff, 0.11));
  scene.add(sun, sun.target);

  // ══ 레벨 빌더 ══════════════════════════════════════════════════════
  // world 안의 것만 레벨 전환 때 버린다. 아바타·조명은 밖에 있어 살아남는다.
  const world = new THREE.Group(); scene.add(world);
  let junk = [];                                  // 이번 레벨이 만든 geometry/material
  const track = o => { junk.push(o); return o; };

  const COLLIDERS = [];     // 레벨 전환마다 비우고 다시 채운다
  const ZONES = [];
  let OCCLUDERS = [];       // 야외 건물 — 카메라를 가리면 투명해진다

  function clearLevel(){
    world.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    world.clear();
    for (const o of junk) o.dispose?.();
    junk = [];
    COLLIDERS.length = 0; ZONES.length = 0; OCCLUDERS = [];
  }

  function addWall(x1, z1, x2, z2){
    const seg = {
      minX: Math.min(x1,x2) - WALL_T/2, maxX: Math.max(x1,x2) + WALL_T/2,
      minZ: Math.min(z1,z2) - WALL_T/2, maxZ: Math.max(z1,z2) + WALL_T/2,
    };
    if (seg.maxX - seg.minX < 0.01 || seg.maxZ - seg.minZ < 0.01) return;  // 길이 0 조각 버림
    COLLIDERS.push(seg);
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(seg.maxX - seg.minX, LOW_H, seg.maxZ - seg.minZ), WALL_MAT());
    m.position.set((seg.minX+seg.maxX)/2, LOW_H/2, (seg.minZ+seg.maxZ)/2);
    world.add(m);
  }
  // 벽 재질은 레벨당 하나만 만든다 — 벽 조각마다 만들면 드로우콜이 그만큼 는다
  let _wallMat = null;
  const WALL_MAT = () => (_wallMat ||= lam(0xeef2ee, null, 0.42));

  // 문이 뚫린 벽 한 줄. axis='x' 면 z 고정, 'z' 면 x 고정.
  function wallWithDoor(axis, fixed, from, to, doorAt){
    const a = Math.min(from, to), b = Math.max(from, to);
    const d0 = doorAt - DOOR_W/2, d1 = doorAt + DOOR_W/2;
    const put = (s, e) => axis === 'x' ? addWall(s, fixed, e, fixed) : addWall(fixed, s, fixed, e);
    if (doorAt === null){ put(a, b); return; }
    put(a, d0); put(d1, b);
  }

  function floorPlate(minX, maxX, minZ, maxZ, color, rep, y){
    const w = maxX - minX, d = maxZ - minZ;
    const t = track(tileTex(1)); t.repeat.set(w/rep, d/rep);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), flat(color, t));
    m.rotation.x = -Math.PI/2;
    m.position.set((minX+maxX)/2, y, (minZ+maxZ)/2);
    world.add(m);
    return m;
  }
  // 타일 없는 단색 판 — 잔디·길처럼 눈금이 있으면 안 되는 바닥에 쓴다
  function plate(cx, cz, w, d, color, y){
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI/2), flat(color));
    m.position.set(cx, y, cz);
    world.add(m);
    return m;
  }
  function signAt(text, x, y, z, faceZ, hue = 0x1f7a33){
    const s = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 1.1),
      track(bend(new THREE.MeshBasicMaterial({
        map: track(labelTexture(text, '#' + hue.toString(16).padStart(6,'0'))), transparent:true}))));
    s.position.set(x, y, z);
    s.rotation.y = faceZ === 1 ? 0 : Math.PI;
    world.add(s);
    return s;
  }
  function trees(list){
    const trunk = lam(0xb8ab97, null, 0.25), leaf = lam(0xa9bfa6, null, 0.3);
    // 지오메트리는 나무 전체가 공유한다 — 16그루가 각자 만들면 그만큼 낭비다
    const gTr = new THREE.CylinderGeometry(0.22, 0.3, 1.5, 8);
    const gLv = new THREE.SphereGeometry(1.25, 14, 12);
    for (const [x, z] of list){
      const t = new THREE.Group(); t.position.set(x, 0, z);
      const tr = new THREE.Mesh(gTr, trunk); tr.position.y = 0.75;
      const lv = new THREE.Mesh(gLv, leaf);  lv.position.y = 2.3; lv.scale.set(1, 0.92, 1);
      t.add(tr, lv); world.add(t);
    }
  }

  // ── 야외 ───────────────────────────────────────────────────────────
  function buildOutdoor(){
    // 잔디는 실내 바닥(거의 흰색)보다 확실히 초록이어야 한다. 여기서 색이 붙어야
    // '건물 밖으로 나왔다'가 한눈에 읽힌다 — 명도만 다르면 같은 실내로 보인다.
    plate(0, -4, 400, 400, 0xbcd4b4, -0.06);                 // 잔디 — 끝이 안 보이게 넓게
    plate(0,  8, 12, 26, 0xeef1ec, -0.03);                   // 중앙 진입로
    plate(0, -5, 44,  9, 0xeef1ec, -0.03);                   // 건물 앞 가로축 광장

    for (const b of BUILDINGS){
      const x0 = b.x - b.w/2, x1 = b.x + b.w/2, z0 = b.z - b.d/2, z1 = b.z + b.d/2;
      // 건물 하나 = 가림 판정 단위. 몸통이 가려지면 문·간판까지 같이 비쳐야 한다
      // (따로 놀면 투명해진 건물 앞에 문짝만 떠 있는 그림이 된다).
      const body = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), lam(b.c, null, 0.30));
      body.position.set(b.x, b.h/2, b.z);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(b.w + 1.2, 0.5, b.d + 1.2), lam(b.roof, null, 0.26));
      roof.position.set(b.x, b.h + 0.25, b.z);
      // 문 — 남쪽 면에 박아 넣은 판. 들어가는 곳이 눈에 보여야 한다
      const door = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W, 2.3), flat(0x5d7d68));
      door.position.set(b.x, 1.15, z1 + 0.02);
      world.add(body, roof, door);
      const sign = signAt(b.name, b.x, 3.1, z1 + 0.05, 1);
      OCCLUDERS.push({test:[body, roof], meshes:[body, roof, door, sign]});

      // 충돌 — 건물 전체를 막되 문 앞은 비운다. 문으로는 '입구 존'이 처리한다
      COLLIDERS.push({minX:x0, maxX:x1, minZ:z0, maxZ:z1});
      // 진입로
      plate(b.x, z1 + 3.2, DOOR_W + 2.4, 6.4, 0xeef1ec, -0.02);
      ZONES.push({kind:'enter', level:b.level, name:b.name, sub:'건물 안으로',
        minX:b.x - DOOR_W/2 - 0.6, maxX:b.x + DOOR_W/2 + 0.6, minZ:z1 + 0.2, maxZ:z1 + 2.6});
    }

    for (const p of PROPS.filter(p => p.level === 'outdoor')) addProp(p);

    // 과일나무 자리(FRUIT_TREES)는 일반 나무 목록에서 뺐다 — 같은 자리에 두 그루가 겹친다
    trees([
      [-32,-24],[-24,-26],[0,-27],[13,-27],[32,-24],
      [-34,-10],[34,-10],[-34, 4],[34, 4],[30, 14],
      [-12, 15],[20, 12],[-26, 20],[0, 24],
    ]);
    buildFruitTrees();
    buildFlowers();
    buildClouds();

    // 정문 기둥 — 남쪽 끝. 여기가 캠퍼스 입구라는 표시
    for (const gx of [-6.6, 6.6]){
      const g = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.0, 1.1), lam(0xe6e2d6, null, 0.28));
      g.position.set(gx, 1.5, 20);
      world.add(g);
      COLLIDERS.push({minX:gx-0.55, maxX:gx+0.55, minZ:19.45, maxZ:20.55});
    }
  }

  // ── 과일나무·장식 (야외 전용) ──────────────────────────────────────
  // 레벨 로컬 상태 — clearLevel 이 메시를 지우므로 야외를 지을 때마다 다시 채운다.
  let fruitTrees = [];      // {id, crown, fruits[], shakeT, x, z}
  let groundFruits = [];    // {mesh, vx, vy, vz}  떨어져서 주울 수 있는 과일
  let clouds = [];          // {g, speed}

  function buildFruitTrees(){
    fruitTrees = []; groundFruits = [];
    const trunkM = lam(0xa9906f, null, 0.25), leafM = lam(0x93c47e, null, 0.30);
    const fruitM = lam(0xe25d4a, null, 0.4);
    const gTr = new THREE.CylinderGeometry(0.26, 0.34, 1.7, 8);
    const gLv = new THREE.SphereGeometry(1.45, 14, 12);
    const gFr = new THREE.SphereGeometry(0.21, 10, 8);
    for (const ft of FRUIT_TREES){
      const g = new THREE.Group(); g.position.set(ft.x, 0, ft.z);
      const tr = new THREE.Mesh(gTr, trunkM); tr.position.y = 0.85;
      const crown = new THREE.Group(); crown.position.y = 2.6;
      const lv = new THREE.Mesh(gLv, leafM); lv.scale.set(1, 0.9, 1);
      crown.add(lv);
      const fruits = [];
      if (!INV.picked.includes(ft.id)){
        // 과일은 항상 남쪽(+z, 카메라 쪽)에 몰아 단다 — 뒤에 달리면 있는지도 모른다
        for (const s of [[-0.85, -0.2, 0.85], [0.9, 0.1, 0.65], [0.05, -0.55, 1.1]]){
          const f = new THREE.Mesh(gFr, fruitM);
          f.position.set(s[0], s[1], s[2]);
          crown.add(f); fruits.push(f);
        }
      }
      g.add(tr, crown);
      world.add(g);
      COLLIDERS.push({minX:ft.x-0.5, maxX:ft.x+0.5, minZ:ft.z-0.5, maxZ:ft.z+0.5});
      ZONES.push({kind:'tree', tree:ft.id, name:'과일나무', sub:'흔들면 사과가 떨어진다',
        minX:ft.x-2.6, maxX:ft.x+2.6, minZ:ft.z-2.6, maxZ:ft.z+2.6});
      fruitTrees.push({id:ft.id, crown, fruits, shakeT:0, x:ft.x, z:ft.z});
    }
  }

  function buildFlowers(){
    // 시드 고정 난수 — 들를 때마다 꽃밭이 다른 곳에 피면 세계가 아니라 배경화면이 된다
    let s = 7;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const stemM = lam(0x74a862, null, 0.28);
    const headMs = [0xf2b8c6, 0xf5e07f, 0xffffff, 0xc9a9e8].map(c => lam(c, null, 0.4));
    const gSt = new THREE.CylinderGeometry(0.035, 0.035, 0.34, 5);
    const gHd = new THREE.SphereGeometry(0.13, 8, 6);
    for (let i = 0; i < 40; i++){
      const a = rnd()*Math.PI*2, r = 12 + rnd()*22;
      const x = Math.cos(a)*r, z = Math.sin(a)*r - 3;
      if (Math.abs(x) < 8 && z > -12) continue;         // 광장·진입로는 비워 둔다
      const f = new THREE.Group(); f.position.set(x, 0, z);
      const st = new THREE.Mesh(gSt, stemM); st.position.y = 0.17;
      const hd = new THREE.Mesh(gHd, headMs[i % headMs.length]); hd.position.y = 0.38;
      f.add(st, hd); world.add(f);
    }
  }

  function buildClouds(){
    clouds = [];
    for (let i = 0; i < 6; i++){
      const g = new THREE.Group();
      const m = flat(0xffffff);
      m.transparent = true; m.opacity = 0.9; m.fog = false;
      for (let j = 0; j < 3; j++){
        const p = new THREE.Mesh(track(new THREE.SphereGeometry(1.6 - j*0.35, 10, 8)), m);
        p.position.set(j*1.7 - 1.7, (j%2)*0.25, 0); p.scale.y = 0.55;
        g.add(p);
      }
      g.position.set(-50 + i*18, 17 + (i%3)*2.5, -34 + (i*11)%52);
      world.add(g);
      clouds.push({g, speed: 0.5 + (i%3)*0.22});
    }
  }

  // 흔들기 — 오늘 이 나무를 처음 흔들 때만 과일이 떨어진다(자정에 리셋).
  function shakeTree(id){
    const t = fruitTrees.find(t => t.id === id);
    if (!t || !t.fruits.length) return;
    INV.picked.push(id); markInv();
    t.shakeT = 0.7;
    for (const f of t.fruits){
      // crown 로컬에서 떼어 월드로 옮긴 뒤 떨어뜨린다
      const wp = new THREE.Vector3(); f.getWorldPosition(wp);
      t.crown.remove(f); world.add(f);
      f.position.copy(wp);
      groundFruits.push({mesh:f,
        vx:(Math.random() - .5)*1.6, vy:0.6 + Math.random()*0.6, vz:0.4 + Math.random()*1.2});
    }
    t.fruits = [];
    toast('나무를 흔들었다! 떨어진 사과를 밟아 줍자');
  }

  function addProp(p){
    // 분수는 상자로 두면 광장 한복판의 회색 판때기로 읽힌다. 원기둥이라야
    // 분수로 보인다. 충돌은 어차피 AABB 라 모양과 무관하다.
    const geo = p.round
      ? new THREE.CylinderGeometry(p.w/2, p.w/2 * 1.06, p.h, 20)
      : new THREE.BoxGeometry(p.w, p.h, p.d);
    const m = new THREE.Mesh(geo, lam(p.c, null, 0.24));
    m.position.set(p.x, p.h/2, p.z);
    m.name = p.id; world.add(m);
    if (p.solid) COLLIDERS.push({minX:p.x - p.w/2, maxX:p.x + p.w/2, minZ:p.z - p.d/2, maxZ:p.z + p.d/2});
  }

  // ── 실내 ───────────────────────────────────────────────────────────
  function buildIndoor(level){
    const rooms = ROOMS.filter(r => r.level === level);
    const hall = HALLS[level];

    // 건물 밖 — 줌아웃하면 맵 밖 빈 배경이 보인다. 지면을 넓게 깔아 세상이 이어지게 한다.
    // 야외와 달리 나무는 두지 않는다. 지금은 '건물 안'이라 창밖 풍경을 그릴 자리가 아니다.
    plate(0, -8, 200, 200, 0xdfe7dc, -0.06);
    plate(0, -8, 40, 34, 0xeef1ec, -0.04);

    const bb = rooms.reduce((a, r) => ({
      minX: Math.min(a.minX, r.x - r.w/2), maxX: Math.max(a.maxX, r.x + r.w/2),
      minZ: Math.min(a.minZ, r.z - r.d/2), maxZ: Math.max(a.maxZ, r.z + r.d/2),
    }), {minX:hall.minX, maxX:hall.maxX, minZ:hall.minZ, maxZ:hall.maxZ});
    floorPlate(bb.minX - 1, bb.maxX + 1, bb.minZ - 1, bb.maxZ + 1, 0xe6e9e5, 2, 0);   // 룸 사이 여백
    floorPlate(hall.minX, hall.maxX, hall.minZ, hall.maxZ, 0xfafbf9, 2, 0.01);        // 복도 = 흰 타일

    for (const r of rooms){
      floorPlate(r.x - r.w/2, r.x + r.w/2, r.z - r.d/2, r.z + r.d/2, 0xf4f3ef, 2, 0.01);
      const x0 = r.x - r.w/2, x1 = r.x + r.w/2, z0 = r.z - r.d/2, z1 = r.z + r.d/2;
      wallWithDoor('x', z0, x0, x1, r.door === 'n' ? r.x : null);
      wallWithDoor('x', z1, x0, x1, r.door === 's' ? r.x : null);
      wallWithDoor('z', x0, z0, z1, null);
      wallWithDoor('z', x1, z0, z1, null);

      const zDoor = r.door === 's' ? z1 : z0, face = r.door === 's' ? 1 : -1;
      signAt(r.name, r.x, 1.95, zDoor + face * 0.3, face, r.hue);
      ZONES.push({kind:'room', room:r, name:r.name, sub:r.sub,
        minX:x0 + 1, maxX:x1 - 1, minZ:z0 + 1, maxZ:z1 - 1});
    }

    for (const f of FILLERS[level] || []){
      const m = new THREE.Mesh(new THREE.BoxGeometry(f.w, LOW_H, f.d), WALL_MAT());
      m.position.set(f.x, LOW_H/2, f.z);
      world.add(m);
      COLLIDERS.push({minX:f.x - f.w/2, maxX:f.x + f.w/2, minZ:f.z - f.d/2, maxZ:f.z + f.d/2});
    }

    // 복도 외벽 — 나가는 문 한 곳만 뚫는다
    addWall(hall.minX, hall.minZ, hall.minX, hall.maxZ);
    addWall(hall.maxX, hall.minZ, hall.maxX, hall.maxZ);
    wallWithDoor('x', hall.exitZ, hall.minX, hall.maxX, hall.exitX);

    // 출구 존 — 문 안쪽에 붙는다
    const eSide = hall.exitSide === 's' ? -1 : 1;
    ZONES.push({kind:'exit', name:'캠퍼스', sub:'건물 밖으로',
      minX:hall.exitX - DOOR_W/2 - 0.6, maxX:hall.exitX + DOOR_W/2 + 0.6,
      minZ:Math.min(hall.exitZ, hall.exitZ + eSide*2.2), maxZ:Math.max(hall.exitZ, hall.exitZ + eSide*2.2)});

    for (const p of PROPS.filter(p => p.level === level)) addProp(p);

    // 매점 존 — 룸 존보다 앞에 둔다. 존 판정이 첫 일치에서 멈추는데,
    // 카운터 앞은 휴게실 존 안쪽이라 뒤에 두면 영영 안 잡힌다.
    if (level === 'union'){
      ZONES.unshift({kind:'shop', name:'매점', sub:'사과 팔기 · 가구 사기',
        minX:9.6, maxX:13.6, minZ:1.4, maxZ:2.8});
    }
  }

  // 개인 자습실 가구는 계정 데이터라 레벨 지오메트리와 수명이 다르다.
  // world 밖에 따로 두고 study 레벨에서만 보인다.
  const roomGroup = new THREE.Group(); scene.add(roomGroup);
  const ROOM_COLLIDERS = [];
  const FURN_MAT = {};
  const furnMat = t => (FURN_MAT[t] ||= new THREE.MeshLambertMaterial({
    color: FURNITURE[t].c, emissive: new THREE.Color(FURNITURE[t].c).multiplyScalar(0.24)}));
  let myRoom = [];

  function applyRoom(items){
    myRoom = items;
    roomGroup.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    roomGroup.clear();
    ROOM_COLLIDERS.length = 0;
    for (const it of items){
      const f = FURNITURE[it.t];
      const m = new THREE.Mesh(new THREE.BoxGeometry(f.w, f.h, f.d), furnMat(it.t));
      m.position.set(it.x, f.h/2, it.z);
      m.rotation.y = it.r;
      roomGroup.add(m);
      if (f.solid !== false) ROOM_COLLIDERS.push(itemBox(it));
    }
  }

  // ══ 아바타 ════════════════════════════════════════════════════════
  // 학생은 '기본 학생'에서 출발해 각자 꾸민다(4속성 캐릭터 프리셋은 걷어냈다 —
  // 스위처가 없어진 뒤로 아무도 쓰지 않았고, 시안은 prototypes/characters.html 에 남아 있다).
  // 충쌤만 고정 프리셋으로 둔다. 사람이 아니라 AI 페르소나라 항상 원장실을 지킨다.
  const TEACHER = {
    body:{height:1.02, head:1.10, girth:1.16, shoulder:1.08, limb:1.08, legLen:0.89, torso:0.94},
    look:{hairStyle:'bald', topStyle:'hood', bottomStyle:'pants', glasses:true,
          brow:'thick', mouth:'flat', blush:'hatch',
          skin:0xf2f1ee, hair:0x000000, top:0x26262c, bottom:0x141417, shoe:0x0d0d10, tie:0x1b1b20, eye:'#17141a',
          model:'male-c'},          // Kenney 캐릭터 — 정장 느낌
  };
  // 매점쌤 — GLB 아바타는 지금 skin·표정만 반영하므로 피부톤·표정으로만 구분된다.
  // look 의 나머지 필드는 코드 아바타(?code) 폴백일 때를 위해 채워 둔다.
  const SHOPKEEPER = {
    body: {...TEACHER.body},
    look: {...TEACHER.look, glasses:false, skin:0xf7f2e8, expr:'happy', model:'female-b',
           top:0x2e7d4f, bottom:0x27563f, shoe:0x223d30, tie:0x1f5c40},
  };
  // 레벨별 고정 NPC. 충쌤은 원장실 사람이라 본관에만 있다.
  const NPC_DEFS = [
    {level:'main',  name:'충쌤',   preset:TEACHER,    x:14,   z:-17.2, yaw:0},
    {level:'union', name:'매점쌤', preset:SHOPKEEPER, x:11.5, z:4.4,   yaw:Math.PI},
  ];
  let NPCS = [];

  function buildNpcs(level){
    for (const n of NPCS) disposeAvatar(n.rig);
    NPCS = NPC_DEFS.filter(n => n.level === level).map(n => {
      const rig = buildAvatar(n.preset.look, n.preset.body);
      rig.root.position.set(n.x, 0, n.z);
      rig.root.rotation.y = n.yaw;
      const tag = nameTag(n.name); tag.position.set(0, 3.45, 0); rig.root.add(tag);
      scene.add(rig.root);
      return {rig, phase: Math.random()*6};
    });
  }

  // plantor와 origin이 같으므로 로그인 세션이 그대로 공유된다.
  const ME = await whenReady();
  // 로그인 표시는 상단 네비바가 맡는다. 여기선 꾸미기 노출만 정한다.
  document.getElementById('dressBtn').hidden = !ME;
  const MY_LABEL = ME ? ME.name : '방문자';

  // 비로그인은 저장분을 읽지 않는다 — 꾸미기 버튼이 없어 저장할 방법도 없으므로
  // localStorage 에 남아 있을 값은 게스트 꾸미기가 열려 있던 시절의 잔재뿐이다.
  // 그게 로드되면 '아무 커스텀도 안 된 방문자'가 아니게 된다.
  const SAVED = ME ? await loadCharacter() : null;
  let myLook = SAVED ? {...SAVED.look} : {...(ME ? DEFAULT_LOOK : GUEST_LOOK)};
  // Kenney 캐릭터는 색·표정·헤어가 메시에 박혀 있다. 코드 아바타용 색 필드는
  // 그대로 두되(?code 폴백이 읽는다), 어떤 캐릭터인지는 look.model 이 정한다.
  if (IS_GLB && !myLook.model)
    myLook = {...myLook, model: ME ? 'male-a' : 'male-e'};   // 방문자는 다른 얼굴
  let myBody = SAVED ? {...SAVED.body} : {...BODY_BASE};

  applyRoom(await loadRoom());

  // ── 인벤토리·벨 ────────────────────────────────────────────────────
  // {inv:{itemId:개수}, bells:수, picked:[오늘 흔든 나무 id]}
  // 저장은 디바운스 — 과일 세 개를 연달아 주울 때 문서를 세 번 쓰지 않는다.
  const INV = await loadInv();
  let invDirty = false, invTimer = 0;
  function flushInv(){
    if (!invDirty) return;
    invDirty = false;
    saveInv(INV.inv, INV.bells, INV.picked);
  }
  function markInv(){
    invDirty = true;
    clearTimeout(invTimer); invTimer = setTimeout(flushInv, 1200);
    refreshBag();
  }
  // 탭을 닫거나 백그라운드로 가면 그 자리에서 밀어 넣는다
  const onPageHide = () => flushInv();
  addEventListener('pagehide', onPageHide);
  const countOf = k => INV.inv[k] || 0;
  function give(k, n = 1){ INV.inv[k] = countOf(k) + n; markInv(); }
  function take(k, n = 1){
    const c = countOf(k);
    if (c < n) return false;
    if (c - n > 0) INV.inv[k] = c - n; else delete INV.inv[k];
    markInv(); return true;
  }

  // ── 플레이어 ──────────────────────────────────────────────────────
  let player = buildAvatar(myLook, myBody);
  scene.add(player.root);
  const meTag = nameTag(MY_LABEL);
  meTag.position.set(0, 3.45, 0); player.root.add(meTag);
  meTag.scale.set(2.0, 0.5, 1);

  const P = {x: 0, z: 16, yaw: Math.PI, walkT: 0};
  player.root.position.set(P.x, 0, P.z);

  // ── 실제 접속자 ────────────────────────────────────────────────────
  // 좌표는 5Hz로만 오므로 프레임마다 보간해서 끊김 없이 움직이게 한다.
  let net = null;                     // 아래 showCount()가 읽으므로 먼저 선언한다
  const remotes = new Map();          // uid → {rig, x,z,yaw, tx,tz,tyaw, moving, walkT}
  const elCount = document.getElementById('count');
  const showCount = () => {
    const t = net ? (remotes.size ? `접속 ${remotes.size + 1}명` : '나 혼자') : '';
    elCount.textContent = t;
    elCount.hidden = !t;          // 비어 있으면 숨긴다(padding 만 남아 왼쪽 여백이 생겼다)
  };

  function addRemote(uid, info){
    const rig = buildAvatar(info.look, info.body, {outline:false});
    const tag = nameTag(info.name); tag.position.set(0, 3.45, 0); rig.root.add(tag);
    rig.root.visible = false;          // 첫 좌표가 오기 전엔 숨긴다(원점에서 미끄러져 오는 것 방지)
    scene.add(rig.root);
    remotes.set(uid, {rig, x:0, z:0, yaw:0, tx:0, tz:0, tyaw:0, moving:false, walkT:0, first:true});
    showCount();
  }
  function dropRemote(uid){
    const r = remotes.get(uid);
    if (!r) return;
    disposeAvatar(r.rig);
    remotes.delete(uid);
    showCount();
  }
  function poseRemote(uid, p){
    const r = remotes.get(uid);
    if (!r) return;
    r.tx = p.x; r.tz = p.z; r.tyaw = p.yaw; r.moving = p.moving;
    if (r.first){ r.x = p.x; r.z = p.z; r.yaw = p.yaw; r.first = false; r.rig.root.visible = true; }
  }

  if (ME){
    net = joinCampus({uid: ME.uid, name: ME.name, look: myLook, body: myBody},
                     {onJoin: addRemote, onLeave: dropRemote, onPose: poseRemote});
  }
  showCount();

  // ══ 카메라 ════════════════════════════════════════════════════════
  // 고정 아이소메트릭 프레이밍. 위치와 look-at을 각각 따로 스무딩한다.
  // 카메라는 수평각(camYaw)으로 돈다. 기본 45°가 기존 아이소메트릭 각도다.
  // 반경·높이는 레벨이 정한다 — 야외는 건물 세 채가 한눈에 들어와야 해서 더 멀다.
  let CAM_R = 21.8, CAM_H = 14.2;          // 부감 33°. 더 낮추면 허리벽이 시야를 가린다
  let camYaw = Math.PI/4, camYawTo = Math.PI/4;
  const CAM_DIR = new THREE.Vector3();
  const camDirFrom = y => CAM_DIR.set(Math.sin(y)*CAM_R, CAM_H, Math.cos(y)*CAM_R);
  camDirFrom(camYaw);
  let zoom = 1;
  const camPos  = new THREE.Vector3().copy(CAM_DIR).add(new THREE.Vector3(P.x, 0, P.z));
  const camLook = new THREE.Vector3(P.x, 0.9, P.z);
  addEventListener('wheel', e => {
    // 하한을 0.34 → 0.18 로 낮췄다. GLB 캐릭터는 얼굴·표정이 있어서 더 가까이
    // 볼 만한 값이 생겼다(코드 아바타 시절엔 당겨도 볼 게 없었다).
    zoom = THREE.MathUtils.clamp(zoom + Math.sign(e.deltaY)*0.08, 0.18, 1.65);
  }, {passive:true});

  // 카메라 기준 이동축 (화면 위 = 화면 안쪽). 카메라가 돌면 같이 돈다.
  const FWD = new THREE.Vector3(), RIGHT = new THREE.Vector3();
  function syncAxes(){
    FWD.set(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    RIGHT.set(Math.cos(camYaw), 0, -Math.sin(camYaw));
  }
  syncAxes();

  // ══ 레벨 전환 ══════════════════════════════════════════════════════
  let level = null;                    // 현재 레벨 id
  let lastDoor = null;                 // 야외에서 마지막으로 들어간 건물 — 나올 때 그 앞에 세운다
  let switching = false;
  const elFade = document.getElementById('fade');

  function placeAt(x, z, yaw){
    P.x = x; P.z = z; P.yaw = yaw; P.walkT = 0;
    player.root.position.set(x, 0, z);
    player.root.rotation.y = yaw;
    // 카메라를 새 위치로 순간이동시킨다. 안 그러면 암전이 걷힌 뒤 이전 레벨
    // 자리에서 새 자리로 카메라가 주욱 날아간다.
    camPos.copy(CAM_DIR).multiplyScalar(zoom).add(player.root.position);
    camLook.set(x, 1.30, z);
    tap.target = null;
  }

  function loadLevel(id, spawn){
    const L = LEVELS[id];
    clearLevel();
    _wallMat = null;
    if (L.outdoor) buildOutdoor(); else buildIndoor(id);
    // 곡면 셰이더가 정점을 GPU에서 내려앉히면 CPU 쪽 바운딩과 어긋난다.
    // 화면 가장자리 물체가 컬링으로 사라지지 않게 야외에선 컬링을 끈다(메시 백 개 수준).
    if (L.outdoor) world.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
    buildNpcs(id);
    roomGroup.visible = (id === 'study');
    CAM_R = L.camR; CAM_H = L.camH;
    scene.fog.near = L.fog[0]; scene.fog.far = L.fog[1];
    camDirFrom(camYaw); syncAxes();
    level = id;
    const s = spawn || L.spawn;
    placeAt(s.x, s.z, s.yaw);
    currentZone = null;
    elPrompt.classList.remove('on');
    showWhere();
  }

  // 암전 → 교체 → 밝힘. 전환 중에는 입력을 삼킨다(.fade.on 이 포인터를 먹는다).
  function go(id, spawn){
    if (switching || id === level) return;
    switching = true;
    elFade.classList.add('on');
    setTimeout(() => {
      loadLevel(id, spawn);
      // 새 레벨이 한 프레임이라도 그려진 뒤에 걷어야 이전 레벨 잔상이 안 비친다.
      // 다만 rAF 하나만 믿으면 안 된다 — 백그라운드 탭에서는 rAF 가 아예 돌지
      // 않아서 암전이 영구히 남는다. setTimeout 을 안전망으로 같이 건다.
      const clear = () => { elFade.classList.remove('on'); switching = false; };
      requestAnimationFrame(clear);
      setTimeout(clear, 400);
    }, 230);
  }
  function enterBuilding(id){
    lastDoor = id;
    go(id, LEVELS[id].spawn);
  }
  function exitToOutdoor(){
    // 들어갔던 문 앞으로 되돌린다. 원점으로 튀면 어디서 나왔는지 알 수 없다.
    const b = BUILDINGS.find(b => b.level === (lastDoor || level));
    const spawn = b ? {x:b.x, z:b.z + b.d/2 + 2.0, yaw:0} : LEVELS.outdoor.spawn;
    go('outdoor', spawn);
  }

  // ══ 입력 ══════════════════════════════════════════════════════════
  const keys = {};
  const MOVEKEYS = new Set(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d']);
  addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (MOVEKEYS.has(k)){ if (!keys[k]) tap.target = null; keys[k] = true; e.preventDefault(); }
    if (k === 'q') turn(-1);
    if (k === 'e') turn(1);
    if (k === ' ' || k === 'enter'){ interact(); e.preventDefault(); }
  });
  addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  // 보이지 않는 터치 조작: 드래그=조이스틱 / 탭=그 지점으로 이동
  const stick = {on:false, ox:0, oy:0, vx:0, vy:0, moved:false};
  const tap = {target:null, stuck:0};
  const DEAD = 16;
  const rayc = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const GROUND = new THREE.Plane(new THREE.Vector3(0,1,0), 0);
  function screenToGround(cx, cy){
    const r = cv.getBoundingClientRect();
    ndc.set((cx - r.left)/r.width*2 - 1, -((cy - r.top)/r.height*2 - 1));
    rayc.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    return rayc.ray.intersectPlane(GROUND, hit) ? hit : null;
  }
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    stick.on = true; stick.ox = e.clientX; stick.oy = e.clientY;
    stick.vx = stick.vy = 0; stick.moved = false; tap.target = null;
  });
  cv.addEventListener('pointermove', e => {
    if (!stick.on) return;
    const dx = e.clientX - stick.ox, dy = e.clientY - stick.oy, m = Math.hypot(dx, dy);
    if (m > DEAD){ stick.moved = true; stick.vx = dx/m; stick.vy = dy/m; }
    else { stick.vx = stick.vy = 0; }
  });
  function endPointer(e){
    if (!stick.on) return;
    if (!stick.moved){
      if (editing){
        editTap(e.clientX, e.clientY);       // 편집 중의 탭은 배치·선택이다. 걷지 않는다
      } else {
        const hit = screenToGround(e.clientX, e.clientY);
        if (hit){ tap.target = hit; tap.stuck = 0; }
      }
    }
    stick.on = false; stick.vx = stick.vy = 0;
  }
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', () => { stick.on = false; stick.vx = stick.vy = 0; });

  // ══ 충돌 해소 — 축 분리 방식이라 벽을 따라 미끄러진다 ═════════════
  const R = 0.42;
  function resolve(p, axis){
    const list = level === 'study' ? COLLIDERS.concat(ROOM_COLLIDERS) : COLLIDERS;
    for (const c of list){
      if (p.x + R <= c.minX || p.x - R >= c.maxX || p.z + R <= c.minZ || p.z - R >= c.maxZ) continue;
      if (axis === 'x') p.x = (p.x < (c.minX + c.maxX)/2) ? c.minX - R : c.maxX + R;
      else              p.z = (p.z < (c.minZ + c.maxZ)/2) ? c.minZ - R : c.maxZ + R;
    }
  }

  // ══ 존 · HUD ══════════════════════════════════════════════════════
  const elWhere = document.getElementById('where');
  const elPrompt = document.getElementById('prompt');
  const elPTitle = document.getElementById('pTitle'), elPSub = document.getElementById('pSub');
  const elPBtn = document.getElementById('pBtn'), elPAct = document.getElementById('pAct');
  const elToast = document.getElementById('toast');
  const elBagBtn = document.getElementById('bagBtn'), elBagBells = document.getElementById('bagBells');
  const elBag = document.getElementById('bagPanel'), elShop = document.getElementById('shopPanel');
  const elRoomBtn = document.getElementById('roomBtn'), elEditBar = document.getElementById('editBar');
  let currentZone = null, toastTimer = 0;

  function toast(msg){
    elToast.textContent = msg; elToast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elToast.classList.remove('on'), 2200);
  }
  function zoneKey(z){ return !z ? '' : z.kind + ':' + (z.room ? z.room.id : z.level || z.name); }
  // 존 밖에서는 레벨 이름이 곧 현재 위치다. 레벨이 바뀔 때도 불러야 하므로
  // setZone 안에 두지 않는다 — setZone 은 '존이 바뀌었을 때' 만 도는데,
  // 야외→실내는 둘 다 존 밖(null)이라 그 조건에 안 걸린다.
  function showWhere(){
    const room = currentZone && currentZone.kind === 'room' ? currentZone.room : null;
    const label = room
      ? ((room.personal && ME) ? `${ME.name}님의 자습실` : room.name)
      : LEVELS[level].name;
    elWhere.innerHTML = '현재 위치 · <b>' + label + '</b>';
  }
  function setZone(z){
    if (zoneKey(z) === zoneKey(currentZone)) return;
    currentZone = z;
    showWhere();
    if (z){
      elPTitle.textContent = z.name; elPSub.textContent = z.sub;
      elPAct.textContent =
        z.kind === 'exit' ? '나가기' :
        z.kind === 'tree' ? '흔들기' :
        z.kind === 'shop' ? '열기'   : '입장';
      elPrompt.classList.add('on');
    } else elPrompt.classList.remove('on');
    // 방 꾸미기 버튼은 내 자습실 존 안에서만 보인다(로그인 전용 — 방문자는 저장할 방이 없다)
    elRoomBtn.hidden = !(ME && z && z.kind === 'room' && z.room.id === 'study' && z.room.personal);
  }
  function interact(){
    if (!currentZone || switching) return;
    if (currentZone.kind === 'enter') return enterBuilding(currentZone.level);
    if (currentZone.kind === 'exit')  return exitToOutdoor();
    if (currentZone.kind === 'tree')  return shakeTree(currentZone.tree);
    if (currentZone.kind === 'shop')  return openShop();
    const room = currentZone.room;
    if (room.go) location.href = room.go;        // 룸 데이터가 이동 대상을 갖는다
    else toast(room.name + ' — 다음 슬라이스에서 구현');
  }
  elPBtn.onclick = interact;

  // 실시간 채널 — 레벨 단위로 나눈다. 같은 건물 안에 있는 사람만 서로 보인다.
  // 개인 자습실만 계정별로 한 겹 더 나눈다(남의 방에 내가 보이면 안 된다).
  const channelOf = (z) => {
    const room = z && z.kind === 'room' ? z.room : null;
    if (!room) return level;
    return (room.personal && ME) ? `${room.id}:${ME.uid}` : room.id;
  };

  // ── 카메라 회전 ────────────────────────────────────────────────
  // 45°씩 끊어 돌린다. 자유 회전은 아이소메트릭 격자가 어긋나 보인다.
  function turn(dir){ camYawTo += dir * Math.PI/4; }
  document.getElementById('rotL').onclick = () => turn(-1);
  document.getElementById('rotR').onclick = () => turn(1);

  // ── 꾸미기 모달 ────────────────────────────────────────────────────
  // 미리보기는 모달이 자기 캔버스에 직접 그린다(customizer.js). 맵 아바타는
  // 모달이 덮어 가리므로, 값이 바뀔 때마다 여기서 다시 만들 이유가 없다.
  // 닫힐 때 한 번만 만든다 — 취소·저장 어느 쪽이든 onClose 를 거친다.
  function rebuildPlayer(){
    disposeAvatar(player);
    player = buildAvatar(myLook, myBody);
    player.root.position.set(P.x, 0, P.z);
    player.root.rotation.y = P.yaw;
    const tag = nameTag(MY_LABEL);
    tag.position.set(0, 3.45, 0); tag.scale.set(2.0, 0.5, 1);
    player.root.add(tag);
    scene.add(player.root);
  }

  const cz = mountCustomizer({
    onChange(look, body){ myLook = look; myBody = body; },
    async onSave(look, body){
      const r = await saveCharacter(look, body);
      if (r.ok && net) net.updateMeta(look, body);      // 남들 화면에도 바로 반영
      return r;
    },
    onClose(){ rebuildPlayer(); },
  });
  document.getElementById('dressBtn').onclick = () => cz.open(myLook, myBody, ME);

  // ══ 가방 · 매점 ═══════════════════════════════════════════════════
  // 패널은 innerHTML 로 매번 다시 그린다 — 항목이 10개 남짓이라 diff 를 관리할
  // 이유가 없다. 클릭은 패널 단위 위임으로 받는다.
  const uiOpen = () => !elBag.hidden || !elShop.hidden;
  const esc = s => String(s);
  const itemRow = (k, right) =>
    `<div class="prow"><span class="nm">${ITEMS[k].icon} ${esc(ITEMS[k].name)}</span>${right}</div>`;

  function refreshBag(){
    elBagBells.textContent = INV.bells.toLocaleString();
    if (elBag.hidden) return;
    const have = Object.keys(ITEMS).filter(k => countOf(k) > 0);
    const rows = have.map(k => itemRow(k, `<span class="ct">×${countOf(k)}</span>`));
    const crafts = RECIPES.map(r => {
      const ok = Object.entries(r.need).every(([k, n]) => countOf(k) >= n);
      const need = Object.entries(r.need).map(([k, n]) => `${ITEMS[k].name}×${n}`).join(' + ');
      return itemRow(r.make, `<button data-craft="${r.id}" ${ok ? '' : 'disabled'}>조합 · ${need}</button>`);
    });
    elBag.innerHTML =
      `<div class="phead">🎒 가방<span class="sp"></span><b>${INV.bells.toLocaleString()}벨</b>` +
      `<button class="x" data-close aria-label="닫기">✕</button></div>` +
      `<div class="pbody">` +
      (rows.length ? rows.join('') : `<div class="pempty">비어 있어요 — 야외 과일나무를 흔들어 보세요</div>`) +
      `<div class="psec">조합</div>` + crafts.join('') +
      `</div>`;
  }
  function refreshShop(){
    if (elShop.hidden) return;
    const sells = Object.keys(ITEMS).filter(k => ITEMS[k].sell && countOf(k) > 0)
      .map(k => itemRow(k, `<span class="ct">×${countOf(k)}</span>` +
        `<button data-sell="${k}">팔기 ${ITEMS[k].sell}벨</button>` +
        (countOf(k) > 1 ? `<button data-sellall="${k}" class="ghostb">전부</button>` : '')));
    const buys = Object.keys(ITEMS).filter(k => ITEMS[k].buy)
      .map(k => itemRow(k, `<button data-buy="${k}" ${INV.bells >= ITEMS[k].buy ? '' : 'disabled'}>` +
        `${ITEMS[k].buy}벨</button>`));
    elShop.innerHTML =
      `<div class="phead">🏪 매점<span class="sp"></span><b>${INV.bells.toLocaleString()}벨</b>` +
      `<button class="x" data-close aria-label="닫기">✕</button></div>` +
      `<div class="pbody">` +
      `<div class="psec">팔기</div>` +
      (sells.length ? sells.join('') : `<div class="pempty">팔 물건이 없어요</div>`) +
      `<div class="psec">사기 — 가구는 자습실에 놓을 수 있어요</div>` + buys.join('') +
      `</div>`;
  }
  function openBag(){ elShop.hidden = true; elBag.hidden = false; refreshBag(); }
  function openShop(){ elBag.hidden = true; elShop.hidden = false; refreshShop(); }
  elBagBtn.onclick = () => elBag.hidden ? openBag() : (elBag.hidden = true);

  elBag.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-close')){ elBag.hidden = true; return; }
    const r = RECIPES.find(r => r.id === b.dataset.craft);
    if (r){
      for (const [k, n] of Object.entries(r.need)) if (countOf(k) < n) return;
      for (const [k, n] of Object.entries(r.need)) take(k, n);
      give(r.make);
      toast(`${ITEMS[r.make].icon} ${r.name} 완성!`);
      refreshBag();
    }
  });
  elShop.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-close')){ elShop.hidden = true; return; }
    const d = b.dataset;
    if (d.sell || d.sellall){
      const k = d.sell || d.sellall, n = d.sellall ? countOf(k) : 1;
      if (!take(k, n)) return;
      INV.bells += ITEMS[k].sell * n; markInv();
      toast(`${ITEMS[k].name} ×${n} → ${(ITEMS[k].sell*n).toLocaleString()}벨`);
      refreshShop();
    } else if (d.buy){
      const k = d.buy;
      if (INV.bells < ITEMS[k].buy) return;
      INV.bells -= ITEMS[k].buy; give(k);
      toast(`${ITEMS[k].icon} ${ITEMS[k].name} 구입!`);
      refreshShop();
    }
  });

  // ══ 방 꾸미기 (자습실 배치 모드) ═══════════════════════════════════
  //  가방의 가구를 골라 바닥 탭 = 배치 / 놓인 가구 탭 = 선택(이동·회전·치우기).
  //  저장 전까지는 전부 편집 사본(editItems)에서만 논다.
  let editing = false, editItems = null, origRoom = null, invSnap = null;
  let editSel = -1, placeType = null;
  const selMarker = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.74, 28).rotateX(-Math.PI/2),
    new THREE.MeshBasicMaterial({color:0x1f7a33, transparent:true, opacity:0.85, depthWrite:false}));
  selMarker.visible = false; selMarker.renderOrder = 5;
  scene.add(selMarker);

  function syncMarker(){
    selMarker.visible = editing && editSel >= 0;
    if (!selMarker.visible) return;
    const it = editItems[editSel], f = FURNITURE[it.t];
    selMarker.position.set(it.x, 0.04, it.z);
    selMarker.scale.setScalar(Math.max(f.w, f.d));
  }
  function overlaps(it, self){
    if (FURNITURE[it.t].solid === false) return false;      // 러그는 깔개다 — 겹쳐도 된다
    const a = itemBox(it);
    return editItems.some((o, i) => {
      if (i === self || FURNITURE[o.t].solid === false) return false;
      const b = itemBox(o);
      return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
    });
  }
  function refreshEditBar(){
    const chips = Object.keys(ITEMS).filter(k => ITEMS[k].furn && countOf(k) > 0)
      .map(k => `<button class="chip ${placeType === k ? 'on' : ''}" data-place="${k}">` +
                `${ITEMS[k].icon} ${ITEMS[k].name} ×${countOf(k)}</button>`);
    elEditBar.innerHTML =
      `<div class="chips">` +
      (chips.length ? chips.join('') : `<span class="pempty">가구가 없어요 — 매점에서 살 수 있어요</span>`) +
      `</div>` +
      `<div class="acts">` +
      `<button data-rot ${editSel < 0 ? 'disabled' : ''}>회전</button>` +
      `<button data-del ${editSel < 0 ? 'disabled' : ''}>치우기</button>` +
      `<span class="sp"></span>` +
      `<button data-save>저장</button>` +
      `<button data-cancel class="ghostb">취소</button>` +
      `</div>` +
      `<div class="hint">${placeType
        ? '바닥을 탭하면 놓입니다'
        : editSel >= 0 ? '바닥 탭 = 이동 · 회전/치우기 버튼 사용' : '가구 칩을 고르거나, 놓인 가구를 탭하세요'}</div>`;
  }
  function applyEdit(){ applyRoom(editItems); syncMarker(); refreshEditBar(); }

  function startEdit(){
    if (editing || !ME) return;
    editing = true;
    origRoom = myRoom.map(it => ({...it}));
    editItems = myRoom.map(it => ({...it}));
    invSnap = JSON.stringify(INV.inv);
    editSel = -1; placeType = null;
    elBag.hidden = elShop.hidden = true;
    elEditBar.hidden = false; elRoomBtn.hidden = true;
    applyEdit();
    toast('방 꾸미기 — 가구 칩을 고르고 바닥을 탭하세요');
  }
  async function endEdit(save){
    if (!editing) return;
    editing = false;
    elEditBar.hidden = true;
    selMarker.visible = false;
    if (save){
      applyRoom(editItems);
      flushInv();
      const r = await saveRoom(editItems);
      toast(r.ok ? '방을 저장했어요' : '저장 실패: ' + r.error);
    } else {
      INV.inv = JSON.parse(invSnap); markInv();
      applyRoom(origRoom);
      toast('되돌렸어요');
    }
  }
  elRoomBtn.onclick = startEdit;
  elEditBar.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.place !== undefined){ placeType = placeType === d.place ? null : d.place; editSel = -1; syncMarker(); refreshEditBar(); }
    else if (d.rot !== undefined && editSel >= 0){
      const it = editItems[editSel], prev = it.r;
      it.r = (it.r + Math.PI/2) % (Math.PI*2);
      if (overlaps(it, editSel)){ it.r = prev; toast('돌릴 자리가 없어요'); return; }
      applyEdit();
    }
    else if (d.del !== undefined && editSel >= 0){
      give(editItems[editSel].t);
      editItems.splice(editSel, 1); editSel = -1;
      applyEdit();
    }
    else if (d.save !== undefined) endEdit(true);
    else if (d.cancel !== undefined) endEdit(false);
  });

  // 편집 중의 탭 — 가구 선택 / 배치 / 이동. 이동 탭과 완전히 분리된다.
  function editTap(cx, cy){
    const r = cv.getBoundingClientRect();
    ndc.set((cx - r.left)/r.width*2 - 1, -((cy - r.top)/r.height*2 - 1));
    rayc.setFromCamera(ndc, camera);
    const hits = rayc.intersectObjects(roomGroup.children, false);
    if (hits.length){
      editSel = roomGroup.children.indexOf(hits[0].object);
      placeType = null;
      syncMarker(); refreshEditBar();
      return;
    }
    const hit = new THREE.Vector3();
    if (!rayc.ray.intersectPlane(GROUND, hit)) return;
    const x = Math.round(hit.x*2)/2, z = Math.round(hit.z*2)/2;
    const B = ROOM_BOUNDS;
    if (x < B.minX || x > B.maxX || z < B.minZ || z > B.maxZ){
      if (placeType || editSel >= 0) toast('자습실 안에만 놓을 수 있어요');
      return;
    }
    if (placeType){
      const it = {t:placeType, x, z, r:0};
      if (overlaps(it, -1)){ toast('겹치는 자리예요'); return; }
      if (!take(placeType)) return;
      editItems.push(it);
      editSel = editItems.length - 1; placeType = null;
      applyEdit();
    } else if (editSel >= 0){
      const it = editItems[editSel], px = it.x, pz = it.z;
      it.x = x; it.z = z;
      if (overlaps(it, editSel)){ it.x = px; it.z = pz; toast('겹치는 자리예요'); return; }
      applyEdit();
    }
  }

  // ── 첫 레벨 ────────────────────────────────────────────────────────
  refreshBag();                       // 툴바의 벨 잔액 첫 표시
  loadLevel('outdoor');

  // ══ 루프 ══════════════════════════════════════════════════════════
  const SPEED = 4.6;
  const clock = new THREE.Clock();
  const moveVec = new THREE.Vector3(), tmp = new THREE.Vector3();
  const occRay = new THREE.Raycaster(), occDir = new THREE.Vector3();

  function resize(){
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    // 브라우저를 확대하면 devicePixelRatio가 바뀐다. 픽셀비를 다시 잡지 않으면
    // 버퍼 크기가 어긋나 화면 옆에 흰 여백이 남는다.
    const pr = Math.min(devicePixelRatio || 1, PR_CAP);
    if (renderer.getPixelRatio() !== pr) renderer.setPixelRatio(pr);
    if (cv.width !== Math.round(w*pr) || cv.height !== Math.round(h*pr)){
      renderer.setSize(w, h, false);
      camera.aspect = w/h; camera.updateProjectionMatrix();
    }
  }

  // 카메라와 나 사이를 건물이 막으면 그 건물만 비친다.
  // 야외 건물은 허리 높이가 아니라 진짜 높이라, 45°씩 돌리다 보면 반드시 가린다.
  function fadeOccluders(dt){
    if (!OCCLUDERS.length) return;
    occDir.copy(player.root.position).setY(1.2).sub(camera.position);
    occRay.far = occDir.length();
    occRay.set(camera.position, occDir.normalize());
    const k = 1 - Math.exp(-9 * dt);
    for (const b of OCCLUDERS){
      const want = occRay.intersectObjects(b.test, false).length ? 0.22 : 1;
      for (const m of b.meshes){
        const mat = m.material;
        // transparent 를 바꾸면 셰이더를 다시 컴파일해야 한다. 최초 1회만 건드린다
        if (!mat.transparent){ mat.transparent = true; mat.needsUpdate = true; }
        mat.opacity += (want - mat.opacity) * k;
        // 반투명한데 깊이를 쓰면 뒤쪽 벽이 안 보인다. 거의 불투명할 때만 깊이를 쓴다
        mat.depthWrite = mat.opacity > 0.92;
      }
    }
  }

  let rafId = 0;
  function frame(){
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.getElapsedTime();
    resize();

    // ── 입력 → 이동 벡터 (카메라 기준) ──
    // 꾸미는 동안·전환 중·패널이 열린 동안에는 조작을 받지 않는다
    const frozen = cz.isOpen() || switching || uiOpen();
    let ix = 0, iy = 0;
    if (frozen){ for (const k in keys) keys[k] = false; tap.target = null; stick.vx = stick.vy = 0; }
    if (keys['w'] || keys['arrowup'])    iy += 1;
    if (keys['s'] || keys['arrowdown'])  iy -= 1;
    if (keys['a'] || keys['arrowleft'])  ix -= 1;
    if (keys['d'] || keys['arrowright']) ix += 1;
    if (ix || iy) tap.target = null;
    if (!ix && !iy && (stick.vx || stick.vy)){ ix = stick.vx; iy = -stick.vy; }

    moveVec.set(0,0,0);
    if (ix || iy){
      moveVec.addScaledVector(RIGHT, ix).addScaledVector(FWD, iy);
      if (moveVec.lengthSq() > 1) moveVec.normalize();
    } else if (tap.target){
      tmp.set(tap.target.x - P.x, 0, tap.target.z - P.z);
      if (tmp.length() < 0.35) tap.target = null;
      else moveVec.copy(tmp).normalize();
    }

    const moving = moveVec.lengthSq() > 0.0001;
    if (moving){
      const before = P.x + P.z;
      P.x += moveVec.x * SPEED * dt; resolve(P, 'x');
      P.z += moveVec.z * SPEED * dt; resolve(P, 'z');
      // 탭 이동이 벽에 막혀 제자리면 목적지를 버린다(소프트락 방지)
      if (tap.target){
        tap.stuck = (Math.abs((P.x + P.z) - before) < 0.004) ? tap.stuck + dt : 0;
        if (tap.stuck > 0.45) { tap.target = null; tap.stuck = 0; }
      }
      P.walkT += dt * SPEED * 1.55;
      const want = Math.atan2(moveVec.x, moveVec.z);
      let d = want - P.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));            // 최단 회전
      P.yaw += d * Math.min(1, dt * 14);
    }
    player.root.position.set(P.x, 0, P.z);
    player.root.rotation.y = P.yaw;
    poseAvatar(player, moving ? 'walk' : 'idle', 'none', moving ? P.walkT/7 : t);

    for (const n of NPCS) poseAvatar(n.rig, 'idle', 'none', t + n.phase);

    // 다른 접속자 — 받은 좌표로 보간해서 그린다
    for (const r of remotes.values()){
      const k = 1 - Math.exp(-11 * dt);
      r.x += (r.tx - r.x) * k;
      r.z += (r.tz - r.z) * k;
      let dy = r.tyaw - r.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      r.yaw += dy * Math.min(1, dt * 12);
      r.rig.root.position.set(r.x, 0, r.z);
      r.rig.root.rotation.y = r.yaw;
      if (r.moving) r.walkT += dt * SPEED * 1.55;
      poseAvatar(r.rig, r.moving ? 'walk' : 'idle', 'none', r.moving ? r.walkT/7 : t);
    }

    // ── 동숲: 곡면 램프 · 구름 · 나무 흔들림 · 과일 낙하/줍기 ──
    CURVE.value += ((level === 'outdoor' ? CURVE_K : 0) - CURVE.value) * Math.min(1, dt*4);
    // 굽힘 기준점 = 플레이어의 뷰공간 깊이. 여기서 변형량이 0 이라 발이 땅에 붙는다
    FOCUS.value = tmp.copy(player.root.position).setY(0.9)
                     .applyMatrix4(camera.matrixWorldInverse).z;
    if (level === 'outdoor'){
      for (const c of clouds){
        c.g.position.x += c.speed * dt;
        if (c.g.position.x > 55) c.g.position.x = -55;
      }
      for (const ft of fruitTrees){
        if (ft.shakeT > 0){
          ft.shakeT = Math.max(0, ft.shakeT - dt);
          ft.crown.rotation.z = Math.sin(t*34) * 0.09 * ft.shakeT;
          ft.crown.rotation.x = Math.cos(t*27) * 0.07 * ft.shakeT;
        }
      }
      if (groundFruits.length){
        const keep = [];
        for (const gf of groundFruits){
          const m = gf.mesh;
          if (gf.vy !== null){                              // 낙하 중
            gf.vy -= 12 * dt;
            m.position.x += gf.vx * dt;
            m.position.z += gf.vz * dt;
            m.position.y += gf.vy * dt;
            if (m.position.y <= 0.21){ m.position.y = 0.21; gf.vy = null; }
            keep.push(gf);
          } else {
            const dx = m.position.x - P.x, dz = m.position.z - P.z;
            if (dx*dx + dz*dz < 1.44){                      // 다가가면 줍는다
              world.remove(m);
              give('apple');
              toast(`🍎 사과 +1 · 모두 ${countOf('apple')}개`);
            } else keep.push(gf);
          }
        }
        groundFruits = keep;
      }
    }

    // ── 존 판정 ──
    let inZone = null;
    for (const z of ZONES){
      if (z.kind === 'tree' && INV.picked.includes(z.tree)) continue;   // 오늘 흔든 나무는 끝
      if (P.x > z.minX && P.x < z.maxX && P.z > z.minZ && P.z < z.maxZ){ inZone = z; break; }
    }
    setZone(editing ? null : inZone);

    // 내 좌표 발행 — 채널이 바뀌면 net.js가 구독 대상을 통째로 갈아끼운다
    if (net) net.publish(P.x, P.z, P.yaw, moving, channelOf(inZone));

    // 조감에서는 이름표가 서로 겹쳐 오히려 안 읽힌다 — 멀어지면 감춘다
    const tagsOn = zoom < 1.15;
    meTag.visible = tagsOn;
    for (const n of NPCS) n.rig.root.children.forEach(c => { if (c.isSprite) c.visible = tagsOn; });
    for (const r of remotes.values()) r.rig.root.children.forEach(c => { if (c.isSprite) c.visible = tagsOn; });

    // ── 카메라 회전 보간 ──
    if (Math.abs(camYawTo - camYaw) > 1e-4){
      camYaw += (camYawTo - camYaw) * Math.min(1, dt * 9);
      camDirFrom(camYaw); syncAxes();
    }

    // ── 카메라: 위치와 look-at을 각각 스무딩 ──
    // 세로로 긴 화면(모바일)은 가로 시야가 좁다. 거리로 보정해 주변 맥락이 보이게 한다.
    const fit = Math.min(1.7, Math.max(1, 1.35 / camera.aspect));
    tmp.copy(CAM_DIR).multiplyScalar(zoom * fit).add(player.root.position);
    camPos.lerp(tmp, 1 - Math.exp(-6.5 * dt));
    camLook.lerp(tmp.set(P.x, 1.30, P.z), 1 - Math.exp(-9 * dt));
    camera.position.copy(camPos);
    camera.lookAt(camLook);

    fadeOccluders(dt);

    renderer.render(scene, camera);
    rafId = requestAnimationFrame(frame);
  }
  resize();
  frame();
  // 브라우저 플레이 검증용 훅 (test-playable-web-games)
  window.__game = {
    P, get ZONES(){ return ZONES; }, get COLLIDERS(){ return COLLIDERS; },
    room: () => currentZone && currentZone.room && currentZone.room.id,
    level: () => level,
    go: (id) => id === 'outdoor' ? exitToOutdoor() : enterBuilding(id),
    counts: () => ({world: world.children.length, colliders: COLLIDERS.length, zones: ZONES.length}),
    // 동숲 v1 검증 훅
    inv: () => INV,
    zone: () => currentZone && currentZone.kind,
    warp: (x, z) => placeAt(x, z, P.yaw),
    interact, shake: shakeTree, openShop, openBag,
    startEdit, endEdit, editTap,
    fruits: () => ({trees: fruitTrees.map(t => ({id:t.id, left:t.fruits.length})), ground: groundFruits.length}),
  };
  window.__ready = true;
  // 라우트를 떠날 때 멈춘다 — 안 그러면 RAF와 실시간 연결이 남는다
  return function dispose(){
    cancelAnimationFrame(rafId);
    clearTimeout(invTimer); flushInv();
    removeEventListener('pagehide', onPageHide);
    try { net?.leave(); } catch {}
    clearLevel();
    renderer.dispose();
  };
}
