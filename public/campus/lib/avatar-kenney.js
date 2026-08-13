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

// 곡면(지평선) 셰이더는 **맵 카메라 기준**이다. uFocus 가 맵의 시야 좌표라, 카메라가
// 다른 곳(꾸미기 무대·썸네일)에서 같은 재질을 쓰면 캐릭터가 0.8m 쯤 아래로 밀려
// 몸이 화면 밖으로 나간다. 그 화면들은 굽히지 않는다.
let FLAT = false;
const bendIf = mat => FLAT ? mat : bend(mat);

export const CREDIT = 'Kenney "Mini" 시리즈 (CC0) — kenney.nl';

const BASE = '/campus/models/kenney/';
//  뒤의 아홉은 mini-characters 밖(arcade·market·skate·forest·dungeon·arena)에서
//  왔다. 리그(뼈 7개)는 같아서 클립을 그대로 쓰지만 **팩마다 팔레트 자리가 달라**,
//  굽는 단계에서 UV 를 mini-characters 자리로 옮겨 뒀다(campus-prep-kenney.py).
//  ⚠ 저장된 look.model 이 있으므로 **추가만** 한다. 순서를 바꾸면 안 된다.
export const MODELS = [
  'male-a', 'male-b', 'male-c', 'male-d', 'male-e', 'male-f',
  'female-a', 'female-b', 'female-c', 'female-d', 'female-e', 'female-f',
  'gamer', 'arcade-clerk', 'market-clerk', 'skate-boy', 'skate-girl',
  'archer', 'hero', 'orc', 'soldier',
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

//  살색이 넷뿐이라 빈 계열에 여섯을 더 찍어 둔 팔레트(scripts/campus-skin-tones.py).
//  GLB 12개를 다시 굽지 않으려고 **바깥 PNG** 로 두고 런타임에서 갈아 끼운다.
let PALETTE_TEX = null;
function paletteTexture(){
  if (!PALETTE_TEX){
    PALETTE_TEX = new THREE.TextureLoader().load(BASE + 'colormap.png');
    PALETTE_TEX.flipY = false;             // glTF 와 같은 방향이어야 UV 가 맞는다
    PALETTE_TEX.colorSpace = THREE.SRGBColorSpace;
    PALETTE_TEX.magFilter = PALETTE_TEX.minFilter = THREE.NearestFilter;
    PALETTE_TEX.generateMipmaps = false;
  }
  return PALETTE_TEX;
}

function prepare(scene){
  scene.updateMatrixWorld(true);
  scene.traverse(o => {
    if (!o.isMesh) return;
    o.frustumCulled = false;                 // 스킨드는 바운딩이 어긋나 사라진다
    const m = o.material;
    if (m && m.map){
      m.map = paletteTexture();            // 살색을 더 넣은 팔레트로 갈아 끼운다
      m.needsUpdate = true;
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

// ══ 색 바꾸기 ══════════════════════════════════════════════════════
//
//  팔레트(512×512)는 세로로 짝지어져 있다 — 같은 열의 두 줄이 한 색의 밝은/어두운
//  쌍이다. 그래서 색의 단위는 64px 칸이 아니라 **64×128 계열**(가로 8 × 세로 4)이다.
//
//  색을 바꾸는 방법은 '칠하기'가 아니라 **UV 이사**다. 계열 안에 명암 램프가 이미
//  들어 있으므로, 정점의 UV 를 다른 계열로 평행이동하면 음영이 그대로 산 채 색만
//  바뀐다. 텍스처는 12종이 계속 한 장을 공유한다 — 사람마다 복제하는 건 UV 뿐이다.
//
//  ⚠ 칸을 칠하는 방식은 못 쓴다. 계열은 색 단위지 부위가 아니라서, 같은 색이면
//    부위가 달라도 한 계열을 나눠 쓴다(검정 머리와 검정 신발). 칠하면 같이 바뀐다.
//
//  어느 정점이 어느 부위인지는 오프라인에서 뽑아 둔 표를 읽는다
//  (scripts/campus-part-cells.py → models/kenney/part-cells.json).
//  열쇠는 정점의 (메시, 계열x, 계열y, 뼈부류) 다.

/** 쓸 수 있는 색. y2 줄은 옷 색, y3 줄은 중립·피부다(빈 계열은 검정이라 안 쓴다). */
export const PALETTE = [
  {id:'cream',  name:'크림',   hex:'#fde4c7', f:[0,2]},
  {id:'green',  name:'초록',   hex:'#61cb8b', f:[1,2]},
  {id:'yellow', name:'노랑',   hex:'#ffd565', f:[2,2]},
  {id:'orange', name:'주황',   hex:'#ff9d44', f:[3,2]},
  {id:'red',    name:'다홍',   hex:'#fe6c40', f:[4,2]},
  {id:'blue',   name:'파랑',   hex:'#6794d9', f:[5,2]},
  {id:'sky',    name:'연하늘', hex:'#d0e8ff', f:[6,2]},
  {id:'purple', name:'보라',   hex:'#a878e8', f:[7,2]},
  {id:'ink',    name:'먹색',   hex:'#464957', f:[0,3]},
  {id:'gray',   name:'회색',   hex:'#868ba1', f:[1,3]},
  {id:'slate',  name:'청회색', hex:'#565c74', f:[2,3]},
  {id:'mist',   name:'연회청', hex:'#c4cdf6', f:[3,3]},
  {id:'white',  name:'흰색',   hex:'#ffffff', f:[4,3]},
  {id:'tan',    name:'살구',   hex:'#f1976c', f:[5,3]},
  {id:'brown',  name:'갈색',   hex:'#b06041', f:[6,3]},
  {id:'peach',  name:'밝은살', hex:'#f2bf99', f:[7,3]},
  // 아래 여섯은 빈 계열에 새로 찍은 살색이다(scripts/campus-skin-tones.py).
  // 기존 램프의 명암을 그대로 두고 색조만 옮겨 만들었다 — 음영이 살아 있다.
  {id:'porcelain', name:'아주밝은', hex:'#f0ceb8', f:[0,0]},
  {id:'ivory',     name:'밝은',     hex:'#e3be9f', f:[1,0]},
  {id:'honey',     name:'중간',     hex:'#d39779', f:[2,0]},
  {id:'almond',    name:'중간진한', hex:'#b5755d', f:[3,0]},
  {id:'chestnut',  name:'진한',     hex:'#8c5142', f:[4,0]},
  {id:'espresso',  name:'아주진한', hex:'#663b32', f:[5,0]},
];
const BY_ID = new Map(PALETTE.map(p => [p.id, p]));
/** 피부에 초록·보라를 보여 주면 실수로만 눌린다. 살색 계열만 낸다. */
export const SKIN_IDS = ['porcelain', 'ivory', 'peach', 'honey', 'tan',
                         'almond', 'brown', 'chestnut', 'espresso', 'cream'];
/** 옷·머리에는 원래 16색만 낸다 — 새로 찍은 살색까지 섞으면 목록이 살색으로 덮인다 */
const WEAR_IDS = PALETTE.slice(0, 16).map(p => p.id);
export const PARTS = [
  {id:'skin',   name:'피부',   ids: SKIN_IDS},
  {id:'hair',   name:'머리',   ids: WEAR_IDS},
  {id:'top',    name:'상의',   ids: WEAR_IDS},
  {id:'bottom', name:'하의',   ids: WEAR_IDS},
  {id:'glass',  name:'안경',   ids: WEAR_IDS},
];

let PART_CELLS = null;                       // {family:[w,h], models:{name:{key:part}}}

const BONE_CLASS = {'head':'head', 'torso':'torso', 'root':'torso',
                    'arm-left':'arm', 'arm-right':'arm',
                    'leg-left':'leg', 'leg-right':'leg'};

/**
 * 정점마다 UV 를 목표 계열로 옮긴다. 표에 없는 부위(이목구비 등)는 건드리지 않는다.
 * geometry 는 cloneSkinned 가 **공유**하므로, 손대기 전에 이 인스턴스 것으로 복제한다.
 * 안 그러면 같은 모델을 쓰는 다른 접속자의 캐릭터까지 같이 바뀐다.
 */
function recolor(model, L, colors, owned){
  if (!PART_CELLS) return;
  const [fw, fh] = PART_CELLS.family;                     // 64 × 128
  const TEX = 512;
  model.traverse(o => {
    if (!o.isMesh || !o.geometry.attributes.uv) return;
    // 부위 표는 **그 메시가 온 모델** 것을 쓴다. 조합하면 머리카락·몸·얼굴이
    // 서로 다른 모델에서 오므로, 하나의 표로 찾으면 엉뚱한 부위가 칠해진다.
    const table = PART_CELLS.models[
      o.name === 'hair-graft' ? L.head : o.name === 'face-graft' ? L.face
      : o.name.charAt(0) === 'b' ? L.body : L.base];
    if (!table) return;
    // 이미 이 인스턴스 것으로 만든 geometry(이식한 머리·갈아입은 몸)는 다시 복제하지 않는다
    if (!owned.includes(o.geometry)){
      o.geometry = o.geometry.clone();                    // ← 공유 해제
      owned.push(o.geometry);                             // 복제했으니 버리는 것도 우리 몫
    }
    const uv = o.geometry.attributes.uv;
    const si = o.geometry.attributes.skinIndex;
    const sw = o.geometry.attributes.skinWeight;
    const bones = o.skeleton ? o.skeleton.bones : [];
    const tag = o.name.charAt(0);                         // 'b' / 'h'
    /** 정점의 부위 — (메시, 계열, 뼈부류) 로 표를 찾는다 */
    const partAt = (i) => {
      const u = uv.getX(i), v = uv.getY(i);
      const fx = Math.floor(Math.min(Math.floor(u * TEX), TEX - 1) / fw);
      const fy = Math.floor(Math.min(Math.floor(v * TEX), TEX - 1) / fh);
      // 뼈부류 — 가중치가 가장 큰 뼈가 그 정점의 주인이다
      let cls = 'torso', best = -1;
      if (si && sw){
        const w = {};
        for (let k = 0; k < 4; k++){
          const wk = sw.getComponent(i, k);
          if (wk <= 0) continue;
          const b = bones[si.getComponent(i, k)];
          const c = b ? BONE_CLASS[b.name] : null;
          if (!c) continue;
          w[c] = (w[c] || 0) + wk;
          if (w[c] > best){ best = w[c]; cls = c; }
        }
      }
      return { part: table[`${tag},${fx},${fy},${cls}`], fx, fy, u, v };
    };
    for (let i = 0; i < uv.count; i++){
      const { part, fx, fy, u, v } = partAt(i);
      const pick = part && BY_ID.get(colors[part]);
      if (!pick) continue;
      uv.setXY(i, u + (pick.f[0] - fx) * fw / TEX,
                  v + (pick.f[1] - fy) * fh / TEX);
    }
    uv.needsUpdate = true;
  });
}

/**
 * 안경 색 — 본체 recolor 와 달리 부위 표가 없어 **테의 계열**을 기하로 찾는다.
 * 안경다리는 귀까지 뻗으므로 |x| 가 가장 큰 정점이 반드시 테다. 그 정점의
 * 팔레트 계열과 같은 계열만 목표 색으로 옮긴다 — 렌즈(다른 계열)는 남는다.
 */
function shiftFrameUVs(geom, indices, colorId){
  const pick = BY_ID.get(colorId);
  if (!pick || !PART_CELLS || !geom.attributes.uv) return;
  const [fw, fh] = PART_CELLS.family, TEX = 512;
  const uv = geom.attributes.uv, pos = geom.attributes.position;
  const list = indices || Array.from({length: uv.count}, (_, i) => i);
  if (!list.length) return;
  let far = list[0];
  for (const i of list) if (Math.abs(pos.getX(i)) > Math.abs(pos.getX(far))) far = i;
  const fam = i => [Math.floor(Math.min(Math.floor(uv.getX(i) * TEX), TEX - 1) / fw),
                    Math.floor(Math.min(Math.floor(uv.getY(i) * TEX), TEX - 1) / fh)];
  const [ffx, ffy] = fam(far);
  for (const i of list){
    const [gx, gy] = fam(i);
    if (gx !== ffx || gy !== ffy) continue;
    uv.setXY(i, uv.getX(i) + (pick.f[0] - gx) * fw / TEX,
                uv.getY(i) + (pick.f[1] - gy) * fh / TEX);
  }
  uv.needsUpdate = true;
}

/** 머리 색 대신 고를 수 있는 '없음'. 색이 아니라 상태라 id 를 따로 둔다. */
export const BALD = 'none';

/**
 * 대머리 — 머리카락 삼각형을 인덱스에서 뺀다. 정점을 지우는 게 아니라 그리지
 * 않는 것이라 스키닝·뼈는 그대로다. 머리 밑에 두피 면이 닫혀 있어 구멍은 안 뚫린다.
 *
 * 무엇이 머리카락인지는 **런타임이 추측하지 않는다.** 색으로 찾으면 눈썹·입이
 * 같은 색일 때 딸려오고, 모자 장식이 다른 색이면 안 딸려온다. 오프라인에서
 * 메시를 연결 요소로 쪼개 머리카락 덩어리를 골라 두고(scripts/campus-part-cells.py),
 * 여기서는 그 정점 목록을 읽기만 한다.
 */
function makeBald(mesh, modelName){
  const hide = PART_CELLS && PART_CELLS.bald && PART_CELLS.bald[modelName];
  const g = mesh.geometry, idx = g.index;
  if (!hide || !hide.length || !idx) return;
  const drop = new Set(hide);
  const keep = [];
  for (let t = 0; t < idx.count; t += 3){
    const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
    if (drop.has(a) || drop.has(b) || drop.has(c)) continue;
    keep.push(a, b, c);
  }
  g.setIndex(keep);
}

// ══ 소품 ══════════════════════════════════════════════════════════
//
//  같은 팩(mini-characters)의 접근성 소품이다. 캐릭터와 달리 **뼈가 없는 정적
//  메시**고, 전부 원점에 놓여 있다 — 붙일 자리는 우리가 정해야 한다.
//
//  자리는 눈대중이 아니라 실측이다. male-a·male-e 는 안경이 메시에 박혀 있는데,
//  그 렌즈의 위치가 곧 정답이다(y 0.468~0.514 · z -0.019~0.170). 소품 안경은
//  폭·깊이가 그것과 일치한다 — 같은 모델을 원점에 옮겨 둔 것이다.
//
//  offset 은 **머리 뼈 기준**이다. 머리 뼈는 12종 모두 (0, 0.343, -0.003) 에 있고
//  회전이 없다. 뼈에 붙여야 끄덕임·점프에서 같이 움직인다.
//
//  마스크(aid-mask)와 보청기(aid_hearing)는 뺐다 — 마스크는 튜브 달린 의료용
//  산소마스크고, 보청기는 캠퍼스 카메라 거리에서 보이지 않는다.
const AID_BASE = BASE + 'aid/';
export const ACCESSORIES = [
  {id:'glasses',    name:'안경',   file:'aid-glasses',    offset:[0, 0.100, 0.079]},
  {id:'sunglasses', name:'선글라스', file:'aid-sunglasses', offset:[0, 0.100, 0.079]},
];
const aidCache = new Map();

export async function ensureAid(id){
  const a = ACCESSORIES.find(x => x.id === id);
  if (!a || aidCache.has(id)) return !!a;
  const gltf = await loader.loadAsync(AID_BASE + a.file + '.glb');
  prepare(gltf.scene);                        // NearestFilter — 소품도 같은 팔레트다
  aidCache.set(id, gltf.scene);
  return true;
}

export async function preloadAids(){
  await Promise.all(ACCESSORIES.map(a => ensureAid(a.id).catch(() => false)));
}

/** 이 캐릭터가 안경을 이미 쓰고 있나 — 소품 안경을 또 씌우면 두 겹이 된다. */
export function hasBuiltinGlasses(modelName){
  return !!(PART_CELLS && (PART_CELLS.builtinGlasses || []).includes(modelName));
}

function attachAid(model, id, owned, colorId){
  const a = ACCESSORIES.find(x => x.id === id);
  const src = a && aidCache.get(id);
  if (!src) return;
  let head = null;
  model.traverse(o => { if (o.isBone && o.name === 'head') head = o; });
  if (!head) return;
  const node = src.clone(true);
  node.traverse(o => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.material = bendIf(o.material.clone());    // 곡면은 캐릭터와 같이 굽어야 한다
    owned.push(o.material);
    if (colorId){
      o.geometry = o.geometry.clone();          // UV 를 만지니 공유를 끊는다
      owned.push(o.geometry);
      shiftFrameUVs(o.geometry, null, colorId);
    }
  });
  node.position.set(a.offset[0], a.offset[1], a.offset[2]);
  head.add(node);
}

/** 맵 마운트 전에 한 번. buildAvatar 가 동기라 기본 캐릭터는 미리 받아 둔다. */
export async function preload(){
  // 표는 색을 쓸 때만 필요하다. 못 받아도 캐릭터는 그대로 선다.
  if (!PART_CELLS){
    try { PART_CELLS = await (await fetch(BASE + 'part-cells.json')).json(); }
    catch { PART_CELLS = null; }
  }
  await load(DEFAULT_MODEL);                 // 클립도 여기서 들어온다
  return cache.get(DEFAULT_MODEL);
}

/** 12종 전부 받아 둔다 — 캐릭터 고르기 화면을 열 때 한 번. */
export async function preloadAll(){
  await Promise.all(MODELS.map(n => load(n).catch(() => null)));
}

/**
 * 같은 모양을 두 번 보여 주지 않는다.
 *
 * Kenney 캐릭터 12종은 얼굴·옷은 다 다르지만 **표정은 네 가지뿐**이다
 * (남자 다섯이 한 벌, male-f 한 벌, 여자 다섯이 한 벌, female-f 한 벌).
 * 머리카락도 male-b 와 male-d 가 같다. 열두 칸을 늘어놓으면 고르는 사람은
 * "왜 다 똑같지" 하고 자기 눈을 의심한다 — 뽑을 때 미리 접는다.
 *
 * 판단 근거는 **정점 좌표**다. 이름이나 손으로 적은 표가 아니라 실제 기하라
 * 에셋이 바뀌면 결과도 따라 바뀐다.
 *
 * 아직 안 받아진 모델이 있으면 접지 않고 전부 돌려준다 — 반쯤 받아진 상태에서
 * 접으면 "같다"는 판단 자체가 틀린다. 다 받아진 뒤 다시 그릴 때 접힌다.
 */
const distinctCache = new Map();
export function distinctModels(part){
  // 'face'·'bald' 는 그 부위의 정점만, 'base'·'body' 는 메시 전체를 지문으로 삼는다.
  if (distinctCache.has(part)) return distinctCache.get(part);
  if (!MODELS.every(m => cache.has(m))) return MODELS;
  const whole = part === 'base' || part === 'body';
  const cells = PART_CELLS && PART_CELLS[part];
  if (!whole && !cells) return MODELS;
  const prefix = part === 'body' ? 'b' : 'h';
  const seen = new Map(), out = [];
  for (const m of MODELS){
    const e = cache.get(m);
    let mesh = null;
    e.scene.traverse(o => { if (o.isMesh && o.name.charAt(0) === prefix) mesh = o; });
    const p = mesh && mesh.geometry.attributes.position.array;
    if (!p){ out.push(m); continue; }
    let h = 0;
    if (whole){ for (let i = 0; i < p.length; i++) h = (h * 31 + Math.round(p[i] * 1e4)) | 0; }
    else {
      const list = cells[m] || [];
      if (!list.length){ out.push(m); continue; }
      for (const i of list)
        for (let a = 0; a < 3; a++) h = (h * 31 + Math.round(p[i * 3 + a] * 1e4)) | 0;
    }
    if (seen.has(h)) continue;
    seen.set(h, m); out.push(m);
  }
  distinctCache.set(part, out);
  return out;
}

// ── 만든 표정 ────────────────────────────────────────────────────────
//  Kenney 12종이 가진 표정은 넷뿐이다(다섯 명이 한 벌을 돌려쓴다). 눈썹과 입은
//  얼굴 앞면에 붙은 **납작한 판**이라, 에셋 없이 도형만 그려도 같은 화법이 된다.
//  좌표는 손으로 적지 않는다 — 두개골이 12종 공통이므로, 기본 모델의 원래
//  눈썹·입 위치를 재서 그 자리에 그린다(anchorFace). 에셋이 바뀌면 따라 움직인다.
export const SYNTH_FACES = [
  {id:'grin', name:'활짝'}, {id:'wow', name:'놀람'}, {id:'sad', name:'시무룩'},
  {id:'flat', name:'무표정'}, {id:'cat', name:'야옹'},
];
export function faceOptions(){
  return distinctModels('face').concat(SYNTH_FACES.map(f => f.id));
}
//  ⚠ 자리는 **얼굴마다 다시 잰다.** 기본 모델 한 번만 재서 쓰면, 머리가 작은
//    얼굴(male-c 는 눈 높이가 male-a 보다 0.14 낮다)에서 표정이 허공에 뜨고,
//    얼굴이 얕은 쪽에서는 표정 판이 앞으로 튀어나와 **안경을 가린다**.
const faceAnchor = new Map();
function anchorFace(name){
  if (faceAnchor.has(name)) return faceAnchor.get(name);
  const cells = PART_CELLS && PART_CELLS.face && PART_CELLS.face[name];
  const e = cache.get(name);
  if (!cells || !cells.length || !e) return null;
  let hm = null;
  e.scene.traverse(o => { if (o.isMesh && o.name.charAt(0) === 'h') hm = o; });
  if (!hm) return null;
  const p = hm.geometry.attributes.position;
  const pts = cells.map(i => [p.getX(i), p.getY(i), p.getZ(i)]);
  let ymin = 1e9, ymax = -1e9, zmax = -1e9;
  for (const [, y, z] of pts){ ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); zmax = Math.max(zmax, z); }
  const ymid = (ymin + ymax) / 2;
  const box = () => ({x0:1e9, x1:-1e9, y0:1e9, y1:-1e9});
  const brow = box(), mouth = box();
  for (const [x, y] of pts){
    const b = y > ymid ? brow : mouth;
    b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x);
    b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y);
  }
  const mid = b => ({cx:(b.x0 + b.x1) / 2, cy:(b.y0 + b.y1) / 2, w:b.x1 - b.x0, h:b.y1 - b.y0});
  const a = {z: zmax + 0.002, brow: mid(brow), mouth: mid(mouth)};
  faceAnchor.set(name, a);
  return a;
}
//  도형 셋 — 호(웃음·울상), 기운 막대(눈썹), 점(놀란 입)
function shpArc(cx, cy, r, a0, a1, w){
  const s = new THREE.Shape();
  s.absarc(cx, cy, r + w / 2, a0, a1, false);
  s.absarc(cx, cy, Math.max(0.001, r - w / 2), a1, a0, true);
  return s;
}
function shpBar(cx, cy, w, h, rot = 0){
  const s = new THREE.Shape(), c = Math.cos(rot), n = Math.sin(rot);
  const pts = [[-w/2, -h/2], [w/2, -h/2], [w/2, h/2], [-w/2, h/2]]
    .map(([x, y]) => [cx + x * c - y * n, cy + x * n + y * c]);
  s.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) s.lineTo(x, y);
  s.closePath();
  return s;
}
function shpDot(cx, cy, rx, ry){
  const s = new THREE.Shape();
  s.absellipse(cx, cy, rx, ry, 0, Math.PI * 2, false, 0);
  return s;
}
const PI = Math.PI;
function synthShapes(id, a){
  //  위 덩어리는 눈썹이 아니라 **눈**이다(8정점 팔각형 둘). 표정을 지우면 눈도
  //  같이 사라지므로, 만든 표정은 눈과 입을 **둘 다** 그려야 한다.
  const E = a.brow, M = a.mouth;
  const ex = E.w * 0.31, ew = E.w * 0.19, eh = Math.max(0.012, E.h * 0.5);
  const eye = (shape) => {                       // 좌우 한 쌍
    const mk = (sx) => {
      const s2 = new THREE.Shape();
      if (shape === 'round') s2.absellipse(sx, E.cy, ew, eh * 1.25, 0, PI * 2, false, 0);
      else if (shape === 'wide') s2.absellipse(sx, E.cy, ew * 1.18, eh * 1.6, 0, PI * 2, false, 0);
      else if (shape === 'droop')
        s2.absellipse(sx, E.cy, ew, eh, 0, PI * 2, false, sx < 0 ? 0.42 : -0.42);
      return s2;
    };
    if (shape === 'lid')                          // 반쯤 감은 눈 — 가로 막대
      return [shpBar(-ex + E.cx, E.cy, ew * 2.1, eh * 0.7),
              shpBar(ex + E.cx, E.cy, ew * 2.1, eh * 0.7)];
    if (shape === 'happy')                        // 웃어서 감긴 눈 — ∩ 호
      return [shpArc(-ex + E.cx, E.cy - eh * 0.5, ew, PI * 0.15, PI * 0.85, eh * 0.65),
              shpArc(ex + E.cx, E.cy - eh * 0.5, ew, PI * 0.15, PI * 0.85, eh * 0.65)];
    return [mk(-ex + E.cx), mk(ex + E.cx)];
  };
  const r = M.w * 0.42, t = Math.max(0.012, M.h * 0.55);
  const grinMouth = () => {                       // 웃느라 벌린 입 — 아래가 둥근 반원
    const s2 = new THREE.Shape();
    s2.moveTo(M.cx - r, M.cy + r * 0.30);
    s2.lineTo(M.cx + r, M.cy + r * 0.30);
    s2.absarc(M.cx, M.cy + r * 0.30, r, 0, PI, true);
    s2.closePath();
    return s2;
  };
  switch (id){
    case 'grin': return [...eye('happy'), grinMouth()];
    case 'wow':  return [...eye('wide'), shpDot(M.cx, M.cy, M.w * 0.16, M.w * 0.20)];
    case 'sad':  return [...eye('droop'),
                         shpArc(M.cx, M.cy - r * 0.45, r, PI * 0.22, PI * 0.78, t * 1.2)];
    case 'flat': return [...eye('lid'), shpBar(M.cx, M.cy, M.w * 0.58, t)];
    case 'cat':  return [...eye('round'),
                         shpArc(M.cx - r * 0.40, M.cy - r * 0.15, r * 0.42, PI * 0.10, PI * 0.95, t * 0.8),
                         shpArc(M.cx + r * 0.40, M.cy - r * 0.15, r * 0.42, PI * 0.05, PI * 0.90, t * 0.8)];
  }
  return null;
}
function synthFace(baseHeadMesh, id, owned, baseName){
  const a = anchorFace(baseName);
  const shapes = a && synthShapes(id, a);
  if (!shapes) return null;
  const g = new THREE.ShapeGeometry(shapes, 10);
  g.translate(0, 0, a.z);
  //  전부 head 뼈에 100%로 묶는다 — 원래 눈썹·입도 그랬다
  const n = g.attributes.position.count;
  const head = new Map(baseHeadMesh.skeleton.bones.map((b, i) => [b.name, i])).get('head') || 0;
  const di = new Uint16Array(n * 4), dw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++){ di[i * 4] = head; dw[i * 4] = 1; }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(di, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(dw, 4));
  const mesh = new THREE.SkinnedMesh(g,
    bendIf(new THREE.MeshLambertMaterial({color: 0x2c2c31})));
  mesh.name = 'face-synth';
  mesh.frustumCulled = false;
  mesh.position.copy(baseHeadMesh.position);
  mesh.quaternion.copy(baseHeadMesh.quaternion);
  mesh.scale.copy(baseHeadMesh.scale);
  mesh.bind(baseHeadMesh.skeleton, baseHeadMesh.bindMatrix);
  owned.push(g, mesh.material);
  return mesh;
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

