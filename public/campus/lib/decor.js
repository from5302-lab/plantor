// ══════════════════════════════════════════════════════════════════
//  꾸미기 — 배치 가능한 오브젝트 목록 · 미리보기 · 저장
//
//  같은 기능을 두 곳에서 쓴다:
//    · 학생 — 자기 방(users/{uid}.campus.room)만
//    · 운영자 — 학생 개인방을 뺀 모든 공간(campusPlaces/{levelId})
//  다루는 데이터 모양이 같아야 코드가 하나로 유지된다:
//    {t: 오브젝트 id, x, z, r: 회전(라디안), s: 크기 배수}
//
//  ⚠ 예전 방 데이터에는 s 가 없다(회전도 90° 단위였다). 없으면 1 로 읽는다.
// ══════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { loadKit, placeKit, kitSize } from '/campus/lib/kit.js';
import { bend } from '/campus/lib/curve.js';

/**
 * 배치 가능한 오브젝트.
 *   kit  = GLB 이름(public/campus/models/kenney/kit/)
 *   s    = 기본 크기 배수. 캐릭터 키 1.3m 기준으로 어울리게 잡은 값
 *   tall = 사람 키를 넘는 것. 실내에 놓으면 시야를 가려 경고를 띄운다
 *   group= 팔레트 묶음
 *   seat = 앉는 면 높이. **미터가 아니라 이 물건 높이의 비율**이다 —
 *          꾸미기는 크기 슬라이더로 물건을 키울 수 있어서, 미터로 박아 두면
 *          두 배로 키운 소파에 앉을 때 허공에 뜬다. 비율이면 따라 올라간다.
 *   seatFace = 앉아서 보는 쪽. 물건이 놓인 각에 **더하는 값**이다.
 *          벤치·통나무는 긴 축이 세로(Z)라, 그대로 앉으면 통나무를 따라 본다 —
 *          긴 축과 직각으로 앉아야 다리가 앞으로 나온다.
 *   glow = 밤에 빛나는 것(모닥불). {color, pool, halo} — pool·halo 는 물건
 *          가로폭에 대한 배수다. 가로등은 모델에 lamp-glow 면이 있어 따로 안 적는다.
 */
