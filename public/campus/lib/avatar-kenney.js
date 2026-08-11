// ══════════════════════════════════════════════════════════════════
//  Kenney 캐릭터 어댑터 — avatar.js(코드 아바타 폴백)와 **같은 API** 를 제공한다.
//
//    preload()                      맵 마운트 전 1회
//    buildAvatar(look, body, opts) → rig
//    poseAvatar(rig, lower, upper, t)
//    disposeAvatar(rig)
//
//  모델: Kenney "Mini Characters" (CC0) — 12종 · 803 삼각형 · 뼈 7개
//        https://kenney.nl/assets/mini-characters
//
//  ── 이 팩을 다루며 확인한 것 ──────────────────────────────────────
//   · 12종이 **같은 7뼈 리그**(root/torso/head/arm·leg-left·right)를 쓴다.
//     이름까지 같아서 애니메이션 클립을 어느 캐릭터에든 그대로 물릴 수 있다.
//     그래서 전처리(scripts/campus-prep-kenney.py)에서 애니메이션을 기본 1종에만
//     남겼다 — 12종에 30클립이 중복돼 3MB 였던 게 1.3MB 가 됐다.
//   · 색은 **512×512 팔레트 텍스처 한 장(colormap)** 을 UV 로 찍어 쓴다.
//     ⚠ 반드시 NearestFilter 여야 한다. 선형 보간이면 인접 색 칸이 섞여
//       옷 경계마다 엉뚱한 색 띠가 생긴다.
//   · 파일에 부모 없는 Icosphere(42정점) 잔재가 있다 — 전처리에서 지웠다.
//   · 표정·헤어는 메시에 그려져 있다. 얼굴을 따로 그릴 필요가 없고,
//     꾸미기는 '어느 캐릭터를 고를까'로 바뀐다.
// ══════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { bend } from '/campus/lib/curve.js';

export const CREDIT = 'Kenney "Mini Characters" (CC0) — kenney.nl';

const BASE = '/campus/models/kenney/';
export const MODELS = [
  'male-a', 'male-b', 'male-c', 'male-d', 'male-e', 'male-f',
  'female-a', 'female-b', 'female-c', 'female-d', 'female-e', 'female-f',
];
// 애니메이션 클립을 들고 있는 파일. 전처리가 이 한 종에만 남겼다.
export const DEFAULT_MODEL = 'male-a';

// 캠퍼스 월드 기준 키(m). 2등신 치비라 성인 1.5m 로 두면 머리가 문틀을 넘는다.
const TARGET_H = 1.30;

// map.js 가 쓰는 동작 이름 → Kenney 클립 이름.
//
// 팩에는 32종이 들어 있다(전처리 로그 참고). 지금 쓰는 건 아래 여덟이고,
// 나머지는 쓸 자리가 생기면 여기에 한 줄 추가하면 바로 돈다:
//   attack-kick-left/right · attack-melee-left/right · die · drive
//   holding-both/left/right (+ -shoot) · static
//   wheelchair-sit / -move-forward/back/left/right / -look-left/right
const CLIP = {
  idle:'idle', walk:'walk', run:'sprint', sit:'sit',
  crouch:'crouch', jump:'jump', fall:'fall',
  pick:'pick-up', wave:'interact-right', point:'interact-left',
  yes:'emote-yes', no:'emote-no',
};

// 한 번 재생하고 끝나는 동작(반복하면 안 되는 것들)
const ONCE = new Set(['jump', 'pick', 'wave', 'point', 'yes', 'no']);

const cache = new Map();          // model 이름 → {scene, height}
let CLIPS = null;                 // AnimationClip[] — 전 캐릭터가 공유한다
const loader = new GLTFLoader();

function prepare(scene){
  scene.updateMatrixWorld(true);
  scene.traverse(o => {
    if (!o.isMesh) return;
    o.frustumCulled = false;                 // 스킨드는 바운딩이 어긋나 사라진다
    const m = o.material;
    if (m && m.map){
      // 팔레트 아틀라스 — 보간하면 색 칸이 섞인다
      m.map.magFilter = THREE.NearestFilter;
      m.map.minFilter = THREE.NearestFilter;
      m.map.generateMipmaps = false;
      m.map.needsUpdate = true;
    }
  });
  return scene;
}

async function load(name){
  if (cache.has(name)) return cache.get(name);
  const gltf = await loader.loadAsync(BASE + name + '.glb');
  const scene = prepare(gltf.scene);
  if (gltf.animations && gltf.animations.length) CLIPS = gltf.animations;
  const box = new THREE.Box3().setFromObject(scene);
  const entry = { scene, height: box.max.y - box.min.y };
  cache.set(name, entry);
  return entry;
}

/** 맵 마운트 전에 한 번. buildAvatar 가 동기라 기본 캐릭터는 미리 받아 둔다. */
export async function preload(){
  await load(DEFAULT_MODEL);                 // 클립도 여기서 들어온다
  return cache.get(DEFAULT_MODEL);
}