// ══ 조합 ═══════════════════════════════════════════════════════════
//
//  12종을 통째로 고르는 대신 **얼굴 · 헤어 · 옷** 셋으로 쪼갠다. 근거는 에셋이다:
//   · 두개골+귀가 11/12 바이트 단위로 동일하다 → 남의 머리카락이 정확히 맞는다
//     (female-f 만 귀가 살짝 다르다)
//   · 뼈 7개가 이름까지 같다 → 남의 몸을 그대로 물릴 수 있다
//  상의/하의/신발을 따로 떼는 건 안 된다 — 덩어리가 부위와 안 맞는다.
//
//  look = {base, head, body}. 옛 look.model 은 셋 다 그 값으로 편다.

/** 옛 저장분(model 하나)과 새 저장분(base/head/body)을 한 모양으로 만든다. */
export function resolveLook(look = {}){
  const fb = MODELS.includes(look.model) ? look.model : DEFAULT_MODEL;
  const pick = (v) => MODELS.includes(v) ? v : fb;
  const base = pick(look.base);
  // 안경(eyewear): 'own'(얼굴에 붙은 그대로) · 'none'(안 씀) · 소품 id.
  //  ⚠ 옛 코드-아바타의 look.glasses 는 **불리언**이다. 같은 이름을 쓰면 NPC 의
  //    glasses:true 가 여기로 흘러 들어와 안경을 벗겨 버린다 — 이름을 갈라 둔다.
  // 얼굴에 안경이 없으면 'own' 과 'none' 은 같은 그림이다 — 하나로 모아
  // 두어야 고르기 화면에서 "지금 이거" 표시가 어디에도 안 붙는 일이 없다.
  //  옛 저장분의 aid 는 안경 소품이었다. 그대로 두면 얼굴에 박힌 안경 위에
  //  한 겹 더 씌워져 두 개가 겹친다 — 새 칸으로 옮겨 읽는다.
  let eyewear = look.eyewear || look.aid || 'own';
  if (eyewear === 'own' && !hasBuiltinGlasses(base)) eyewear = 'none';
  return {
    base,
    head: look.head === BALD ? BALD : pick(look.head),
    body: pick(look.body),
    // ⚠ 표정만은 fb(기본 모델)로 떨어지면 안 된다. 표정을 안 고른 캐릭터가
    //   전부 male-a 의 입을 달게 된다 — 제 얼굴을 기본값으로 둔다.
    face: (MODELS.includes(look.face) || SYNTH_FACES.some(f => f.id === look.face))
            ? look.face : base,
    eyewear,
  };
}