export const DECOR = [
  // 가구
  {id:'desk',     name:'책상',      kit:'desk',              s:1.7, group:'가구'},
  {id:'chair',    name:'의자',      kit:'chairDesk',         s:1.4, group:'가구', seat:0.55},
  {id:'table',    name:'테이블',    kit:'table',             s:1.8, group:'가구'},
  {id:'sofa',     name:'소파',      kit:'loungeSofa',        s:1.8, group:'가구', seat:0.52},
  {id:'bed',      name:'침대',      kit:'bedSingle',         s:1.8, group:'가구', seat:0.5},
  {id:'stool',    name:'스툴',      kit:'stoolBar',          s:1.6, group:'가구', seat:0.95},
  {id:'shelf',    name:'책장',      kit:'bookcaseOpen',      s:2.0, group:'가구', tall:true},
  {id:'shelfw',   name:'낮은 책장', kit:'bookcaseClosedWide', s:2.0, group:'가구'},
  {id:'counter',  name:'카운터',    kit:'kitchenBar',        s:2.2, group:'가구'},
  {id:'fridge',   name:'냉장고',    kit:'kitchenFridgeLarge', s:2.0, group:'가구', tall:true},

  // 소품
  {id:'rug',      name:'러그',      kit:'rugRectangle',      s:1.6, group:'소품'},
  {id:'rugr',     name:'원형 러그', kit:'rugRound',          s:1.8, group:'소품'},
  {id:'lamp',     name:'스탠드',    kit:'lampSquareFloor',   s:1.6, group:'소품'},
  {id:'plant',    name:'화분',      kit:'pottedPlant',       s:1.7, group:'소품'},
  {id:'tv',       name:'텔레비전',  kit:'televisionModern',  s:1.6, group:'소품'},
  {id:'books',    name:'책 더미',   kit:'books',             s:2.0, group:'소품'},
  {id:'apple',    name:'사과',      kit:'apple',             s:1.6, group:'소품'},

  // 실내 구조
  {id:'wall',     name:'벽',        kit:'wall',              s:1.2, group:'구조', tall:true, snap:[1.2, 1.2]},
  {id:'wallw',    name:'창문 벽',   kit:'wallWindow',        s:1.2, group:'구조', tall:true, snap:[1.2, 1.2]},
  {id:'walld',    name:'문 벽',     kit:'wallDoorway',       s:1.2, group:'구조', tall:true, snap:[1.2, 1.2]},
  {id:'floor',    name:'바닥 타일', kit:'floorFull',         s:2.0, group:'구조', snap:[2.0, 2.0]},
  //  실측 1 × 2. 앞서 2 × 1 로 뒤집어 적어 옆 칸을 먹고 있었다.
  {id:'floorH',   name:'반 타일',   kit:'floorHalf',         s:2.0, group:'구조', snap:[1.0, 2.0]},
  {id:'floorC',   name:'모서리 타일', kit:'floorCorner',     s:2.0, group:'구조', snap:[2.0, 2.0]},
  {id:'floorCR',  name:'둥근 모서리', kit:'floorCornerRound', s:2.0, group:'구조', snap:[2.0, 2.0]},

  // 야외
  {id:'tree',     name:'나무',      kit:'tree_default',      s:3.6, group:'야외', tall:true},
  {id:'treeOak',  name:'참나무',    kit:'tree_oak',          s:3.6, group:'야외', tall:true},
  {id:'pine',     name:'전나무',    kit:'tree_pineRoundC',   s:3.6, group:'야외', tall:true},
  {id:'treeS',    name:'작은 나무', kit:'tree_small',        s:3.0, group:'야외'},
  {id:'bush',     name:'덤불',      kit:'plant_bushSmall',   s:4.2, group:'야외'},
  {id:'grass',    name:'풀',        kit:'grass_large',       s:4.2, group:'야외'},
  {id:'fRed',     name:'빨간 꽃',   kit:'flower_redA',       s:3.2, group:'야외'},
  {id:'fYellow',  name:'노란 꽃',   kit:'flower_yellowA',    s:3.2, group:'야외'},
  {id:'fPurple',  name:'보라 꽃',   kit:'flower_purpleA',    s:3.2, group:'야외'},
  {id:'bench',    name:'벤치',      kit:'stall-bench',       s:1.9, group:'야외', seat:0.95, seatFace:-Math.PI/2},
  {id:'fence',    name:'울타리',    kit:'fence',             s:8.0, group:'야외', snap:[3.8, 3.8]},
  {id:'planter',  name:'화단',      kit:'planter',           s:4.0, group:'야외'},
  {id:'fountain', name:'분수',      kit:'fountain-round',    s:2.1, group:'야외'},

  //  광장 한 벌 — 분수를 **조립**한다. 판타지타운 분수는 모듈이라 턱·모서리·
  //  분출구를 이어 붙이면 크기를 마음대로 키울 수 있다. 원본이 1×1(큰 분수만
  //  2×2)이고 기존 분수가 s=2.1 이라, 같은 배수를 쓰면 한 칸이 2.1m 로 맞는다.
  //  ⚠ 물 타일은 높이가 0 이다 — FLAT 에 넣어야 보이지 않는 벽이 안 생긴다.
  {id:'fntWater', name:'분수 물',    kit:'ft-fountain-center', s:2.1, group:'야외', snap:[2.1, 2.1]},
  {id:'fntEdge',  name:'분수 턱',    kit:'ft-fountain-curved', s:2.1, group:'야외', snap:[2.1, 2.1]},
  {id:'fntCorner',name:'분수 모서리', kit:'ft-fountain-corner', s:2.1, group:'야외', snap:[2.1, 2.1]},
  {id:'fntSpout', name:'분수 분출구', kit:'ft-fountain-inner',  s:2.1, group:'야외', snap:[2.1, 2.1]},
  {id:'fntBig',   name:'큰 분수',    kit:'ft-fountain-square', s:2.1, group:'야외', snap:[4.2, 4.2]},
  //  파라솔 — 노천 카페 톤. 키 2.2m(캐릭터 1.3m 머리 위), 차양 폭 1.7m.
  //  같은 팩의 parasol-a 는 실루엣이 거의 같아 안 넣었다.
  {id:'parasol',  name:'파라솔',     kit:'parasol-b',          s:4.9, group:'야외'},
  //  돌 테두리 — 잔디와 포장이 만나는 자리에 두르는 낮은 난간(Building Kit).
  //  원본이 길이 2 · 높이 0.3 이라 배수 하나로 둘이 같이 움직인다. s=1.5 면
  //  길이 3m(타일 한 변) · 높이 0.45m 인데, **통나무(0.28m)보다 높아 뒤를 가린다** —
  //  크기 0.5 로 줄여 반 칸(1.5m)씩 이어 붙이는 쪽이 낫다.
  {id:'bdEdge',   name:'돌 테두리',   kit:'bd-edge',   s:1.5, group:'야외', snap:[1.5, 1.5]},
  {id:'bdCorner', name:'테두리 모서리', kit:'bd-corner', s:1.5, group:'야외', snap:[1.5, 1.5]},
  {id:'bdRound',  name:'둥근 테두리',  kit:'bd-round',  s:1.5, group:'야외', snap:[1.5, 1.5]},
  {id:'path',     name:'포장 타일', kit:'driveway-long',     s:8.0, group:'바닥', snap:[3.0, 3.0]},

  //  야외 2차분 — Nature Kit(민트 톤은 kit.js 가 잔디색으로 맞춘다)과 mini-forest.
  {id:'treeFall', name:'단풍나무',   kit:'tree_default_fall', s:3.6, group:'야외', tall:true},
  {id:'pineTall', name:'큰 전나무',  kit:'tree_pineTallA',    s:3.6, group:'야외', tall:true},
  {id:'palm',     name:'야자수',     kit:'tree_palm',         s:3.6, group:'야외', tall:true},
  {id:'patch',    name:'풀밭',       kit:'patch-grass',       s:4.0, group:'야외'},
  {id:'sand',     name:'모래밭',     kit:'patch-dirt',        s:4.0, group:'야외'},

  //  가로등 — 밤이 되면 등갓이 켜지고 바닥에 빛 웅덩이가 깔린다(addLampPool).
  //  s 는 등 높이가 **3.2m**(캐릭터 1.3m 의 2.5배)이 되게 잡았다. 원본 높이가
  //  굽은 등 0.675 · 나머지 0.600 이라 배수가 갈린다.
  {id:'lampC',    name:'가로등',     kit:'lamp-curved',       s:4.7, group:'야외', tall:true},
  {id:'lampS',    name:'사각 가로등', kit:'lamp-square',      s:5.3, group:'야외', tall:true},
  {id:'lampD',    name:'쌍둥이 가로등', kit:'lamp-double',    s:5.3, group:'야외', tall:true},

  {id:'rockL',    name:'큰 바위',    kit:'rock_largeA',       s:3.6, group:'자연'},
  {id:'rock',     name:'바위',       kit:'rock_smallA',       s:3.6, group:'자연'},
  {id:'stump',    name:'그루터기',   kit:'stump_round',       s:3.6, group:'자연', seat:0.9, seatFace:-Math.PI/2},
  {id:'log',      name:'통나무',     kit:'log',               s:3.6, group:'자연', seat:0.85, seatFace:-Math.PI/2},
  {id:'mushR',    name:'빨간 버섯',  kit:'mushroom_red',      s:3.2, group:'자연'},
  {id:'mushT',    name:'버섯 무리',  kit:'mushroom_tanGroup', s:3.2, group:'자연'},
  //  모닥불 넷 — 다 같은 불빛(glow)을 쓰고 생김새만 다르다. s 는 넷의 가로폭이
  //  1.05m 로 같아지게 잡았다(원본 크기가 제각각이다). 돌 링만 있는 것은 장작을
  //  겹쳐 놓으라고 둔 것이라 불은 안 붙인다.
  {id:'campfire', name:'모닥불',     kit:'campfire_logs',     s:3.6, group:'자연',
   glow:{color:0xff8a3a, pool:1.6, halo:0.42}},
  {id:'firePit',  name:'화덕',       kit:'campfire-pit',      s:3.78, group:'자연',
   glow:{color:0xff8a3a, pool:1.6, halo:0.42}},
  {id:'fireStone', name:'돌 화덕',   kit:'campfire_stones',   s:1.94, group:'자연'},
  {id:'fireBrick', name:'벽돌 화덕', kit:'campfire_bricks',   s:2.24, group:'자연'},
  {id:'tent',     name:'텐트',       kit:'tent_smallOpen',    s:3.6, group:'자연'},
  {id:'sign',     name:'표지판',     kit:'sign',              s:3.6, group:'자연'},
  {id:'bridge',   name:'나무 다리',  kit:'bridge_wood',       s:3.6, group:'자연'},
  {id:'pot',      name:'항아리',     kit:'pot_large',         s:3.6, group:'자연'},
  {id:'flag',     name:'깃발',       kit:'flag',              s:4.0, group:'자연', tall:true},
  {id:'fenceW',   name:'나무 울타리', kit:'fence_planks',     s:3.6, group:'자연', snap:[3.6, 3.6]},
  {id:'gate',     name:'울타리 문',  kit:'fence_gate',        s:3.6, group:'자연', snap:[3.6, 3.6]},

  //  바닥 — 잔디·길. 타일이라 제 크기 격자에 붙는다.
  {id:'gGrass',   name:'잔디 타일',  kit:'ground_grass',        s:3.0, group:'바닥', snap:[3.0, 3.0]},
  {id:'gPath',    name:'길 타일',    kit:'ground_pathStraight', s:3.0, group:'바닥', snap:[3.0, 3.0]},
  {id:'gPathB',   name:'길 모퉁이',  kit:'ground_pathBend',     s:3.0, group:'바닥', snap:[3.0, 3.0]},
  {id:'gPathX',   name:'길 교차',    kit:'ground_pathCross',    s:3.0, group:'바닥', snap:[3.0, 3.0]},
  //  Nature Kit 길·강은 전부 원본 1×1 이라 s=3.0 이면 칸도 3.0 이다.
  //  한 벌을 다 넣어야 길이 끊기지 않는다 — 직선만 있으면 모퉁이에서 멈춘다.
  {id:'gpCorner', name:'길 꺾임',    kit:'gp-corner',   s:3.0, group:'바닥', snap:[3.0, 3.0]},
  {id:'gpEnd',    name:'길 끝',      kit:'gp-end',      s:3.0, group:'바닥', snap:[3.0, 3.0]},
  {id:'gpSplit',  name:'길 삼거리',  kit:'gp-split',    s:3.0, group:'바닥', snap:[3.0, 3.0]},
  {id:'gpSide',   name:'길 가장자리', kit:'gp-side',    s:3.0, group:'바닥', snap:[3.0, 3.0]},
  {id:'gpTile',   name:'길 한 칸',   kit:'gp-tile',     s:3.0, group:'바닥', snap:[3.0, 3.0]},
  {id:'gpRocks',  name:'돌 깔린 길', kit:'gp-rocks',    s:3.0, group:'바닥', snap:[3.0, 3.0]},

  //  강 — 물이다. 밟고 지나가되 막지는 않는다(FLAT 에 넣는다).
  {id:'grStr',    name:'강',         kit:'gr-straight', s:3.0, group:'바닥', snap:[3.0, 3.0]},
  {id:'grBend',   name:'강 굽이',    kit:'gr-bend',     s:3.0, group:'바닥', snap:[3.0, 3.0]},
  {id:'grCross',  name:'강 교차',    kit:'gr-cross',    s:3.0, group:'바닥', snap:[3.0, 3.0]},
  {id:'grCorner', name:'강 꺾임',    kit:'gr-corner',   s:3.0, group:'바닥', snap:[3.0, 3.0]},
  {id:'grEnd',    name:'강 끝',      kit:'gr-end',      s:3.0, group:'바닥', snap:[3.0, 3.0]},
  {id:'grRocks',  name:'돌 많은 강', kit:'gr-rocks',    s:3.0, group:'바닥', snap:[3.0, 3.0]},

  //  징검다리·나무 데크 — 낱개라 격자에 안 묶는다(자유롭게 흩뿌리는 물건)
  {id:'psStone',  name:'돌판',       kit:'ps-stone',      s:3.0, group:'바닥', snap:[3.0, 1.5]},
  {id:'psCircle', name:'둥근 돌판',  kit:'ps-circle',     s:3.0, group:'바닥', snap:[3.0, 3.0]},
  {id:'psCorner', name:'돌판 꺾임',  kit:'ps-corner',     s:3.0, group:'바닥', snap:[3.0, 3.0]},
  {id:'psWood',   name:'나무 데크',  kit:'ps-wood',       s:3.0, group:'바닥', snap:[3.0, 1.5]},
  {id:'psWoodC',  name:'데크 꺾임',  kit:'ps-woodcorner', s:3.0, group:'바닥', snap:[3.0, 3.0]},

  //  단 — 올라설 수 있는 낮은 판. 점프해서 오르는 발판이 된다(FLAT 아님).
  {id:'platG',    name:'잔디 단',    kit:'plat-grass', s:3.0, group:'바닥', snap:[3.0, 3.0]},
  {id:'platS',    name:'돌 단',      kit:'plat-stone', s:3.0, group:'바닥', snap:[3.0, 3.0]},
  {id:'platB',    name:'모래 단',    kit:'plat-beach', s:3.0, group:'바닥', snap:[3.0, 3.0]},

  //  아스팔트 도로 — City Kit. 원본이 커서 배수가 다르다(아래에서 실측해 맞춘다)
  {id:'rdStr',    name:'도로',       kit:'rd-straight', s:3.0, snap:[3.0, 3.0], group:'바닥', snap:[3.0, 3.0]},
  {id:'rdBend',   name:'도로 굽이',  kit:'rd-bend',     s:3.0, snap:[3.0, 3.0], group:'바닥', snap:[3.0, 3.0]},
  {id:'rdCross',  name:'도로 사거리', kit:'rd-cross',   s:3.0, snap:[3.0, 3.0], group:'바닥', snap:[3.0, 3.0]},
  {id:'rdCrossing', name:'횡단보도', kit:'rd-crossing', s:3.0, snap:[3.0, 3.0], group:'바닥', snap:[3.0, 3.0]},
  {id:'rdEnd',    name:'도로 끝',    kit:'rd-end',      s:3.0, snap:[3.0, 3.0], group:'바닥', snap:[3.0, 3.0]},
  //  인도는 도로보다 깊다(3 × 3.93). 깊이만 4로 잡아야 옆 칸을 안 먹는다.
  {id:'rdSide',   name:'인도',       kit:'rd-side',     s:3.0, snap:[3.0, 4.0], group:'바닥', snap:[3.0, 3.0]},
  //  포장 광장 타일(city-kit-roads tile-low)과 마당길(suburban path) —
  //  레퍼런스(도시 블록)의 회색 바닥이 이것들이다.
  //  bright = 재질 색 배수. 텍스처에 곱해지므로 1 보다 크면 밝아진다. 조명을
  //  안 건드리므로 밤에는 조명 따라 같이 어두워진다(자체발광으로 올리면 밤에도 뜬다).
  {id:'plaza',    name:'광장 타일',  kit:'tile-low',        s:3.0, group:'바닥', snap:[3.0, 3.0], bright:1.45},
  //  플랜토 로고 — 키트 모델이 아니라 **바닥에 까는 판**이다(decal).
  //  s 는 배수가 아니라 **한 변의 미터**다. 6m = 타일 두 칸.
  {id:'logo',     name:'플랜토 로고', decal:'/campus/logo-decal.png', s:6.0, group:'바닥', snap:[3.0, 3.0]},
  {id:'dwShort',  name:'짧은 진입로', kit:'driveway-short', s:8.0, group:'바닥', snap:[3.0, 1.5]},
  {id:'walk',     name:'마당길',     kit:'sb-path-long',    s:8.0, group:'바닥', snap:[1.5, 3.0]},
  {id:'walkS',    name:'짧은 마당길', kit:'sb-path-short',  s:8.0, group:'바닥', snap:[1.5, 1.5]},
  {id:'stones',   name:'디딤돌 길',  kit:'sb-stones-long',  s:8.0, group:'바닥', snap:[1.5, 3.0]},
  {id:'stonesM',  name:'흩은 디딤돌', kit:'sb-stones-messy', s:8.0, group:'바닥', snap:[1.5, 3.0]},

  //  건물 — 다른 것과 달리 **문이 달려 있다.**
  //  door 가 있으면 배치할 때 '입장' 존이 같이 생긴다(map.js drawDecor).
  //  scale 은 예전 하드코딩 시절의 fitH(3.8 / 3.1)를 그대로 옮긴 값이다.
  //  ⚠ 이 셋은 캠퍼스의 유일한 입구다. 다 지우면 아무 데도 못 들어간다 —
  //    map.js 가 없으면 기본 자리에 도로 심는다.
  {id:'bMain',  name:'학습센터', kit:'building-type-p', s:4.14, group:'건물',
   door:'main',  tall:true},
  {id:'bStudy', name:'우리집',   kit:'building-type-k', s:2.70, group:'건물',
   door:'study', tall:true},
  {id:'bUnion', name:'상점',     kit:'building-type-s', s:2.72, group:'건물',
   door:'union', tall:true},
  //  장식 주택 18종 — 문이 없다(들어가지지 않는다). 동네 거리를 채우는 용도.
  //  City Kit Suburban 의 21종 중 문 달린 셋(k·p·s)을 뺀 전부다.
  {id:'hA', name:'주택 A', kit:'building-type-a', s:2.7, group:'건물', tall:true},
  {id:'hB', name:'주택 B', kit:'building-type-b', s:2.7, group:'건물', tall:true},
  {id:'hC', name:'주택 C', kit:'building-type-c', s:2.7, group:'건물', tall:true},
  {id:'hD', name:'주택 D', kit:'building-type-d', s:2.7, group:'건물', tall:true},
  {id:'hE', name:'주택 E', kit:'building-type-e', s:2.7, group:'건물', tall:true},
  {id:'hF', name:'주택 F', kit:'building-type-f', s:2.7, group:'건물', tall:true},
  {id:'hG', name:'주택 G', kit:'building-type-g', s:2.7, group:'건물', tall:true},
  {id:'hH', name:'주택 H', kit:'building-type-h', s:2.7, group:'건물', tall:true},
  {id:'hI', name:'주택 I', kit:'building-type-i', s:2.7, group:'건물', tall:true},
  {id:'hJ', name:'주택 J', kit:'building-type-j', s:2.7, group:'건물', tall:true},
  {id:'hL', name:'주택 L', kit:'building-type-l', s:2.7, group:'건물', tall:true},
  {id:'hM', name:'주택 M', kit:'building-type-m', s:2.7, group:'건물', tall:true},
  {id:'hN', name:'주택 N', kit:'building-type-n', s:2.7, group:'건물', tall:true},
  {id:'hO', name:'주택 O', kit:'building-type-o', s:2.7, group:'건물', tall:true},
  {id:'hQ', name:'주택 Q', kit:'building-type-q', s:2.7, group:'건물', tall:true},
  {id:'hR', name:'주택 R', kit:'building-type-r', s:2.7, group:'건물', tall:true},
  {id:'hT', name:'주택 T', kit:'building-type-t', s:2.7, group:'건물', tall:true},
  {id:'hU', name:'주택 U', kit:'building-type-u', s:2.7, group:'건물', tall:true},

  //  마을 — Fantasy Town Kit. 시장·풍차·가로등 같은 '동네' 물건.
  {id:'lanternF', name:'가로등',     kit:'ft-lantern',      s:2.4, group:'마을', tall:true},
  {id:'cart',     name:'수레',       kit:'ft-cart',         s:2.0, group:'마을'},
  {id:'cartHigh', name:'포장 수레',  kit:'ft-cart-high',    s:2.0, group:'마을'},
  {id:'stallA',   name:'노점',       kit:'ft-stall',        s:2.0, group:'마을', tall:true},
  {id:'stallG',   name:'초록 노점',  kit:'ft-stall-green',  s:2.0, group:'마을', tall:true},
  {id:'stallR',   name:'빨간 노점',  kit:'ft-stall-red',    s:2.0, group:'마을', tall:true},
  {id:'windmill', name:'풍차',       kit:'ft-windmill',     s:2.6, group:'마을', tall:true},
  {id:'watermill',name:'물레방아',   kit:'ft-watermill',    s:2.4, group:'마을', tall:true},
  {id:'bannerG',  name:'초록 깃발',  kit:'ft-banner-green', s:2.4, group:'마을', tall:true},
  {id:'bannerR',  name:'빨간 깃발',  kit:'ft-banner-red',   s:2.4, group:'마을', tall:true},
  {id:'hedgeF',   name:'생울타리',   kit:'ft-hedge',        s:2.0, group:'마을', snap:[2.0, 2.0]},
  {id:'hedgeGate',name:'생울타리 문', kit:'ft-hedge-gate',  s:2.0, group:'마을', snap:[2.0, 2.0]},
  {id:'wheelF',   name:'나무 바퀴',  kit:'ft-wheel',        s:1.8, group:'마을'},
  {id:'pillarF',  name:'돌기둥',     kit:'ft-pillar',       s:2.0, group:'마을', tall:true},

  //  보물 — Platformer Kit. 게임에서 튀어나온 반짝이는 것들.
  {id:'coin',     name:'금화',       kit:'pf-coin',      s:2.0, group:'보물'},
  {id:'chest',    name:'보물상자',   kit:'pf-chest',     s:2.0, group:'보물'},
  {id:'keyG',     name:'열쇠',       kit:'pf-key',       s:2.0, group:'보물'},
  {id:'starG',    name:'별',         kit:'pf-star',      s:2.0, group:'보물'},
  {id:'heartG',   name:'하트',       kit:'pf-heart',     s:2.0, group:'보물'},
  {id:'jewel',    name:'보석',       kit:'pf-jewel',     s:2.0, group:'보물'},
  {id:'flagChk',  name:'깃대',       kit:'pf-flag',      s:2.2, group:'보물', tall:true},
  {id:'barrel',   name:'나무통',     kit:'pf-barrel',    s:1.8, group:'보물'},
  {id:'crateP',   name:'상자',       kit:'pf-crate',     s:1.8, group:'보물'},
  {id:'ladderP',  name:'사다리',     kit:'pf-ladder',    s:2.0, group:'보물', tall:true},
  {id:'spring',   name:'스프링',     kit:'pf-spring',    s:1.8, group:'보물'},
  {id:'mushP',    name:'게임 버섯',  kit:'pf-mushrooms', s:2.2, group:'보물'},
  {id:'flowersT', name:'키 큰 꽃',   kit:'pf-flowers',   s:2.2, group:'보물'},

  //  자연 2차 — 밭·조각상·캠핑.
  {id:'pumpkin',  name:'호박',       kit:'crop_pumpkin',      s:3.2, group:'자연'},
  {id:'carrot',   name:'당근',       kit:'crop_carrot',       s:3.2, group:'자연'},
  {id:'melon',    name:'수박',       kit:'crop_melon',        s:3.2, group:'자연'},
  {id:'cactus',   name:'선인장',     kit:'cactus_tall',       s:3.2, group:'자연'},
  {id:'lily',     name:'수련',       kit:'lily_large',        s:3.2, group:'자연'},
  {id:'statueH',  name:'석상 머리',  kit:'statue_head',       s:3.2, group:'자연'},
  {id:'obelisk',  name:'오벨리스크', kit:'statue_obelisk',    s:3.2, group:'자연', tall:true},
  //  기념물 부재 — 광장 한가운데 세울 것들. 같은 Nature Kit 이라 s 도 같다.
  {id:'stColumn', name:'석주',       kit:'statue_column',     s:3.2, group:'자연', tall:true},
  {id:'stBroken', name:'부서진 석주', kit:'statue_columnDamaged', s:3.2, group:'자연'},
  {id:'stRing',   name:'고리 석상',  kit:'statue_ring',       s:3.2, group:'자연'},
  {id:'stBlock',  name:'석재',       kit:'statue_block',      s:3.2, group:'자연'},
  {id:'logStack', name:'장작 더미',  kit:'log_stack',         s:3.6, group:'자연'},
  {id:'canoe',    name:'카누',       kit:'canoe',             s:3.2, group:'자연'},
  {id:'tentBig',  name:'큰 텐트',    kit:'tent_detailedOpen', s:3.6, group:'자연', tall:true},

  //  가구 2차 — Furniture Kit. 방을 집답게.
  {id:'bear',     name:'곰인형',     kit:'fu-bear',        s:1.5, group:'가구'},
  {id:'bedBunk',  name:'2층 침대',   kit:'fu-bedBunk',     s:1.8, group:'가구', tall:true},
  {id:'bedDouble',name:'큰 침대',    kit:'fu-bedDouble',   s:1.8, group:'가구'},
  {id:'chairRelax', name:'안락의자', kit:'fu-chairRelax',  s:1.8, group:'가구', seat:0.42},
  {id:'sofaLong', name:'긴 소파',    kit:'fu-sofaLong',    s:1.8, group:'가구', seat:0.52},
  {id:'tableCoffee', name:'탁자',    kit:'fu-tableCoffee', s:1.8, group:'가구'},
  {id:'tableRound',  name:'원탁',    kit:'fu-tableRound',  s:1.8, group:'가구'},
  {id:'sideTable',   name:'협탁',    kit:'fu-sideTable',   s:1.8, group:'가구'},
  {id:'coatRack', name:'옷걸이',     kit:'fu-coatRack',    s:1.8, group:'가구', tall:true},
  {id:'laptop',   name:'노트북',     kit:'fu-laptop',      s:1.6, group:'소품'},
  {id:'radio',    name:'라디오',     kit:'fu-radio',       s:1.6, group:'소품'},
  {id:'speaker',  name:'스피커',     kit:'fu-speaker',     s:1.6, group:'소품'},
  {id:'tvOld',    name:'옛날 TV',    kit:'fu-tvVintage',   s:1.6, group:'소품'},
  {id:'lampTable',name:'탁상 램프',  kit:'fu-lampTable',   s:1.6, group:'소품'},
  {id:'rugSq',    name:'네모 러그',  kit:'fu-rugSquare',   s:1.8, group:'소품'},
  {id:'doormat',  name:'현관 매트',  kit:'fu-doormat',     s:1.8, group:'소품'},
  {id:'trashcan', name:'쓰레기통',   kit:'fu-trashcan',    s:1.6, group:'소품'},
  {id:'boxOpen',  name:'택배 상자',  kit:'fu-box',         s:1.6, group:'소품'},
  {id:'pillow',   name:'쿠션',       kit:'fu-pillow',      s:1.6, group:'소품'},
];

