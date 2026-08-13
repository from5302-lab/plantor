// ══════════════════════════════════════════════════════════════════
//  꾸미기 에디터 — map.js 에서 떼어 낸 모달.
//
//  격자·유령·칸 하이라이트·팔레트·회전/크기·저장까지 전부 여기다.
//  맵과의 접점은 env 하나:
//    scene · camera            렌더 컨텍스트(격자·유령을 씬에 얹는다)
//    roomGroup · placeGroup    배치물이 그려지는 그룹(선택 레이캐스트 대상)
//    getMyRoom() · getPlace()  현재 배치 배열
//    applyRoom(items) · applyPlace(items)   다시 그리기(맵이 소유)
//    level() · switching() · me · isAdmin
//    countOf(id) · tierNow() · roomEarned()  내 방 인벤토리
//    pushZoom(v) · popZoom()   편집 동안 카메라를 물렸다 되돌린다
//    onEditingChange(bool)     방 버튼 표시 갱신 등 맵 쪽 훅
//    closePanels() · toast(msg)
//
//  다루는 데이터( {t,x,z,r,s} )와 저장처(saveRoom/savePlace)는 그대로다.
// ══════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { DECOR, DECOR_BY_ID, GROUPS, decorSnap, preloadDecor, decorBox, buildDecor,
         decorThumb } from '/campus/lib/decor.js';
import { roomBounds } from '/campus/lib/room.js';
import { saveRoom, savePlace } from '/campus/lib/store.js';

const esc = s => String(s);