/**
 * 머리카락 이식 — head 모델의 머리카락 덩어리만 떼어 base 스켈레톤에 물린다.
 *
 * 정점 목록은 대머리에 쓰는 것과 **같은 목록**이다(오프라인에서 연결 요소로
 * 골라 둔 것). 떼는 쪽과 붙이는 쪽이 같은 근거를 쓰므로 어긋날 일이 없다.
 *
 * ⚠ 뼈 순서는 모델마다 다를 수 있다. 번호를 그대로 쓰면 머리카락이 엉뚱한 뼈를
 *   따라간다 — 이름으로 다시 짝지어 skinIndex 를 고쳐 쓴다.
 */
function graftHair(baseHeadMesh, headName, owned){
  const hide = PART_CELLS && PART_CELLS.bald && PART_CELLS.bald[headName];
  const entry = cache.get(headName);
  if (!hide || !hide.length || !entry) return null;
  let src = null;
  entry.scene.traverse(o => { if (o.isMesh && o.name.charAt(0) === 'h') src = o; });
  if (!src || !src.geometry.index) return null;

  const keep = new Set(hide);
  const g = src.geometry, idx = g.index;
  const remap = new Map();                       // 원본 정점 → 새 정점
  const tri = [];
  for (let t = 0; t < idx.count; t += 3){
    const v = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
    if (!v.every(i => keep.has(i))) continue;     // 머리카락 삼각형만
    for (const i of v){
      if (!remap.has(i)) remap.set(i, remap.size);
      tri.push(remap.get(i));
    }
  }
  if (!tri.length) return null;

  // 뼈 이름 → base 스켈레톤에서의 번호
  const baseBones = baseHeadMesh.skeleton.bones;
  const byName = new Map(baseBones.map((b, i) => [b.name, i]));
  const srcBones = src.skeleton.bones;

  const n = remap.size;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']){
    const a = g.attributes[name];
    if (!a) continue;
    const dst = new Float32Array(n * a.itemSize);
    for (const [from, to] of remap)
      for (let k = 0; k < a.itemSize; k++) dst[to * a.itemSize + k] = a.getComponent(from, k);
    out.setAttribute(name, new THREE.BufferAttribute(dst, a.itemSize));
  }
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const di = new Uint16Array(n * 4), dw = new Float32Array(n * 4);
  for (const [from, to] of remap){
    for (let k = 0; k < 4; k++){
      const b = srcBones[si.getComponent(from, k)];
      di[to * 4 + k] = (b && byName.has(b.name)) ? byName.get(b.name) : 0;
      dw[to * 4 + k] = sw.getComponent(from, k);
    }
  }
  out.setAttribute('skinIndex', new THREE.BufferAttribute(di, 4));
  out.setAttribute('skinWeight', new THREE.BufferAttribute(dw, 4));
  out.setIndex(tri);

  const mesh = new THREE.SkinnedMesh(out, bendIf(src.material.clone()));
  mesh.name = 'hair-graft';
  mesh.frustumCulled = false;
  // ⚠ 원본 메시의 로컬 변환을 그대로 물려받아야 한다. 새 메시는 기본이 항등이라
  //   원본에 위치·회전·크기가 걸려 있으면 엉뚱한 자리에 서거나 사라진다.
  mesh.position.copy(src.position);
  mesh.quaternion.copy(src.quaternion);
  mesh.scale.copy(src.scale);
  mesh.bind(baseHeadMesh.skeleton, baseHeadMesh.bindMatrix);
  owned.push(out, mesh.material);
  return mesh;
}