export const DECOR_BY_ID = Object.fromEntries(DECOR.map(d => [d.id, d]));

//  옛 데이터 호환 — 방 가구는 예전에 FURNITURE id 로 저장됐다.
//  'board'(화이트보드)만 이름이 바뀌었고 나머지는 그대로다.
const ALIAS = {board: 'tv'};

const MAX_ITEMS = 200;

/**
 * 저장된 배치를 정화한다. 남이 손댔거나 버전이 밀렸을 수 있다.
 * @param bounds {minX,maxX,minZ,maxZ} 있으면 그 안으로 자른다(학생 방)
 */
export function sanitizePlace(raw, bounds){
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const it of raw.slice(0, MAX_ITEMS)){
    if (!it) continue;
    const t = ALIAS[it.t] || it.t;
    if (!DECOR_BY_ID[t]) continue;
    const x = +it.x, z = +it.z;
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const r = Number.isFinite(+it.r) ? +it.r : 0;
    const s = Number.isFinite(+it.s) ? Math.min(3, Math.max(0.3, +it.s)) : 1;
    out.push({
      t,
      x: bounds ? Math.min(bounds.maxX, Math.max(bounds.minX, x)) : +x.toFixed(2),
      z: bounds ? Math.min(bounds.maxZ, Math.max(bounds.minZ, z)) : +z.toFixed(2),
      // 회전은 자유각이지만 저장은 소수 셋째 자리까지 — 문서 크기를 아낀다
      r: +(((r % (Math.PI*2)) + Math.PI*2) % (Math.PI*2)).toFixed(3),
      s: +s.toFixed(2),
    });
  }
  return out;
}
export const GROUPS = [...new Set(DECOR.map(d => d.group))];

