// ══════════════════════════════════════════════════════════════════
//  캐릭터 고르기(꾸미기 창) — map.js 에서 떼어 낸 모달.
//
//  맵과의 접점은 env 하나다:
//    me           로그인 프로필({name, ...}) | null
//    getLook()    지금 입은 look   getBody()  체형
//    commit(look, name|null)   적용 확정 — 맵이 내 모습·이름표·방송을 갱신한다
//    closePanels()             다른 패널(가방·상점·상담)을 닫는다
//    toast(msg)
//    Avatar       런타임에 고른 아바타 어댑터(kenney | code)
//
//  저장(saveCharacter/saveName)과 옷장(loadWardrobe/buyWardrobe)은 맵을 거치지
//  않고 여기서 직접 부른다 — 맵이 중계만 하는 함수를 들고 있을 이유가 없다.
// ══════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { saveCharacter, saveName, loadWardrobe, buyWardrobe } from '/campus/lib/store.js';
import { icon } from '/campus/lib/icons.js';
import * as Pets from '/campus/lib/pets.js';

const esc = s => String(s);

/** @returns {{open(), close(), isOpen():boolean}} */
export function initDressing(env){
  const { Avatar, toast } = env;
  let charOpen = false;
  let nameDraft = '';
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
  const elChars = document.getElementById('charPanel');

  async function openChars(){
    if (!env.me) return toast('로그인하면 캐릭터를 고를 수 있어요');
    env.closePanels();
    charOpen = true;
    elChars.hidden = false;
    elChars.classList.add('dress');
    elRoot && elRoot.classList.add('dressing');
    savedLook = {...env.getLook()};
    draft = {...savedLook};
    nameDraft = env.me ? env.me.name : '';
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
        Avatar.poseAvatar(pv.rig, 'idle', 'none', 0);
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
    if (pv.rig){ pv.scene.remove(pv.rig.root); Avatar.disposeAvatar(pv.rig); }
    pv.rig = Avatar.buildAvatar(draft || env.getLook(), env.getBody(), {flat: true});
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
    if (pv.rig){ pv.scene.remove(pv.rig.root); Avatar.disposeAvatar(pv.rig); pv.rig = null; }
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
    const rig = Avatar.buildAvatar({...look, colors: (draft || env.getLook()).colors}, env.getBody(), {flat: true});
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
    aS.remove(rig.root); Avatar.disposeAvatar(rig);
    return url;
  }
  function thumbFor(slot, v, L){
    if (slot === 'pet') return Pets.petThumb(v);
    const k = `${slot}:${v}:${L.base}:${L.head}:${L.face}:${L.eyewear}:` +
              JSON.stringify((draft || env.getLook()).colors || {});
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
    const D = draft || env.getLook();
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
      const curOf = slot === 'pet' ? ((draft || env.getLook()).pet || 'none') : L[slot];
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
      (env.me ? `<div class="dname"><span class="dnlab">이름</span>` +
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
    const newLook = {...draft, ...back};
    //  이름이 바뀌었으면 같이 저장한다. 실패해도 캐릭터 저장은 살린다 —
    //  이름 때문에 옷까지 못 갈아입는 건 말이 안 된다.
    let nameMsg = '', newName = null;
    if (env.me && nameDraft.trim() && nameDraft.trim() !== env.me.name){
      const nr = await saveName(nameDraft);
      if (nr.ok){ env.me.name = nr.name; newName = nr.name; }
      else nameMsg = ' (이름은 못 바꿨어요)';
    }
    env.commit(newLook, newName);        // 맵의 내 모습·이름표·방송은 맵이 맡는다
    const r = await saveCharacter(newLook, env.getBody());
    if (r.ok) savedLook = {...newLook};
    if (!r.ok && btn){ btn.disabled = false; btn.textContent = '적용'; }
    if (r.ok) closeChars();
    toast(!r.ok ? '저장 실패: ' + r.error
          : (dropped ? '사지 않은 건 빼고 저장했어요' : '캐릭터를 저장했어요 ✓') + nameMsg);
  }

  document.getElementById('dressBtn').onclick = openChars;


  return { open: openChars, close: closeChars, isOpen: () => charOpen };
}