/**
 * 표정 이식 — face 모델의 눈썹·입 덩어리만 떼어 base 스켈레톤에 물린다.
 * 머리카락(graftHair)과 같은 방식이고, 쓰는 목록만 다르다(PART_CELLS.face).
 */
function graftPart(baseHeadMesh, srcName, listKey, tag, owned){
  const hide = PART_CELLS && PART_CELLS[listKey] && PART_CELLS[listKey][srcName];
  const entry = cache.get(srcName);
  if (!hide || !hide.length || !entry) return null;
  let src = null;
  entry.scene.traverse(o => { if (o.isMesh && o.name.charAt(0) === 'h') src = o; });
  if (!src || !src.geometry.index) return null;
  const keep = new Set(hide), g = src.geometry, idx = g.index;
  const remap = new Map(); const tri = [];
  for (let t = 0; t < idx.count; t += 3){
    const v = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
    if (!v.every(i => keep.has(i))) continue;
    for (const i of v){
      if (!remap.has(i)) remap.set(i, remap.size);
      tri.push(remap.get(i));
    }
  }
  if (!tri.length) return null;
  const byName = new Map(baseHeadMesh.skeleton.bones.map((b, i) => [b.name, i]));
  const srcBones = src.skeleton.bones;
  const n = remap.size, out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']){
    const a = g.attributes[name];
    if (!a) continue;
    const dst = new Float32Array(n * a.itemSize);
    for (const [from, to] of remap)
      for (let k = 0; k < a.itemSize; k++) dst[to * a.itemSize + k] = a.getComponent(from, k);
    out.setAttribute(name, new THREE.BufferAttribute(dst, a.itemSize));
  }
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const di = new Uint16Array(n * 4), dw = new Float32Array(n * 4);
  for (const [from, to] of remap)
    for (let k = 0; k < 4; k++){
      const b = srcBones[si.getComponent(from, k)];
      di[to * 4 + k] = (b && byName.has(b.name)) ? byName.get(b.name) : 0;
      dw[to * 4 + k] = sw.getComponent(from, k);
    }
  out.setAttribute('skinIndex', new THREE.BufferAttribute(di, 4));
  out.setAttribute('skinWeight', new THREE.BufferAttribute(dw, 4));
  out.setIndex(tri);
  const mesh = new THREE.SkinnedMesh(out, bendIf(src.material.clone()));
  mesh.name = tag;
  mesh.frustumCulled = false;
  mesh.position.copy(src.position);
  mesh.quaternion.copy(src.quaternion);
  mesh.scale.copy(src.scale);
  mesh.bind(baseHeadMesh.skeleton, baseHeadMesh.bindMatrix);
  owned.push(out, mesh.material);
  return mesh;
}

