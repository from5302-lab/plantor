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

/**
 * 배치 가능한 오브젝트.
 *   kit  = GLB 이름(public/campus/models/kenney/kit/)
 *   s    = 기본 크기 배수. 캐릭터 키 1.3m 기준으로 어울리게 잡은 값
 *   tall = 사람 키를 넘는 것. 실내에 놓으면 시야를 가려 경고를 띄운다
 *   group= 팔레트 묶음
 */
export const DECOR = [
  // 가구
  {id:'desk',     name:'책상',      kit:'desk',              s:1.7, group:'가구'},
  {id:'chair',    name:'의자',      kit:'chairDesk',         s:1.4, group:'가구'},
  {id:'table',    name:'테이블',    kit:'table',             s:1.8, group:'가구'},
  {id:'sofa',     name:'소파',      kit:'loungeSofa',        s:1.8, group:'가구'},
  {id:'bed',      name:'침대',      kit:'bedSingle',         s:1.8, group:'가구'},
  {id:'stool',    name:'스툴',      kit:'stoolBar',          s:1.6, group:'가구'},
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
  {id:'wall',     name:'벽',        kit:'wall',              s:1.2, group:'구조', tall:true},
  {id:'wallw',    name:'창문 벽',   kit:'wallWindow',        s:1.2, group:'구조', tall:true},
  {id:'walld',    name:'문 벽',     kit:'wallDoorway',       s:1.2, group:'구조', tall:true},
  {id:'floor',    name:'바닥 타일', kit:'floorFull',         s:2.0, group:'구조'},

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
  {id:'bench',    name:'벤치',      kit:'stall-bench',       s:1.9, group:'야외'},
  {id:'fence',    name:'울타리',    kit:'fence',             s:8.0, group:'야외'},
  {id:'planter',  name:'화단',      kit:'planter',           s:4.0, group:'야외'},
  {id:'fountain', name:'분수',      kit:'fountain-round',    s:2.1, group:'야외'},
  {id:'path',     name:'포장 타일', kit:'driveway-long',     s:8.0, group:'야외'},
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
  return loadKit([...new Set(DECOR.map(d => d.kit))]);
}

/** 배치된 한 항목의 실제 크기(m). decorBox 가 쓴다. */
function decorSize(it){
  const d = DECOR_BY_ID[it.t];
  if (!d) return null;
  const k = kitSize(d.kit);
  if (!k) return null;
  const s = d.s * (it.s || 1);
  return {w: k.x * s, h: k.y * s, d: k.z * s};
}

/** 회전(90° 단위가 아니어도 된다)을 반영한 대략적 AABB. */
export function decorBox(it){
  const sz = decorSize(it);
  if (!sz) return null;
  // 임의 각도라 회전한 사각형의 외접 상자를 쓴다 — 살짝 넉넉하지만 안전하다
  const c = Math.abs(Math.cos(it.r || 0)), s = Math.abs(Math.sin(it.r || 0));
  const w = sz.w * c + sz.d * s, d = sz.w * s + sz.d * c;
  return {minX: it.x - w/2, maxX: it.x + w/2, minZ: it.z - d/2, maxZ: it.z + d/2};
}

/** 씬에 놓는다. r 은 라디안, s 는 기본 크기 대비 배수. */
export function buildDecor(it, track){
  const d = DECOR_BY_ID[it.t];
  if (!d) return null;
  return placeKit(d.kit, {x: it.x, z: it.z, yaw: it.r || 0,
                          scale: d.s * (it.s || 1), track});
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