/** 팔레트가 열리기 전에 한 번. 모델을 다 받아 둬야 미리보기를 그릴 수 있다. */
export function preloadDecor(){
  return loadKit([...new Set(DECOR.map(d => d.kit).filter(Boolean))]);
}

/** 배치된 한 항목의 실제 크기(m). decorBox 가 쓴다. */
function decorSize(it){
  const d = DECOR_BY_ID[it.t];
  if (!d) return null;
  //  바닥 데칼(로고)은 GLB 가 없다 — 선언한 한 변을 그대로 쓴다. 두께는 0.
  if (d.decal){ const s = d.s * (it.s || 1); return {w: d.s ? d.s * (it.s || 1) : 1, h: 0, d: s}; }
  const k = kitSize(d.kit);
  if (!k) return null;
  const s = d.s * (it.s || 1);
  return {w: k.x * s, h: k.y * s, d: k.z * s};
}

/**
 * 이 물건을 놓을 격자 칸.
 *
 * 줄 맞춰 깔아야 하는 것(벽·바닥 타일·울타리·포장)은 **제 크기가 곧 격자**다.
 * 1.2m 짜리 벽을 0.25m 격자에 놓으면 다섯 번에 한 번만 딱 맞는다 — 나머지는
 * 틈이 벌어지거나 겹친다. 숫자는 눈대중이 아니라 에셋에서 실측한 값이다.
 * 그 밖의 것(가구·나무·꽃)은 줄 맞출 이유가 없으니 0.5m 로 성글게 둔다.
 *
 * 90° 돌리면 가로세로가 바뀌므로 축도 같이 바꾼다.
 */