/** 정점 목록에 든 삼각형을 인덱스에서 뺀다(대머리·표정 지우기·안경 벗기기 공용). */
function hideVerts(mesh, list){
  const idx = mesh.geometry.index;
  if (!list || !list.length || !idx) return;
  const drop = new Set(list), keep = [];
  for (let t = 0; t < idx.count; t += 3){
    const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
    if (drop.has(a) || drop.has(b) || drop.has(c)) continue;
    keep.push(a, b, c);
  }
  mesh.geometry.setIndex(keep);
}

/** 몸 갈아입기 — body 모델의 몸 메시로 바꿔 끼운다. 뼈 이름이 같아 그대로 물린다. */
function swapBody(model, bodyName, owned){
  const entry = cache.get(bodyName);
  if (!entry) return null;
  let src = null, cur = null;
  entry.scene.traverse(o => { if (o.isMesh && o.name.charAt(0) === 'b') src = o; });
  model.traverse(o => { if (o.isMesh && o.name.charAt(0) === 'b') cur = o; });
  if (!src || !cur) return null;

  const baseBones = cur.skeleton.bones;
  const byName = new Map(baseBones.map((b, i) => [b.name, i]));
  const srcBones = src.skeleton.bones;
  const g = src.geometry.clone();
  const si = g.attributes.skinIndex;
  for (let i = 0; i < si.count; i++)
    for (let k = 0; k < 4; k++){
      const b = srcBones[si.getComponent(i, k)];
      si.setComponent(i, k, (b && byName.has(b.name)) ? byName.get(b.name) : 0);
    }
  si.needsUpdate = true;

  const mesh = new THREE.SkinnedMesh(g, bendIf(src.material.clone()));
  mesh.name = src.name;
  mesh.frustumCulled = false;
  mesh.position.copy(src.position);
  mesh.quaternion.copy(src.quaternion);
  mesh.scale.copy(src.scale);
  mesh.bind(cur.skeleton, cur.bindMatrix);
  cur.parent.add(mesh);
  cur.parent.remove(cur);
  owned.push(g, mesh.material);
  return mesh;
}

