// ══════════════════════════════════════════════════════════════════
//  캠퍼스 맵 — Next 라우트(/campus)가 마운트한다.
//  상단 네비바를 캠퍼스에서도 유지하려고 정적 HTML에서 앱 라우트로 옮겼다.
//  DOM(캔버스·HUD)은 페이지가 그리고, 이 모듈은 그 위에서 돌기만 한다.
// ══════════════════════════════════════════════════════════════════
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import * as CodeAvatar from '/campus/lib/avatar.js';
import { DEFAULT_LOOK, GUEST_LOOK, BODY_BASE } from '/campus/lib/avatar.js';
import { loadWardrobe, buyWardrobe,
         loadCharacter, saveCharacter, saveName, loadRoom, saveRoom, loadPlace, savePlace,
         loadInv, saveInv, whenReady } from '/campus/lib/store.js';
import { roomBounds, roomTier } from '/campus/lib/room.js';
import { ITEMS, RECIPES, FRUIT_TREES } from '/campus/lib/items.js';
import { ROOM_TIERS } from '/campus/lib/room.js';
import { icon } from '/campus/lib/icons.js';
import * as Pets from '/campus/lib/pets.js';
import { DECOR, DECOR_BY_ID, GROUPS, decorSnap, preloadDecor, decorBox, buildDecor, decorThumb,
         thumbOf, disposeThumbs } from '/campus/lib/decor.js';