/** @returns {{startEdit, endEdit, editTap, moveGhost, isEditing():boolean}} */
export function initEditor(env){
  const { toast, FLAT } = env;
  const elEditBar = document.getElementById('editBar');
  const cv = document.getElementById('cv');        // 레이캐스트 기준 캔버스
  const rayc = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  // ══ 꾸미기 ════════════════════════════════════════════════════════
  //  같은 코드가 두 곳에 쓰인다:
  //    · 내 방(study) — 누구나 자기 방만. 배치 범위는 누적 포인트로 넓어진다
  //    · 공용 공간   — 운영자만. 캠퍼스·학습센터·상점을 자유롭게 꾸민다
  //  다른 건 '어느 배열을 고치고 어디에 저장하느냐' 뿐이다.
  let editing = false, editItems = null, editOrig = null;
  let editTarget = null;              // 'room' | 'place'
  let editSel = -1, placeType = null, decorReady = false, editGroup = null;
  let editListOpen = true;            // 고르면 접힌다 — 시트가 맵을 덮은 채로는 못 놓는다

  //  격자 — 어디에 붙는지 **보여야** 스냅이 기능이다. 안 보이면 탭이 어긋난
  //  자리로 튀는 버그처럼 읽힌다. 칸은 고른 물건의 스냅을 따라간다.
  let editGrid = null;
  function syncEditGrid(){
    if (editGrid){ env.scene.remove(editGrid); editGrid.geometry.dispose(); editGrid.material.dispose(); editGrid = null; }
    if (!editing) return;
    const type = placeType || (editSel >= 0 && editItems[editSel] ? editItems[editSel].t : null);
    const [gx, gz] = decorSnap(type, editSel >= 0 && !placeType ? editItems[editSel].r : 0);
    //  범위가 없는 공용 공간에서는 격자를 무한히 그을 수 없다 — 플레이어
    //  둘레로 한 뼘(±30m)만 긋는다. 어차피 안개 너머는 안 보인다.
    const B = editBounds() || (c => ({minX: c.x - 34, maxX: c.x + 34,
                                      minZ: c.z - 40, maxZ: c.z + 10}))(env.camera.position);
    const pts = [];
    //  ⚠ 선을 스냅 자리(칸의 중심)에 그으면 안 된다. 스냅은 round 라 물건의
    //    **중심**이 배수 자리에 놓이므로, 배수 자리에 선을 그으면 타일이 선을
    //    가로질러 네 칸에 걸친다 — 격자와 실제가 어긋나 보인 이유가 이것이다.
    //    선은 **반 칸 밀어서**(n+0.5) 긋는다. 그러면 한 칸이 타일 하나다.
    const line = (g, from, to) => {
      const out = [];
      for (let n = Math.floor(from / g) - 1; ; n++){
        const v = (n + 0.5) * g;
        if (v > to + 1e-6) break;
        if (v >= from - 1e-6) out.push(v);
      }
      return out;
    };
    for (const x of line(gx, B.minX, B.maxX)) pts.push(x, 0.03, B.minZ, x, 0.03, B.maxZ);
    for (const z of line(gz, B.minZ, B.maxZ)) pts.push(B.minX, 0.03, z, B.maxX, 0.03, z);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    editGrid = new THREE.LineSegments(g,
      new THREE.LineBasicMaterial({color: 0x1f7a33, transparent: true, opacity: 0.3, depthWrite: false}));
    editGrid.renderOrder = 4;
    env.scene.add(editGrid);
  }

  //  유령 — 고른 물건이 커서를 따라다닌다. 탭하기 전에 **어디에 얼마만 하게**
  //  놓일지 보여 준다. 격자에 붙은 자리를 그대로 쓰므로 "여기가 맞나" 를 안 묻는다.
  //  반투명으로 그려 이미 놓인 것과 헷갈리지 않게 한다.
  //  놓일 **칸 자체**를 칠한다. 유령만 있으면 "어디에 붙는가" 는 여전히 눈대중이다 —
  //  칸이 켜졌다 꺼졌다 하는 게 곧 '착 붙는' 느낌이다.
  const cellMark = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI/2),
    new THREE.MeshBasicMaterial({color:0x1f7a33, transparent:true, opacity:0.20,
                                 depthWrite:false}));
  cellMark.visible = false; cellMark.renderOrder = 4;
  env.scene.add(cellMark);

  //  ⚠ 이 선언은 clearGhost 보다 위에 있어야 한다(TDZ — 펫 초기화에서 같은 걸로
  //    콜백이 조용히 죽은 적이 있다).
  let ghost = null, ghostType = null, ghostJunk = [];
  function clearGhost(){
    for (const o of ghostJunk) o.dispose?.();
    ghostJunk = [];
    if (ghost){ env.scene.remove(ghost); ghost = null; }
    ghostType = null;
    cellMark.visible = false;
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
    env.scene.add(g);
  }
  /** 화면 좌표 → 격자에 붙인 바닥 좌표. 없으면 null(바닥 밖) */
  function snapAt(cx, cy){
    const r = cv.getBoundingClientRect();
    ndc.set((cx - r.left)/r.width*2 - 1, -((cy - r.top)/r.height*2 - 1));
    rayc.setFromCamera(ndc, env.camera);
    const hit = new THREE.Vector3();
    if (!rayc.ray.intersectPlane(GROUND, hit)) return null;
    const type = placeType || (editSel >= 0 && editItems[editSel] ? editItems[editSel].t : null);
    const rot = editSel >= 0 && !placeType ? editItems[editSel].r : 0;
    const [gx, gz] = decorSnap(type, rot);
    return {x: Math.round(hit.x / gx) * gx, z: Math.round(hit.z / gz) * gz};
  }

  function moveGhost(cx, cy){
    const p = editing ? snapAt(cx, cy) : null;
    const B = editBounds();
    const ok = p && (!B || (p.x >= B.minX && p.x <= B.maxX && p.z >= B.minZ && p.z <= B.maxZ));
    if (ghost){
      ghost.visible = !!ok;
      if (ok) ghost.position.set(p.x, 0, p.z);
    }
    cellMark.visible = !!ok;
    if (ok){
      //  칠하는 넓이는 **격자 칸이 아니라 물건이 실제로 먹는 자리**다.
      //  칸만 칠하면 0.5m 눈금에 3m 짜리 바위를 놓을 때 "여기 들어가겠구나" 하고
      //  놨다가 옆것을 덮는다 — 발자국을 보여 줘야 자리를 가늠할 수 있다.
      const sel = editSel >= 0 && !placeType ? editItems[editSel] : null;
      const probe = {t: placeType || (sel && sel.t), x: p.x, z: p.z,
                     r: sel ? sel.r : 0, s: sel ? sel.s : 1};
      const b = probe.t && decorBox(probe);
      const w = b ? b.maxX - b.minX : 1, d = b ? b.maxZ - b.minZ : 1;
      cellMark.scale.set(Math.max(0.3, w), 1, Math.max(0.3, d));
      cellMark.position.set(p.x, 0.035, p.z);
    }
  }

  const selMarker = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.74, 28).rotateX(-Math.PI/2),
    new THREE.MeshBasicMaterial({color:0x1f7a33, transparent:true, opacity:0.9, depthWrite:false}));
  selMarker.visible = false; selMarker.renderOrder = 5;
  env.scene.add(selMarker);

  //  내 방은 티어 범위 안으로 제한한다. 공용 공간은 그 레벨의 활동 범위로 넉넉히 둔다.
  //  공용 공간은 **범위를 두지 않는다**(사용자 결정). 운영자만 고치는 곳이라
  //  가둘 이유가 없고, 마당 밖에 울타리나 나무를 두르려면 오히려 나가야 한다.
  //  내 방은 그대로 — 누적 포인트로 넓어지는 것이 우리집의 규칙이다.
  const editBounds = () => editTarget === 'room' ? roomBounds(env.roomEarned()) : null;

  function redraw(){
    if (editTarget === 'room') env.applyRoom(editItems); else env.applyPlace(editItems);
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
    return DECOR.filter(d => env.countOf(d.id) > 0 || (d.id === 'tv' && env.countOf('board') > 0));
  }

  function refreshEditBar(){
    const list = paletteItems();
    const groups = GROUPS.filter(g => list.some(d => d.group === g));
    // 묶음을 전부 늘어놓으면 목록이 세로로 끝없이 길다 — 한 번에 한 묶음만.
    if (!groups.includes(editGroup)) editGroup = groups[0] || null;
    const sel = editSel >= 0 ? editItems[editSel] : null;

    const cell = d => {
      const url = decorReady ? decorThumb(d.id) : '';
      const own = editTarget === 'room' ? `<b>×${env.countOf(d.id) || env.countOf('board')}</b>` : '';
      return `<button class="dcell ${placeType === d.id ? 'on' : ''}" data-place="${d.id}"
                title="${esc(d.name)}">` +
             (url ? `<img src="${url}" alt="" draggable="false">` : `<span class="dph"></span>`) +
             `<span>${esc(d.name)}${own}</span></button>`;
    };

    const mini = !!placeType && !editListOpen;
    elEditBar.classList.toggle('mini', mini);
    elEditBar.innerHTML =
      `<div class="ehead">${editTarget === 'room' ? '내 방 꾸미기' : env.level() === 'outdoor' ? '캠퍼스 꾸미기' : '실내 꾸미기'}` +
      (mini ? `<span class="epick">· ${esc(DECOR_BY_ID[placeType]?.name || '')} 놓는 중</span>` : '') +
      `<span class="sp"></span>` +
      (mini ? `<button data-list class="ghostb">목록</button>` : '') +
      `<button data-save>저장</button><button data-cancel class="ghostb">취소</button></div>` +
      (sel
        ? `<div class="erow">` +
          `<span class="elab">${esc(DECOR_BY_ID[sel.t]?.name || '')}</span>` +
          //  슬라이더만 두면 "지금 몇 도인지 / 몇 배인지" 를 알 수 없고, 같은 값을
          //  두 물건에 맞출 수가 없다. 수치를 보여 주고 직접 칠 수도 있게 한다.
          `<label>회전<input type="range" data-rot min="0" max="359" step="5"
             value="${Math.round(sel.r * 180 / Math.PI)}">` +
          `<input class="enum" type="number" data-rotn min="0" max="359" step="5"
             value="${Math.round(sel.r * 180 / Math.PI)}"><i>°</i></label>` +
          `<label>크기<input type="range" data-scale min="40" max="220" step="5"
             value="${Math.round((sel.s || 1) * 100)}">` +
          `<input class="enum" type="number" data-scalen min="0.4" max="2.2" step="0.1"
             value="${((sel.s || 1)).toFixed(1)}"><i>배</i></label>` +
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
    if (editing || env.switching()) return;
    const inMyRoom = env.level() === 'study';
    if (!inMyRoom && !env.isAdmin) return toast('공용 공간은 운영자만 꾸밀 수 있어요');
    if (inMyRoom && !env.me) return toast('로그인하면 내 방을 꾸밀 수 있어요');

    editTarget = inMyRoom ? 'room' : 'place';
    editing = true;
    editItems = (editTarget === 'room' ? env.getMyRoom() : env.getPlace()).map(it => ({...it}));
    editOrig = editItems.map(it => ({...it}));
    editSel = -1; placeType = null; editListOpen = true;
    env.closePanels();
    elEditBar.hidden = false; env.onEditingChange(true);
    //  꾸밀 때는 **넓게** 본다. 평소 거리(0.75)는 캐릭터를 보라고 당겨 둔 값이라,
    //  길을 깔다 보면 세 칸 앞이 화면 밖이다. 편집을 마치면 원래대로 돌아간다.
    env.pushZoom(1.35);
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
    env.popZoom();
    clearGhost();
    syncEditGrid();                     // editing=false 라 지우기만 한다
    env.onEditingChange(false);
    const items = save ? editItems : editOrig;
    if (editTarget === 'room') env.applyRoom(items); else env.applyPlace(items);
    if (!save) return toast('되돌렸어요');
    const r = editTarget === 'room' ? await saveRoom(items) : await savePlace(env.level(), items);
    toast(r.ok ? '저장했어요' : '저장 실패: ' + r.error);
  }

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
    const t = e.target, it = editItems[editSel], row = elEditBar.querySelector('.erow');
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const setRot = deg => {
      it.r = deg * Math.PI / 180;
      //  ⚠ 값을 바꾼 쪽은 건드리지 않는다. 숫자칸을 치는 중에 그 칸의 value 를
      //    다시 쓰면 커서가 끝으로 튀고 '1' 을 치려다 '10' 이 된다.
      const a = row.querySelector('[data-rot]'), b = row.querySelector('[data-rotn]');
      if (t !== a) a.value = Math.round(deg);
      if (t !== b) b.value = Math.round(deg);
    };
    const setScale = mul => {
      it.s = mul;
      const a = row.querySelector('[data-scale]'), b = row.querySelector('[data-scalen]');
      if (t !== a) a.value = Math.round(mul * 100);
      if (t !== b) b.value = mul.toFixed(1);
    };
    if (t.dataset.rot !== undefined)        setRot(+t.value);
    else if (t.dataset.rotn !== undefined)  setRot(clamp(+t.value || 0, 0, 359));
    else if (t.dataset.scale !== undefined) setScale((+t.value) / 100);
    else if (t.dataset.scalen !== undefined) setScale(clamp(+t.value || 1, 0.4, 2.2));
    else return;
    // 슬라이더를 끄는 동안 목록을 다시 그리면 포커스가 튄다 — 3D 만 갱신한다
    if (editTarget === 'room') env.applyRoom(editItems); else env.applyPlace(editItems);
    syncMarker();
  });

  //  편집 중의 탭 — 놓기 / 고르기 / 옮기기. 걷기 탭과 완전히 분리된다.
  function editTap(cx, cy){
    const r = cv.getBoundingClientRect();
    ndc.set((cx - r.left)/r.width*2 - 1, -((cy - r.top)/r.height*2 - 1));
    rayc.setFromCamera(ndc, env.camera);

    const group = editTarget === 'room' ? env.roomGroup : env.placeGroup;
    const hits = rayc.intersectObjects(group.children, true);   // 유령은 scene 직속이라 안 걸린다
    if (hits.length){
      //  ⚠ 맨 앞 히트를 그대로 잡으면 안 된다. 바닥 타일은 3m 판이라 그 위에
      //    선 가로등을 노려도 판이 먼저 걸릴 수 있다 — "옆의 것이 잡힌다"가
      //    이것이다. **세워진 것 먼저**, 깔린 것(FLAT)은 그다음이다.
      //  물건이 제 순번을 들고 있다(drawDecor 의 userData.decorIndex).
      //  group.children 의 순번은 못 믿는다 — 안 받아진 모델은 아무것도 안 붙고,
      //  시계 같은 덤 자식이 끼어들어 목록과 어긋난다.
      const idxOf = h => {
        let node = h.object;
        while (node && node.userData.decorIndex === undefined) node = node.parent;
        return node ? node.userData.decorIndex : -1;
      };
      let pick = -1;
      for (const h of hits){
        const i = idxOf(h);
        if (i < 0) continue;
        const t = editItems[i]?.t;
        if (t && !FLAT.has(t)){ pick = i; break; }   // 세워진 것 — 즉시 확정
        if (pick < 0) pick = i;                      // 깔린 것 — 후보로만
      }
      if (pick >= 0){ editSel = pick; placeType = null; syncMarker(); refreshEditBar(); return; }
    }

    // 격자는 물건이 정한다 — 유령이 서 있는 자리와 **같은 함수**로 계산한다
    const sp = snapAt(cx, cy);
    if (!sp) return;
    const x = sp.x, z = sp.z;
    const B = editBounds();
    if (B && (x < B.minX || x > B.maxX || z < B.minZ || z > B.maxZ)){
      if (placeType || editSel >= 0){
        const t = env.tierNow();
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


  document.getElementById('roomBtn').onclick = startEdit;
  return { startEdit, endEdit, editTap, moveGhost, isEditing: () => editing };
}
