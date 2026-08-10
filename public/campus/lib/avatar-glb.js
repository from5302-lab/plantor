// ══════════════════════════════════════════════════════════════════
//  GLB 캐릭터 어댑터 — avatar.js 와 **같은 API** 를 제공한다.
//
//    buildAvatar(look, body, opts) → rig
//    poseAvatar(rig, lower, upper, t)
//    disposeAvatar(rig)
//
//  맵(map.js)이 캐릭터를 쓰는 지점이 이 셋뿐이라, 임포트만 갈아끼우면 교체된다.
//
//  모델: DuNguyn Studio "Free Pack - Chibi Base Mesh (Rigged)" (CC-BY-4.0)
//        2,234 삼각형 · 관절 32 · 애니메이션 없음 · 텍스처 없음
//
//  ── 이 모델을 다루며 확인한 것들 ──────────────────────────────────
//   · 기본 자세가 **T포즈** 다(어깨→손 가로 7.36 · 세로 0). 팔을 내려 A포즈로
//     바꾼 뒤 그 결과를 새 '기준 자세' 로 굳혀야 걷기가 자연스럽다.
//   · 뼈 이름이 좌우 비대칭이다(RightArm vs Left_Arm). 자동 매칭 금지.
//   · 회전은 '월드 축을 뼈의 부모 좌표계로 변환' 해서 건다. 뼈 로컬 축이 어디를
//     보는지 몰라도 정확하고, 나중에 모델을 바꿔도 대응표만 고치면 된다.
//   · 원본 눈은 튀어나온 별도 메시다. 정점 수(몸 1233 vs 눈 110)로 갈라 끈다.
//   · 머리 치수는 파일 좌표를 믿지 말고 스켈레톤에서 실측한다
//     (뼈가 자체 이동 x=1.58·회전 7° 를 갖고 있고 Sketchfab 루트까지 낀다).
// ══════════════════════════════════════════════════════════════════
//  ⚠ 'three' / 'three/addons/' 는 캠퍼스 페이지가 꽂는 importmap 이 풀어 준다.
//    map.js 가 쓰는 전체 URL 과 같은 파일로 매핑돼 있어 인스턴스가 갈라지지 않는다.
//    (한때 GLTFLoader 를 피하려고 GLB 파서를 직접 만들었는데, matrix 노드·스킨 공간
//     같은 스펙 세부를 계속 놓쳐 스키닝이 깨졌다. 공식 로더가 옳다.)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// 슬림 롱다리 리셰이프판 — 원본(chibi.glb)을 Blender에서 버텍스·본 동시 변형한 것.
// 원본 파일과 리그 이름·구조가 같아 이 모듈의 포즈 코드가 그대로 돈다.
const MODEL_URL = '/campus/models/chibi-base/chibi-slim.glb?v=2';
export const CREDIT = '"Free Pack - Chibi Base Mesh (Rigged)" by DuNguyn Studio (CC-BY-4.0)';

// 캠퍼스 월드 기준 키(m). 슬림 체형은 롱다리라 약간 키운다.
const TARGET_H = 1.52;

const BONE = {
  hips : 'Hips_01',
  chest: 'Spine2_04',
  head : 'Head_06',
  headTop: 'HeadTop_End_07',
  legL : ['Left_UpLeg_00',  'Left_Leg_028', 'Left_Foot_029'],
  legR : ['RightUpLeg_024', 'RightLeg_025', 'RightFoot_026'],
  armL : ['Left_Arm_017',   'Left_ForeArm_018'],
  armR : ['RightArm_09',    'RightForeArm_010'],
};

const AX = new THREE.Vector3(1,0,0), AY = new THREE.Vector3(0,1,0), AZ = new THREE.Vector3(0,0,1);

let TPL = null;
// 머리 실측값 (복제본 로컬 좌표). 뼈 간격으로 유추하지 않고 **정점에서 잰다.**
//
//   Head 뼈는 두개골 중심이 아니라 목 관절에 있다. 그래서 Head→HeadTop 간격을
//   반지름으로 쓰면 실제 두상보다 중심이 낮고 크기가 크게 잡힌다. 머리를 통째로
//   감싸는 것(헤어·모자·헬멧)을 붙이면 아래로 내려앉아 정수리가 드러난다.
//
// ⚠ 아직 아무도 안 쓴다. 얼굴 데칼은 여전히 뼈 간격에서 나온 ry 를 쓰는데,
//   데칼은 표면 한 조각이라 그 오차가 눈에 안 띄어 그대로 뒀다. 머리에 뭔가를
//   씌우게 되면 그때 이 값으로 갈아타라 — 얼굴 위치가 미세하게 움직이므로
//   눈·안경 위치를 같이 봐야 한다.
let HEAD = null;
export { HEAD as HEAD_MEASURED };