import { joinCampus } from '/campus/lib/net.js';
import { CURVE, FOCUS, bend } from '/campus/lib/curve.js';
import { createSky } from '/campus/lib/sky.js';
import { loadKit, placeKit, placeKitInstanced, kitSize, GRASS, DIRT } from '/campus/lib/kit.js';

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
  //    내 방 가구 배치가 월드 절대좌표로 저장돼 있어서(room.js ROOM_FULL,
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
  //  한 번짜리 동작(점프·손흔들기·줍기)은 Kenney 어댑터에만 있다.
  //  코드 아바타로 폴백했을 땐 조용히 무시된다.
  const playOnce = Avatar.playOnce || (() => {});
  //  상태(idle/walk/run/sit)가 아니라 한 번 재생되는 몸짓들
  const GESTURES = new Set(['jump', 'wave', 'pick', 'point', 'yes', 'no']);
  const IS_GLB = Avatar !== CodeAvatar;

  // Kenney 키트(건물·나무) — 못 받으면 예전 프로시저럴 지오메트리로 돌아간다
  let KIT_OK = false;
  try {
    await loadKit(['building-type-p', 'building-type-k', 'building-type-s',
                   'tree_default', 'tree_oak', 'tree_pineRoundC', 'tree_small',
                   'fence', 'planter', 'apple',
                   'flower_purpleA', 'flower_redA', 'flower_yellowA',
                   'plant_bushSmall', 'grass_large',
                   'fountain-round', 'stall-bench',
                   // 실내 — 벽·바닥·가구까지 전부 키트로 세운다
                   'wall', 'wallDoorway', 'wallWindow', 'floorFull',
                   'desk', 'chairDesk', 'bookcaseOpen', 'bookcaseClosedWide',
                   'loungeSofa', 'table', 'rugRectangle', 'rugRound',
                   'lampSquareFloor', 'pottedPlant', 'televisionModern',
                   'kitchenBar', 'kitchenFridgeLarge', 'stoolBar', 'bedSingle']);
    KIT_OK = true;
  } catch (e){
    console.warn('[campus] Kenney 키트 로드 실패 — 기본 지오메트리로 갑니다', e);
  }

  const cv = document.getElementById('cv');
  const renderer = new THREE.WebGLRenderer({canvas:cv, antialias:true});
  const MOBILE = matchMedia('(max-width:760px)').matches || navigator.maxTouchPoints > 1;
  const PR_CAP = MOBILE ? 1.5 : 2;                          // 모바일 GPU 보호
  renderer.setPixelRatio(Math.min(devicePixelRatio, PR_CAP));
  //  그림자 없음. 한 번 켜 봤다가 껐다 — 저폴리 톤에서는 그림자 경계가 모델의
  //  각진 면과 싸워 지저분해진다. 시간의 흐름은 **조도와 하늘색**으로 말한다.
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  //  하늘 — 거의 흰색이던 시절엔 지평선 위가 종이처럼 비어 보였다.
  //  그라디언트·구름·별·달은 sky.js 가 맡고, 시각에 따라 낮과 밤이 흐른다.
  //  ⚠ 안개 색은 **지평선 색을 따라가야** 한다. 고정해 두면 밤에 먼 나무만
  //    대낮처럼 밝게 남아 하늘에서 오려낸 것처럼 보인다(프레임마다 맞춘다).
  const sky = createSky(scene);
  scene.background = sky.texture;
  scene.fog = new THREE.Fog(0xf2f6ee, 44, 84);
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
  /**
   * 이름표를 머리 바로 위에 단다. 캐릭터 키는 1.30m(avatar-kenney 의 TARGET_H)이고
   * 스프라이트는 **중심** 기준이라 절반 높이를 더해야 아랫변이 머리 위에 온다.
   * 높이를 호출부마다 적어 두면 크기가 다른 표(내 것 0.5 / 남의 것 0.375)끼리
   * 간격이 어긋난다 — 여기서 한 번에 계산한다.
   */
  const TAG_GAP = 0.17;                       // 머리와 이름표 아랫변 사이
  function placeTag(tag, w, h){
    tag.scale.set(w, h, 1);
    tag.position.set(0, 1.30 + TAG_GAP + h/2, 0);
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
  //  outdoor ── 캠퍼스. 첫 화면. 건물 셋이 한 화면에 다 들어온다.
  //    ├ main   학습센터 : 학습실 · 상담실(충쌤)
  //    ├ study  우리집   : 내 방 — 포인트로 넓어지는 꾸미기 공간
  //    └ union  상점     : 매장 — 팔고 사기

  const LEVELS = {
    // 건물 셋이 한 화면에 들어오되 **캐릭터가 읽힐 만큼** 가까워야 한다.
    // 예전 값(42/24.5 = 거리 48m)에서는 캐릭터가 점이었다. 마을을 좁히고
    // 카메라를 당겼다 — 거리 25m 면 1.3m 캐릭터가 화면 높이의 1/10 쯤 된다.
    // fog 는 레벨마다 다르다. 실내 값을 야외에 그대로 쓰면 건물이 안개에 잠긴다.
    // spawn.yaw 는 **카메라 반대 방향**이어야 뒷모습이 보인다.
    // 카메라 기본각이 0°(camYaw=0, 카메라가 +z 쪽)이므로 캐릭터는 -z 인 π 를 본다.
    // 야외 부감은 28°(24.4/13.0, 거리 27.7m). 40° 대에서는 하늘이 안 보여
    // 곡면 셰이더가 드러나지 않았다 — 동숲의 곡률은 낮은 각을 위한 장치다.
    // 33° 도 써 봤는데 지평선만 겨우 생기고 땅이 말리는 게 안 보였다.
    // 안개 46m 는 하필 울타리 자리였다(카메라→마을 끝 ≈45m). 부감을 내려 보이는
    // 땅이 60m 밖까지 늘어나자 마을 경계부터 흰색으로 빠졌다. 안개는 마을 **밖**
    // 에서만 걸려야 한다 — 지평선을 지우는 장치지 바닥을 지우는 장치가 아니다.
    // 부감 22°(22.0/8.9). 28° 에서는 지평선이 화면 밖이라 하늘이 한 뼘도 안 보였다 —
    // 동숲의 하늘은 각도를 낮춰서 버는 것이다. 더 낮추면 건물 뒤가 안 보인다.
    outdoor: {id:'outdoor', name:'캠퍼스',     outdoor:true, spawn:{x:0,   z:0,    yaw:Math.PI}, camR:22.0, camH:8.9, fog:[64, 130]},
    main:    {id:'main',    name:'학습센터', spawn:{x:0,    z:-4.2, yaw:Math.PI}, camR:16.0, camH:11.0, fog:[34, 70]},
    // 우리집은 뒷모습으로 통일한다. 상점만 0 인 건 매점쌤(z=4.4)을 마주 보라는 뜻이다.
    study:   {id:'study',   name:'우리집',   spawn:{x:-7.5, z:-4.6, yaw:Math.PI}, camR:16.0, camH:11.0, fog:[34, 70]},
    union:   {id:'union',   name:'상점',     spawn:{x: 7.5, z:-4.6, yaw:0},       camR:16.0, camH:11.0, fog:[34, 70]},
  };

  const ROOMS = [
    {id:'class',  level:'main',  name:'학습실',   sub:'클래스카드 · 오토보카 · 매일국어', x:-7.5, z:-13.5, w:13, d:8, door:'s', hue:0x1f7a33},
    {id:'office', level:'main',  name:'상담실',   sub:'충쌤에게 물어보기',                x: 7.5, z:-13.5, w:13, d:8, door:'s', hue:0x1f7a33},
    {id:'study',  level:'study', name:'내 방',    sub:'포인트로 넓히고 꾸미기',           x:-7.5, z:  1,   w:13, d:8, door:'n', hue:0x1f7a33,
     personal:true},
    {id:'lounge', level:'union', name:'매장',     sub:'팔고 사기',                        x: 7.5, z:  1,   w:13, d:8, door:'n', hue:0x1f7a33},
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
  //  kit = Kenney City Kit Suburban 모델. 못 받으면 예전 상자 건물로 돌아간다.
  //  kitYaw = 모델 정면이 남쪽(+z)을 보게 돌리는 각.
  //  fitH 는 **캐릭터 키(1.3m)의 배수**로 읽어야 한다. 5.4m 는 4.2배 — 실제
  //  2층 건물 비율이고, 그러면 마을이 아니라 도시로 보인다. 동숲 건물은 주민의
  //  세 배쯤이다. 3.2 · 2.6 배로 낮추고, 낮아진 만큼 서로 당겨 붙였다.
  //  건물은 이제 **꾸미기 배치**다(campusPlaces/outdoor). 여기 남은 건
  //  아직 한 번도 안 꾸민 캠퍼스에 심을 **기본 자리**뿐이다.
  //  ⚠ 셋 다 지워지면 아무 건물에도 못 들어간다. seedBuildings 가 도로 심는다.
  const BUILDING_SEED = [
    {t:'bMain',  x:  0,   z:-9.5, r:0, s:1},
    {t:'bStudy', x:-7.6,  z:-2,   r:0, s:1},
    {t:'bUnion', x: 7.6,  z:-2,   r:0, s:1},
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
  // 벤치는 캐릭터(키 1.3m)에 맞춰 1.8m 로 줄였다 — 2.6m 는 3인용 정원 벤치 크기였다
  prop('outdoor', 'bench-a', -3.8, 2.2, 1.6, 0.5, 0.40, 0xd9cdb4);
  prop('outdoor', 'bench-b',  3.8, 2.2, 1.6, 0.5, 0.40, 0xd9cdb4);
  // 휴게실 매점 카운터 — 점원(매점쌤)이 뒤에 선다
  prop('union', 'shop-counter', 11.5, 3.2, 2.8, 1.0, 0.95, 0xd9b98c);

  // 로컬 광원(천장 전등) 없음 — 전역 조명만 쓴다.
  // 밝기는 조명 세기가 아니라 재질의 밝은 색에서 나온다. 세기를 올려 밝히면
  // 툰 셰이딩이 흰색으로 포화돼 캐릭터 얼굴이 날아간다(민머리에서 특히 드러난다).
  const hemi = new THREE.HemisphereLight(0xffffff, 0xf0f5f1, 0.76);
  scene.add(hemi);
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
    wallSpots = []; floorSpots = [];
  }

  // 벽 패널을 모아 뒀다가 레벨 끝에서 한 번에 인스턴싱한다(조각마다 드로우콜을 쓰면
  // 실내 하나에 백 개가 넘는다). 충돌은 조각 단위 AABB 그대로다.
  let wallSpots = [];
  const WALL_S = 1.16;                    // Kenney wall 1.0×1.29 → 폭 1.16m · 높이 1.5m

  function addWall(x1, z1, x2, z2){
    const seg = {
      minX: Math.min(x1,x2) - WALL_T/2, maxX: Math.max(x1,x2) + WALL_T/2,
      minZ: Math.min(z1,z2) - WALL_T/2, maxZ: Math.max(z1,z2) + WALL_T/2,
    };
    if (seg.maxX - seg.minX < 0.01 || seg.maxZ - seg.minZ < 0.01) return;  // 길이 0 조각 버림
    //  허리 벽이지만 top 은 3m 로 둔다 — 실제 높이(1.5)를 쓰면 뛰어넘어 방 밖으로
    //  나간다. 여긴 놀이터가 아니라 방이다.
    seg.top = 3.0;
    COLLIDERS.push(seg);

    if (KIT_OK){
      const alongX = (seg.maxX - seg.minX) > (seg.maxZ - seg.minZ);
      const len = alongX ? seg.maxX - seg.minX : seg.maxZ - seg.minZ;
      const n = Math.max(1, Math.round(len / WALL_S));
      const step = len / n;
      const cx = (seg.minX + seg.maxX)/2, cz = (seg.minZ + seg.maxZ)/2;
      for (let i = 0; i < n; i++){
        const t = -len/2 + (i + 0.5)*step;
        wallSpots.push(alongX
          ? {x: cx + t, z: cz, yaw: 0, scale: step / 1.0}
          : {x: cx, z: cz + t, yaw: Math.PI/2, scale: step / 1.0});
      }
      return;
    }
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

  // 실내 바닥도 키트 타일로 깐다. 한 판씩 모았다가 레벨 끝에서 인스턴싱한다.
  let floorSpots = [];
  const FLOOR_S = 2.0;                    // Kenney floorFull 1×1 → 2m 타일

  function floorPlate(minX, maxX, minZ, maxZ, color, rep, y){
    if (KIT_OK){
      const w = maxX - minX, d = maxZ - minZ;
      const nx = Math.max(1, Math.round(w / FLOOR_S)), nz = Math.max(1, Math.round(d / FLOOR_S));
      const sx = w / nx, sz = d / nz;
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++)
        floorSpots.push({x: minX + (i + 0.5)*sx, z: minZ + (j + 0.5)*sz, scale: sx, y});
      return null;
    }
    const w = maxX - minX, d = maxZ - minZ;
    const t = track(tileTex(1)); t.repeat.set(w/rep, d/rep);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), flat(color, t));
    m.rotation.x = -Math.PI/2;
    m.position.set((minX+maxX)/2, y, (minZ+maxZ)/2);
    world.add(m);
    return m;
  }
  // 타일 없는 단색 판 — 잔디·길처럼 눈금이 있으면 안 되는 바닥에 쓴다
  /**
   * 바닥 판.
   *
   * ⚠ 정점 넷짜리 판을 쓰면 안 된다. 안개도 곡면도 **버텍스 셰이더**에서
   *   계산되므로, 400m 판의 네 귀퉁이 값이 마당 전체에 보간된다 —
   *   코앞의 흙이 지평선 안개 색까지 끌려와 하얗게 뜨고(울타리·나무는 정점이
   *   많아 멀쩡하니 바닥만 바랜 것처럼 보인다), 땅은 아예 안 굽는다.
   *   4m 쯤마다 한 칸씩 쪼갠다. 삼각형 몇 천 개는 이 화면에서 공짜다.
   */
  function plate(cx, cz, w, d, color, y, lit){
    const seg = n => Math.min(96, Math.max(1, Math.round(n / 4)));
    //  야외 바닥은 **빛을 받는 재질**이다. 해가 기울면 잔디도 같이 어두워져야
    //  밤이 밤으로 읽힌다. 실내는 그대로 flat — 거긴 해가 없다.
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d, seg(w), seg(d)).rotateX(-Math.PI/2),
      lit ? lam(color, null, 0.9) : flat(color));
    m.position.set(cx, y, cz);
    world.add(m);
    return m;
  }
  function trees(list){
    if (KIT_OK){
      // Kenney 나무 — 시드 고정으로 크기·방향만 흔들어 심는다(같은 모델 반복이 티 안 나게)
      let s = 3;
      const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
      const KINDS = ['tree_default', 'tree_oak', 'tree_pineRoundC', 'tree_small'];
      for (const [x, z] of list){
        const k = KINDS[Math.floor(rnd() * KINDS.length)];
        const g = placeKit(k, {x, z, yaw: rnd() * Math.PI * 2,
          scale: (k === 'tree_small' ? 2.6 : 3.0) * (0.85 + rnd()*0.3),
          track: m => junk.push(m)});
        if (g) world.add(g);
      }
      return;
    }
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
    // 바닥은 흙 한 판이다. 색은 키트 팔레트에서 실측한 값.
    // 바닥은 잔디다. 흙 한 판이던 시절엔 마을이 운동장처럼 보였다 —
    // 초록이 깔려야 '밖에 나왔다'가 읽힌다. 길은 에디터의 길·포장 타일로 깐다.
    // 잔디색 그대로는 나무·덤불과 한 덩어리로 붙어 보여서 한 톤 눌렀다.
    plate(0, -4, 400, 400, KIT_OK ? 0x69d193 : 0xb4e0bb, -0.06, true);

    for (const p of PROPS.filter(p => p.level === 'outdoor')) addProp(p);

    // 과일나무 자리(FRUIT_TREES)는 일반 나무 목록에서 뺐다 — 같은 자리에 두 그루가 겹친다
    // 남쪽(카메라 쪽) 앞줄에는 큰 나무를 두지 않는다 — 마을을 통째로 가린다
    trees([
      [-12.8,-11.6],[-5.4,-12.4],[5.4,-12.4],[12.8,-11.6],
      [-13.4,-5.4],[13.4,-5.4],[-13.4, 1.2],[13.4, 1.2],
      [-13.4, 6.2],[13.4, 6.2],
    ]);
    buildFruitTrees();
    buildFlowers();

    buildFence();
  }

  // ── 시계 ───────────────────────────────────────────────────────────
  //  학습센터 정면에 걸린 **진짜 시계**다. 바늘은 이 컴퓨터의 시간을 그대로
  //  가리킨다 — 게임 안 시간을 따로 두면 밖의 시계와 어긋나서 오히려 안 보게 된다.
  //
  //  ⚠ 처음엔 성 키트로 시계탑을 세웠다. 6.4m 로 줄여도 마을에서 제일 큰 것이
  //    되어 학습센터를 뒷방 취급하게 만들었다. 랜드마크가 하나 더 필요한 게
  //    아니라 **시간이 필요했던 것**이므로, 있는 건물의 얼굴에 건다.
  let clockHands = null;                   // {hour, minute} — 프레임마다 각도만 고친다
  function addClockFace(parent, x, y, z, r){
    const cv2 = document.createElement('canvas');
    cv2.width = cv2.height = 256;
    const c2 = cv2.getContext('2d');
    c2.fillStyle = '#f7f4ea'; c2.beginPath(); c2.arc(128, 128, 122, 0, Math.PI*2); c2.fill();
    c2.strokeStyle = '#3a4a3f'; c2.lineWidth = 12;
    c2.beginPath(); c2.arc(128, 128, 117, 0, Math.PI*2); c2.stroke();
    c2.strokeStyle = '#5a6b60';
    for (let i = 0; i < 12; i++){
      const a = i * Math.PI / 6, long = i % 3 === 0;
      c2.lineWidth = long ? 10 : 5;
      const r1 = long ? 84 : 95, r2 = 108;
      c2.beginPath();
      c2.moveTo(128 + Math.sin(a)*r1, 128 - Math.cos(a)*r1);
      c2.lineTo(128 + Math.sin(a)*r2, 128 - Math.cos(a)*r2);
      c2.stroke();
    }
    const tex = new THREE.CanvasTexture(cv2);
    tex.colorSpace = THREE.SRGBColorSpace;
    const faceMat = bend(new THREE.MeshBasicMaterial({map: tex}));
    //  축 캡 — 바늘이 **어디서 도는지**가 또렷해야 시계로 읽힌다
    const handMat = bend(new THREE.MeshBasicMaterial({color: 0x2f3d34}));
    junk.push({dispose: () => { tex.dispose(); faceMat.dispose(); handMat.dispose(); }});

    const face = new THREE.Mesh(new THREE.CircleGeometry(r, 40), faceMat);
    face.position.set(x, y, z);
    const handGeo = (len, w) => new THREE.PlaneGeometry(w, len).translate(0, len/2 - w*0.6, 0);
    const h = new THREE.Mesh(handGeo(r * 0.52, r * 0.13), handMat);
    const m = new THREE.Mesh(handGeo(r * 0.82, r * 0.085), handMat);
    h.position.z = m.position.z = 0.012;
    const cap = new THREE.Mesh(new THREE.CircleGeometry(r * 0.075, 16), handMat);
    cap.position.z = 0.014;
    face.add(h, m, cap);
    parent.add(face);
    clockHands = {hour: h, minute: m};
  }
  function tickClock(){
    if (!clockHands) return;
    const d = new Date();
    const mA = (d.getMinutes() + d.getSeconds()/60) / 60 * Math.PI * 2;
    const hA = ((d.getHours() % 12) + d.getMinutes()/60) / 12 * Math.PI * 2;
    clockHands.hour.rotation.z = -hA;
    clockHands.minute.rotation.z = -mA;
  }

  // ── 캠퍼스 울타리 ──────────────────────────────────────────────────
  //  경계가 없으면 캠퍼스 밖으로 끝없이 걸어 나간다(실측: 8초 달려 60m,
  //  지면 판 밖까지). 보이지 않는 벽으로 막으면 왜 못 나가는지 알 수 없으니
  //  **눈에 보이는 울타리**로 두르고 그 자리에 충돌을 놓는다.
  //  ⚠ 남쪽에 정문 틈을 냈더니 그리로 계속 걸어 나갔다(z=28 까지 확인).
  //    밖에 갈 곳이 생기기 전까지는 **완전히 닫는다** — 보이는 구멍을 보이지 않는
  //    벽으로 막는 것보다, 아예 안 뚫려 있는 편이 정직하다.
  //    대신 남쪽 한가운데에 화분 두 개를 세워 정문처럼 읽히게 한다.
  //  42 × 30 은 1.3m 캐릭터에게 축구장이었다 — 건물 사이를 걷는 데만 6초였다.
  //  30 × 22 로 좁힌다. 담을 것(건물 셋·분수·벤치·과일나무 여섯)은 그대로다.
  const YARD = {minX:-15, maxX:15, minZ:-14, maxZ:8};

  function buildFence(){
    const FZ = KIT_OK ? kitSize('fence') : null;           // 원본 폭 0.48
    const FW = 3.84;                                       // 한 칸이 덮는 미터(목표 폭)
    const spots = [];

    // 축에 나란한 한 줄을 FW 간격으로 채운다
    const run = (axis, fixed, from, to) => {
      const a = Math.min(from, to), b = Math.max(from, to);
      const n = Math.max(1, Math.round((b - a) / FW));
      const step = (b - a) / n;
      for (let i = 0; i < n; i++){
        const t = a + (i + 0.5) * step;
        // ⚠ placeKitInstanced 는 sp.scale 에 base 를 **곱한다**. 여기서 이미
        //   목표 폭에 맞춘 배수를 넣으므로 base 는 1 이어야 한다.
        //   (base 를 8 로 두면 8배로 더 곱해져 울타리가 담벼락이 된다)
        const sc = step / FZ.x;
        spots.push(axis === 'x'
          ? {x: t, z: fixed, yaw: 0,         scale: sc}
          : {x: fixed, z: t, yaw: Math.PI/2, scale: sc});
      }
    };

    if (KIT_OK){
      run('x', YARD.maxZ, YARD.minX, YARD.maxX);            // 남
      run('x', YARD.minZ, YARD.minX, YARD.maxX);            // 북
      run('z', YARD.minX, YARD.minZ, YARD.maxZ);            // 서
      run('z', YARD.maxX, YARD.minZ, YARD.maxZ);            // 동
      const g = placeKitInstanced('fence', spots, {scale: 1, track: m => junk.push(m)});
      if (g) world.add(g);

      // 정문 표시 — 남쪽 한가운데 화분 두 개. 여기가 앞쪽이라는 신호다
      for (const gx of [-3.6, 3.6]){
        const pot = placeKit('planter', {x: gx, z: YARD.maxZ - 1.6, yaw: 0,
                                         scale: 4.0, track: m => junk.push(m)});
        if (pot) world.add(pot);
        //  planter 원본 높이 0.177 × 4.0 배 = 0.71m (kitSize 실측)
        COLLIDERS.push({minX:gx - 0.8, maxX:gx + 0.8,
                        minZ:YARD.maxZ - 2.2, maxZ:YARD.maxZ - 1.0, top:0.71});
      }
    }

    // 충돌은 키트 유무와 상관없이 놓는다 — 모델이 없어도 밖으로 나가면 안 된다
    const T = 0.6;                                          // 울타리 두께(충돌용)
    //  ⚠ 실제 울타리는 1m 남짓이지만 top 은 4m 로 잡는다. 꾸미기로 상자를
    //    계단처럼 쌓으면 마을 밖으로 걸어 나갈 수 있기 때문이다.
    const wall = (minX, maxX, minZ, maxZ) => COLLIDERS.push({minX, maxX, minZ, maxZ, top:4});
    wall(YARD.minX, YARD.maxX,  YARD.maxZ - T/2, YARD.maxZ + T/2);   // 남
    wall(YARD.minX, YARD.maxX,  YARD.minZ - T/2, YARD.minZ + T/2);   // 북
    wall(YARD.minX - T/2, YARD.minX + T/2, YARD.minZ, YARD.maxZ);    // 서
    wall(YARD.maxX - T/2, YARD.maxX + T/2, YARD.minZ, YARD.maxZ);    // 동

    // 울타리 너머 — 나무를 한 겹 둘러 '끝'이 허허벌판으로 안 보이게 한다.
    // 시드 고정이라 들를 때마다 같은 자리에 선다.
    if (!KIT_OK) return;
    let sd = 11;
    const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    const KINDS = ['tree_default', 'tree_oak', 'tree_pineRoundC'];
    const ring = [];
    //  ⚠ 이 띠가 **지평선을 가린다.** 예전엔 울타리 바로 밖에 큰 나무를 둘렀는데,
    //    부감을 낮춰 하늘을 보려 하자 화면 위쪽이 통째로 나무가 됐다. 멀리 밀고
    //    낮춰서, 마을 끝은 가리되 그 너머 하늘은 남긴다.
    for (let x = YARD.minX - 5; x <= YARD.maxX + 5; x += 5.2){
      ring.push([x, YARD.minZ - 4.5 - rnd()*2.5]);
      ring.push([x, YARD.maxZ + 4.5 + rnd()*2.5]);
    }
    for (let z = YARD.minZ - 1; z <= YARD.maxZ + 1; z += 5.2){
      ring.push([YARD.minX - 4.5 - rnd()*2.5, z]);
      ring.push([YARD.maxX + 4.5 + rnd()*2.5, z]);
    }
    for (const [x, z] of ring){
      const k = KINDS[Math.floor(rnd() * KINDS.length)];
      const g = placeKit(k, {x, z, yaw: rnd()*Math.PI*2,
        scale: 2.5 * (0.85 + rnd()*0.3), track: m => junk.push(m)});
      if (g) world.add(g);
    }
  }

  // ── 과일나무·장식 (야외 전용) ──────────────────────────────────────
  // 레벨 로컬 상태 — clearLevel 이 메시를 지우므로 야외를 지을 때마다 다시 채운다.
  let fruitTrees = [];      // {id, crown, fruits[], shakeT, x, z}
  let groundFruits = [];    // {mesh, vx, vy, vz}  떨어져서 주울 수 있는 과일

  function buildFruitTrees(){
    fruitTrees = []; groundFruits = [];
    const TREE_S = 3.8, FRUIT_S = 1.6;
    for (const ft of FRUIT_TREES){
      const g = new THREE.Group(); g.position.set(ft.x, 0, ft.z);
      // 나무 본체는 통째로 하나. 흔들 때는 이 그룹을 기울인다
      const crown = new THREE.Group(); crown.position.y = 0;
      const tree = KIT_OK
        ? placeKit('tree_oak', {scale: TREE_S, track: m => junk.push(m)})
        : null;
      if (tree) crown.add(tree);
      else {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 1.7, 8), lam(0xa9906f, null, .25));
        trunk.position.y = 0.85;
        const lv = new THREE.Mesh(new THREE.SphereGeometry(1.45, 14, 12), lam(0x93c47e, null, .3));
        lv.position.y = 2.6; lv.scale.set(1, .9, 1);
        crown.add(trunk, lv);
      }
      const fruits = [];
      if (!INV.picked.includes(ft.id)){
        // 과일은 남쪽(카메라 쪽)에 몰아 단다 — 뒤에 달리면 있는지도 모른다
        for (const sp of [[-0.75, 2.3, 0.7], [0.8, 2.6, 0.5], [0.05, 3.0, 0.85]]){
          const f = KIT_OK
            ? placeKit('apple', {scale: FRUIT_S, track: m => junk.push(m)})
            : new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), lam(0xe25d4a, null, .4));
          if (!f) continue;
          f.position.set(sp[0], sp[1], sp[2]);
          crown.add(f); fruits.push(f);
        }
      }
      g.add(crown);
      world.add(g);
      COLLIDERS.push({minX:ft.x-0.5, maxX:ft.x+0.5, minZ:ft.z-0.5, maxZ:ft.z+0.5, top:2.4});
      ZONES.push({kind:'tree', tree:ft.id, name:'과일나무', sub:'흔들면 사과가 떨어진다',
        minX:ft.x-2.6, maxX:ft.x+2.6, minZ:ft.z-2.6, maxZ:ft.z+2.6});
      fruitTrees.push({id:ft.id, crown, fruits, shakeT:0, x:ft.x, z:ft.z});
    }
  }

  function buildFlowers(){
    // 시드 고정 난수 — 들를 때마다 꽃밭이 다른 곳에 피면 세계가 아니라 배경화면이 된다
    let s = 7;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;

    // 광장·진입로를 비켜 잔디에만 심는다
    const spots = [];
    for (let i = 0; i < 150; i++){
      const a = rnd()*Math.PI*2, r = 7 + rnd()*7.5;
      const x = Math.cos(a)*r, z = Math.sin(a)*r - 3;
      if (x < YARD.minX + 1 || x > YARD.maxX - 1) continue;
      if (z < YARD.minZ + 1 || z > YARD.maxZ - 1) continue;
      if (Math.abs(x) < 6 && z > -10) continue;              // 광장·진입로
      if (Math.abs(z + 1.6) < 3 && Math.abs(x) < 10) continue; // 건물 앞
      spots.push({x, z, yaw: rnd()*Math.PI*2, scale: 0.8 + rnd()*0.6});
    }

    if (KIT_OK){
      // 종류별로 나눠 인스턴싱한다(모델이 다르면 같은 배치로 못 묶는다)
      const kinds = ['flower_redA', 'flower_yellowA', 'flower_purpleA',
                     'grass_large', 'plant_bushSmall'];
      const buckets = kinds.map(() => []);
      spots.forEach((sp, i) => buckets[i % kinds.length].push(sp));
      kinds.forEach((k, i) => {
        // 꽃은 작게, 풀·덤불은 조금 크게
        const base = k.startsWith('flower') ? 3.2 : 4.2;
        const g = placeKitInstanced(k, buckets[i], {scale: base, track: m => junk.push(m)});
        if (g) world.add(g);
      });
      return;
    }

    const stemM = lam(0x74a862, null, 0.28);
    const headMs = [0xf2b8c6, 0xf5e07f, 0xffffff, 0xc9a9e8].map(c => lam(c, null, 0.4));
    const gSt = new THREE.CylinderGeometry(0.035, 0.035, 0.34, 5);
    const gHd = new THREE.SphereGeometry(0.13, 8, 6);
    spots.forEach((sp, i) => {
      const f = new THREE.Group(); f.position.set(sp.x, 0, sp.z);
      const st = new THREE.Mesh(gSt, stemM); st.position.y = 0.17;
      const hd = new THREE.Mesh(gHd, headMs[i % headMs.length]); hd.position.y = 0.38;
      f.add(st, hd); world.add(f);
    });
  }

  /**
   * 앉을 자리를 등록한다. 존은 가구 **주변**에 깔고, 실제로 앉는 위치는 가구 위다.
   * @param yaw  가구가 놓인 방향. 앉으면 그 방향을 보고 앉는다(등받이에 등을 댄다)
   * @param h    앉는 높이(m). 캐릭터를 그만큼 띄워야 의자를 뚫고 앉지 않는다
   * @param span 가구 크기 — 존을 이만큼 넓게 잡는다
   */
  function addSeat(x, z, yaw, h, span){
    const r = span/2 + 0.9;
    ZONES.push({kind:'seat', name:'앉기', sub:'여기에 앉는다',
      seat:{x, z, yaw: yaw || 0, h},
      minX:x - r, maxX:x + r, minZ:z - r, maxZ:z + r});
  }

  // 흔들기 — 오늘 이 나무를 처음 흔들 때만 과일이 떨어진다(자정에 리셋).
  function shakeTree(id){
    const t = fruitTrees.find(t => t.id === id);
    if (!t || !t.fruits.length) return;
    INV.picked.push(id); markInv();
    // 나무를 향해 돌아서서 미는 동작 — 흔든 사람이 나라는 게 보여야 한다
    P.yaw = Math.atan2(t.x - P.x, t.z - P.z);
    player.root.rotation.y = P.yaw;
    gesture('point', 520);
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

  // 키트 모델이 있는 소품은 상자 대신 그 모델로 세운다. 충돌 상자는 저작 데이터 그대로다.
  //  실내 고정 가구도 전부 키트 모델이다. 상자로 두면 캐릭터·건물과 톤이 어긋난다.
  //  scale 은 모델 실측 기준(전처리 로그 참고). yaw 는 남향(+z)을 보는 각.
  const PROP_KIT = {
    // ⚠ stall-bench 는 **z 축이 긴** 모델이다. yaw 0 으로 두면 남북으로 눕는데
    //   충돌 상자(prop 의 w=2.4 · d=0.7)는 동서로 누워 있어 벤치를 뚫고 지나갔다.
    //  seat = 앉는 면 높이(m). 모델을 실측해 넣는다 — 어림하면 파묻히거나 뜬다.
    //  seatYaw = 앉았을 때 보는 방향. 벤치는 긴 축과 **직각**으로 앉아야 다리가
    //  옆으로 빠진다(같은 방향이면 벤치를 타고 앉은 그림이 된다).
    'bench-a':  {name:'stall-bench',   fitL:1.8, yaw:Math.PI/2, seat:0.44, seatYaw:0},
    'bench-b':  {name:'stall-bench',   fitL:1.8, yaw:Math.PI/2, seat:0.44, seatYaw:0},
    // 학습실
    'class-board': {name:'televisionModern', scale:3.2, yaw:0},
    // 상담실
    'office-desk':  {name:'desk',           scale:2.0, yaw:0},
    'office-sofa':  {name:'loungeSofa',     scale:2.0, yaw:0, seat:0.48},
    'office-shelf': {name:'bookcaseClosedWide', scale:2.2, yaw:Math.PI/2},
    // 휴게실 · 상점
    'lounge-sofa-a': {name:'loungeSofa',    scale:2.0, yaw:0, seat:0.48},
    'lounge-sofa-b': {name:'loungeSofa',    scale:2.0, yaw:Math.PI, seat:0.48},
    'lounge-table':  {name:'table',         scale:2.0, yaw:0},
    'lounge-vending':{name:'kitchenFridgeLarge', scale:2.0, yaw:Math.PI},
    'shop-counter':  {name:'kitchenBar',    scale:2.4, yaw:0},
  };
  // 책상마다 의자를 한 벌씩 붙인다 — 학습실이 책상만 늘어서면 창고로 보인다
  const DESK_IDS = /^class-desk-/;

  function addProp(p){
    if (KIT_OK && DESK_IDS.test(p.id)){
      const d = placeKit('desk', {x:p.x, z:p.z, yaw:0, scale:1.7, track:m => junk.push(m)});
      const c = placeKit('chairDesk', {x:p.x, z:p.z + 0.85, yaw:Math.PI, scale:1.4,
                                       track:m => junk.push(m)});
      if (d) world.add(d);
      if (c) world.add(c);
      if (d && p.solid) COLLIDERS.push({minX:p.x - p.w/2, maxX:p.x + p.w/2,
                                        minZ:p.z - p.d/2, maxZ:p.z + p.d/2, top:p.h});
      if (d) return;
    }
    const k = KIT_OK ? PROP_KIT[p.id] : null;
    if (k){
      const g = placeKit(k.name, {x:p.x, z:p.z, yaw:k.yaw,
                                  fitL:k.fitL, scale:k.scale, track:m => junk.push(m)});
      if (g){
        g.name = p.id; world.add(g);
        if (p.solid) COLLIDERS.push({minX:p.x - p.w/2, maxX:p.x + p.w/2,
                                     minZ:p.z - p.d/2, maxZ:p.z + p.d/2, top:p.h});
        if (k.seat) addSeat(p.x, p.z, k.seatYaw ?? k.yaw, k.seat, Math.max(p.w, p.d));
        return;
      }
    }
    // 분수는 상자로 두면 광장 한복판의 회색 판때기로 읽힌다. 원기둥이라야
    // 분수로 보인다. 충돌은 어차피 AABB 라 모양과 무관하다.
    const geo = p.round
      ? new THREE.CylinderGeometry(p.w/2, p.w/2 * 1.06, p.h, 20)
      : new THREE.BoxGeometry(p.w, p.h, p.d);
    const m = new THREE.Mesh(geo, lam(p.c, null, 0.24));
    m.position.set(p.x, p.h/2, p.z);
    m.name = p.id; world.add(m);
    if (p.solid) COLLIDERS.push({minX:p.x - p.w/2, maxX:p.x + p.w/2,
                                 minZ:p.z - p.d/2, maxZ:p.z + p.d/2, top:p.h});
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

      ZONES.push({kind:'room', room:r, name:r.name, sub:r.sub,
        minX:x0 + 1, maxX:x1 - 1, minZ:z0 + 1, maxZ:z1 - 1});
    }

    for (const f of FILLERS[level] || []){
      // 막다른 골목을 메우는 덩어리. 키트 벽과 면이 정확히 맞닿아 z-fighting 줄무늬가
      // 생겼다 — 키트를 쓸 땐 충돌만 남기고 그리지 않는다. 양옆 룸 벽이 이미 막고 있다.
      if (!KIT_OK){
        const m = new THREE.Mesh(new THREE.BoxGeometry(f.w, LOW_H, f.d), WALL_MAT());
        m.position.set(f.x, LOW_H/2, f.z);
        world.add(m);
      }
      COLLIDERS.push({minX:f.x - f.w/2, maxX:f.x + f.w/2,
                      minZ:f.z - f.d/2, maxZ:f.z + f.d/2, top:3.0});
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

    if (KIT_OK){
      if (floorSpots.length){
        const g = placeKitInstanced('floorFull', floorSpots,
          {scale: 1, track: m => junk.push(m)});
        if (g) world.add(g);
      }
      if (wallSpots.length){
        // 벽은 세로로도 늘려야 사람 키를 넘지 않는 허리벽이 된다.
        // placeKitInstanced 는 균등 스케일만 다루므로 그룹 전체를 눌러 높이를 맞춘다.
        const g = placeKitInstanced('wall', wallSpots, {scale: 1, track: m => junk.push(m)});
        if (g){ g.scale.y = 1.5 / 1.29; world.add(g); }
      }
    }

    for (const p of PROPS.filter(p => p.level === level)) addProp(p);

    // 충쌤 존 — 상담실 안쪽이라 룸 존보다 앞에 둬야 잡힌다
    if (level === 'main'){
      ZONES.unshift({kind:'npc', npc:'teacher', name:'충쌤', sub:'상담 · 과제 안내',
        minX:6.0, maxX:9.0, minZ:-15.6, maxZ:-13.6});
    }
    // 매점 존 — 룸 존보다 앞에 둔다. 존 판정이 첫 일치에서 멈추는데,
    // 카운터 앞은 휴게실 존 안쪽이라 뒤에 두면 영영 안 잡힌다.
    if (level === 'union'){
      ZONES.unshift({kind:'shop', name:'매점', sub:'사과 팔기 · 가구 사기',
        minX:9.6, maxX:13.6, minZ:1.4, maxZ:2.8});
    }
  }

  // 개인 자습실 가구는 계정 데이터라 레벨 지오메트리와 수명이 다르다.
  // world 밖에 따로 두고 study 레벨에서만 보인다.
  // ── 꾸며 놓은 것들 ────────────────────────────────────────────────
  //  두 종류가 있고 데이터 모양은 같다({t,x,z,r,s}).
  //    myRoom  = 내 방(users/{uid}.campus.room). study 레벨에서만 보인다
  //    place   = 공용 공간(campusPlaces/{level}). 레벨마다 다르고 운영자만 고친다
  //  둘 다 같은 편집 코드를 쓴다 — 다루는 배열과 저장처만 갈아 끼운다.
  const roomGroup = new THREE.Group(); scene.add(roomGroup);
  const placeGroup = new THREE.Group(); scene.add(placeGroup);
  const ROOM_COLLIDERS = [], PLACE_COLLIDERS = [];
  //  배치물이 만드는 존·가림막. 레벨 지오메트리(ZONES/OCCLUDERS)와 수명이 달라
  //  따로 담는다 — 꾸미기를 저장할 때마다 이쪽만 다시 만든다.
  let PLACE_ZONES = [], PLACE_OCC = [];
  let roomJunk = [], placeJunk = [];
  let myRoom = [], place = [], placeLevel = null;

  function drawDecor(items, group, junkArr, colliders){
    group.clear();
    for (const m of junkArr) m.dispose?.();
    junkArr.length = 0;
    colliders.length = 0;
    if (group === placeGroup){ PLACE_ZONES = []; PLACE_OCC = []; }
    for (const it of items){
      const g = buildDecor(it, m => junkArr.push(m));
      if (g) group.add(g);
      const d = DECOR_BY_ID[it.t];
      // 러그·바닥처럼 밟고 지나가는 것은 막지 않는다(높이로 판단한다)
      const box = decorBox(it);
      if (box && d && !FLAT.has(it.t)) colliders.push(box);   // box.top = 실제 높이

      //  문 달린 배치물 = 건물. 앞에 '입장' 존을 깔고, 가리면 비치게 한다.
      if (g && d && d.door && box && group === placeGroup){
        PLACE_ZONES.push({kind:'enter', level:d.door, name:d.name, sub:'건물 안으로',
          minX: it.x - DOOR_W/2 - 0.6, maxX: it.x + DOOR_W/2 + 0.6,
          minZ: box.maxZ + 0.2, maxZ: box.maxZ + 2.6});
        const parts = [];
        g.traverse(o => { if (o.isMesh) parts.push(o); });
        PLACE_OCC.push({test: parts, meshes: parts});
        //  시계는 학습센터 얼굴에 붙어 다닌다 — 건물을 옮기면 같이 간다.
        if (d.door === 'main'){
          const bw = box.maxX - box.minX, bh = box.top || 3.8;
          clockHands = null;
          addClockFace(group, it.x - bw * 0.29, bh * 0.69, box.maxZ + 0.06,
                       Math.min(bw, bh) * 0.15);
        }
      }
    }
  }
  //  깔개류 — 충돌을 두면 러그 위를 못 걷는다
  const FLAT = new Set(['rug', 'rugr', 'floor', 'path', 'grass', 'fRed', 'fYellow', 'fPurple']);

  const applyRoom  = items => { myRoom = items; drawDecor(items, roomGroup, roomJunk, ROOM_COLLIDERS); };
  /**
   * 캠퍼스에는 **문 셋이 반드시 있어야 한다.** 운영자가 실수로 지우면 아무 데도
   * 못 들어가고, 되돌릴 방법도 화면 안에 없다(건물이 없으니 상점도 못 연다).
   * 없는 건물은 기본 자리에 도로 심는다 — 옮긴 것은 그대로 둔다.
   */
  const seedBuildings = items => {
    if (placeLevel !== 'outdoor') return items;
    const out = items.slice();
    for (const seed of BUILDING_SEED)
      if (!out.some(it => it.t === seed.t)) out.push({...seed});
    return out;
  };
  //  ⚠ 야외 배치는 따로 기억해 둔다. 나가기(exitToOutdoor)는 실내에 있는 동안
  //    계산되는데, 그때 place 에는 **실내 배치**가 들어 있다 — 그대로 찾으면
  //    건물을 못 찾아 원점으로 튄다(실제로 튀었다).
  let outdoorPlace = [];
  const applyPlace = items => {
    place = seedBuildings(items);
    if (placeLevel === 'outdoor') outdoorPlace = place;
    drawDecor(place, placeGroup, placeJunk, PLACE_COLLIDERS);
  };

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
    {level:'main',  name:'충쌤',   preset:TEACHER,    x:7.5,  z:-16.2, yaw:0},
    {level:'union', name:'매점쌤', preset:SHOPKEEPER, x:11.5, z:4.4,   yaw:Math.PI},
  ];
  let NPCS = [];

  function buildNpcs(level){
    for (const n of NPCS) disposeAvatar(n.rig);
    NPCS = NPC_DEFS.filter(n => n.level === level).map(n => {
      const rig = buildAvatar(n.preset.look, n.preset.body);
      rig.root.position.set(n.x, 0, n.z);
      rig.root.rotation.y = n.yaw;
      const tag = nameTag(n.name); placeTag(tag, 1.5, 0.375); rig.root.add(tag);
      scene.add(rig.root);
      return {rig, phase: Math.random()*6};
    });
  }

  // plantor와 origin이 같으므로 로그인 세션이 그대로 공유된다.
  const ME = await whenReady();
  // 로그인 표시는 상단 네비바가 맡는다. 여기선 꾸미기 노출만 정한다.
  document.getElementById('dressBtn').hidden = !ME;
  let MY_LABEL = ME ? ME.name : '방문자';   // 꾸미기에서 바꿀 수 있다

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
    saveInv(INV.inv, INV.bells, INV.picked, INV.earned);
  }
  function markInv(){
    invDirty = true;
    clearTimeout(invTimer); invTimer = setTimeout(flushInv, 1200);
    refreshBag();
  }
  // 탭을 닫거나 백그라운드로 가면 그 자리에서 밀어 넣는다
  const onPageHide = () => flushInv();
  addEventListener('pagehide', onPageHide);
  INV.earned = INV.earned || 0;
  const countOf = k => INV.inv[k] || 0;
  const tierNow = () => roomTier(INV.earned);
  /** 포인트를 준다 — 잔액과 누적을 같이 올린다(누적은 방 확장·해금 기준). */
  function award(n, why){
    if (n <= 0) return;
    INV.bells += n; INV.earned += n; markInv();
    toast(`${why} +${n.toLocaleString()}포인트`);
  }
  function give(k, n = 1){ INV.inv[k] = countOf(k) + n; markInv(); }
  function take(k, n = 1){
    const c = countOf(k);
    if (c < n) return false;
    if (c - n > 0) INV.inv[k] = c - n; else delete INV.inv[k];
    markInv(); return true;
  }

  // ── 플레이어 ──────────────────────────────────────────────────────
  //  ⚠ buildAvatar 는 동기다. 저장된 조합(얼굴·헤어·옷)이 서로 다른 모델이면
  //    **그 모델들이 먼저 받아져 있어야** 한다. 안 그러면 첫 화면이 반쪽으로
  //    선다 — 원래 머리는 지워졌는데 이식할 머리는 아직 없어서 대머리로 뜬다.
  //    꾸미기를 열면 preloadAll 이 돌아 정상으로 돌아오는 게 그래서였다.
  if (IS_GLB && Avatar.resolveLook){
    const L = Avatar.resolveLook(myLook);
    await Promise.all([L.base, L.head, L.body]
      .filter(v => v && v !== Avatar.BALD)
      .map(v => Avatar.ensure?.(v).catch(() => false)));
  }
  let player = buildAvatar(myLook, myBody);
  scene.add(player.root);
  const meTag = nameTag(MY_LABEL);
  placeTag(meTag, 2.0, 0.5); player.root.add(meTag);

  //  y = 발 높이, vy = 수직 속도. 예전엔 y 가 없어 점프가 그림뿐이었다.
  const P = {x: 0, z: 16, y: 0, vy: 0, yaw: Math.PI, walkT: 0};
  const GRAVITY = 18;                    // 0.7m 점프가 0.5초에 끝나는 값
  //  앉기 — 앉아 있는 동안에는 이동 입력을 '일어서기'로 해석한다.
  //  seat 가 있으면 벤치에 앉은 것이라 일어설 때 자리를 살짝 비켜 준다.
  let sitting = false, seat = null;
  //  Kenney sit 포즈는 루트보다 0.094 유닛(캠퍼스 기준 약 0.18m) 아래까지 내려간다.
  //  루트를 앉는 면 높이에 그대로 두면 엉덩이가 면 아래로 파묻힌다 — 그만큼 올린다.
  const SIT_LIFT = 0.14;
  function sitAt(x, z, yaw, s){
    sitting = true; seat = s || null;
    P.x = x; P.z = z; P.yaw = yaw;
    player.root.position.set(x, seat ? seat.h + SIT_LIFT : 0, z);
    player.root.rotation.y = yaw;
    tap.target = null;
  }
  function standUp(){
    if (!sitting) return;
    sitting = false;
    if (seat){
      // 가구에서 일어날 땐 가구가 보는 방향으로 한 걸음 나온다 — 안 그러면 안에 낀다
      P.x += Math.sin(seat.yaw) * 1.1;
      P.z += Math.cos(seat.yaw) * 1.1;
      player.root.position.set(P.x, 0, P.z);
      seat = null;
    }
  }
  function toggleSit(){
    if (switching || uiOpen() || editing) return;
    if (sitting) standUp();
    else sitAt(P.x, P.z, P.yaw, null);
  }

  //  점프·손흔들기는 상태가 아니라 **한 번 재생되는 몸짓**이다.
  //  걷는 중에도 낼 수 있게 이동을 막지 않는다.
  let gestureUntil = 0, gestureAct = null;
  function gesture(act, ms){
    if (switching || uiOpen() || editing) return;
    if (sitting) standUp();
    playOnce(player, act);
    gestureAct = act;
    gestureUntil = performance.now() + ms;
  }
  //  점프는 애니메이션만으로는 제자리 뜀뛰기로 안 읽힌다 — 실제로 몸을 띄운다.
  let grounded = true;                   // 땅(또는 어떤 면)에 발이 닿아 있나
  const JUMP_DUR = 0.5, JUMP_H = 0.7;
  function doJump(){
    if (!grounded || sitting) return;      // 공중에서 또 뛰지 않는다
    gesture('jump', JUMP_DUR * 1000);
    //  올라갈 높이에서 초속을 거꾸로 구한다 — JUMP_H 를 고치면 알아서 맞는다
    P.vy = Math.sqrt(2 * GRAVITY * JUMP_H);
    grounded = false;
  }
  const doWave = () => gesture('wave', 700);
  const doNod  = () => gesture('yes', 700);
  player.root.position.set(P.x, 0, P.z);

  // ── 실제 접속자 ────────────────────────────────────────────────────
  // 좌표는 5Hz로만 오므로 프레임마다 보간해서 끊김 없이 움직이게 한다.
  let net = null;                     // 아래 showCount()가 읽으므로 먼저 선언한다
  const remotes = new Map();          // uid → {rig, x,z,yaw, tx,tz,tyaw, moving, walkT}
  const elCount = document.getElementById('count');
  //  혼자인 게 이 캠퍼스의 기본값이다(게스트는 실시간에 안 붙는다). 늘 켜져 있는
  //  '나 혼자' 는 알림이 아니라 잔소리라 뗐다 — 남이 있을 때만 뜬다.
  const showCount = () => {
    const t = (net && remotes.size) ? `접속 ${remotes.size + 1}명` : '';
    elCount.textContent = t;
    elCount.hidden = !t;          // 비어 있으면 숨긴다(padding 만 남아 왼쪽 여백이 생겼다)
  };

  function addRemote(uid, info){
    const rig = buildAvatar(info.look, info.body, {outline:false});
    const tag = nameTag(info.name); placeTag(tag, 1.5, 0.375); rig.root.add(tag);
    rig.root.visible = false;          // 첫 좌표가 오기 전엔 숨긴다(원점에서 미끄러져 오는 것 방지)
    scene.add(rig.root);
    const r = {rig, x:0, z:0, yaw:0, tx:0, tz:0, tyaw:0,
               act:'idle', moving:false, walkT:0, first:true, pet:null};
    remotes.set(uid, r);
    const petId = info.look && info.look.pet;
    if (petId && Pets.PET_BY_ID.has(petId))
      Pets.ensure(petId).then(ok => {
        if (!ok || !remotes.has(uid)) return;
        const pr = Pets.buildPet(petId);
        if (!pr) return;
        scene.add(pr.root);
        r.pet = makePetState(pr, r.x, r.z - 1);
      });
    showCount();
  }
  function dropRemote(uid){
    const r = remotes.get(uid);
    if (!r) return;
    disposeAvatar(r.rig);
    if (r.pet) r.pet.rig.dispose();
    remotes.delete(uid);
    showCount();
  }
  function poseRemote(uid, p){
    const r = remotes.get(uid);
    if (!r) return;
    const act = p.act || 'idle';
    // 몸짓은 상태가 아니라 사건이다 — 받은 즉시 한 번 재생하고 이전 상태로 돌아간다
    if (GESTURES.has(act)) playOnce(r.rig, act);
    else { r.act = act; r.moving = act === 'walk' || act === 'run'; }
    r.tx = p.x; r.tz = p.z; r.tyaw = p.yaw; r.th = p.h || 0;
    if (r.first){ r.x = p.x; r.z = p.z; r.yaw = p.yaw; r.h = r.th;
                  r.first = false; r.rig.root.visible = true; }
  }

  if (ME){
    net = joinCampus({uid: ME.uid, name: ME.name, look: myLook, body: myBody},
                     {onJoin: addRemote, onLeave: dropRemote, onPose: poseRemote});
  }
  showCount();

  // ══ 카메라 ════════════════════════════════════════════════════════
  // 고정 아이소메트릭 프레이밍. 위치와 look-at을 각각 따로 스무딩한다.
  // 카메라는 수평각(camYaw)으로 돈다. 기본은 **0° — 월드 축에 정면 정렬**이다.
  // 45°(대각선)로 두면 건물이 전부 모서리를 내밀어 아이소메트릭 전략 게임이 된다.
  // 동물의 숲은 섬에서 카메라를 좌우로 아예 못 돌린다 — 집이 정면을 보이고 길이
  // 화면 축을 따라 흐르는 그 구도가 정면 정렬이다. 회전(J/K)은 남겨 두되 시작만
  // 여기서 한다. 45° 단위라 0°에서 시작해야 정면과 대각선을 둘 다 쓸 수 있다.
  // 반경·높이는 레벨이 정한다 — 야외는 건물 세 채가 한눈에 들어와야 해서 더 멀다.
  let CAM_R = 21.8, CAM_H = 14.2;          // 부감 33°. 더 낮추면 허리벽이 시야를 가린다
  let camYaw = 0, camYawTo = 0;
  const CAM_DIR = new THREE.Vector3();
  const camDirFrom = y => CAM_DIR.set(Math.sin(y)*CAM_R, CAM_H, Math.cos(y)*CAM_R);
  camDirFrom(camYaw);
  // 기본 줌 0.75 = 거리 27.7m → 20.8m. 캐릭터가 1.33배 커진다.
  // 1.0 에서는 1.3m 캐릭터가 화면 높이의 1/10 쯤이라 표정이 안 읽혔다(동숲은 1/5~1/6).
  // 캐릭터 키(TARGET_H)를 올리는 쪽은 문틀·앉는 높이·이름표·충돌을 다 건드려야 해서
  // 카메라만 당긴다. 대신 건물도 같이 커져 한 화면에 들어오는 마을 범위가 줄어든다.
  // 카메라 거리 배율 — 휠·핀치로 조절한다(한 번 걷어냈다가 되살렸다).
  // ⚠ 걷어냈던 이유가 사라진 게 아니다: 꾸미기 창 위에서 휠을 굴리면 뒤의 맵까지
  //   당겨졌었다. 그래서 **캔버스 위에서만** 받는다 — 패널·창은 각자 스크롤한다.
  let zoom = 0.75, zoomTo = 0.75;
  const ZOOM_MIN = 0.45, ZOOM_MAX = 1.6;
  const zoomBy = f => { zoomTo = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomTo * f)); };
  cv.addEventListener('wheel', e => {
    e.preventDefault();                       // 페이지 스크롤·브라우저 확대와 겹치지 않게
    zoomBy(Math.exp(e.deltaY * 0.0016));
  }, {passive: false});
  // 핀치 — 포인터 둘 사이 거리의 변화율이 곧 배율이다
  const pinch = new Map(); let pinchD = 0;
  cv.addEventListener('pointerdown', e => { pinch.set(e.pointerId, [e.clientX, e.clientY]); });
  cv.addEventListener('pointermove', e => {
    if (!pinch.has(e.pointerId)) return;
    pinch.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch.size !== 2) return;
    const [a, b] = [...pinch.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (pinchD > 0) zoomBy(pinchD / d);
    pinchD = d;
  });
  const pinchEnd = e => { pinch.delete(e.pointerId); pinchD = 0; };
  cv.addEventListener('pointerup', pinchEnd);
  cv.addEventListener('pointercancel', pinchEnd);
  const camPos  = new THREE.Vector3().copy(CAM_DIR).add(new THREE.Vector3(P.x, 0, P.z));
  const camLook = new THREE.Vector3(P.x, 0.9, P.z);

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
    sitting = false; seat = null;
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
    syncRoomBtn();
    // 공용 배치는 레벨마다 다르다. 비동기라 먼저 비우고 도착하면 그린다.
    if (placeLevel !== id){
      placeLevel = id;
      applyPlace([]);
      loadPlace(id).then(items => { if (placeLevel === id) applyPlace(items); });
    }
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
    //  들어갔던 문 앞으로 되돌린다. 원점으로 튀면 어디서 나왔는지 알 수 없다.
    //  건물이 배치물이 된 뒤로는 **저장된 자리**에서 찾는다(운영자가 옮겼을 수 있다).
    const want = lastDoor || level;
    const it = outdoorPlace.find(p => DECOR_BY_ID[p.t]?.door === want);
    let spawn = LEVELS.outdoor.spawn;
    if (it){
      const box = decorBox(it);
      if (box) spawn = {x: it.x, z: box.maxZ + 1.6, yaw: 0};
    }
    go('outdoor', spawn);
  }

  // ══ 입력 ══════════════════════════════════════════════════════════
  const keys = {};
  //  이동은 방향키만. WASD 를 비워 둬야 그 자리를 기능키로 쓸 수 있다.
  const MOVEKEYS = new Set(['arrowup','arrowdown','arrowleft','arrowright']);
  //  ── 키 배치 ──────────────────────────────────────────────────────
  //    이동 ←↑↓→ · 대시 D(누른 채) · 점프 F · 상호작용 Space
  //    Space 는 문·나무·상점·NPC·의자 **전부**를 연다. 예전엔 문 전용이었는데,
  //    "가장 큰 키"에 가장 흔한 동작이 안 걸려 있으면 손이 F 와 Space 사이를
  //    계속 헤맨다 — 상호작용은 하나로 모으고, 점프를 F 로 내렸다.
  //    나머지 몸짓 Q/E/R: 앉기 · 인사 · 끄덕임
  //    회전 J/K
  //  ⚠ e.key 를 쓰면 **한/영 상태에 따라 조작이 죽는다** — 한글 입력기가 켜져 있으면
  //    D 를 눌러도 e.key 가 'ㅇ' 로 온다(F→'ㄹ', J→'ㅓ'…). 방향키·Space 만 살아남아
  //    "달리기가 갑자기 안 된다"가 된다. 물리 키 위치인 e.code 로 읽으면 입력기와
  //    무관하게 같은 자리를 가리킨다. 코드가 없는 옛 환경만 e.key 로 떨어진다.
  function keyId(e){
    const c = e.code || '';
    if (c.startsWith('Key'))   return c.slice(3).toLowerCase();   // KeyD → d
    if (c.startsWith('Arrow')) return c.toLowerCase();            // ArrowUp → arrowup
    if (c === 'Space') return ' ';
    if (c === 'Enter' || c === 'NumpadEnter') return 'enter';
    return e.key.toLowerCase();
  }
  addEventListener('keydown', e => {
    const k = keyId(e);
    if (MOVEKEYS.has(k)){ if (!keys[k]) tap.target = null; keys[k] = true; e.preventDefault(); }
    if (k === 'd'){ keys['run'] = true; return; }
    if (k === 'j') turn(-1);
    if (k === 'k') turn(1);
    if (k === 'q'){ toggleSit(); e.preventDefault(); }
    if (k === 'e'){ doWave(); e.preventDefault(); }
    if (k === 'r'){ doNod(); e.preventDefault(); }
    if (k === 'f'){ doJump(); e.preventDefault(); }
    if (k === ' ' || k === 'enter'){ interact(); e.preventDefault(); }
  });
  addEventListener('keyup', e => {
    const k = keyId(e);
    if (k === 'd') keys['run'] = false;
    keys[k] = false;
  });

  // 보이지 않는 터치 조작: 드래그=조이스틱 / 탭=그 지점으로 이동
  const stick = {on:false, ox:0, oy:0, vx:0, vy:0, mag:0, moved:false};
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
    if (editing) moveGhost(e.clientX, e.clientY);
    if (!stick.on) return;
    // 두 손가락이면 핀치 줌이다 — 걷기로 읽으면 줌하는 동안 캐릭터가 끌려다닌다
    if (pinch.size >= 2){ stick.vx = stick.vy = 0; stick.mag = 0; stick.moved = true; return; }
    const dx = e.clientX - stick.ox, dy = e.clientY - stick.oy, m = Math.hypot(dx, dy);
    if (m > DEAD){ stick.moved = true; stick.vx = dx/m; stick.vy = dy/m; stick.mag = m; }
    else { stick.vx = stick.vy = 0; stick.mag = 0; }
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
    stick.on = false; stick.vx = stick.vy = 0; stick.mag = 0;
  }
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', () => { stick.on = false; stick.vx = stick.vy = 0; stick.mag = 0; });

  // ══ 충돌 해소 ═════════════════════════════════════════════════════
  //
  //  세계에 **높이**가 있다. 상자마다 윗면(top)이 있어서
  //    · 내 발보다 낮으면 → 그 위를 걷는다(막지 않는다)
  //    · 조금 높으면      → 걸어서 올라선다(계단·낮은 단)
  //    · 많이 높으면      → 지금처럼 민다
  //  top 이 없는 상자는 Infinity 로 읽어 예전과 똑같이 동작한다.
  //
  //  ⚠ 축 분리(x 따로 z 따로)는 그대로 둔다 — 벽을 따라 미끄러지는 감각이
  //    이 게임의 걷기다. 한 번에 풀면 벽에 붙었을 때 걸음이 멈춘다.
  const R = 0.42;
  const STEP_UP = 0.35;                  // 이만큼까지는 걸어서 오른다
  const boxes = () => level === 'study'
    ? COLLIDERS.concat(ROOM_COLLIDERS, PLACE_COLLIDERS)
    : COLLIDERS.concat(PLACE_COLLIDERS);
  const overlaps = (c, x, z) =>
    !(x + R <= c.minX || x - R >= c.maxX || z + R <= c.minZ || z - R >= c.maxZ);

  /** (x,z) 발밑에서 밟고 설 수 있는 가장 높은 면. 아무것도 없으면 0(땅). */
  function groundAt(x, z, feet){
    let g = 0;
    for (const c of boxes()){
      if (!overlaps(c, x, z)) continue;
      const top = c.top ?? Infinity;
      //  머리 위로 지나가는 것은 바닥이 아니다. 발보다 조금 높은 것까지만
      //  '올라설 수 있는 면'으로 본다(그 이상은 벽이라 resolve 가 민다).
      if (top <= feet + STEP_UP && top > g) g = top;
    }
    return g;
  }

  function resolve(p, axis){
    for (const c of boxes()){
      if (!overlaps(c, p.x, p.z)) continue;
      const top = c.top ?? Infinity;
      if (top <= p.y + STEP_UP) continue;         // 밟고 넘어갈 수 있는 높이다
      if (axis === 'x') p.x = (p.x < (c.minX + c.maxX)/2) ? c.minX - R : c.maxX + R;
      else              p.z = (p.z < (c.minZ + c.maxZ)/2) ? c.minZ - R : c.maxZ + R;
    }
  }

  // ══ 존 · HUD ══════════════════════════════════════════════════════
  const elWhere = document.getElementById('where');
  const elPrompt = document.getElementById('prompt');
  const elPTitle = document.getElementById('pTitle'), elPSub = document.getElementById('pSub');
  const elPBtn = document.getElementById('pBtn'), elPAct = document.getElementById('pAct');
  const elPKey = document.getElementById('pKey');
  const elToast = document.getElementById('toast');
  const elBagBtn = document.getElementById('bagBtn'), elBagBells = document.getElementById('bagBells');
  const elBag = document.getElementById('bagPanel'), elShop = document.getElementById('shopPanel');
  const elRoomBtn = document.getElementById('roomBtn'), elEditBar = document.getElementById('editBar');
  const elTalk = document.getElementById('talkPanel');
  const elChars = document.getElementById('charPanel');
  let charOpen = false;
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
        z.kind === 'shop' ? '열기'   :
        z.kind === 'npc'  ? '말 걸기' :
        z.kind === 'seat' ? '앉기'    : '입장';
      elPKey.textContent = 'Space';
      elPrompt.classList.add('on');
    } else elPrompt.classList.remove('on');
    syncRoomBtn();
  }
  //  방 꾸미기 버튼. 내 방에서는 누구나, 그 밖에서는 운영자만.
  //  ⚠ setZone 안에만 두면 안 된다 — setZone 은 존이 **바뀔 때만** 돌고, 스폰
  //    지점은 존 밖이라 첫 진입에서 안 바뀐다. 운영자 버튼이, 존을 한 번
  //    드나들기 전까지 안 보였다. 레벨을 열 때와 편집을 마칠 때도 부른다.
  function syncRoomBtn(){
    const z = currentZone;
    const inMyRoom = ME && z && z.kind === 'room' && z.room.id === 'study' && z.room.personal;
    elRoomBtn.hidden = editing || !(inMyRoom || (IS_ADMIN && level !== 'study'));
    elRoomBtn.textContent = inMyRoom ? '내 방 꾸미기' : '꾸미기';
  }
  function interact(){
    if (!currentZone || switching) return;
    if (currentZone.kind === 'enter') return enterBuilding(currentZone.level);
    if (currentZone.kind === 'exit')  return exitToOutdoor();
    if (currentZone.kind === 'tree')  return shakeTree(currentZone.tree);
    if (currentZone.kind === 'shop')  return openShop();
    if (currentZone.kind === 'npc')   return openTalk();
    if (currentZone.kind === 'seat'){
      const st = currentZone.seat;
      return sitAt(st.x, st.z, st.yaw, st);
    }
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
  // ── 펫 ─────────────────────────────────────────────────────────────
  //  펫은 장식이 아니라 **동행**이다. 주인 뒤 1m 를 지키고, 멀어지면 뛰어온다.
  //  충돌은 안 본다(유령) — 문틈에 끼어 못 따라오는 펫만큼 슬픈 버그가 없다.
  function makePetState(rig, x, z){
    return {rig, x, z, yaw:0, yawTo:0, moving:false, running:false};
  }
  /**
   * @param oyaw 주인이 보는 방향. 멈춰 서면 펫도 **옆에 나란히** 서서 같은 데를 본다.
   *   뒤통수만 쫓아다니면 강아지가 아니라 그림자처럼 보인다 — 멈췄을 때
   *   자기 자리(주인 왼쪽 0.8m)를 잡고 고개를 같이 돌리는 게 동행이다.
   */
  function petFollow(p, ox, oz, oyaw, moving, dt, oy = 0){
    //  목표 자리 — 주인이 걸으면 뒤(따라가기), 멈추면 옆(나란히).
    //  0.8m 로는 어깨가 겹쳐 펭귄이 팔에 가렸다. 캐릭터 폭이 0.7m 쯤이니
    //  1.15m 는 되어야 둘이 나란히 서 있는 게 보인다.
    const side = moving ? 0 : 1.15;
    const back = moving ? 1.05 : 0.1;
    const tx = ox - Math.sin(oyaw) * back - Math.cos(oyaw) * side;
    const tz = oz - Math.cos(oyaw) * back + Math.sin(oyaw) * side;
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    if (d > 30){ p.x = tx; p.z = tz; }    // 레벨 이동 — 걸어오게 두면 지평선 너머에서 온다
    else if (d > 0.12){
      const sp = Math.min(d * 6, d > 2.8 ? 6.6 : 3.4);
      p.x += dx / d * sp * dt; p.z += dz / d * sp * dt;
      p.yawTo = Math.atan2(dx, dz);
      p.moving = sp > 0.35; p.running = sp > 4;
    } else {
      p.moving = false;
      p.yawTo = oyaw;                      // 다 왔으면 주인과 같은 데를 본다
    }
    let a = p.yawTo - p.yaw;
    p.yaw += Math.atan2(Math.sin(a), Math.cos(a)) * Math.min(1, dt * 10);
    p.rig.play(p.moving ? (p.running ? 'run' : 'walk') : 'idle');
    //  주인이 올라선 면 높이를 그대로 쓴다. 제 발밑을 따로 재면 상자 모서리에서
    //  펫만 아래로 떨어져 주인을 올려다보는 그림이 된다.
    p.y = (p.y ?? oy) + (oy - (p.y ?? oy)) * Math.min(1, dt * 12);
    p.rig.root.position.set(p.x, p.y, p.z);
    p.rig.root.rotation.y = p.yaw;
    p.rig.mixer.update(dt);
  }
  //  ⚠ 첫 호출은 **이 선언들보다 뒤**여야 한다. 위쪽(플레이어를 만드는 자리)에서
  //    부르면 myPetId 가 TDZ 라 콜백이 조용히 죽는다 — 저장된 펫이 새로고침
  //    때마다 안 나왔다(꾸미기에서 적용할 때만 나왔다).
  let myPet = null, myPetId = null;
  function syncMyPet(){
    const id = myLook.pet && Pets.PET_BY_ID.has(myLook.pet) ? myLook.pet : null;
    if (id === myPetId) return;
    if (myPet){ myPet.rig.dispose(); myPet = null; }
    myPetId = id;
    if (!id) return;
    Pets.ensure(id).then(ok => {
      if (!ok || myPetId !== id) return;
      const rig = Pets.buildPet(id);
      if (!rig) return;
      scene.add(rig.root);
      myPet = makePetState(rig, P.x, P.z - 1);
    });
  }

  syncMyPet();                             // 저장된 펫을 첫 화면부터 데리고 있는다

  function rebuildPlayer(){
    disposeAvatar(player);
    player = buildAvatar(myLook, myBody);
    player.root.position.set(P.x, sitting && seat ? seat.h + SIT_LIFT : 0, P.z);
    player.root.rotation.y = P.yaw;
    const tag = nameTag(MY_LABEL);
    placeTag(tag, 2.0, 0.5);
    player.root.add(tag);
    scene.add(player.root);
    syncMyPet();
  }

  // ══ 캐릭터 고르기 ═════════════════════════════════════════════════
  //  Kenney 캐릭터는 피부·머리·옷 색이 **메시에 박혀** 있다. 예전 커스터마이저의
  //  체형 슬라이더·색 팔레트는 코드 아바타 시절 물건이라 여기선 의미가 없다.
  //  그래서 '무엇을 조절하나'가 아니라 '누구로 할까'를 고르게 한다 — 12종을
  //  실제 3D 로 찍어 나란히 보여 준다(팔레트와 같은 카메라라 크기가 비교된다).

  //  ── 꾸미기 모드 ──
  //  썸네일 12개를 격자로 늘어놓으면 **정작 캐릭터가 제일 작다**. 모바일 시트에서는
  //  격자가 눌려 잘리기까지 했다. 그래서 격자를 버리고, 카메라가 캐릭터로 밀고
  //  들어가 화면을 채운다 — 고르는 대상이 화면에서 가장 큰 것이어야 한다.
  //  넘기기는 ‹ › 로, 색은 **한 번에 한 부위만** 한 줄로 낸다(네 줄을 동시에 펴면
  //  그것만으로 화면이 다 찬다).
  let dressTab = 'base';
  let elHead = null, elFoot = null;
  //  창 안에서는 **초안(draft)** 만 바꾼다. 고를 때마다 저장하면 되돌릴 길이 없어
  //  아이가 눌러 보기를 무서워한다. 적용을 눌러야 내 것이 된다.
  let draft = null;
  let escClose = null, outClose = null;
  //  옷장 — 잔액·가진 것·값. 꾸미기 화면을 열 때 한 번 받아 온다.
  //  통화는 캠퍼스 사과가 아니라 **학습 포인트**다. 안 산 것도 입어는 볼 수 있게 하고
  //  (입어 봐야 산다), 저장은 가진 것만 한다.
  let wardrobe = null;
  let savedLook = null;                    // 마지막으로 저장된 값 — 미리보기를 되돌릴 기준
  //  표정·안경은 파는 물건이 아니다 — 기분과 소품이지 옷이 아니라 값을 안 매긴다.
  const ownsSlot = (slot, id) =>
    slot === 'face' || slot === 'eyewear' || slot === 'pet' ||
    id === Avatar.BALD || !wardrobe ||
    (wardrobe.owned?.[slot] || []).includes(id);
  const elRoot = document.querySelector('.campus-root');

  async function openChars(){
    if (!ME) return toast('로그인하면 캐릭터를 고를 수 있어요');
    elBag.hidden = elShop.hidden = elTalk.hidden = true;
    charOpen = true;
    elChars.hidden = false;
    elChars.classList.add('dress');
    elRoot && elRoot.classList.add('dressing');
    savedLook = {...myLook};
    draft = {...myLook};
    nameDraft = ME ? ME.name : '';
    lastDrawTab = null;                  // 새로 열면 목록은 맨 위에서 시작한다
    elChars.innerHTML =
      `<div class="dhead"></div>` +
      `<div class="dstage">` +
        `<button class="dside dprev" data-spin="-1" aria-label="왼쪽으로 돌리기">` +
          `${icon('chevron-left', 24)}</button>` +
        `<button class="dside dnext" data-spin="1" aria-label="오른쪽으로 돌리기">` +
          `${icon('chevron-right', 24)}</button>` +
      `</div>` +
      `<div class="dfoot"></div>`;
    elHead = elChars.querySelector('.dhead');
    elFoot = elChars.querySelector('.dfoot');
    previewStart(elChars.querySelector('.dstage'));
    // 닫는 길을 여럿 둔다. '취소'는 있었지만 '닫기'로 안 읽혔다 —
    // ESC 와 바깥 클릭은 창을 닫는 보편적인 방법이라 없으면 갇힌 느낌이 든다.
    escClose = e => { if (e.key === 'Escape' || e.code === 'Escape'){ e.preventDefault(); closeChars(); } };
    outClose = e => { if (charOpen && !elChars.contains(e.target)) closeChars(); };
    addEventListener('keydown', escClose, true);
    setTimeout(() => addEventListener('pointerdown', outClose), 0);
    drawChars();
    await Avatar.preloadAll?.();            // ‹ › 가 즉시 넘어가도록 미리 받아 둔다
    await Avatar.preloadAids?.();           // 안경 카드도 그려야 해서 소품까지 받아 둔다
    Pets.preloadAll().then(() => { if (charOpen && dressTab === 'pet') drawChars(); });
    // ⚠ buildAvatar 는 안 받아진 모델을 기본(male-a)으로 떨군다. 다 받아지기 전에
    //   찍은 썸네일은 전부 같은 얼굴이 되어 캐시에 굳는다 — 여기서 버리고 다시 찍는다.
    lookThumbs.clear();
    Avatar.preloadAids?.();
    wardrobe = await loadWardrobe();
    drawChars();
  }
  function closeChars(){
    if (escClose){ removeEventListener('keydown', escClose, true); escClose = null; }
    if (outClose){ removeEventListener('pointerdown', outClose); outClose = null; }
    // 초안은 버리면 그만이다 — 맵의 나는 애초에 안 건드렸다
    draft = null;
    previewStop();
    elChars.hidden = true; charOpen = false;
    elChars.classList.remove('dress');
    elRoot && elRoot.classList.remove('dressing');
  }
  //  캐릭터는 얼굴·헤어·옷 셋으로 쪼개진다(두개골이 12종 공통이라 남의 머리를
  //  얹을 수 있고, 뼈가 같아 남의 옷을 입을 수 있다). 탭 하나가 슬롯 하나고,
  //  ‹ › 는 **지금 탭의 슬롯**을 넘긴다 — 무엇을 고르는 중인지가 화면에 남는다.
  //  여기 있는 셋만 **파는 것**이다 — 사는 줄과 "안 산 건 빼고 저장"이 이 표를 본다.
  //  표정·안경은 값이 없으므로 넣지 않는다.
  const SLOTS = [{id:'base', name:'얼굴'}, {id:'head', name:'헤어'}, {id:'body', name:'옷'}];
  //  탭은 **부위**다. 모양과 색을 다른 탭에 두면 머리를 고르다 색을 바꾸려고
  //  탭을 옮겨야 한다 — 같은 것을 만지는데 자리가 갈린다.
  //  한 탭 안에 '무엇을 입을까'(모양)와 '무슨 색으로'(색)를 같이 놓는다.
  const TABS = [
    {id:'base', name:'얼굴', slot:'base', colors:['skin']},
    {id:'face', name:'표정', slot:'face'},
    {id:'head', name:'헤어', slot:'head', colors:['hair']},
    {id:'body', name:'옷',   slot:'body', colors:['top', 'bottom']},
    {id:'eyewear', name:'안경', slot:'eyewear', colors:['glass']},
    {id:'pet', name:'펫', slot:'pet'},
  ];
  const slotOf = tab => (TABS.find(t => t.id === tab) || {}).slot || 'base';
  /**
   * 이 슬롯이 고를 수 있는 값들. 헤어에만 '없음'(대머리)이 있다.
   * 안경은 모델이 아니다 — 얼굴에 박힌 것('own')·안 씀·소품 둘.
   */
  const optionsOf = (slot, L) => {
    if (slot === 'pet') return ['none'].concat(Pets.PETS.map(p => p.id));
    if (slot === 'eyewear'){
      // 얼굴에 박힌 안경은 소품 '안경'과 **같은 물건**이다(정점 82개가 같다).
      // 둘을 나란히 놓으면 똑같은 카드가 두 장 뜬다 — 박힌 쪽이 있으면 소품은 뺀다.
      const builtin = Avatar.hasBuiltinGlasses?.(L ? L.base : '');
      const aids = (Avatar.ACCESSORIES || []).map(a => a.id)
        .filter(id => !(builtin && id === 'glasses'));
      // '안 씀'이 맨 앞 — 기본 상태부터 보여 준다
      return ['none'].concat(builtin ? ['own'] : [], aids);
    }
    // 모든 슬롯이 기하(정점 좌표) 기준으로 중복을 접는다 — 같은 카드가 두 장
    // 뜨는 일은 어느 탭에도 없어야 한다. 얼굴·옷은 지금 12종 전부 다르지만,
    // 에셋이 늘거나 겹쳐도 여기가 걸러 준다.
    if (slot === 'face') return Avatar.faceOptions?.() || Avatar.MODELS || [];
    if (slot === 'head')
      return [Avatar.BALD].concat(Avatar.distinctModels?.('bald') || Avatar.MODELS || []);
    return Avatar.distinctModels?.(slot) || Avatar.MODELS || [];
  };

  // ── 창 안의 캐릭터 ────────────────────────────────────────────────
  //  맵 카메라를 당겨 보여 주면 뒤에 마을이 비치고, 회전도 맵 규칙에 묶인다.
  //  꾸미기는 **자기 무대**를 가져야 한다 — 창 안에 작은 렌더러를 따로 둔다.
  //  컨텍스트는 한 번 만들어 재사용한다(WebGL 컨텍스트를 여닫으면 브라우저가 늙는다).
  let pv = null;                 // {renderer, scene, cam, rig, raf, yaw, spin}
  /**
   * ⚠ 무대는 창을 열 때마다 innerHTML 로 새로 그린다. 캔버스를 그 안에 적어 두면
   *   두 번째로 열었을 때 렌더러는 **버려진 옛 캔버스**에 계속 그린다 — 화면은
   *   비어 있는데 아무 에러도 안 난다. 캔버스는 렌더러가 들고, 열 때마다 끼운다.
   */
  function previewStart(host){
    if (!pv){
      const canvas = document.createElement('canvas');
      canvas.className = 'dcv';
      const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true});
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe6e0, 2.2));
      const key = new THREE.DirectionalLight(0xfff6e8, 1.5);
      key.position.set(2.5, 4, 3);
      scene.add(key);
      // 발판과 접지 그림자 — 없으면 캐릭터가 공중에 뜬 것처럼 보인다.
      // 그림자는 라이트를 켜는 대신 **그림자처럼 생긴 판**을 깐다(무대 하나에
      // 그림자 맵을 켜는 건 값이 비싸고, 이 각도에선 티도 안 난다).
      const cv = document.createElement('canvas'); cv.width = cv.height = 128;
      const g2 = cv.getContext('2d');
      const grd = g2.createRadialGradient(64, 64, 4, 64, 64, 62);
      grd.addColorStop(0, 'rgba(30,45,35,.34)');
      grd.addColorStop(0.55, 'rgba(30,45,35,.13)');
      grd.addColorStop(1, 'rgba(30,45,35,0)');
      g2.fillStyle = grd; g2.fillRect(0, 0, 128, 128);
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({map: new THREE.CanvasTexture(cv), transparent: true,
                                     depthWrite: false}));
      shadow.position.y = 0.004;
      scene.add(shadow);
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.62, 0.62, 0.035, 48),
        new THREE.MeshLambertMaterial({color: 0xf2f6f3}));
      disc.position.y = -0.018;
      scene.add(disc);
      const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
      pv = {renderer, scene, cam, rig:null, raf:0, yaw:0, spin:0, look:0.65};
    }
    const canvas = pv.renderer.domElement;
    host.prepend(canvas);
    previewSync();
    const loop = () => {
      pv.raf = requestAnimationFrame(loop);
      const el = pv.renderer.domElement;
      const w = el.clientWidth, h = el.clientHeight;
      if (w && h && (el.width !== w * pv.renderer.getPixelRatio() || pv.cam.aspect !== w/h)){
        pv.renderer.setSize(w, h, false);
        pv.cam.aspect = w / h; pv.cam.updateProjectionMatrix();
        frameStage();
      }
      if (pv.rig){
        pv.yaw += pv.spin * 0.02;
        pv.rig.root.rotation.y = pv.yaw;
        poseAvatar(pv.rig, 'idle', 'none', 0);
      }
      pv.cam.lookAt(0, pv.look, 0);
      pv.renderer.render(pv.scene, pv.cam);
    };
    cancelAnimationFrame(pv.raf); loop();
    // 끌어서 돌린다 — 버튼보다 이게 먼저 손에 잡힌다
    if (!canvas.dataset.spin){
      canvas.dataset.spin = '1';
      let last = null;
      const down = e => { last = (e.touches ? e.touches[0] : e).clientX; };
      const move = e => {
        if (last === null) return;
        const x = (e.touches ? e.touches[0] : e).clientX;
        pv.yaw += (x - last) * 0.012; last = x;
        e.preventDefault();
      };
      const up = () => { last = null; };
      canvas.addEventListener('pointerdown', down);
      addEventListener('pointermove', move, {passive:false});
      addEventListener('pointerup', up);
    }
  }
  function previewSync(){
    if (!pv) return;
    if (pv.rig){ pv.scene.remove(pv.rig.root); disposeAvatar(pv.rig); }
    pv.rig = buildAvatar(draft || myLook, myBody, {flat: true});
    // 이름표는 맵에서만 쓴다. 무대에서는 캐릭터만 본다.
    pv.rig.root.rotation.y = pv.yaw;
    pv.scene.add(pv.rig.root);
    frameStage();
  }
  /**
   * 무대는 **언제나 전신 풀샷**이다. 부위를 고를 때마다 화면이 움직이면 어지럽고,
   * 바뀐 부분이 어디인지도 오히려 놓친다.
   *
   * 바운딩을 재서 맞추던 걸 걷어냈다 — 캐릭터 키는 어차피 1.30m 로 고정이라
   * 잴 이유가 없었고, 잴 때마다 값이 어긋나 몸이 화면 밖으로 나가곤 했다.
   * 세로 1.6m 가 보이게 세워 두면 1.30m 캐릭터가 넉넉히 들어온다.
   */
  const STAGE_H = 1.62, STAGE_W = 1.5, STAGE_LOOK = 0.66;
  function frameStage(){
    if (!pv) return;
    const t = Math.tan(pv.cam.fov * Math.PI / 360);
    const aspect = pv.cam.aspect || 1;
    const d = Math.max(STAGE_H / 2 / t, STAGE_W / 2 / (t * aspect));
    pv.look = STAGE_LOOK;
    pv.cam.position.set(0, STAGE_LOOK, d);
  }

  function previewStop(){
    if (!pv) return;
    cancelAnimationFrame(pv.raf); pv.raf = 0;
    if (pv.rig){ pv.scene.remove(pv.rig.root); disposeAvatar(pv.rig); pv.rig = null; }
  }

  // ── 모양 썸네일 ───────────────────────────────────────────────────
  //  숫자로 고르게 하면 눌러 보기 전엔 무엇인지 알 수 없다. 실제로 입힌 모습을
  //  찍어 보여 준다. 열쇠에 기준 얼굴을 넣는다 — 얼굴이 바뀌면 머리·옷도 달라 보인다.
  const lookThumbs = new Map();
  //  부위마다 **그 부위를 확대해서** 찍는다. 전신으로 찍으면 머리 차이가 몇 픽셀이라
  //  무엇이 다른지 알 수 없다(레퍼런스의 아바타 편집기들이 그렇게 한다).
  //  캐릭터 키는 1.30m — 아래 값은 그 안에서의 띠다.
  //  띠는 **바운딩에서 비율로** 잡는다. 좌표로 박으면 안 맞는다 — 긴 머리·모자가
  //  있는 모델은 같은 키에 맞추느라 머리통이 아래로 내려온다.
  //  **부위만 보여 준다.** 전신을 찍으면 12개가 다 비슷한 살색 덩어리로 보인다.
  //  레퍼런스(아바타 편집기들)가 머리카락을 민머리 위에 얹어 보여 주는 이유다.
  //   · 헤어 → 민머리(male-b) 위에 그 머리카락만. 몸은 감춘다
  //   · 옷   → 몸만. 머리를 감춘다
  //   · 얼굴 → 얼굴만
  const NEUTRAL = 'male-b';            // 12종 중 유일하게 원래 대머리다
  const THUMB_W = 132, THUMB_H = 150;
  let aR = null, aS = null, aC = null;
  function thumbSetup(){
    if (aR) return;
    aR = new THREE.WebGLRenderer({antialias:true, alpha:true});
    aR.setSize(THUMB_W, THUMB_H); aR.setPixelRatio(2);
    aR.outputColorSpace = THREE.SRGBColorSpace;
    aS = new THREE.Scene();
    aS.add(new THREE.HemisphereLight(0xffffff, 0xe2e8e3, 2.3));
    const k = new THREE.DirectionalLight(0xfff6e8, 1.3); k.position.set(2, 4, 3); aS.add(k);
    // 정사영 — 원근이 섞이면 카드마다 크기가 달라 보여 비교가 안 된다
    aC = new THREE.OrthographicCamera(-1, 1, 1, -1, -20, 40);
  }
  /** 슬롯마다 보여 줄 메시만 남긴다. 나머지는 감춘다. */
  function showOnly(rig, slot){
    rig.model.traverse(o => {
      if (!o.isMesh) return;
      const isBody = o.name.charAt(0) === 'b';
      o.visible = slot === 'body' ? isBody : !isBody;
    });
  }
  function renderThumb(look, slot){
    thumbSetup();
    const rig = buildAvatar({...look, colors: (draft || myLook).colors}, myBody, {flat: true});
    // 바인드 자세는 팔을 벌린 T 포즈다. 그대로 찍으면 옷보다 팔이 먼저 보이고
    // 카드 안에서 옷이 가로로 길쭉해진다. idle 을 한 번 돌려 팔을 내린다.
    rig.mixer.update(0.4);
    showOnly(rig, slot);
    rig.root.rotation.y = -0.38;          // 살짝 튼 3/4 — 옆머리·소매가 보인다
    rig.root.updateMatrixWorld(true);
    aS.add(rig.root);
    // 보이는 메시만으로 바운딩을 잡는다 — 감춘 것까지 세면 엉뚱한 데를 찍는다
    const box = new THREE.Box3();
    rig.model.traverse(o => { if (o.isMesh && o.visible) box.expandByObject(o); });
    if (box.isEmpty()) box.setFromObject(rig.root);
    const cy = (box.max.y + box.min.y) / 2;
    const h = Math.max(0.08, (box.max.y - box.min.y)) / 2 * 1.14;
    const wNeed = Math.max(0.08, (box.max.x - box.min.x)) / 2 * 1.14;
    const half = Math.max(h, wNeed * (THUMB_H / THUMB_W));
    const w = half * (THUMB_W / THUMB_H);
    aC.left = -w; aC.right = w; aC.top = half; aC.bottom = -half;
    aC.position.set(0, cy, 8); aC.lookAt(0, cy, 0);
    aC.updateProjectionMatrix();
    aR.render(aS, aC);
    const url = aR.domElement.toDataURL('image/png');
    aS.remove(rig.root); disposeAvatar(rig);
    return url;
  }
  function thumbFor(slot, v, L){
    if (slot === 'pet') return Pets.petThumb(v);
    const k = `${slot}:${v}:${L.base}:${L.head}:${L.face}:${L.eyewear}:` +
              JSON.stringify((draft || myLook).colors || {});
    if (lookThumbs.has(k)) return lookThumbs.get(k);
    // 헤어는 **지금 쓰는 내 얼굴**에 얹어 찍는다. 그게 알고 싶은 것이기도 하고,
    // 기준 얼굴을 따로 두면 그 얼굴의 특징(male-b 는 수염이 덥수룩하다)이 열두
    // 장에 전부 딸려 나온다. base 의 원래 머리는 어차피 벗겨지므로 아무 얼굴이나 된다.
    // 옷은 얼굴을 감추므로 기준 몸을 써도 상관없다.
    const look = slot === 'base' ? {base:v, head:v, body:v}
               : slot === 'head' ? {base:L.base, head:v, body:L.body}
               : slot === 'face' ? {base:L.base, head:L.head, body:L.body, face:v,
                                    eyewear:'none'}  // 안경이 표정을 가린다
               : slot === 'eyewear' ? {...L, eyewear:v}
                                 : {base:NEUTRAL, head:'none', body:v};
    let url = '';
    try { url = renderThumb(look, slot); } catch { url = ''; }
    lookThumbs.set(k, url);
    return url;
  }

  //  같은 탭을 다시 그릴 때는 목록이 보던 자리에 그대로 있어야 한다.
  //  innerHTML 을 통째로 갈아 끼우므로 스크롤이 맨 위로 튄다 — 카드를 하나
  //  고를 때마다 목록이 처음으로 돌아가면 스물다섯 마리 중에 고를 수가 없다.
  let lastDrawTab = null;
  function drawChars(){
    if (!charOpen) return;
    const keepScroll = lastDrawTab === dressTab;
    const prevFoot = keepScroll ? elFoot.scrollTop : 0;
    const prevGrid = keepScroll ? (elFoot.querySelector('.dgrid2')?.scrollTop || 0) : 0;
    lastDrawTab = dressTab;
    const D = draft || myLook;
    const L = Avatar.resolveLook ? Avatar.resolveLook(D) : {base: D.model};
    const colors = D.colors || {};
    const parts = Avatar.PARTS || [];
    const tabs = TABS;                      // 탭은 늘 보여 준다 — 사라지면 없어진 줄 안다
    if (!tabs.some(t => t.id === dressTab)) dressTab = tabs[0].id;
    const tab = tabs.find(t => t.id === dressTab);

    //  색 칸이 차지하는 높이는 어느 탭에서나 두 줄이다. 부위가 둘인 탭(옷)은
    //  부위마다 한 줄씩, 부위가 하나면 그 하나가 두 줄을 쓴다. 색이 늘어도
    //  바가 자라지 않아야 무대가 안 눌린다.
    const rows1 = (tab.colors || []).length > 1;
    const swatches = (partId) => {
      const p = parts.find(x => x.id === partId);
      if (!p) return '';
      return `<div class="drow"><span class="dlabel">${p.name}</span>` +
        `<div class="swrow${rows1 ? ' r1' : ''}">` +
        p.ids.map(id => {
          const c = (Avatar.PALETTE || []).find(x => x.id === id);
          if (!c) return '';
          const on = colors[partId] === id ? ' on' : '';
          return `<button class="swatch${on}" data-part="${partId}" data-color="${id}"` +
                 ` style="background:${c.hex}" title="${c.name}" aria-label="${p.name} ${c.name}"` +
                 `${on ? ' aria-pressed="true"' : ''}></button>`;
        }).join('') + `</div></div>`;
    };

    let body = '';
    {
      const slot = tab.slot;
      const opts = optionsOf(slot, L);
      const curOf = slot === 'pet' ? ((draft || myLook).pet || 'none') : L[slot];
      body += `<div class="dgrid2">` + opts.map(v => {
        const on = v === curOf ? ' on' : '';
        const lock = ownsSlot(slot, v) ? '' : ' lock';
        // '없음'도 글자 대신 그림으로 — 옆 칸이 전부 그림인데 혼자 글자면
        // 카드가 아니라 안내문으로 읽힌다. 머리는 민머리, 안경은 벗은 안경.
        if (v === Avatar.BALD || v === 'none')
          return `<button class="dcard${on}" data-slot="${slot}" data-val="${v}" ` +
                 `aria-label="없음">` +
                 `<span class="dnone">` +
                 icon(slot === 'eyewear' ? 'glasses-off' : 'ban', 32) +
                 `</span></button>`;
        const url = thumbFor(slot, v, L);
        return `<button class="dcard${on}${lock}" data-slot="${slot}" data-val="${v}">` +
               (url ? `<img src="${url}" alt="" draggable="false">` : `<span class="dph"></span>`) +
               (lock ? `<span class="dlock">${icon('lock', 12)}</span>` : '') + `</button>`;
      }).join('') + `</div>`;
      body += (tab.colors || []).map(swatches).join('');
    }

    elHead.innerHTML =
      `<b>캐릭터 꾸미기</b><span class="sp"></span>` +
      (wardrobe ? `<span class="dpts">${wardrobe.unlimited ? '∞' :
         (wardrobe.points || 0).toLocaleString('ko-KR')}<i>P</i></span>` : '') +
      `<button class="droll" data-roll aria-label="아무거나 골라 보기">${icon('dice', 18)}</button>` +
      `<button class="dcancel" data-close>닫기</button>` +
      `<button class="ddone" data-apply>적용</button>`;
    elFoot.innerHTML =
      (ME ? `<div class="dname"><span class="dnlab">이름</span>` +
            `<input data-name maxlength="12" value="${esc(nameDraft)}" ` +
            `aria-label="캠퍼스에서 보이는 이름"></div>` : '') +
      `<div class="dtabs">` +
        tabs.map(t => `<button class="dtab${t.id === dressTab ? ' on' : ''}" ` +
                      `data-tab="${t.id}">${t.name}</button>`).join('') +
      `</div>${body}${buyRow(L)}`;
    elFoot.scrollTop = prevFoot;
    const grid = elFoot.querySelector('.dgrid2');
    if (grid) grid.scrollTop = prevGrid;
  }
  /** 안 산 것을 입어 본 상태면 사는 줄. 없으면 빈 문자열. */
  function buyRow(L){
    if (!wardrobe) return '';
    const s = SLOTS.find(s => !ownsSlot(s.id, L[s.id]));
    if (!s) return '';
    const cost = (wardrobe.price || {})[s.id] || 0;
    const short = (wardrobe.points || 0) < cost;
    return `<div class="dbuy">` +
      `<span class="dbuyt">${s.name} · <b>${cost.toLocaleString('ko-KR')}P</b></span>` +
      `<span class="dbuyp">가진 포인트 ${(wardrobe.points || 0).toLocaleString('ko-KR')}P</span>` +
      `<button class="ddone" data-buy="${s.id}"${short ? ' disabled' : ''}>` +
      `${short ? '포인트 부족' : '사기'}</button></div>`;
  }
  elChars.addEventListener('input', e => {
    //  ⚠ 여기서 drawChars 를 부르면 안 된다. innerHTML 을 다시 쓰면 입력칸이
    //    새로 만들어져 **한 글자 칠 때마다 커서가 날아간다.** 값만 담아 둔다.
    if (e.target.hasAttribute('data-name')) nameDraft = e.target.value;
  });
  elChars.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-roll')){ await rollLook(); return; }
    if (b.hasAttribute('data-apply')){ await applyDraft(b); return; }
    if (b.hasAttribute('data-close')){ closeChars(); return; }
    if (b.dataset.tab){ dressTab = b.dataset.tab; drawChars(); return; }
    if (b.dataset.buy){
      const slot = b.dataset.buy;
      const id = Avatar.resolveLook(draft)[slot];
      b.disabled = true;
      const r = await buyWardrobe(slot, id);
      if (!r.ok){ toast(r.error || '사지 못했어요'); drawChars(); return; }
      wardrobe = {...wardrobe, points: r.points, owned: r.owned};
      toast(r.already ? '이미 가지고 있어요' : '샀어요!');
      drawChars();
      return;
    }
    if (b.dataset.slot){ await pickSlot(b.dataset.slot, b.dataset.val); return; }
    if (b.dataset.spin){
      if (pv) pv.yaw += Number(b.dataset.spin) * Math.PI / 4;
      return;
    }
    if (b.dataset.step){
      const slot = slotOf(dressTab);
      const L = Avatar.resolveLook(draft);
      const opts = optionsOf(slot, L);
      const at = Math.max(0, opts.indexOf(L[slot]));
      await pickSlot(slot, opts[(at + Number(b.dataset.step) + opts.length) % opts.length]);
      return;
    }
    if (b.dataset.part){
      // 같은 색을 다시 누르면 원래 색으로 되돌린다 — 되돌릴 길이 없으면 못 눌러 본다.
      const cur = (draft.colors || {})[b.dataset.part];
      const colors = {...(draft.colors || {})};
      if (cur === b.dataset.color) delete colors[b.dataset.part];
      else colors[b.dataset.part] = b.dataset.color;
      draft = {...draft, colors};
      lookThumbs.clear();                 // 색이 바뀌면 썸네일도 다시 찍어야 한다
      previewSync(); drawChars();
      return;
    }
  });
  async function pickSlot(slot, value){
    if (slot === 'pet'){
      if (value !== 'none') await Pets.ensure(value);
      draft = {...draft, pet: value === 'none' ? null : value};
      drawChars();
      return;
    }
    const L = Avatar.resolveLook(draft);
    const next = {...L, [slot]: value};
    draft = {...draft, ...next, model: undefined, aid: undefined};
    if (slot === 'eyewear'){
      if (value !== 'own' && value !== 'none') await Avatar.ensureAid?.(value);
    } else if (value !== Avatar.BALD) await Avatar.ensure?.(value);
    previewSync();
    drawChars();
  }

  /**
   * 주사위 — 조합이 12 × 13 × 12 × 색이라 무엇을 고를지 모르는 게 정상이다.
   * 시작점을 준다. **가진 것 중에서만** 뽑는다 — 못 사는 걸 뽑아 주면 놀리는 셈이다.
   */
  async function rollLook(){
    const pick = a => a[Math.floor(Math.random() * a.length)];
    const mine = slot => optionsOf(slot).filter(v => ownsSlot(slot, v));  // 안경은 안 뽑는다
    const next = {base: pick(mine('base')), head: pick(mine('head')), body: pick(mine('body'))};
    const ids = (Avatar.PALETTE || []).map(p => p.id);
    const colors = {};
    for (const p of (Avatar.PARTS || []))
      if (Math.random() < 0.7) colors[p.id] = pick(p.ids.length ? p.ids : ids);
    draft = {...draft, ...next, model: undefined, colors,
             aid: Avatar.hasBuiltinGlasses?.(next.base) ? null : draft.aid};
    await Promise.all([next.base, next.head, next.body]
      .filter(v => v && v !== Avatar.BALD).map(v => Avatar.ensure?.(v).catch(() => false)));
    lookThumbs.clear();
    previewSync(); drawChars();
  }

  /** 적용 — 초안을 내 것으로. 안 산 것은 여기서 걸러진다. */
  async function applyDraft(btn){
    // 저장은 왕복이 있어 한 박자 는다. 그동안 버튼이 그대로면 안 눌린 줄 알고
    // 다시 누른다 — 누르는 순간 잠그고 무슨 일이 벌어지는지 버튼에 적는다.
    if (btn){ btn.disabled = true; btn.textContent = '저장 중…'; }
    const L = Avatar.resolveLook(draft);
    const back = {};
    for (const sl of SLOTS) if (!ownsSlot(sl.id, L[sl.id])) back[sl.id] = Avatar.resolveLook(savedLook || {})[sl.id];
    const dropped = Object.keys(back).length;
    myLook = {...draft, ...back};
    //  이름이 바뀌었으면 같이 저장한다. 실패해도 캐릭터 저장은 살린다 —
    //  이름 때문에 옷까지 못 갈아입는 건 말이 안 된다.
    let nameMsg = '';
    if (ME && nameDraft.trim() && nameDraft.trim() !== ME.name){
      const nr = await saveName(nameDraft);
      if (nr.ok){ ME.name = nr.name; MY_LABEL = nr.name; }
      else nameMsg = ' (이름은 못 바꿨어요)';
    }
    rebuildPlayer();                     // 이름표는 여기서 새로 붙는다
    const r = await saveCharacter(myLook, myBody);
    // 남들에게 알리다 실패해도 **내 저장은 이미 끝났다**. 여기서 예외가 새면
    // 창이 안 닫히고 알림도 안 떠, 저장이 안 된 것처럼 보인다.
    if (r.ok){
      savedLook = {...myLook};
      try { net && net.updateMeta(myLook, myBody, MY_LABEL); }
      catch (e){ console.warn('[campus] 캐릭터 방송 실패', e); }
    }
    if (!r.ok && btn){ btn.disabled = false; btn.textContent = '적용'; }
    if (r.ok) closeChars();
    toast(!r.ok ? '저장 실패: ' + r.error
          : (dropped ? '사지 않은 건 빼고 저장했어요' : '캐릭터를 저장했어요 ✓') + nameMsg);
  }

  document.getElementById('dressBtn').onclick = openChars;

  // ══ 가방 · 매점 ═══════════════════════════════════════════════════
  // 패널은 innerHTML 로 매번 다시 그린다 — 항목이 10개 남짓이라 diff 를 관리할
  // 이유가 없다. 클릭은 패널 단위 위임으로 받는다.
  const uiOpen = () => !elBag.hidden || !elShop.hidden || !elTalk.hidden || !elChars.hidden;
  const esc = s => String(s);
  const itemRow = (k, right) =>
    `<div class="prow"><span class="ig">${icon(ITEMS[k].icon, 17)}</span>` +
    `<span class="nm">${esc(ITEMS[k].name)}</span>${right}</div>`;

  function refreshBag(){
    // 숫자와 단위를 붙여 쓰면 0P 가 알파벳 OP 로 읽힌다. 단위는 따로 조판한다.
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
      `<div class="phead">${icon('backpack', 16)} 가방<span class="sp"></span>` +
      `<b>${INV.bells.toLocaleString()}<i>P</i></b>` +
      `<button class="x" data-close aria-label="닫기">${icon('x', 16)}</button></div>` +
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
    const ti = tierNow();
    const buys = Object.keys(ITEMS).filter(k => ITEMS[k].buy).map(k => {
      const need = ITEMS[k].tier ?? 0;
      if (need > ti.index){
        const at = ROOM_TIERS[need];
        return itemRow(k, `<span class="ct lock">${icon('lock', 13)} 누적 ${at.need.toLocaleString()}P</span>`);
      }
      return itemRow(k, `<button data-buy="${k}" ${INV.bells >= ITEMS[k].buy ? '' : 'disabled'}>` +
        `${ITEMS[k].buy}P</button>`);
    });
    elShop.innerHTML =
      `<div class="phead">${icon('store', 16)} 상점<span class="sp"></span>` +
      `<b>${INV.bells.toLocaleString()}<i>P</i></b>` +
      `<button class="x" data-close aria-label="닫기">${icon('x', 16)}</button></div>` +
      `<div class="pbody">` +
      `<div class="psec">팔기</div>` +
      (sells.length ? sells.join('') : `<div class="pempty">팔 물건이 없어요</div>`) +
      `<div class="psec">사기 — 가구는 우리집에 놓을 수 있어요</div>` + buys.join('') +
      `</div>`;
  }
  const shutPanels = () => { elShop.hidden = elTalk.hidden = true; closeChars(); };
  function openBag(){ shutPanels(); elBag.hidden = false; refreshBag(); }
  function openShop(){ elBag.hidden = elTalk.hidden = true; closeChars();
                       elShop.hidden = false; refreshShop(); }
  elBagBtn.onclick = () => elBag.hidden ? openBag() : (elBag.hidden = true);

  elBag.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-close')){ elBag.hidden = true; return; }
    const r = RECIPES.find(r => r.id === b.dataset.craft);
    if (r){
      for (const [k, n] of Object.entries(r.need)) if (countOf(k) < n) return;
      for (const [k, n] of Object.entries(r.need)) take(k, n);
      give(r.make);
      playOnce(player, 'yes');
      toast(`${r.name} 완성!`);
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
      INV.bells += ITEMS[k].sell * n; INV.earned += ITEMS[k].sell * n; markInv();
      toast(`${ITEMS[k].name} ×${n} → ${(ITEMS[k].sell*n).toLocaleString()}P`);
      refreshShop();
    } else if (d.buy){
      const k = d.buy;
      if (INV.bells < ITEMS[k].buy) return;
      INV.bells -= ITEMS[k].buy; give(k);
      playOnce(player, 'yes');
      toast(`${ITEMS[k].name} 구입!`);
      refreshShop();
    }
  });

  // ══ 충쌤 상담 ═════════════════════════════════════════════════════
  //  같은 사람이라도 역할에 따라 할 말이 다르다.
  //   · 학부모 → 학습 상담(아이 진행 상황을 어디서 보는지)
  //   · 학생   → 오늘 할 과제 안내
  //   · 비로그인 → 로그인 안내
  //  실제 데이터는 plantor 본체 화면들이 이미 갖고 있다. 여기서는 그리로 보낸다 —
  //  같은 숫자를 두 곳에서 계산하면 반드시 어긋난다.
  function talkScript(){
    const role = ME && ME.role;
    if (!ME) return {
      title: '충쌤',
      lines: ['안녕! 처음 보는 얼굴이네.',
              '로그인하면 네 학습 기록을 보고 상담해 줄 수 있어.'],
      actions: [{label:'로그인하러 가기', href:'/'}],
    };
    if (role === 'parent') return {
      title: `${ME.name} 학부모님, 안녕하세요`,
      lines: ['아이 학습은 잘 따라가고 있어요.',
              '진행 상황과 이번 달 리포트는 아래에서 바로 보실 수 있어요.'],
      actions: [{label:'학습 리포트 보기', href:'/parent'},
                {label:'플랜 확인', href:'/plan'}],
    };
    if (role === 'admin') return {
      title: '충쌤',
      lines: ['운영자시군요. 관리 화면으로 안내할게요.'],
      actions: [{label:'관리', href:'/admin'}],
    };
    return {
      title: `${ME.name}, 어서 와`,
      lines: ['오늘 할 과제부터 같이 보자.',
              '끝내고 오면 포인트를 줄게 — 그걸로 우리집을 넓힐 수 있어.'],
      actions: [{label:'오늘 과제 보기', href:'/class5'},
                {label:'내 플랜', href:'/plan'}],
    };
  }

  function openTalk(){
    elBag.hidden = elShop.hidden = true; closeChars();
    // 충쌤에게 인사 — 말을 걸었다는 신호가 화면에도 남는다
    for (const n of NPCS) if (n.rig) playOnce(n.rig, 'yes');
    playOnce(player, 'wave');
    const t = talkScript();
    const ti = tierNow();
    const next = ti.next
      ? `<div class="pempty">누적 ${INV.earned.toLocaleString()}P · ${ti.name}` +
        ` — ${ti.next.need.toLocaleString()}P 모으면 ${ti.next.name}으로 넓어져요</div>`
      : `<div class="pempty">누적 ${INV.earned.toLocaleString()}P · ${ti.name} (최대)</div>`;
    elTalk.innerHTML =
      `<div class="phead">${icon('user-round', 16)} ${esc(t.title)}<span class="sp"></span>` +
      `<button class="x" data-close aria-label="닫기">${icon('x', 16)}</button></div>` +
      `<div class="pbody">` +
      t.lines.map(l => `<p class="say">${esc(l)}</p>`).join('') +
      (ME ? next : '') +
      `<div class="acts">` +
      t.actions.map(a => `<button data-go="${a.href}">${esc(a.label)}</button>`).join('') +
      `</div></div>`;
    elTalk.hidden = false;
  }
  elTalk.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-close')){ elTalk.hidden = true; return; }
    if (b.dataset.go) location.href = b.dataset.go;
  });

  // ══ 꾸미기 ════════════════════════════════════════════════════════
  //  같은 코드가 두 곳에 쓰인다:
  //    · 내 방(study) — 누구나 자기 방만. 배치 범위는 누적 포인트로 넓어진다
  //    · 공용 공간   — 운영자만. 캠퍼스·학습센터·상점을 자유롭게 꾸민다
  //  다른 건 '어느 배열을 고치고 어디에 저장하느냐' 뿐이다.
  const IS_ADMIN = !!(ME && ME.role === 'admin');
  let editing = false, editItems = null, editOrig = null;
  let editTarget = null;              // 'room' | 'place'
  let editSel = -1, placeType = null, decorReady = false, editGroup = null;
  let editListOpen = true;            // 고르면 접힌다 — 시트가 맵을 덮은 채로는 못 놓는다
  let nameDraft = '';                 // 이름도 초안이다 — 적용을 눌러야 바뀐다

  //  격자 — 어디에 붙는지 **보여야** 스냅이 기능이다. 안 보이면 탭이 어긋난
  //  자리로 튀는 버그처럼 읽힌다. 칸은 고른 물건의 스냅을 따라간다.
  let editGrid = null;
  function syncEditGrid(){
    if (editGrid){ scene.remove(editGrid); editGrid.geometry.dispose(); editGrid.material.dispose(); editGrid = null; }
    if (!editing) return;
    const type = placeType || (editSel >= 0 && editItems[editSel] ? editItems[editSel].t : null);
    const [gx, gz] = decorSnap(type, editSel >= 0 && !placeType ? editItems[editSel].r : 0);
    const B = editBounds();
    const pts = [];
    //  칸 경계가 아니라 **놓이는 자리(칸의 중심)** 기준으로 긋는다 — 스냅은 round 라
    //  교차점이 곧 물건의 중심이 된다.
    for (let x = Math.ceil(B.minX / gx) * gx; x <= B.maxX + 1e-6; x += gx)
      pts.push(x, 0.03, B.minZ, x, 0.03, B.maxZ);
    for (let z = Math.ceil(B.minZ / gz) * gz; z <= B.maxZ + 1e-6; z += gz)
      pts.push(B.minX, 0.03, z, B.maxX, 0.03, z);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    editGrid = new THREE.LineSegments(g,
      new THREE.LineBasicMaterial({color: 0x1f7a33, transparent: true, opacity: 0.3, depthWrite: false}));
    editGrid.renderOrder = 4;
    scene.add(editGrid);
  }

  //  유령 — 고른 물건이 커서를 따라다닌다. 탭하기 전에 **어디에 얼마만 하게**
  //  놓일지 보여 준다. 격자에 붙은 자리를 그대로 쓰므로 "여기가 맞나" 를 안 묻는다.
  //  반투명으로 그려 이미 놓인 것과 헷갈리지 않게 한다.
  let ghost = null, ghostType = null, ghostJunk = [];
  function clearGhost(){
    for (const o of ghostJunk) o.dispose?.();
    ghostJunk = [];
    if (ghost){ scene.remove(ghost); ghost = null; }
    ghostType = null;
  }
  function syncGhost(){
    const want = editing ? placeType : null;
    if (want === ghostType) return;
    clearGhost();
    if (!want || !decorReady) return;
    const g = buildDecor({t: want, x: 0, z: 0, r: 0, s: 1}, m => ghostJunk.push(m));
    if (!g) return;
    g.traverse(o => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.55;
      o.material.depthWrite = false;
      ghostJunk.push(o.material);
      o.renderOrder = 6;
    });
    g.visible = false;                   // 커서가 바닥에 닿기 전까지는 안 보인다
    ghost = g; ghostType = want;
    scene.add(g);
  }
  /** 화면 좌표 → 격자에 붙인 바닥 좌표. 없으면 null(바닥 밖) */
  function snapAt(cx, cy){
    const r = cv.getBoundingClientRect();
    ndc.set((cx - r.left)/r.width*2 - 1, -((cy - r.top)/r.height*2 - 1));
    rayc.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    if (!rayc.ray.intersectPlane(GROUND, hit)) return null;
    const type = placeType || (editSel >= 0 && editItems[editSel] ? editItems[editSel].t : null);
    const rot = editSel >= 0 && !placeType ? editItems[editSel].r : 0;
    const [gx, gz] = decorSnap(type, rot);
    return {x: Math.round(hit.x / gx) * gx, z: Math.round(hit.z / gz) * gz};
  }
  function moveGhost(cx, cy){
    if (!ghost) return;
    const p = snapAt(cx, cy);
    const B = editBounds();
    const ok = p && p.x >= B.minX && p.x <= B.maxX && p.z >= B.minZ && p.z <= B.maxZ;
    ghost.visible = !!ok;
    if (ok) ghost.position.set(p.x, 0, p.z);
  }

  const selMarker = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.74, 28).rotateX(-Math.PI/2),
    new THREE.MeshBasicMaterial({color:0x1f7a33, transparent:true, opacity:0.9, depthWrite:false}));
  selMarker.visible = false; selMarker.renderOrder = 5;
  scene.add(selMarker);

  //  내 방은 티어 범위 안으로 제한한다. 공용 공간은 그 레벨의 활동 범위로 넉넉히 둔다.
  const editBounds = () => editTarget === 'room'
    ? roomBounds(INV.earned)
    : (level === 'outdoor' ? {minX:-14, maxX:14, minZ:-13, maxZ:7}
                           : {minX:-26, maxX:26, minZ:-22, maxZ:8});

  function redraw(){
    if (editTarget === 'room') applyRoom(editItems); else applyPlace(editItems);
    syncMarker(); refreshEditBar();
  }

  function syncMarker(){
    selMarker.visible = editing && editSel >= 0;
    if (!selMarker.visible) return;
    const it = editItems[editSel];
    const b = decorBox(it);
    selMarker.position.set(it.x, 0.05, it.z);
    selMarker.scale.setScalar(b ? Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.85 : 1);
  }

  /** 팔레트에 보일 목록. 내 방은 산 가구만, 공용 공간(운영자)은 전부. */
  function paletteItems(){
    if (editTarget === 'place') return DECOR;
    // 내 방 — 인벤토리에 있는 것만. ITEMS.furn 의 id 가 DECOR id 와 같다(board→tv 는 별칭)
    return DECOR.filter(d => countOf(d.id) > 0 || (d.id === 'tv' && countOf('board') > 0));
  }

  function refreshEditBar(){
    const list = paletteItems();
    const groups = GROUPS.filter(g => list.some(d => d.group === g));
    // 묶음을 전부 늘어놓으면 목록이 세로로 끝없이 길다 — 한 번에 한 묶음만.
    if (!groups.includes(editGroup)) editGroup = groups[0] || null;
    const sel = editSel >= 0 ? editItems[editSel] : null;

    const cell = d => {
      const url = decorReady ? decorThumb(d.id) : '';
      const own = editTarget === 'room' ? `<b>×${countOf(d.id) || countOf('board')}</b>` : '';
      return `<button class="dcell ${placeType === d.id ? 'on' : ''}" data-place="${d.id}"
                title="${esc(d.name)}">` +
             (url ? `<img src="${url}" alt="" draggable="false">` : `<span class="dph"></span>`) +
             `<span>${esc(d.name)}${own}</span></button>`;
    };

    const mini = !!placeType && !editListOpen;
    elEditBar.classList.toggle('mini', mini);
    elEditBar.innerHTML =
      `<div class="ehead">${editTarget === 'room' ? '내 방 꾸미기' : level === 'outdoor' ? '캠퍼스 꾸미기' : '실내 꾸미기'}` +
      (mini ? `<span class="epick">· ${esc(DECOR_BY_ID[placeType]?.name || '')} 놓는 중</span>` : '') +
      `<span class="sp"></span>` +
      (mini ? `<button data-list class="ghostb">목록</button>` : '') +
      `<button data-save>저장</button><button data-cancel class="ghostb">취소</button></div>` +
      (sel
        ? `<div class="erow">` +
          `<span class="elab">${esc(DECOR_BY_ID[sel.t]?.name || '')}</span>` +
          `<label>회전<input type="range" data-rot min="0" max="359" step="5"
             value="${Math.round(sel.r * 180 / Math.PI)}"></label>` +
          `<label>크기<input type="range" data-scale min="40" max="220" step="5"
             value="${Math.round((sel.s || 1) * 100)}"></label>` +
          `<button data-dup class="ghostb">복제</button>` +
          `<button data-del class="ghostb">치우기</button>` +
          `</div>`
        : '') +
      (mini ? '' :
        `<div class="etabs">` + groups.map(g =>
          `<button class="etab${g === editGroup ? ' on' : ''}" data-group="${esc(g)}">${esc(g)}</button>`).join('') +
        `</div>` +
        `<div class="dgrid">` +
          list.filter(d => d.group === editGroup).map(cell).join('') + `</div>`);
    syncEditGrid();
    syncGhost();
  }

  async function startEdit(){
    if (editing || switching) return;
    const inMyRoom = level === 'study';
    if (!inMyRoom && !IS_ADMIN) return toast('공용 공간은 운영자만 꾸밀 수 있어요');
    if (inMyRoom && !ME) return toast('로그인하면 내 방을 꾸밀 수 있어요');

    editTarget = inMyRoom ? 'room' : 'place';
    editing = true;
    editItems = (editTarget === 'room' ? myRoom : place).map(it => ({...it}));
    editOrig = editItems.map(it => ({...it}));
    editSel = -1; placeType = null; editListOpen = true;
    elBag.hidden = elShop.hidden = elTalk.hidden = true;
    elEditBar.hidden = false; syncRoomBtn();
    redraw();

    if (!decorReady){
      try { await preloadDecor(); decorReady = true; refreshEditBar(); }
      catch (e){ console.warn('[campus] 꾸미기 모델 로드 실패', e); }
    }
  }

  async function endEdit(save){
    if (!editing) return;
    editing = false;
    elEditBar.hidden = true;
    selMarker.visible = false;
    clearGhost();
    syncEditGrid();                     // editing=false 라 지우기만 한다
    syncRoomBtn();
    const items = save ? editItems : editOrig;
    if (editTarget === 'room') applyRoom(items); else applyPlace(items);
    if (!save) return toast('되돌렸어요');
    const r = editTarget === 'room' ? await saveRoom(items) : await savePlace(level, items);
    toast(r.ok ? '저장했어요' : '저장 실패: ' + r.error);
  }

  elRoomBtn.onclick = startEdit;
  elEditBar.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.group !== undefined){ editGroup = d.group; refreshEditBar(); }
    else if (d.list !== undefined){ editListOpen = true; refreshEditBar(); }
    else if (d.place !== undefined){
      placeType = placeType === d.place ? null : d.place;
      editListOpen = !placeType;               // 골랐으면 접고, 해제했으면 다시 편다
      editSel = -1; redraw();
    }
    else if (d.save !== undefined) endEdit(true);
    else if (d.cancel !== undefined) endEdit(false);
    else if (editSel >= 0 && d.del !== undefined){
      //  문 달린 건물을 지우면 들어갈 데가 없어진다. 지우는 대신 옮기게 한다.
      if (DECOR_BY_ID[editItems[editSel].t]?.door)
        return toast('건물은 치울 수 없어요 — 옮기거나 크기를 바꿔 보세요');
      editItems.splice(editSel, 1); editSel = -1; redraw();
    }
    else if (editSel >= 0 && d.dup !== undefined){
      const c = {...editItems[editSel]}; c.x += 1; c.z += 1;
      editItems.push(c); editSel = editItems.length - 1; redraw();
    }
  });
  elEditBar.addEventListener('input', e => {
    if (editSel < 0) return;
    const t = e.target;
    if (t.dataset.rot !== undefined) editItems[editSel].r = (+t.value) * Math.PI / 180;
    else if (t.dataset.scale !== undefined) editItems[editSel].s = (+t.value) / 100;
    else return;
    // 슬라이더를 끄는 동안 목록을 다시 그리면 포커스가 튄다 — 3D 만 갱신한다
    if (editTarget === 'room') applyRoom(editItems); else applyPlace(editItems);
    syncMarker();
  });

  //  편집 중의 탭 — 놓기 / 고르기 / 옮기기. 걷기 탭과 완전히 분리된다.
  function editTap(cx, cy){
    const r = cv.getBoundingClientRect();
    ndc.set((cx - r.left)/r.width*2 - 1, -((cy - r.top)/r.height*2 - 1));
    rayc.setFromCamera(ndc, camera);

    const group = editTarget === 'room' ? roomGroup : placeGroup;
    const hits = rayc.intersectObjects(group.children, true);   // 유령은 scene 직속이라 안 걸린다
    if (hits.length){
      let node = hits[0].object;
      while (node.parent && node.parent !== group) node = node.parent;
      const i = group.children.indexOf(node);
      if (i >= 0){ editSel = i; placeType = null; syncMarker(); refreshEditBar(); return; }
    }

    // 격자는 물건이 정한다 — 유령이 서 있는 자리와 **같은 함수**로 계산한다
    const sp = snapAt(cx, cy);
    if (!sp) return;
    const x = sp.x, z = sp.z;
    const B = editBounds();
    if (x < B.minX || x > B.maxX || z < B.minZ || z > B.maxZ){
      if (placeType || editSel >= 0){
        const t = editTarget === 'room' ? tierNow() : null;
        toast(t && t.next
          ? `여기는 아직 못 써요 — 누적 ${t.next.need.toLocaleString()}P 면 넓어져요`
          : '이 범위 밖에는 놓을 수 없어요');
      }
      return;
    }
    if (placeType){
      editItems.push({t: placeType, x, z, r: 0, s: 1});
      editSel = editItems.length - 1;
      redraw();
    } else if (editSel >= 0){
      editItems[editSel].x = x; editItems[editSel].z = z;
      redraw();
    }
  }

  // ── 첫 레벨 ────────────────────────────────────────────────────────
  refreshBag();                       // 툴바의 벨 잔액 첫 표시
  loadLevel('outdoor');

  // ══ 루프 ══════════════════════════════════════════════════════════
  const SPEED = 4.6;
  const RUN_SPEED = 7.6;             // 걷기의 1.65배 — sprint 클립 속도와 어울린다
  const RUN_MAG = 44;                // 조이스틱을 이만큼 밀면 달린다(px)
  const clock = new THREE.Clock();
  const moveVec = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
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
    const list = OCCLUDERS.concat(PLACE_OCC);
    if (!list.length) return;
    occDir.copy(player.root.position).setY(1.2).sub(camera.position);
    occRay.far = occDir.length();
    occRay.set(camera.position, occDir.normalize());
    const k = 1 - Math.exp(-9 * dt);
    for (const b of list){
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
    const frozen = switching || uiOpen();
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

    let moving = moveVec.lengthSq() > 0.0001;
    // 앉은 채로 방향을 넣으면 일어선다 — 앉기를 풀려고 버튼을 찾아 헤매지 않게
    if (sitting && moving) standUp();
    if (sitting) moving = false;

    // 달리기: 데스크탑은 Shift, 모바일은 조이스틱을 멀리 밀었을 때.
    // 별도 버튼을 두지 않는다 — 손가락 하나로 걷기·달리기가 이어져야 한다.
    const running = moving && (keys['run'] || stick.mag > RUN_MAG);
    if (moving){
      const before = P.x + P.z;
      const sp = running ? RUN_SPEED : SPEED;
      P.x += moveVec.x * sp * dt; resolve(P, 'x');
      P.z += moveVec.z * sp * dt; resolve(P, 'z');
      // 탭 이동이 벽에 막혀 제자리면 목적지를 버린다(소프트락 방지)
      if (tap.target){
        tap.stuck = (Math.abs((P.x + P.z) - before) < 0.004) ? tap.stuck + dt : 0;
        if (tap.stuck > 0.45) { tap.target = null; tap.stuck = 0; }
      }
      P.walkT += dt * sp * 1.55;
      const want = Math.atan2(moveVec.x, moveVec.z);
      let d = want - P.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));            // 최단 회전
      P.yaw += d * Math.min(1, dt * 14);
    }
    // ── 중력과 착지 ──
    //  올라설 면은 **위로 향할 때는 안 본다.** 안 그러면 상자 옆면을 스치며
    //  뛰어오르다 옆 상자 윗면에 빨려 붙는다.
    P.vy -= GRAVITY * dt;
    P.y += P.vy * dt;
    const floor = groundAt(P.x, P.z, P.y);
    if (P.vy <= 0 && P.y <= floor + 0.001){
      P.y = floor; P.vy = 0; grounded = true;
    } else if (P.y > floor + 0.02) grounded = false;
    if (sitting) { P.y = 0; P.vy = 0; grounded = true; }

    player.root.position.set(P.x, (sitting && seat ? seat.h + SIT_LIFT : P.y), P.z);
    player.root.rotation.y = P.yaw;
    const myAct = sitting ? 'sit' : running ? 'run' : moving ? 'walk' : 'idle';
    // 몸짓이 도는 동안엔 poseAvatar 가 기본 동작으로 덮지 않게 어댑터가 잠근다.
    // 여기서는 남들에게 보낼 상태만 몸짓으로 바꿔 준다.
    // 몸짓 중에는 그 몸짓 이름을 보낸다 — 남의 화면에서도 같은 동작이 나온다
    const wire = performance.now() < gestureUntil ? gestureAct : myAct;
    poseAvatar(player, myAct, 'none', moving ? P.walkT/7 : t);

    for (const n of NPCS) poseAvatar(n.rig, 'idle', 'none', t + n.phase);

    // 다른 접속자 — 받은 좌표로 보간해서 그린다
    for (const r of remotes.values()){
      const k = 1 - Math.exp(-11 * dt);
      r.x += (r.tx - r.x) * k;
      r.z += (r.tz - r.z) * k;
      let dy = r.tyaw - r.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      r.yaw += dy * Math.min(1, dt * 12);
      r.h = (r.h || 0) + ((r.th || 0) - (r.h || 0)) * k;
      r.rig.root.position.set(r.x, r.h, r.z);
      r.rig.root.rotation.y = r.yaw;
      if (r.moving) r.walkT += dt * (r.act === 'run' ? RUN_SPEED : SPEED) * 1.55;
      poseAvatar(r.rig, r.act || 'idle', 'none', r.moving ? r.walkT/7 : t);
      if (r.pet) petFollow(r.pet, r.x, r.z, r.yaw, r.moving, dt, r.h || 0);
    }
    if (myPet) petFollow(myPet, P.x, P.z, P.yaw, moving, dt, P.y);

    // ── 하늘 ── 시각에 따라 색·구름·별·달. 실내에서는 끈다(천장 위 별 금지)
    {
      const s = sky.update(camera, dt, level === 'outdoor');
      scene.fog.color.setHex(s.low);
      //  밤에는 해를 낮추고 달빛처럼 푸르게. 완전히 끄면 캐릭터가 실루엣이 되어
      //  누가 누군지 안 보인다 — 어둡게 하되 얼굴은 읽히는 선에서 멈춘다.
      sun.intensity = 0.58 - s.night * 0.34;
      sun.color.setHex(s.night > 0.5 ? 0xcfd8ff : 0xfffdf7);
      hemi.intensity = 0.76 - s.night * 0.30;
      hemi.color.setHex(s.night > 0.5 ? 0xaebbdd : 0xffffff);
    }

    // ── 동숲: 곡면 램프 · 구름 · 나무 흔들림 · 과일 낙하/줍기 ──
    //  곡면은 껐다. 보이는 높이와 실제 높이가 어긋나면 발판 위에 정확히
    //  내려앉는 재미가 통째로 사라진다 — 세계에 높이가 생긴 이상 둘은 같아야 한다.
    //  (되살리려면 CURVE_K 를 다시 곱하면 된다. curve.js 는 그대로 둔다)
    CURVE.value += (0 - CURVE.value) * Math.min(1, dt*4);
    // 굽힘 기준점 = 플레이어의 뷰공간 깊이. 여기서 변형량이 0 이라 발이 땅에 붙는다
    FOCUS.value = tmp.copy(player.root.position).setY(0.9 + P.y)
                     .applyMatrix4(camera.matrixWorldInverse).z;
    if (level === 'outdoor'){
      tickClock();
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
            if (m.position.y <= 0.16){ m.position.y = 0.16; gf.vy = null; }
            keep.push(gf);
          } else {
            const dx = m.position.x - P.x, dz = m.position.z - P.z;
            if (dx*dx + dz*dz < 1.44){                      // 다가가면 줍는다
              // 사과 쪽으로 몸을 돌리고 줍는 동작을 낸다. 그냥 사라지면
              // 주웠다는 사실이 토스트로만 남아 손맛이 없다.
              P.yaw = Math.atan2(dx, dz);
              player.root.rotation.y = P.yaw;
              gesture('pick', 340);
              world.remove(m);
              give('apple');
              toast(`사과 +1 · 모두 ${countOf('apple')}개`);
            } else keep.push(gf);
          }
        }
        groundFruits = keep;
      }
    }

    // ── 존 판정 ──
    let inZone = null;
    for (const z of ZONES.concat(PLACE_ZONES)){
      if (z.kind === 'tree' && INV.picked.includes(z.tree)) continue;   // 오늘 흔든 나무는 끝
      if (P.x > z.minX && P.x < z.maxX && P.z > z.minZ && P.z < z.maxZ){ inZone = z; break; }
    }
    setZone(editing ? null : inZone);

    // 내 좌표 발행 — 채널이 바뀌면 net.js가 구독 대상을 통째로 갈아끼운다
    if (net) net.publish(P.x, P.z, P.yaw, wire, channelOf(inZone), P.y);

    zoom += (zoomTo - zoom) * Math.min(1, dt * 8);
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
    tmp.copy(CAM_DIR).multiplyScalar(zoom * fit).add(tmp2.set(P.x, P.y, P.z));
    camPos.lerp(tmp, 1 - Math.exp(-6.5 * dt));
    //  올라선 만큼 화면도 올라와야 한다 — 안 그러면 지붕에 섰는데 카메라는
    //  마당을 보고 있어 캐릭터가 화면 위로 밀려 나간다.
    camLook.lerp(tmp.set(P.x, 1.30 + P.y, P.z), 1 - Math.exp(-9 * dt));
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
    P, get ZONES(){ return ZONES.concat(PLACE_ZONES); },
    get COLLIDERS(){ return COLLIDERS.concat(PLACE_COLLIDERS); },
    get place(){ return place; },
    room: () => currentZone && currentZone.room && currentZone.room.id,
    level: () => level,
    go: (id) => id === 'outdoor' ? exitToOutdoor() : enterBuilding(id),
    counts: () => ({world: world.children.length, colliders: COLLIDERS.length, zones: ZONES.length}),
    // 동숲 v1 검증 훅
    inv: () => INV,
    zone: () => currentZone && currentZone.kind,
    warp: (x, z) => placeAt(x, z, P.yaw),
    interact, shake: shakeTree, openShop, openBag, openTalk, award,
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
    disposeThumbs();
    clearLevel();
    renderer.dispose();
  };
}