export const FREE_SNAP = 0.5;
//  이보다 작은 것은 칸에 안 묶는다. 꽃·버섯·책은 벤치 옆에 슬쩍 끼워 놓는 재미가
//  있어야 하는데, 제 칸을 주면 1m 밖에 떨어져 선다.
const FREE_MAX = 1.2;

export function decorSnap(type, r = 0){
  const d = DECOR_BY_ID[type];
  let sn = d && d.snap;
  if (!sn && d){
    //  칸을 안 적어 둔 것은 **제 크기에서 만든다.** 예전엔 전부 0.5m 눈금이라
    //  큰 바위가 여섯 칸에 걸쳐 있었다 — 화면에는 칸으로 그려 놓고 실제로는
    //  칸을 안 지키니, 격자가 거짓말을 하고 있었다.
    //  기준 크기(s=1)로 잡는다. 크기를 키우는 동안 격자까지 출렁이면 조준이 안 된다.
    const k = kitSize(d.kit);
    if (k){
      const w = k.x * d.s, dep = k.z * d.s;
      sn = Math.max(w, dep) < FREE_MAX
        ? [FREE_SNAP, FREE_SNAP]
        : [Math.ceil(w / FREE_SNAP) * FREE_SNAP, Math.ceil(dep / FREE_SNAP) * FREE_SNAP];
    }
  }
  if (!sn) return [FREE_SNAP, FREE_SNAP];
  // 0·180° 면 그대로, 90·270° 면 축을 바꾼다(그 사이 각도는 줄을 못 맞추니 그대로)
  const q = Math.round((r || 0) / (Math.PI / 2)) & 3;
  return (q === 1 || q === 3) ? [sn[1], sn[0]] : [sn[0], sn[1]];
}