/** 12종 전부 받아 둔다 — 캐릭터 고르기 화면을 열 때 한 번. */
export async function preloadAll(){
  await Promise.all(MODELS.map(n => load(n).catch(() => null)));
}

/** 미리보기용 사본. 씬에 넣었다 빼고 버린다. */
export function previewOf(name){
  const e = cache.get(MODELS.includes(name) ? name : DEFAULT_MODEL);
  if (!e) return null;
  const g = cloneSkinned(e.scene);
  g.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  return g;
}

/** 커스터마이저처럼 '고르고 나서 다시 만드는' 흐름에서 쓴다. */
export async function ensure(name){
  if (!MODELS.includes(name)) return false;
  await load(name);
  return true;
}

const modelOf = look => {
  const n = look && look.model;
  return MODELS.includes(n) ? n : DEFAULT_MODEL;
};

/**
 * @param look {model} — 12종 중 하나. 나머지 필드(skin/hair/top…)는 안 쓴다.
 *                       Kenney 캐릭터는 색이 메시에 박혀 있다.
 * @param body (미사용)
 */
export function buildAvatar(look = {}, body = null, opts = {}){
  const name = modelOf(look);
  // 아직 안 받은 모델이면 기본으로 세우고 뒤에서 받아 둔다(다음 빌드부터 제대로 나온다).
  const entry = cache.get(name) || cache.get(DEFAULT_MODEL);
  if (!entry) throw new Error('preload() 를 먼저 호출해야 합니다');
  if (!cache.has(name)) load(name).catch(() => {});

  const model = cloneSkinned(entry.scene);
  // 재질은 인스턴스마다 복제한다 — 곡면 셰이더 주입이 원본을 오염시키면
  // 캐시된 템플릿이 두 번 굽힌 상태로 남는다.
  const owned = [];
  model.traverse(o => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.material = bend(o.material.clone());
    owned.push(o.material);
  });

  const root = new THREE.Group();
  root.add(model);

  // 크기·바닥 맞추기
  model.updateMatrixWorld(true);
  const b0 = new THREE.Box3().setFromObject(model);
  model.scale.setScalar(TARGET_H / (b0.max.y - b0.min.y));
  model.updateMatrixWorld(true);
  model.position.y -= new THREE.Box3().setFromObject(model).min.y;

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const clip of (CLIPS || [])){
    const a = mixer.clipAction(clip);
    a.enabled = true;
    actions[clip.name] = a;
  }
  const rig = { root, model, mixer, actions, cur: null, last: 0, lockUntil: 0,
                kind: 'kenney', owned, modelName: name };
  play(rig, 'idle', 0);
  return rig;
}

function play(rig, act, fade = 0.18){
  const clipName = CLIP[act] || 'idle';
  if (rig.cur === clipName) return;
  const next = rig.actions[clipName];
  if (!next) return;
  const prev = rig.actions[rig.cur];
  next.reset().setEffectiveWeight(1);
  if (ONCE.has(act)){
    // 한 번만 재생하고 마지막 프레임에서 멈춘다. 안 그러면 손 흔들기가 무한 반복된다.
    next.setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true;
  } else {
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = false;
  }
  next.play();
  if (prev && fade > 0){ next.crossFadeFrom(prev, fade, false); }
  rig.cur = clipName;
}

/**
 * 한 번짜리 동작을 끼워 넣는다(손 흔들기·줍기 등). 끝나면 이전 동작으로 돌아간다.
 * poseAvatar 가 매 프레임 기본 동작을 다시 걸기 때문에, 끝날 때까지 잠가 둔다.
 */
export function playOnce(rig, act){
  if (!rig || !CLIP[act]) return;
  const clip = rig.actions[CLIP[act]];
  if (!clip) return;
  play(rig, act, 0.12);
  rig.lockUntil = performance.now() + clip.getClip().duration * 1000;
}

/**
 * map.js 는 t 로 '걸음 위상(walkT/7)' 또는 '경과시간'을 넘긴다 — 둘의 기준이 달라
 * 동작이 바뀌는 순간 t 가 튄다. 그래서 t 를 쓰지 않고 **실제 경과 시간**으로 돌린다.
 */
export function poseAvatar(rig, lower = 'idle', upper = 'none', t = 0){
  const now = performance.now();
  const dt = rig.last ? Math.min((now - rig.last) / 1000, 0.06) : 0;
  rig.last = now;
  // 한 번짜리 동작이 도는 중엔 기본 동작으로 덮지 않는다
  if (!rig.lockUntil || now >= rig.lockUntil) play(rig, lower);
  rig.mixer.update(dt);
}

export function disposeAvatar(rig){
  if (!rig) return;
  rig.mixer.stopAllAction();
  rig.mixer.uncacheRoot(rig.model);
  // 지오메트리·텍스처는 캐시된 템플릿 것을 공유한다. 복제한 재질만 버린다.
  rig.owned.forEach(m => m.dispose());
  rig.root.parent && rig.root.parent.remove(rig.root);
}