function measureHead(root){
  const box = new THREE.Box3();
  const v = new THREE.Vector3(), rel = new THREE.Matrix4();
  let found = 0;
  root.updateMatrixWorld(true);
  // 루트 자신의 행렬은 빼고 잰다. buildAvatar 가 복제본의 scale/position 을 다시
  // 잡으므로, 여기서 나온 값은 **복제본 로컬 좌표**여야 model.matrixWorld 로 옮겨진다
  const invRoot = root.matrixWorld.clone().invert();
  root.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const skel = o.skeleton;
    const hi = skel.bones.findIndex(b => b.name === BONE.head);
    if (hi < 0) return;
    const pos = o.geometry.attributes.position;
    const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
    if (!si || !sw) return;
    rel.multiplyMatrices(invRoot, o.matrixWorld);
    for (let i = 0; i < pos.count; i++){
      let w = 0;
      for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === hi) w += sw.getComponent(i, k);
      if (w < 0.6) continue;                       // 머리에 확실히 붙은 정점만
      v.fromBufferAttribute(pos, i).applyMatrix4(rel);
      box.expandByPoint(v); found++;
    }
  });
  if (!found) return null;
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  return {center: c, rx: s.x/2, ry: s.y/2, rz: s.z/2, verts: found};
}

/** 맵 마운트 전에 한 번 호출한다. buildAvatar 는 동기라서 미리 받아 둬야 한다. */
export async function preload(){
  if (TPL) return TPL;
  const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
  TPL = gltf.scene;
  TPL.updateMatrixWorld(true);
  HEAD = measureHead(TPL);
  if (!HEAD) console.warn('[campus] 머리 실측 실패 — 헤어가 뼈 기준으로 떨어질 수 있습니다');
  return TPL;
}

// ── 표정 ───────────────────────────────────────────────────────────
export const EXPRESSIONS = ['normal','happy','surprise','wink','sleepy'];
const faceCache = new Map();

