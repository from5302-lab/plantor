// ══════════════════════════════════════════════════════════════════
//  Kenney 키트 로더 — 건물·나무·소품 GLB 를 받아 캠퍼스 씬에 심는다.
//
//  모델은 전부 CC0 (kenney.nl). City Kit Suburban / Nature Kit 계열은
//  캐릭터와 **같은 팔레트 텍스처 문법**을 쓴다 — 512×512 색칸 아틀라스라
//  NearestFilter 가 아니면 경계마다 색이 섞인다.
//
//  원본 크기가 1~1.5 유닛(타일 단위)이라 캠퍼스 미터 좌표에 맞춰 재스케일한다.
//  스케일은 '높이'가 아니라 **바닥 가로폭**을 기준으로 잡는다 — 건물은 바닥
//  면적이 정해져 있고(충돌 상자), 지붕 높이는 모델마다 다르기 때문이다.
// ══════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { bend } from '/campus/lib/curve.js';

const BASE = '/campus/models/kenney/kit/';

// Nature Kit 은 팔레트가 민트 계열이라 City Kit(건물·나무)과 색이 안 맞는다.
// 두 팩을 섞어 쓰되, 'grass' 재질만 City Kit 잔디색으로 덮어 톤을 통일한다.
export const GRASS = 0x61cb8b;          // City Kit Suburban 팔레트에서 실측한 잔디색
export const DIRT  = 0xd8a878;          // 흙 — 같은 팔레트의 베이지(#f2bf99)를 한 톤 눌렀다

// Nature/Furniture Kit 은 팔레트가 민트·주황 계열이라 City Kit(건물·캐릭터)과 안 맞는다.
// 재질 **이름**으로 색을 덮어 한 팔레트로 모은다. 이름은 각 팩이 일관되게 붙여 놨다.
const RECOLOR = {
  grass: GRASS, leafsGreen: GRASS, leafsDark: 0x4a9e6b,   // 잎
  woodBark: 0x9a6b45, woodBarkDark: 0x84593a,             // 나무 줄기
  wood: 0xdcb98d, dirt: DIRT, dirtDark: 0xbf8d63,         // 목재·흙
  carpet: 0xd98f7a,                                        // 패브릭
  // Furniture Kit 벽은 색 없는 기본 재질이라 그대로 두면 새하얗다 — 크림으로 눕힌다
  _defaultMat: 0xf1eee5, metal: 0xc9d0d2, metalDark: 0x8b9698,
};
const loader = new GLTFLoader();
const cache = new Map();          // 이름 → {scene, size:Vector3}

function prep(scene){
  //  냉장 쇼케이스 — 전처리가 문짝 계열을 `fridge-glass` 로 갈라 뒀다
  //  (campus-prep-kit.py KIT_SPLIT). 문을 비치게 하려면 몸통을 **양면**으로
  //  둬야 한다. 케니 모델은 껍데기라, 앞면만 그리면 유리 너머로 세상이 비친다.
  let glass = false;
  scene.traverse(o => { if (o.isMesh && o.material?.name === 'fridge-glass') glass = true; });
  scene.traverse(o => {

    if (!o.isMesh) return;
    const m = o.material;
    if (!m) return;
    // ⚠ glTF 는 metallicFactor 기본값이 1 이다. 텍스처 없는 Nature Kit 모델은
    //   환경맵이 없는 이 씬에서 **새까맣게** 렌더된다(실측). 전부 비금속으로 눕힌다.
    m.metalness = 0;
    m.roughness = 0.9;
    const rc = RECOLOR[m.name];
    if (rc !== undefined) m.color.setHex(rc);
    // 이 씬은 광원이 약하다(캐릭터 툰 셰이딩이 포화되지 않게 일부러 낮췄다).
    // 텍스처 없는 키트 모델은 그대로 두면 실내에서 흙빛으로 가라앉는다 —
    // 맵 재질(lam)과 같은 방식으로 자체발광을 조금 얹어 밝기를 맞춘다.
    // 텍스처가 있는 모델은 이미 밝게 읽히므로 건드리지 않는다(얹으면 색이 뜬다).
    if (!m.map && m.emissive) m.emissive.copy(m.color).multiplyScalar(0.3);
    //  가로등 등갓 — 전처리가 채도로 갈라 둔 면이다(campus-prep-kit.py KIT_GLOW).
    //  낮에는 0 이고, 밤이 되면 map.js 가 세기를 올린다.
    if (m.name === 'lamp-glow' && m.emissive){
      m.emissive.setHex(0xffd08a);
      m.emissiveIntensity = 0;
    }
    if (glass){
      if (m.name === 'fridge-glass'){
        m.transparent = true;
        m.opacity = 0.3;
        m.color.setHex(0xdfeaf6);
        m.depthWrite = false;          // 뒤에 든 음료가 문에 가려 사라지지 않게
        m.roughness = 0.35;
      } else {
        m.side = THREE.DoubleSide;     // 유리 너머로 안쪽 면이 보여야 한다
      }
    }
    if (m.map){
      m.map.magFilter = THREE.NearestFilter;
      m.map.minFilter = THREE.NearestFilter;
      m.map.generateMipmaps = false;
      m.map.needsUpdate = true;
    }
  });
  return scene;
}

