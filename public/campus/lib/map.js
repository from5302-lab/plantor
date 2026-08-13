// ══════════════════════════════════════════════════════════════════
//  캠퍼스 맵 — Next 라우트(/campus)가 마운트한다.
//  상단 네비바를 캠퍼스에서도 유지하려고 정적 HTML에서 앱 라우트로 옮겼다.
//  DOM(캔버스·HUD)은 페이지가 그리고, 이 모듈은 그 위에서 돌기만 한다.
// ══════════════════════════════════════════════════════════════════
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import * as CodeAvatar from '/campus/lib/avatar.js';
import { DEFAULT_LOOK, GUEST_LOOK, BODY_BASE } from '/campus/lib/avatar.js';
import { loadCharacter, loadRoom, saveRoom, loadPlace, savePlace,
         loadInv, saveInv, whenReady } from '/campus/lib/store.js';
import { roomBounds, roomTier } from '/campus/lib/room.js';
import { ITEMS, RECIPES, FRUIT_TREES } from '/campus/lib/items.js';
import { ROOM_TIERS } from '/campus/lib/room.js';
import { icon } from '/campus/lib/icons.js';
import { initDressing } from '/campus/lib/dressing.js';
import { initEditor } from '/campus/lib/editor.js';
import * as Pets from '/campus/lib/pets.js';
import { DECOR_BY_ID, decorBox, buildDecor, disposeThumbs } from '/campus/lib/decor.js';
import { joinCampus } from '/campus/lib/net.js';
import { CURVE, FOCUS, bend } from '/campus/lib/curve.js';
import { createSky } from '/campus/lib/sky.js';
import { loadKit, placeKit, placeKitInstanced, kitSize } from '/campus/lib/kit.js';

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
    //  부팅에 꼭 필요한 것만 — 문 달린 건물 셋(seedBuildings)과 실내 구조·가구.
    //  조경·소품은 전부 팔레트 배치가 됐으므로 drawDecor 가 필요할 때 받아 온다.
    await loadKit(['building-type-p', 'building-type-k', 'building-type-s',
                   // 실내 — 벽·바닥·가구까지 전부 키트로 세운다
                   'wall', 'wallDoorway', 'wallWindow', 'floorFull',
                   'desk', 'chairDesk', 'bookcaseOpen', 'bookcaseClosedWide',
                   'loungeSofa', 'table', 'rugRectangle', 'rugRound',
                   'lampSquareFloor', 'pottedPlant', 'televisionModern',
                   'kitchenBar', 'kitchenFridgeLarge', 'stoolBar', 'bedSingle',
                   // 상점 매장 — Mini Market (mm-*). 캐릭터와 같은 mini 팔레트 계열
                   'mm-register', 'mm-shelf-boxes', 'mm-shelf-bags', 'mm-shelf-end',
                   'mm-fridge', 'mm-freezer', 'mm-display-fruit', 'mm-display-bread',
                   'mm-bottle-return', 'mm-cart', 'mm-basket']);
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
    // 하늘이 보이려면 **부감각 < 반시야각** 이어야 한다.
    //   부감각 = atan((camH − 시선높이 1.3) / camR), 반시야각 = FOV 30°의 절반 = 15°
    //   camH 8.9 → 19° : 지평선이 화면 밖. "하늘"처럼 보이던 건 안개에 잠긴 먼 땅이었다.
    //   camH 6.0 → 12° : 화면 위 ~10% 가 진짜 하늘이 된다.
    outdoor: {id:'outdoor', name:'캠퍼스',     outdoor:true, spawn:{x:0,   z:0,    yaw:Math.PI}, camR:22.0, camH:6.0, fog:[64, 130]},
    main:    {id:'main',    name:'학습센터', spawn:{x:0,    z:-4.2, yaw:Math.PI}, camR:16.0, camH:11.0, fog:[34, 70]},
    // 우리집은 뒷모습으로 통일한다.
    study:   {id:'study',   name:'우리집',   spawn:{x:-7.5, z:-4.6, yaw:Math.PI}, camR:16.0, camH:11.0, fog:[34, 70]},
    // 상점 문은 **동쪽**(화면 오른쪽)이다 — 밖에서 걸어 들어온 방향이 이어져야
    // 한다(사용자 결정). 스폰은 문 바로 안, 서향(-π/2)으로 매장을 향해 선다.
    union:   {id:'union',   name:'상점',     spawn:{x:11.6, z:1,    yaw:-Math.PI/2}, camR:16.0, camH:11.0, fog:[34, 70]},
  };

  const ROOMS = [
    {id:'class',  level:'main',  name:'학습실',   sub:'클래스카드 · 오토보카 · 매일국어', x:-7.5, z:-13.5, w:13, d:8, door:'s', hue:0x1f7a33},
    {id:'office', level:'main',  name:'상담실',   sub:'충쌤에게 물어보기',                x: 7.5, z:-13.5, w:13, d:8, door:'s', hue:0x1f7a33},
    {id:'study',  level:'study', name:'내 방',    sub:'포인트로 넓히고 꾸미기',           x:-7.5, z:  1,   w:13, d:8, door:'n', hue:0x1f7a33,
     personal:true},
    {id:'lounge', level:'union', name:'매장',     sub:'팔고 사기',                        x: 7.5, z:  1,   w:13, d:8, door:'e', hue:0x1f7a33},
  ];

  // 실내 현관/복도. 여기서 건물 밖으로 나간다.
  //  main  은 룸 둘 사이의 복도가 그대로 현관을 겸한다(문 = 남쪽 z=-3).
  //  study 는 룸이 하나뿐이라 문 앞에 현관 한 칸만 둔다(문 = 북쪽 z=-6).
  //  union 은 현관이 없다 — 매장 문(동쪽)이 곧 바깥 문이다. 마트 안에
  //  칸막이 벽이 서 있으면 매장이 아니라 사무실로 보인다(사용자 결정).
  const HALLS = {
    main:  {minX:-14, maxX: 14, minZ:-9, maxZ:-3, exitZ:-3, exitX:0,    exitSide:'s'},
    study: {minX:-14, maxX: -1, minZ:-6, maxZ:-3, exitZ:-6, exitX:-7.5, exitSide:'n'},
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
    //  우리집이 오른쪽, 상점이 왼쪽. 처음엔 반대였다.
    {t:'bStudy', x: 7.6,  z:-2,   r:0, s:1},
    {t:'bUnion', x:-7.6,  z:-2,   r:0, s:1},
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
  // 매장: Kenney Mini Market 레퍼런스. 문은 **동쪽**(14, 1) — 들어서면 서쪽으로
  //  매장이 펼쳐지고, 계산대·매점쌤이 입구 앞(북동)에 바로 보여야 한다.
  //  계산대 2대 — 북동. 점원이 북쪽(벽 쪽)에 서므로 키패드(+z 모델)를 π로 돌린다.
  prop('union', 'mm-register-a', 10.3, -1.2, 1.3, 1.3, 0.9, 0x8b93a8);
  prop('union', 'mm-register-b', 11.8, -1.2, 1.3, 1.3, 0.9, 0x8b93a8);
  //  서쪽 벽 냉장 쇼케이스 3대 — 1.5m 폭이 정확히 맞닿아 한 뱅크가 된다. 동향
  prop('union', 'mm-fridge-a', 1.6, -1.8, 0.8, 1.5, 1.35, 0x8b93a8);
  prop('union', 'mm-fridge-b', 1.6, -0.3, 0.8, 1.5, 1.35, 0x8b93a8);
  prop('union', 'mm-fridge-c', 1.6,  1.2, 0.8, 1.5, 1.35, 0x8b93a8);
  //  중앙 곤돌라 2줄 — 3칸이 맞닿아 한 줄. 문에서 들어와 줄 사이(z -0.3~1.3)를 걷는다
  prop('union', 'mm-shelf-a0', 4.2, -0.8, 1.1, 0.95, 1.15, 0x9aa2b5);
  prop('union', 'mm-shelf-a1', 5.3, -0.8, 1.1, 0.95, 1.15, 0x9aa2b5);
  prop('union', 'mm-shelf-a2', 6.4, -0.8, 1.1, 0.95, 1.15, 0x9aa2b5);
  prop('union', 'mm-shelf-b0', 4.2,  1.8, 1.1, 0.95, 1.15, 0x9aa2b5);
  prop('union', 'mm-shelf-b1', 5.3,  1.8, 1.1, 0.95, 1.15, 0x9aa2b5);
  prop('union', 'mm-shelf-b2', 6.4,  1.8, 1.1, 0.95, 1.15, 0x9aa2b5);
  //  북쪽 벽 엔드 진열대 2대 — 병음료. 남향(π)
  prop('union', 'mm-wallshelf-a', 4.5, -2.45, 1.0, 0.5, 1.3, 0x9aa2b5);
  prop('union', 'mm-wallshelf-b', 5.65, -2.45, 1.0, 0.5, 1.3, 0x9aa2b5);
  //  남서 코너 과일·빵 매대 — 정면이 +z 모델이라 방 쪽(-z)으로 π 돌린다
  prop('union', 'mm-display-fruit', 2.2, 4.0, 1.0, 1.0, 0.8, 0xd98f7a);
  prop('union', 'mm-display-bread', 3.6, 4.0, 1.2, 1.0, 0.8, 0xd9b98c);
  //  남쪽 벽 평대 냉동고 2대
  prop('union', 'mm-freezer-a', 5.6, 4.15, 1.5, 1.1, 0.65, 0x8b93a8);
  prop('union', 'mm-freezer-b', 7.2, 4.15, 1.5, 1.1, 0.65, 0x8b93a8);
  //  공병 수거기는 북서 코너. 카트·바구니는 문 옆 남동 코너 주차 —
  //  출구 존(z ≤ 3.2)을 피해야 카트 앞에서 '나가기'가 뜨지 않는다
  prop('union', 'mm-bottle-return', 1.8, -2.35, 0.6, 0.6, 1.4, 0x2e7d5b);
  prop('union', 'mm-cart-a', 12.9, 3.6, 0.5, 0.7, 0.55, 0x8b93a8);
  prop('union', 'mm-cart-b', 12.35, 4.05, 0.5, 0.7, 0.55, 0x8b93a8);
  prop('union', 'mm-basket', 11.6, 4.3, 0.45, 0.45, 0.35, 0x2e7d5b, false);
  // 야외: 벤치 — 앉는 기능은 아직 없다. 광장이 비어 보이지 않게 두는 랜드마크다
  // 벤치는 캐릭터(키 1.3m)에 맞춰 1.8m 로 줄였다 — 2.6m 는 3인용 정원 벤치 크기였다

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

  //  야외 바닥 — 밤에 눕히려고 재질과 **원래 색**을 들고 있는다.
  //  자체발광이 0.9 라 조명을 낮춰도 잔디가 그대로 형광 초록이었다(실측):
  //  낮 0.9c + 1.0c, 밤 0.9c + 0.6c — 둘 다 흰색으로 잘려 차이가 안 보인다.
  //  발광 자체를 내려야 밤이 밤이 되고, 그래야 가로등 빛이 읽힌다.
  const groundLit = [];

  function clearLevel(){
    world.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    world.clear();
    for (const o of junk) o.dispose?.();
    junk = [];
    COLLIDERS.length = 0; ZONES.length = 0; OCCLUDERS = [];
    wallSpots = []; floorSpots = [];
    groundLit.length = 0;
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
    if (lit) groundLit.push({mat: m.material, base: new THREE.Color(color)});
    m.position.set(cx, y, cz);
    world.add(m);
    return m;
  }
  function buildOutdoor(){
    // 잔디는 실내 바닥(거의 흰색)보다 확실히 초록이어야 한다. 여기서 색이 붙어야
    // '건물 밖으로 나왔다'가 한눈에 읽힌다 — 명도만 다르면 같은 실내로 보인다.
    // 바닥은 흙 한 판이다. 색은 키트 팔레트에서 실측한 값.
    // 바닥은 잔디다. 흙 한 판이던 시절엔 마을이 운동장처럼 보였다 —
    // 초록이 깔려야 '밖에 나왔다'가 읽힌다. 길은 에디터의 길·포장 타일로 깐다.
    // 잔디색 그대로는 나무·덤불과 한 덩어리로 붙어 보여서 한 톤 눌렀다.
    plate(0, -4, 400, 400, KIT_OK ? 0x69d193 : 0xb4e0bb, -0.06, true);

    for (const p of PROPS.filter(p => p.level === 'outdoor')) addProp(p);

    //  기본 조경은 없다. 나무·꽃·울타리·벤치 전부 **꾸미기 배치**로 옮겼다 —
    //  코드가 심으면 운영자가 못 치우고, 팔레트에 같은 게 다 있다.
    //  (과일나무는 흔들기 보상이 붙어 있어 buildFruitTrees 를 남겨 두되 안 부른다)

    //  경계 없음 — 보이지 않는 벽은 "왜 못 가지?"만 남긴다. 막고 싶으면
    //  팔레트의 울타리를 깔면 된다(울타리는 충돌을 만든다).
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

  //  마당 경계 — 편집 범위와 펫 순간이동 기준으로만 남았다. 울타리·기본
  //  조경은 전부 팔레트로 옮기고 지웠다(코드가 심으면 운영자가 못 치운다).
  const YARD = {minX:-15, maxX:15, minZ:-14, maxZ:8};

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
    // 매장 (Mini Market) — 스케일은 캐릭터 1.3m 기준 실측.
    //  진열대 ≈ 가슴(1.15m) · 계산대 ≈ 허리(0.9m) · 쇼케이스 ≈ 키(1.35m).
    //  정면은 전부 +z 모델이다 — 쇼케이스는 서향(-π/2), 매대는 방 쪽(π)으로 돌린다.
    'mm-register-a':    {name:'mm-register',      scale:1.5,  yaw:Math.PI},
    'mm-register-b':    {name:'mm-register',      scale:1.5,  yaw:Math.PI},
    'mm-fridge-a':      {name:'mm-fridge',        scale:1.5,  yaw:Math.PI/2},
    'mm-fridge-b':      {name:'mm-fridge',        scale:1.5,  yaw:Math.PI/2},
    'mm-fridge-c':      {name:'mm-fridge',        scale:1.5,  yaw:Math.PI/2},
    'mm-shelf-a0':      {name:'mm-shelf-boxes',   scale:1.35, yaw:0},
    'mm-shelf-a1':      {name:'mm-shelf-bags',    scale:1.35, yaw:0},
    'mm-shelf-a2':      {name:'mm-shelf-boxes',   scale:1.35, yaw:0},
    'mm-shelf-b0':      {name:'mm-shelf-bags',    scale:1.35, yaw:0},
    'mm-shelf-b1':      {name:'mm-shelf-boxes',   scale:1.35, yaw:0},
    'mm-shelf-b2':      {name:'mm-shelf-bags',    scale:1.35, yaw:0},
    'mm-wallshelf-a':   {name:'mm-shelf-end',     scale:1.25, yaw:Math.PI},
    'mm-wallshelf-b':   {name:'mm-shelf-end',     scale:1.25, yaw:Math.PI},
    'mm-display-fruit': {name:'mm-display-fruit', scale:1.6,  yaw:Math.PI},
    'mm-display-bread': {name:'mm-display-bread', scale:1.6,  yaw:Math.PI},
    'mm-freezer-a':     {name:'mm-freezer',       scale:1.8,  yaw:0},
    'mm-freezer-b':     {name:'mm-freezer',       scale:1.8,  yaw:0},
    'mm-bottle-return': {name:'mm-bottle-return', scale:1.25, yaw:0},
    //  카트·바구니는 아무렇게나 세워 둔 각 — 격자로 맞추면 전시장이 된다
    'mm-cart-a':        {name:'mm-cart',          scale:1.3,  yaw:-0.2},
    'mm-cart-b':        {name:'mm-cart',          scale:1.3,  yaw:0.35},
    'mm-basket':        {name:'mm-basket',        scale:1.3,  yaw:0.6},
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
    }), hall ? {minX:hall.minX, maxX:hall.maxX, minZ:hall.minZ, maxZ:hall.maxZ}
             : {minX:Infinity, maxX:-Infinity, minZ:Infinity, maxZ:-Infinity});
    floorPlate(bb.minX - 1, bb.maxX + 1, bb.minZ - 1, bb.maxZ + 1, 0xe6e9e5, 2, 0);   // 룸 사이 여백
    if (hall)
      floorPlate(hall.minX, hall.maxX, hall.minZ, hall.maxZ, 0xfafbf9, 2, 0.01);      // 복도 = 흰 타일

    for (const r of rooms){
      floorPlate(r.x - r.w/2, r.x + r.w/2, r.z - r.d/2, r.z + r.d/2, 0xf4f3ef, 2, 0.01);
      const x0 = r.x - r.w/2, x1 = r.x + r.w/2, z0 = r.z - r.d/2, z1 = r.z + r.d/2;
      wallWithDoor('x', z0, x0, x1, r.door === 'n' ? r.x : null);
      wallWithDoor('x', z1, x0, x1, r.door === 's' ? r.x : null);
      wallWithDoor('z', x0, z0, z1, r.door === 'w' ? r.z : null);
      wallWithDoor('z', x1, z0, z1, r.door === 'e' ? r.z : null);

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

    if (hall){
      // 복도 외벽 — 나가는 문 한 곳만 뚫는다
      addWall(hall.minX, hall.minZ, hall.minX, hall.maxZ);
      addWall(hall.maxX, hall.minZ, hall.maxX, hall.maxZ);
      wallWithDoor('x', hall.exitZ, hall.minX, hall.maxX, hall.exitX);

      // 출구 존 — 문 안쪽에 붙는다
      const eSide = hall.exitSide === 's' ? -1 : 1;
      ZONES.push({kind:'exit', name:'캠퍼스', sub:'건물 밖으로',
        minX:hall.exitX - DOOR_W/2 - 0.6, maxX:hall.exitX + DOOR_W/2 + 0.6,
        minZ:Math.min(hall.exitZ, hall.exitZ + eSide*2.2), maxZ:Math.max(hall.exitZ, hall.exitZ + eSide*2.2)});
    } else {
      // 현관 없는 건물 — 룸 문(동쪽만 쓴다)이 곧 바깥 문. 출구 존을 문 안쪽에 붙인다.
      // ⚠ unshift — 현관이 없으면 문 앞도 룸 존 안이라, 뒤에 두면 영영 못 나간다.
      const r = rooms[0], x1 = r.x + r.w/2;
      ZONES.unshift({kind:'exit', name:'캠퍼스', sub:'건물 밖으로',
        minX:x1 - 1.8, maxX:x1,
        minZ:r.z - DOOR_W/2 - 0.6, maxZ:r.z + DOOR_W/2 + 0.6});
    }

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
    // 계산대 앞은 매장 존 안쪽이라 뒤에 두면 영영 안 잡힌다.
    // 동쪽 끝(x>12.4)은 출구 존 자리라 물러난다 — 문 앞에서 매점이 뜨면 못 나간다.
    if (level === 'union'){
      ZONES.unshift({kind:'shop', name:'매점', sub:'사과 팔기 · 가구 사기',
        minX:9.4, maxX:12.4, minZ:-0.5, maxZ:0.7});
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

  function drawDecor(items, group, junkArr, colliders, retried){
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

    //  ⚠ 부팅 직후에는 배치물의 모델이 아직 안 받아져 있을 수 있다(전체 로드는
    //    꾸미기를 열 때만 한다). placeKit 이 조용히 null 을 돌려주므로 **저장한
    //    꾸밈이 통째로 안 보였다** — 편집 중에만 보이니 알아채기도 어려웠다.
    //    빠진 것만 받아서 한 번 다시 그린다(retried 로 무한 재귀를 막는다).
    if (!retried){
      const missing = [...new Set(items
        .map(it => DECOR_BY_ID[it.t]?.kit)
        .filter(kit => kit && !kitSize(kit)))];
      if (missing.length)
        loadKit(missing)
          .then(() => drawDecor(items, group, junkArr, colliders, true))
          .catch(e => console.warn('[campus] 배치물 모델 로드 실패', e));
    }
    collectLamps();
  }

  //  ── 가로등 ──
  //  밤에 켤 재질. 두 무리를 그때그때 훑어 모은다 — 방과 공용 공간이 서로 다른
  //  때에 다시 그려져서, 그릴 때마다 제 몫만 갈아 끼우려면 장부가 하나 더 는다.
  const lampGlow = [], lampPool = [], lampHalo = [];
  function collectLamps(){
    lampGlow.length = 0; lampPool.length = 0; lampHalo.length = 0;
    for (const grp of [roomGroup, placeGroup])
      grp.traverse(o => {
        const n = o.isMesh && o.material?.name;
        if (n === 'lamp-glow') lampGlow.push(o.material);
        else if (n === 'lamp-pool') lampPool.push(o.material);
        else if (n === 'lamp-halo') lampHalo.push(o.material);
      });
  }
  //  깔개류 — 충돌을 두면 러그 위를 못 걷는다
  //  밟고 지나가는 것들 — 충돌을 두면 러그 위를 못 걷고 길 위를 못 지나간다.
  //  단(platform)은 일부러 뺐다. 올라서는 발판이라 높이가 있어야 한다.
  const FLAT = new Set(['rug', 'rugr', 'rugSq', 'doormat', 'floor', 'floorH', 'floorC', 'floorCR',
    'path', 'grass', 'fRed', 'fYellow', 'fPurple',
    'gGrass', 'gPath', 'gPathB', 'gPathX', 'gpCorner', 'gpEnd', 'gpSplit', 'gpSide',
    'gpTile', 'gpRocks',
    'grStr', 'grBend', 'grCross', 'grCorner', 'grEnd', 'grRocks',
    'psStone', 'psCircle', 'psCorner', 'psWood', 'psWoodC', 'patch', 'sand',
    'rdStr', 'rdBend', 'rdCross', 'rdCrossing', 'rdEnd', 'rdSide',
    'plaza', 'dwShort', 'walk', 'walkS', 'stones', 'stonesM']);

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
    //  매점쌤은 계산대 뒤(북쪽)에서 남쪽 손님을 본다 — 문에서 들어서면 바로 보인다
    {level:'union', name:'매점쌤', preset:SHOPKEEPER, x:11.05, z:-2.3, yaw:0},
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
    if (switching || uiOpen() || editor.isEditing()) return;
    if (sitting) standUp();
    else sitAt(P.x, P.z, P.yaw, null);
  }

  //  점프·손흔들기는 상태가 아니라 **한 번 재생되는 몸짓**이다.
  //  걷는 중에도 낼 수 있게 이동을 막지 않는다.
  let gestureUntil = 0, gestureAct = null;
  function gesture(act, ms){
    if (switching || uiOpen() || editor.isEditing()) return;
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
    if (editor.isEditing()) editor.moveGhost(e.clientX, e.clientY);
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
      if (editor.isEditing()){
        editor.editTap(e.clientX, e.clientY); // 편집 중의 탭은 배치·선택이다. 걷지 않는다
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
    elRoomBtn.hidden = editor.isEditing() || !(inMyRoom || (IS_ADMIN && level !== 'study'));
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
  //  창 전체는 dressing.js 로 떼어 냈다(535줄). 맵이 주는 건 env 하나 —
  //  내 look/body 게터와, 적용 확정 시 맵 쪽을 갱신하는 commit 뿐이다.
  const dressing = initDressing({
    Avatar, toast, me: ME,
    getLook: () => myLook,
    getBody: () => myBody,
    closePanels: () => { elBag.hidden = elShop.hidden = elTalk.hidden = true; },
    commit: (look, name) => {
      myLook = look;
      if (name) MY_LABEL = name;
      rebuildPlayer();                   // 이름표는 여기서 새로 붙는다
      // 남들에게 알리다 실패해도 내 저장은 이미 끝났다 — 예외를 새게 두지 않는다
      try { net && net.updateMeta(myLook, myBody, MY_LABEL); }
      catch (e){ console.warn('[campus] 캐릭터 방송 실패', e); }
    },
  });

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
  const shutPanels = () => { elShop.hidden = elTalk.hidden = true; dressing.close(); };
  function openBag(){ shutPanels(); elBag.hidden = false; refreshBag(); }
  function openShop(){ elBag.hidden = elTalk.hidden = true; dressing.close();
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
    elBag.hidden = elShop.hidden = true; dressing.close();
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
  //  에디터 전체는 editor.js 로 떼어 냈다(380줄). 맵은 컨텍스트(env)만 준다.
  const IS_ADMIN = !!(ME && ME.role === 'admin');
  let zoomBefore = null;
  const editor = initEditor({
    scene, camera, roomGroup, placeGroup, FLAT,
    me: ME, isAdmin: IS_ADMIN, toast,
    level: () => level,
    switching: () => switching,
    getMyRoom: () => myRoom,
    getPlace: () => place,
    applyRoom, applyPlace,
    countOf, tierNow,
    roomEarned: () => INV.earned,
    closePanels: () => { elBag.hidden = elShop.hidden = elTalk.hidden = true; },
    //  꾸밀 때는 넓게 본다(0.75 → 1.35). 마치면 원래 거리로 되돌린다.
    pushZoom: v => { zoomBefore = zoomTo; zoomTo = Math.min(ZOOM_MAX, v); },
    popZoom: () => { if (zoomBefore != null){ zoomTo = zoomBefore; zoomBefore = null; } },
    onEditingChange: () => syncRoomBtn(),
  });

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
      //  가로등 — 해질녘(night 0.15)부터 켜진다. 대낮에 등이 빛나면 장식이 아니라
      //  고장으로 읽힌다. 웅덩이는 갓보다 흐리게 — 같이 올리면 바닥이 하얗게 뜬다.
      //  땅을 눕힌다. 이게 없으면 등을 켜도 티가 안 난다 — 잔디가 대낮처럼
      //  밝은 위에 빛 웅덩이를 깔면 아무것도 얹히지 않는다.
      for (const g of groundLit)
        g.mat.emissive.copy(g.base).multiplyScalar(0.9 - s.night * 0.66);
      const lit = Math.max(0, s.night - 0.15) / 0.85;
      for (const m of lampGlow) m.emissiveIntensity = lit * 1.7;
      for (const m of lampPool) m.opacity = lit * 0.42;
      for (const m of lampHalo) m.opacity = lit * 0.75;
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
    setZone(editor.isEditing() ? null : inZone);

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
    P, scene, get ZONES(){ return ZONES.concat(PLACE_ZONES); },
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
    startEdit: editor.startEdit, endEdit: editor.endEdit, editTap: editor.editTap,
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