/**
 * @param look {model, colors, aid} — model 은 12종 중 하나.
 *             colors 는 {skin, hair, top, bottom} → PALETTE 의 id. 없으면 원래 색.
 *             aid 는 ACCESSORIES 의 id 하나(머리에 붙는다). 없으면 안 붙인다.
 * @param body (미사용)
 */
export function buildAvatar(look = {}, body = null, opts = {}){
  FLAT = !!opts.flat;                      // 무대·썸네일은 굽히지 않는다
  const L = resolveLook(look);
  const name = L.base;
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
    o.material = bendIf(o.material.clone());
    owned.push(o.material);
  });

  // ── 조합 ── 순서가 있다: 몸을 갈아입고 · 머리를 갈아 끼운 뒤 · 색을 칠한다.
  //   색은 **최종 메시** 기준으로 부위를 찾아야 하므로 마지막이다.
  if (L.body !== name) swapBody(model, L.body, owned);

  let headMesh = null;
  model.traverse(o => { if (o.isMesh && o.name.charAt(0) === 'h') headMesh = o; });
  // 이식할 머리가 아직 안 받아졌으면 **아무것도 하지 않는다**. 원래 머리를 지우고
  // 이식만 실패하면 대머리로 서는데, 그건 저장한 모습이 아니다.
  const headReady = L.head === BALD || cache.has(L.head);
  if (headMesh && L.head !== name && headReady){
    // 원래 머리카락을 감춘다(대머리와 같은 목록). geometry 는 공유물이라 먼저 복제한다.
    headMesh.geometry = headMesh.geometry.clone();
    owned.push(headMesh.geometry);
    makeBald(headMesh, name);
    if (L.head !== BALD){
      const hair = graftHair(headMesh, L.head, owned);
      if (hair) headMesh.parent.add(hair);
    }
  }

  // ── 표정·안경 ── 얼굴에 붙어 세트로 딸려 오던 것들을 떼어 낸다.
  //   표정: base 의 눈썹·입을 지우고 face 모델 것을 얹는다
  //   안경: 얼굴에 박힌 안경을 벗길 수 있다('none'). 벗어야 소품 안경을 씌운다
  if (headMesh){
    const synth = SYNTH_FACES.some(f => f.id === L.face);
    const wantFace = synth || (L.face !== name && cache.has(L.face));
    const dropGlass = L.eyewear !== 'own';
    if (wantFace || dropGlass){
      if (!owned.includes(headMesh.geometry)){
        headMesh.geometry = headMesh.geometry.clone();
        owned.push(headMesh.geometry);
      }
      if (wantFace){
        hideVerts(headMesh, PART_CELLS && PART_CELLS.face && PART_CELLS.face[name]);
        const f = synth ? synthFace(headMesh, L.face, owned, name)
                        : graftPart(headMesh, L.face, 'face', 'face-graft', owned);
        if (f) headMesh.parent.add(f);
      }
      if (dropGlass)
        hideVerts(headMesh, PART_CELLS && PART_CELLS.glasses && PART_CELLS.glasses[name]);
    }
  }

  // 색을 고른 사람만 geometry 를 복제한다. 안 골랐으면 원본 UV 를 그대로 공유한다.
  if (look.colors && Object.keys(look.colors).length) recolor(model, L, look.colors, owned);
  const gcol = look.colors && look.colors.glass;
  if (gcol && L.eyewear === 'own' && headMesh){    // 얼굴에 박힌 안경을 칠한다
    if (!owned.includes(headMesh.geometry)){
      headMesh.geometry = headMesh.geometry.clone();
      owned.push(headMesh.geometry);
    }
    shiftFrameUVs(headMesh.geometry,
                  PART_CELLS && PART_CELLS.glasses && PART_CELLS.glasses[name], gcol);
  }
  const wear = (L.eyewear !== 'own' && L.eyewear !== 'none') ? L.eyewear : null;
  if (wear) attachAid(model, wear, owned, gcol);

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
  FLAT = false;
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
  // 텍스처는 캐시된 템플릿 것을 공유한다. 복제한 것만 버린다 —
  // 재질은 항상, geometry 는 색을 골라 UV 를 고쳤을 때만 복제돼 있다.
  rig.owned.forEach(m => m.dispose());
  rig.root.parent && rig.root.parent.remove(rig.root);
}