/** 회전(90° 단위가 아니어도 된다)을 반영한 대략적 AABB. */
export function decorBox(it){
  const sz = decorSize(it);
  if (!sz) return null;
  // 임의 각도라 회전한 사각형의 외접 상자를 쓴다 — 살짝 넉넉하지만 안전하다
  const c = Math.abs(Math.cos(it.r || 0)), s = Math.abs(Math.sin(it.r || 0));
  const w = sz.w * c + sz.d * s, d = sz.w * s + sz.d * c;
  //  top — 이 물건의 윗면 높이. 밟고 올라설 수 있는 면이라 충돌이 이 값을 본다.
  return {minX: it.x - w/2, maxX: it.x + w/2, minZ: it.z - d/2, maxZ: it.z + d/2, top: sz.h};
}

// ── 빛 웅덩이 ──────────────────────────────────────────────────────
//  가로등 아래 바닥에 까는 반투명 원판. **광원이 아니다** — three.js 는 광원이
//  늘 때마다 셰이더를 다시 굽는다. 등을 스무 개 놓으면 그대로 프레임이 죽는다.
//  밝기는 map.js 가 밤 정도로 움직인다(이름 'lamp-pool' 로 찾는다).
let POOL_TEX = null, POOL_GEO = null;
function poolTexture(){
  if (POOL_TEX) return POOL_TEX;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  //  가장자리를 딱 끊으면 원이 도장처럼 보인다. 중간을 빨리 떨어뜨려 번지게 둔다.
  grd.addColorStop(0, 'rgba(255,226,170,1)');
  grd.addColorStop(0.45, 'rgba(255,214,150,0.34)');
  grd.addColorStop(1, 'rgba(255,205,140,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  POOL_TEX = new THREE.CanvasTexture(c);
  POOL_TEX.colorSpace = THREE.SRGBColorSpace;
  return POOL_TEX;
}

/**
 * 등갓(`lamp-glow` 재질) 아래에 웅덩이를 붙인다.
 * ⚠ 자리는 **모델 중심이 아니라 등갓 중심**이다 — 굽은 등은 갓이 기둥에서
 *   옆으로 비켜 있어 중심으로 잡으면 빛이 기둥 밑에 고인다.
 */
function addLampPool(g, track){
  let head = null;
  g.traverse(o => { if (!head && o.isMesh && o.material?.name === 'lamp-glow') head = o; });
  if (!head) return;
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(head)
    .applyMatrix4(new THREE.Matrix4().copy(g.matrixWorld).invert());   // → g 로컬
  const c = box.getCenter(new THREE.Vector3());
  //  등은 굽는데 웅덩이만 안 굽으면 곡면을 되살렸을 때 빛이 등에서 떨어진다.
  const mat = bend(new THREE.MeshBasicMaterial({
    name: 'lamp-pool', map: poolTexture(), transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  track && track(mat);
  //  등갓에 헤일로. **렌즈 면은 법선이 (0,-1,0) 이라 부감 카메라에서 영영 안
  //  보인다** — 자체발광만 올려 두면 켜진 티가 안 나고, 바닥에만 빛이 고여
  //  광원 없는 웅덩이가 된다. 카메라를 향하는 판을 갓 자리에 하나 세운다.
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    name: 'lamp-halo', map: poolTexture(), transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  track && track(halo.material);
  halo.scale.setScalar(c.y * 0.30);      // 라이브에서 눈으로 맞춘 값. 더 키우면 지붕까지 먹는다
  halo.position.copy(c);
  g.add(halo);

  const r = c.y * 0.95;                        // 갓이 높을수록 넓게 퍼진다
  //  지오메트리는 한 장을 모두가 나눠 쓴다 — 등마다 새로 만들면 다시 그릴 때마다
  //  버려진 판이 쌓인다(junk 는 재질만 거둔다).
  POOL_GEO = POOL_GEO || new THREE.PlaneGeometry(1, 1);
  const disc = new THREE.Mesh(POOL_GEO, mat);
  disc.scale.set(r * 2, r * 2, 1);
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(c.x, 0.012, c.z);          // 바닥에서 살짝 띄운다(z-fighting)
  disc.renderOrder = 2;
  g.add(disc);
}

/**
 * 모닥불처럼 **모델에 빛나는 면이 없는 것**에 불빛을 붙인다(d.glow).
 * 웅덩이·헤일로는 가로등과 같은 물건이고 색만 다르다 — map.js 가 이름으로
 * 찾아 밤 정도에 맞춰 밝기를 움직인다('fire-*' 는 흔들림까지 얹는다).
 */
function addFireGlow(g, track, glow){
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g)
    .applyMatrix4(new THREE.Matrix4().copy(g.matrixWorld).invert());
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const w = Math.max(size.x, size.z);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    name: 'fire-halo', map: poolTexture(), color: glow.color, transparent: true,
    opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  track && track(halo.material);
  halo.scale.setScalar(w * glow.halo);
  //  장작 **위**에 불꽃이 앉는다. 모델이 납작해서 중심에 두면 땅에 깔린다.
  halo.position.set(c.x, box.max.y + w * glow.halo * 0.35, c.z);
  g.add(halo);

  const mat = bend(new THREE.MeshBasicMaterial({
    name: 'fire-pool', map: poolTexture(), color: glow.color, transparent: true,
    opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  track && track(mat);
  POOL_GEO = POOL_GEO || new THREE.PlaneGeometry(1, 1);
  const disc = new THREE.Mesh(POOL_GEO, mat);
  disc.scale.setScalar(w * glow.pool * 2);
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(c.x, 0.014, c.z);
  disc.renderOrder = 2;
  g.add(disc);
}

//  바닥 데칼 — 로고처럼 **그림 한 장을 땅에 까는 것**. GLB 를 만들 것 없이
//  판 하나에 텍스처를 붙인다. 텍스처는 종류마다 한 장을 나눠 쓴다.
const DECAL_TEX = new Map();
function buildDecal(it, d, track){
  let tex = DECAL_TEX.get(d.decal);
  if (!tex){
    tex = new THREE.TextureLoader().load(d.decal);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    DECAL_TEX.set(d.decal, tex);
  }
  //  ⚠ depthWrite 를 끈다. 두께가 0 이라 켜 두면 위에 놓은 물건과 z 싸움을 한다.
  const mat = bend(new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, toneMapped: false,
  }));
  track && track(mat);
  POOL_GEO = POOL_GEO || new THREE.PlaneGeometry(1, 1);
  const side = d.s * (it.s || 1);
  const m = new THREE.Mesh(POOL_GEO, mat);
  m.scale.set(side, side, 1);
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = -(it.r || 0);
  //  ⚠ 포장 타일은 **6cm 두께**다(tile-low 0.02 × s 3.0). 2cm 에 두면 타일 속에
  //    묻혀 아예 안 보인다 — 실측하고 10cm 로 올렸다.
  m.position.set(it.x, 0.10, it.z);
  m.renderOrder = 3;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

/** 씬에 놓는다. r 은 라디안, s 는 기본 크기 대비 배수. */
export function buildDecor(it, track){
  const d = DECOR_BY_ID[it.t];
  if (!d) return null;
  if (d.decal) return buildDecal(it, d, track);
  const g = placeKit(d.kit, {x: it.x, z: it.z, yaw: it.r || 0,
                             scale: d.s * (it.s || 1), track});
  //  색 배수 — 텍스처가 어두울 때 한 톤 올린다. 재질은 인스턴스마다 복제돼 있다.
  if (d.bright) g?.traverse(o => { if (o.isMesh) o.material.color.multiplyScalar(d.bright); });
  if (g){
    addLampPool(g, track);                       // 등갓이 있는 것(가로등)
    if (d.glow) addFireGlow(g, track, d.glow);   // 표에 적어 둔 것(모닥불)
  }
  return g;
}

// ── 미리보기 ────────────────────────────────────────────────────────
//  팔레트에는 **실제 에셋을 그대로 줄여서** 보여 준다. 아이콘으로 대신하면
//  무엇이 놓일지 알 수 없다. 오프스크린 렌더러로 모델을 한 번 찍어 캐시한다.
const THUMB_PX = 128;
const thumbCache = new Map();
let tRenderer = null, tScene = null, tCam = null;

function thumbSetup(){
  if (tRenderer) return;
  tRenderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
  tRenderer.setSize(THUMB_PX, THUMB_PX);
  tRenderer.setPixelRatio(1);
  tRenderer.outputColorSpace = THREE.SRGBColorSpace;
  tScene = new THREE.Scene();
  tScene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c8, 1.15));
  const key = new THREE.DirectionalLight(0xfff6e8, 0.75);
  key.position.set(3, 5, 4);
  tScene.add(key);
  // 정사영 — 원근이 섞이면 크기 비교가 흐트러진다
  tCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
}

//  물체마다 화면에 꽉 차게 잡는다.
//  처음엔 모든 물체를 같은 월드 크기(3.2m)로 찍었는데, 그러면 의자·책 같은
//  작은 것이 프레임 구석의 점이 되어 무엇인지 알아볼 수 없었다(실측).
//  각 물체를 제 크기에 맞춰 채우고, 이름표로 무엇인지 알린다.
function frame(obj){
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  // 아이소메트릭에서 가로로 눕는 것(러그·벤치)도 잘리지 않게 대각선까지 본다
  const span = Math.max(size.y, Math.hypot(size.x, size.z) * 0.78, 0.2) * 1.22;
  const h = span / 2;
  tCam.left = -h; tCam.right = h; tCam.top = h; tCam.bottom = -h;
  tCam.position.set(c.x + span, c.y + span * 0.82, c.z + span * 1.25);
  tCam.lookAt(c.x, c.y, c.z);
  tCam.updateProjectionMatrix();
}

/**
 * 아무 Object3D 나 같은 카메라로 찍는다. 캐릭터 미리보기도 이걸 쓴다 —
 * 팔레트와 같은 비율·같은 조명이라야 나란히 놓았을 때 크기가 비교된다.
 */
export function thumbOf(obj){
  thumbSetup();
  const mats = [];
  obj.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material.clone();
    m.onBeforeCompile = () => {};
    m.customProgramCacheKey = () => 'thumb';
    m.needsUpdate = true;
    o.material = m;
    mats.push(m);
  });
  tScene.add(obj);
  frame(obj);
  tRenderer.render(tScene, tCam);
  const url = tRenderer.domElement.toDataURL('image/png');
  tScene.remove(obj);
  mats.forEach(m => m.dispose());
  return url;
}

/** @returns {string} data URL. 모델이 아직 안 받아졌으면 빈 문자열. */
export function decorThumb(id){
  if (thumbCache.has(id)) return thumbCache.get(id);
  const d = DECOR_BY_ID[id];
  if (!d) return '';
  //  데칼은 그림 자체가 곧 미리보기다 — 오프스크린으로 찍을 것이 없다.
  if (d.decal) return d.decal;
  thumbSetup();

  // placeKit 은 곡면 셰이더를 주입한다 — 썸네일 카메라에서는 굽으면 안 되므로
  // 여기서만 평범한 재질로 되돌린다(원본을 건드리지 않게 복제본에서).
  const g = placeKit(d.kit, {scale: d.s});
  if (!g) return '';
  const mats = [];
  g.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material.clone();
    m.onBeforeCompile = () => {};
    m.customProgramCacheKey = () => 'thumb';
    m.needsUpdate = true;
    o.material = m;
    mats.push(m);
  });

  tScene.add(g);
  frame(g);
  tRenderer.render(tScene, tCam);
  const url = tRenderer.domElement.toDataURL('image/png');
  tScene.remove(g);
  g.traverse(o => { if (o.isMesh) o.geometry.dispose?.(); });
  mats.forEach(m => m.dispose());

  thumbCache.set(id, url);
  return url;
}

/** 맵을 떠날 때 렌더러를 놓아 준다(WebGL 컨텍스트는 개수 제한이 있다). */
export function disposeThumbs(){
  tRenderer?.dispose();
  tRenderer = null; tScene = null; tCam = null;
  thumbCache.clear();
}