export async function loadKit(names){
  await Promise.all(names.map(async n => {
    if (cache.has(n)) return;
    const gltf = await loader.loadAsync(BASE + n + '.glb');
    const scene = prep(gltf.scene);
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    cache.set(n, {scene, size: box.getSize(new THREE.Vector3()), min: box.min.clone()});
  }));
}

export const kitSize = name => cache.get(name)?.size || null;

/** 모델의 첫 재질 색 — 큰 판을 키트 색에 맞출 때 쓴다(타일 수천 장 대신). */
export function kitColor(name){
  const e = cache.get(name);
  if (!e) return null;
  let c = null;
  e.scene.traverse(o => { if (!c && o.isMesh && o.material?.color) c = o.material.color.clone(); });
  return c;
}

/**
 * 같은 모델을 여러 곳에 깔 때 쓴다 — 타일 수백 장을 드로우콜 한 줌으로 묶는다.
 * @param name
 * @param spots [{x, z, yaw?, scale?}]
 * @param opts  {scale(기본 배수), track}
 * @returns {THREE.Group|null}
 */
export function placeKitInstanced(name, spots, opts = {}){
  const entry = cache.get(name);
  if (!entry || !spots.length) return null;
  const base = opts.scale ?? 1;
  const group = new THREE.Group();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3();

  // 서브메시마다 InstancedMesh 를 하나씩 만든다(재질이 갈리면 합칠 수 없다)
  entry.scene.updateMatrixWorld(true);
  entry.scene.traverse(o => {
    if (!o.isMesh) return;
    const mat = bend(o.material.clone());
    opts.track && opts.track(mat);
    const inst = new THREE.InstancedMesh(o.geometry, mat, spots.length);
    inst.frustumCulled = false;
    // 서브메시가 모델 안에서 갖는 로컬 변환을 미리 반영한다
    const local = o.matrixWorld.clone();
    for (let i = 0; i < spots.length; i++){
      const sp = spots[i];
      const s = (sp.scale ?? 1) * base;
      //  축마다 다른 배율. 벽처럼 **길이만 늘려야 하는 것**에 쓴다 — 균등 배율로
      //  늘리면 긴 조각은 두껍고 높아지고 짧은 조각은 얇고 낮아져서, 조각끼리
      //  높이가 안 맞고 모서리가 어긋난다(실내 벽에서 그랬다).
      const sx = (sp.sx ?? sp.scale ?? 1) * base;
      const sy = (sp.sy ?? sp.scale ?? 1) * base;
      const sz2 = (sp.sz ?? sp.scale ?? 1) * base;
      pos.set(sp.x, -entry.min.y * sy, sp.z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sp.yaw || 0);
      sc.set(sx, sy, sz2);
      m.compose(pos, q, sc).multiply(local);
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  });
  return group;
}

/**
 * 키트 모델 하나를 놓는다.
 * @param name   GLB 이름
 * @param opts   {x, z, yaw, fitW(바닥 가로폭 m), scale, track(재질 수거 콜백)}
 * @returns {THREE.Group} 배치된 인스턴스 (실패 시 null)
 */
export function placeKit(name, opts = {}){
  const entry = cache.get(name);
  if (!entry) return null;
  const g = entry.scene.clone(true);

  // 재질은 인스턴스마다 복제한다 — 곡면 셰이더 주입이 캐시 원본을 오염시키면
  // 다음에 놓는 것부터 두 번 굽힌 상태로 나온다.
  g.traverse(o => {
    if (!o.isMesh) return;
    o.material = bend(o.material.clone());
    o.frustumCulled = false;              // 굽힌 뒤 바운딩이 어긋난다
    opts.track && opts.track(o.material);
  });

  const longest = Math.max(entry.size.x, entry.size.z);
  const s = opts.scale
    ?? (opts.fitL ? opts.fitL / longest
    :  (opts.fitW ? opts.fitW / entry.size.x : 1));
  g.scale.setScalar(s);
  //  ⚠ 원점이 **중심이 아닌 모델이 213개 중 62개**다(가구 키트가 특히 모서리에
  //    원점을 둔다 — 침대 x+0.75 · 원탁 x+0.35 z-0.40). 보정하지 않으면 놓으라는
  //    자리에서 최대 0.8m 비껴 그려진다. 격자에 붙여도 칸에 안 앉는 이유였다.
  //    y 는 이미 바닥을 붙이고 있었다(-min.y) — x·z 도 같은 값으로 맞춘다.
  const yaw = opts.yaw || 0;
  const cx = (entry.min.x + entry.size.x / 2) * s;
  const cz = (entry.min.z + entry.size.z / 2) * s;
  const ox = cx * Math.cos(yaw) + cz * Math.sin(yaw);
  const oz = -cx * Math.sin(yaw) + cz * Math.cos(yaw);
  g.position.set((opts.x || 0) - ox, -entry.min.y * s, (opts.z || 0) - oz);
  g.rotation.y = yaw;
  return g;
}