export function faceTexture(expr = 'normal', eyeColor = '#241c22'){
  const cacheKey = expr + eyeColor;
  if (faceCache.has(cacheKey)) return faceCache.get(cacheKey);

  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  // 눈 위치는 원본 눈 메시(y 28.05~33.03, x ±3.6)를 데칼 매핑에 역산한 값이다.
  // 캔버스 중앙(256)에 두면 얼굴이 이마로 올라가 머리카락 선에 걸린다.
  const EY = 351, DX = 72;
  g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = eyeColor;

  const open = (x, rx, ry) => {
    g.fillStyle = eyeColor; g.beginPath(); g.ellipse(x, EY, rx, ry, 0, 0, 7); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.ellipse(x - rx*0.36, EY - ry*0.40, rx*0.36, ry*0.32, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(x + rx*0.34, EY + ry*0.44, rx*0.19, ry*0.16, 0, 0, 7); g.fill();
  };
  const arch = x => { g.lineWidth = 16;
    g.beginPath(); g.moveTo(x-38, EY+16); g.lineTo(x, EY-22); g.lineTo(x+38, EY+16); g.stroke(); };
  const line = x => { g.lineWidth = 15;
    g.beginPath(); g.moveTo(x-36, EY-4); g.quadraticCurveTo(x, EY+16, x+36, EY-4); g.stroke(); };
  // 눈썹은 눈과 한 세트다. 눈만 바뀌면 표정이 반만 바뀐다.
  const brow = (x, s, lift, tilt, bend) => { g.lineWidth = 13;
    g.beginPath(); g.moveTo(x - s*40, EY - lift);
    g.quadraticCurveTo(x, EY - lift - bend, x + s*42, EY - lift + tilt); g.stroke(); };

  for (const s of [-1, 1]){
    const x = 256 + s*DX;
    if (expr === 'happy'){        arch(x);          brow(x, s, 78, 4, 16); }
    else if (expr === 'sleepy'){  line(x);          brow(x, s, 62, 16, 2); }
    else if (expr === 'surprise'){open(x, 38, 44);  brow(x, s, 100, -4, 20); }
    else if (expr === 'wink' && s === -1){ arch(x); brow(x, s, 92, 0, 18); }
    else {                        open(x, 31, 38);  brow(x, s, 76, 8, 6); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  faceCache.set(cacheKey, t);
  return t;
}

// 머리 타원체 표면에 감은 평면 — 얼굴 데칼
function decalGeo(rx, ry, rz, wDeg = 112, hDeg = 86, out = 1.015, seg = 22){
  const g = new THREE.PlaneGeometry(1, 1, seg, seg);
  const w = THREE.MathUtils.degToRad(wDeg), h = THREE.MathUtils.degToRad(hDeg);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++){
    const yaw = p.getX(i)*w, pitch = p.getY(i)*h;
    p.setXYZ(i, rx*out*Math.sin(yaw)*Math.cos(pitch),
                ry*out*Math.sin(pitch),
                rz*out*Math.cos(yaw)*Math.cos(pitch));
  }
  p.needsUpdate = true; g.computeVertexNormals();
  return g;
}
const HEAD_RATIO = {x: 15.82/12.96, z: 13.50/12.96};   // 파일에서 잰 가로/세로 비

// ── 뼈 회전 도우미 ─────────────────────────────────────────────────
function prep(bone){
  const pq = new THREE.Quaternion(); bone.parent.getWorldQuaternion(pq);
  const inv = pq.clone().invert();
  return {bone, rest: bone.quaternion.clone(),
    ax: AX.clone().applyQuaternion(inv).normalize(),
    ay: AY.clone().applyQuaternion(inv).normalize(),
    az: AZ.clone().applyQuaternion(inv).normalize()};
}
const _q = new THREE.Quaternion();
const turn = (j, axis, a) => { _q.setFromAxisAngle(axis, a); j.bone.quaternion.copy(_q).multiply(j.rest); };

// ── 빌드 ═══════════════════════════════════════════════════════════
/**
 * @param look  {skin, eye, expr} — 색과 표정. 헤어·옷은 아직 없다.
 * @param body  (미사용 — 체형 슬라이더는 GLB 로 오면서 사라졌다)
 */
export function buildAvatar(look = {}, body = null, opts = {}){
  if (!TPL) throw new Error('preload() 를 먼저 호출해야 합니다');

  // 방문자(비로그인)는 투명 실루엣이다. 색을 칠하면 '누군가'가 되어 버리는데,
  // 아직 아무도 아닌 상태라 비쳐 보이는 쪽이 맞는 표현이다.
  // 채우기를 거의 지우고 테두리(뒷면 확대 셸)로만 형태를 남긴다.
  const GHOST = look.ghost === true;
  const skinMat = GHOST
    ? new THREE.MeshStandardMaterial({
        color: 0xf4f5f3, roughness: 0.85,          // 방문자도 화이트 클레이 톤
        transparent: true, opacity: 0.3, depthWrite: false,
      })
    : new THREE.MeshStandardMaterial({
        // 기본색은 레퍼런스 그대로의 화이트 클레이 — 색은 커스터마이징(look.skin)이 입힌다
        color: look.skin ?? 0xf2f1ee, roughness: 0.7,
        // 실내 조명이 약해 스탠다드 재질이 회색으로 죽는다 — 맵 재질(lam)과 같은 리프트
        emissive: new THREE.Color(look.skin ?? 0xf2f1ee).multiplyScalar(0.22),
        flatShading: true,     // 각진 로우폴리 룩 — 슬림 체형 레퍼런스가 패싯 스타일이다
      });
  // SkeletonUtils.clone — 스킨드 메시는 일반 clone() 으로 복제하면 뼈대를 공유해
  // 캐릭터들이 같은 포즈로 움직인다. 전용 clone 이 뼈대까지 새로 만들어 준다.
  const model = cloneSkinned(TPL);
  const inst = {root: model, meshes: []};
  model.traverse(o => {
    if (!o.isMesh) return;
    o.frustumCulled = false;              // 스킨드는 바운딩이 어긋나 사라진다
    o.castShadow = true;
    inst.meshes.push(o);
    // 원본 눈은 튀어나온 별도 메시라 끈다 — 얼굴은 데칼로 그린다.
    // three 는 glTF **노드** 이름(Object_9)을 쓰므로 이름으로는 못 거른다. 정점 수로 가른다.
    if (o.geometry.attributes.position.count < 300) o.visible = false;
    else o.material = skinMat;
  });

  const root = new THREE.Group();
  root.add(model);

  // 테두리 — 같은 메시를 살짝 키워 뒷면만 그린다(툰 아웃라인과 같은 수법).
  // 스킨드 메시라 뼈대를 공유해야 몸을 따라 움직인다.
  const outlineMats = [];
  if (GHOST){
    for (const m of inst.meshes){
      if (!m.visible) continue;
      // 뒷면만 그리는 확대 셸 = 테두리. depthWrite 를 끄고 먼저 그려야
      // 안쪽 반투명 몸이 그 위에 겹쳐 비친다(안 그러면 셸이 몸을 덮어 덩어리가 된다).
      const om = new THREE.MeshBasicMaterial({
        color: 0x8b9089, side: THREE.BackSide,     // 테두리도 무채색으로

        transparent: true, opacity: 0.9, depthWrite: false,
      });
      outlineMats.push(om);
      const o = new THREE.SkinnedMesh(m.geometry, om);
      o.bind(m.skeleton, m.bindMatrix);      // 같은 뼈대를 그대로 쓴다
      o.frustumCulled = false;
      o.scale.setScalar(1.028);
      o.renderOrder = -1;                    // 몸보다 먼저
      m.renderOrder = 0;
      m.parent.add(o);
    }
  }

  // 크기·바닥 맞추기
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  model.scale.setScalar(TARGET_H / (box.max.y - box.min.y));
  model.updateMatrixWorld(true);
  model.position.y -= new THREE.Box3().setFromObject(model).min.y;
  model.updateMatrixWorld(true);
  const baseY = model.position.y;          // 걷기 중 골반 낙하의 기준선

  const find = n => { const b = model.getObjectByName(n);
                      if (!b) throw new Error('뼈 없음: ' + n); return b; };
  const J = {
    hips : prep(find(BONE.hips)),
    chest: prep(find(BONE.chest)),
    head : prep(find(BONE.head)),
    legL : BONE.legL.map(n => prep(find(n))),
    legR : BONE.legR.map(n => prep(find(n))),
    armL : BONE.armL.map(n => prep(find(n))),
    armR : BONE.armR.map(n => prep(find(n))),
  };

  // T포즈 → A포즈. 결과를 새 기준 자세로 굳힌다
  const DOWN = Math.PI/2 * 0.86;
  for (const [arm, dir] of [[J.armL, -1], [J.armR, +1]]){
    turn(arm[0], arm[0].az, dir*DOWN);
    arm[0].rest.copy(arm[0].bone.quaternion);
  }
  inst.root.updateMatrixWorld(true);
  J.armL[1] = prep(J.armL[1].bone); J.armR[1] = prep(J.armR[1].bone);

  // 얼굴 데칼 — **정점 실측(HEAD)** 기준으로 붙인다. 뼈 간격(Head→HeadTop) 방식은
  // 슬림 리셰이프에서 HeadTop 본이 어긋나며 얼굴이 가슴에 붙는 사고를 냈다(실측 확인).
  // 정점 대역은 스킨 웨이트에서 직접 재므로 본이 이상해도 머리를 벗어나지 않는다.
  const headBone = J.head.bone;
  let center, ry, rx, rz;
  if (HEAD){
    const s = model.getWorldScale(new THREE.Vector3()).x;     // 정규화 스케일(균등)
    center = HEAD.center.clone().applyMatrix4(model.matrixWorld);
    ry = HEAD.ry * s; rx = HEAD.rx * s; rz = HEAD.rz * s;
  } else {
    // 실측 실패 시 옛 방식 폴백
    const topBone = find(BONE.headTop);
    const pH = new THREE.Vector3(), pT = new THREE.Vector3();
    headBone.getWorldPosition(pH); topBone.getWorldPosition(pT);
    ry = pH.distanceTo(pT) / 2;
    rx = ry*HEAD_RATIO.x; rz = ry*HEAD_RATIO.z;
    center = pH.clone().lerp(pT, 0.5);
  }

  const faceMat = new THREE.MeshStandardMaterial({
    map: faceTexture(look.expr ?? 'normal', look.eye),
    transparent: true, alphaTest: 0.42, roughness: 0.7,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2,
  });
  const face = new THREE.Mesh(decalGeo(rx, ry, rz), faceMat);
  const bq = new THREE.Quaternion(), bs = new THREE.Vector3(), mq = new THREE.Quaternion();
  headBone.getWorldQuaternion(bq); headBone.getWorldScale(bs);
  inst.root.getWorldQuaternion(mq);
  headBone.add(face);
  face.position.copy(headBone.worldToLocal(center.clone()));
  face.quaternion.copy(bq).invert().multiply(mq);
  face.scale.setScalar(1 / bs.x);

  return {root, inst, J, skinMat, faceMat, owned: [skinMat, faceMat, ...outlineMats],
          headBone, baseY, kind: 'glb'};
}

/** 표정만 바꾼다 — 캔버스를 다시 그리는 게 전부다 */
export function setExpression(rig, expr, eyeColor){
  rig.faceMat.map = faceTexture(expr, eyeColor);
  rig.faceMat.needsUpdate = true;
}

// ── 포즈 ═══════════════════════════════════════════════════════════
export function poseAvatar(rig, lower = 'idle', upper = 'none', t = 0){
  const J = rig.J;
  if (lower === 'walk' || lower === 'run'){
    const fast = lower === 'run';
    const w = Math.sin(t * (fast ? 11 : 7));
    const amp = fast ? 0.85 : 0.52;
    for (const [lg, sgn] of [[J.legL, 1], [J.legR, -1]]){
      const ws = w*sgn, swing = Math.max(0,-ws), push = Math.max(0,ws);
      const kn = swing*(fast ? 1.2 : 0.80) + 0.06;
      turn(lg[0], lg[0].ax, ws*amp);
      turn(lg[1], lg[1].ax, kn);
      turn(lg[2], lg[2].ax, -kn*0.32 + push*0.34 - swing*0.16);
    }
    turn(J.armL[0], J.armL[0].ax, -w*(fast ? 0.75 : 0.42));
    turn(J.armR[0], J.armR[0].ax,  w*(fast ? 0.75 : 0.42));
    turn(J.armL[1], J.armL[1].ax, -0.12 - Math.max(0,-w)*0.26);
    turn(J.armR[1], J.armR[1].ax, -0.12 - Math.max(0, w)*0.26);
    turn(J.chest, J.chest.ay, -w*0.10);
    turn(J.head,  J.head.ay,   w*0.06);
    // 다리를 벌리면 발이 떠오른다 — 그만큼 몸을 내려 디딤발을 바닥에 붙인다
    rig.inst.root.position.y = rig.baseY - Math.abs(w) * TARGET_H * 0.022;
    return;
  }
  rig.inst.root.position.y = rig.baseY;
  if (lower === 'sit'){
    for (const [lg] of [[J.legL], [J.legR]]){
      turn(lg[0], lg[0].ax, -1.45);
      turn(lg[1], lg[1].ax,  1.40);
      turn(lg[2], lg[2].ax,  0.16);
    }
    turn(J.armL[0], J.armL[0].ax, 0.45); turn(J.armR[0], J.armR[0].ax, 0.45);
    turn(J.armL[1], J.armL[1].ax, -0.55); turn(J.armR[1], J.armR[1].ax, -0.55);
    turn(J.chest, J.chest.ax, 0.10);
    turn(J.head, J.head.ay, 0);
    return;
  }
  // idle — 숨쉬기
  const b = Math.sin(t * 2.0);
  for (const lg of [J.legL, J.legR]){
    turn(lg[0], lg[0].ax, 0); turn(lg[1], lg[1].ax, 0.04); turn(lg[2], lg[2].ax, -0.02);
  }
  turn(J.armL[0], J.armL[0].ax, b*0.03); turn(J.armR[0], J.armR[0].ax, -b*0.03);
  turn(J.armL[1], J.armL[1].ax, -0.14);  turn(J.armR[1], J.armR[1].ax, -0.14);
  turn(J.chest, J.chest.ay, b*0.03);
  turn(J.head,  J.head.ay, -b*0.04);
}

export function disposeAvatar(rig){
  if (!rig) return;
  rig.root.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
  rig.owned.forEach(m => m.dispose());
  rig.root.parent && rig.root.parent.remove(rig.root);
}
