// ══════════════════════════════════════════════════════════════════
//  펫 — Kenney Cube Pets (CC0) 24종.
//
//  캐릭터(mini-*)와 달리 **스킨이 없다.** root/body/leg-*/tail 노드 계층을
//  클립이 직접 움직인다. 그래서 SkeletonUtils 가 아니라 일반 clone 으로 복제하고,
//  복제본마다 AnimationMixer 를 새로 단다(클립은 원본 것을 같이 쓴다).
//
//  클립: static·idle·walk·run·eat·dance·gesture-positive·gesture-negative
//  크기: 모델마다 제각각이라(기린≫게) 로드할 때 재서 목표 키로 눕힌다.
// ══════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { bend } from '/campus/lib/curve.js';

const BASE = '/campus/models/kenney/pets/';
//  목표 키(m). 캐릭터가 1.3m 이므로 무릎께에 오는 애완동물 크기.
//  단, 원래부터 작은 애(꿀벌·게·애벌레)는 덜 키운다 — 전부 같은 키로 만들면
//  꿀벌이 강아지만 해져서 오히려 이상하다.
const TARGET_H = 0.52;

export const PETS = [
  {id:'dog',        name:'강아지'},   {id:'cat',     name:'고양이'},
  {id:'bunny',      name:'토끼'},     {id:'chick',   name:'병아리'},
  {id:'penguin',    name:'펭귄'},     {id:'fox',     name:'여우'},
  {id:'panda',      name:'판다'},     {id:'koala',   name:'코알라'},
  {id:'lion',       name:'사자'},     {id:'tiger',   name:'호랑이'},
  {id:'deer',       name:'사슴'},     {id:'giraffe', name:'기린'},
  {id:'elephant',   name:'코끼리'},   {id:'cow',     name:'젖소'},
  {id:'pig',        name:'돼지'},     {id:'hog',     name:'멧돼지'},
  {id:'monkey',     name:'원숭이'},   {id:'polar',   name:'북극곰'},
  {id:'beaver',     name:'비버'},     {id:'parrot',  name:'앵무새'},
  {id:'bee',        name:'꿀벌'},     {id:'crab',    name:'게'},
  {id:'fish',       name:'물고기'},   {id:'caterpillar', name:'애벌레'},
];
export const PET_BY_ID = new Map(PETS.map(p => [p.id, p]));

const loader = new GLTFLoader();
const cache = new Map();               // id → {scene, clips, scale}

function prepare(scene){
  scene.traverse(o => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    const m = o.material;
    if (m && m.map){ m.map.magFilter = THREE.NearestFilter; m.map.minFilter = THREE.NearestFilter; }
    if (m && 'metalness' in m) m.metalness = 0;   // 환경맵 없는 씬에서 검게 타는 것 방지
  });
}

export async function ensure(id){
  if (!PET_BY_ID.has(id) || cache.has(id)) return cache.has(id);
  const gltf = await loader.loadAsync(BASE + id + '.glb');
  prepare(gltf.scene);
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const h = Math.max(0.05, box.max.y - box.min.y);
  //  작은 동물은 원래 크기의 흔적을 남긴다(최대 2.4배까지만 키운다)
  const scale = Math.min(TARGET_H / h, 2.4);
  cache.set(id, {scene: gltf.scene, clips: gltf.animations || [], scale});
  return true;
}

export async function preloadAll(){
  await Promise.all(PETS.map(p => ensure(p.id).catch(() => false)));
}

/**
 * 펫 인스턴스. {root, mixer, play(name), dispose()}
 * @param flat true 면 곡면 셰이더를 안 태운다(썸네일·무대)
 */
export function buildPet(id, flat = false){
  const e = cache.get(id);
  if (!e) return null;
  const model = e.scene.clone(true);
  const owned = [];
  model.traverse(o => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    if (!flat) bend(o.material);
    owned.push(o.material);
  });
  model.scale.setScalar(e.scale);
  const root = new THREE.Group();
  root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const c of e.clips) actions[c.name] = mixer.clipAction(c);
  let cur = null;
  const play = (name, fade = 0.18) => {
    const a = actions[name];
    if (!a || cur === a) return;
    a.reset().fadeIn(fade).play();
    if (cur) cur.fadeOut(fade);
    cur = a;
  };
  play('idle', 0);
  return { root, mixer, play,
    dispose(){
      root.parent && root.parent.remove(root);
      for (const m of owned){ m.map && m.map.dispose(); m.dispose(); }
    } };
}

// ── 썸네일 ──────────────────────────────────────────────────────────
const THUMB = 96;
const thumbs = new Map();
let tR = null, tS = null, tC = null;
function thumbSetup(){
  if (tR) return;
  tR = new THREE.WebGLRenderer({antialias:true, alpha:true});
  tR.setSize(THUMB, THUMB); tR.setPixelRatio(1);
  tR.outputColorSpace = THREE.SRGBColorSpace;
  tS = new THREE.Scene();
  tS.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c8, 1.2));
  const key = new THREE.DirectionalLight(0xfff6e8, 0.8);
  key.position.set(3, 5, 4); tS.add(key);
  tC = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
}
export function petThumb(id){
  if (thumbs.has(id)) return thumbs.get(id);
  const p = buildPet(id, true);
  if (!p) return '';
  thumbSetup();
  p.root.rotation.y = 0.5;             // 3/4 — 얼굴과 옆모습이 같이 보인다
  tS.add(p.root);
  p.root.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(p.root);
  const cy = (b.max.y + b.min.y) / 2;
  const half = Math.max(b.max.y - b.min.y, b.max.x - b.min.x) / 2 * 1.2;
  tC.left = -half; tC.right = half; tC.top = half; tC.bottom = -half;
  tC.position.set(0, cy, 8); tC.lookAt(0, cy, 0); tC.updateProjectionMatrix();
  tR.render(tS, tC);
  const url = tR.domElement.toDataURL('image/png');
  tS.remove(p.root); p.dispose();
  thumbs.set(id, url);
  return url;
}
