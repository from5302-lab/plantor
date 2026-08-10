// ══════════════════════════════════════════════════════════════════
//  아바타 꾸미기 — 맵 위에 뜨는 글래스모피즘 모달
//
//  별도 페이지가 아니라 맵 안에서 연다.
//
//  미리보기는 이 모달이 자기 캔버스에 직접 그린다. 한때는 '맵에 서 있는 내
//  아바타가 곧 미리보기'였는데, 정작 그 아바타를 이 모달이 덮어 가렸다.
//  맵 카메라도 원거리 아이소메트릭이라 캐릭터가 손톱만 했다.
//  렌더러가 하나 늘지만, 값이 바뀔 때마다 맵 아바타를 통째로 다시 만들던
//  비용이 사라져 실제 작업량은 오히려 줄었다.
//
//  WebGL 컨텍스트는 마운트 때 한 번만 만든다(이 모달은 페이지당 한 번 마운트된다).
//  열고 닫을 때마다 만들면 브라우저의 컨텍스트 상한에 걸린다. 닫힐 땐 루프만 멈춘다.
// ══════════════════════════════════════════════════════════════════
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import {
  BODY_BASE, BODY_SLIDERS, HAIR_STYLES, TOPS, BOTTOMS, PALETTE,
  DEFAULT_LOOK, fromMeasurements, headsRatio, heightM,
  buildAvatar, disposeAvatar, poseAvatar, topY, RIG_SCALE,
} from './avatar.js';

const CSS = `
.cz-back{position:fixed;inset:0;z-index:50;display:none;align-items:center;justify-content:center;
  background:rgba(28,48,38,.28);backdrop-filter:blur(3px);padding:16px}
.cz-back.on{display:flex}
.cz{width:min(760px,100%);max-height:min(88vh,760px);display:flex;flex-direction:column;
  border-radius:22px;overflow:hidden;
  background:rgba(255,255,255,.58);
  backdrop-filter:blur(22px) saturate(150%);-webkit-backdrop-filter:blur(22px) saturate(150%);
  border:1px solid rgba(255,255,255,.7);
  box-shadow:0 10px 46px rgba(24,52,38,.22), inset 0 1px 0 rgba(255,255,255,.85);
  font-family:"Pretendard","Apple SD Gothic Neo",system-ui,sans-serif;color:#1d2a22}
.cz-hd{display:flex;align-items:center;gap:8px;padding:15px 18px 12px}
.cz-hd b{font-size:15px;font-weight:800}
.cz-hd .who{font-size:11.5px;font-weight:700;color:#5d7466;margin-left:auto;text-align:right;line-height:1.4}
.cz-main{display:flex;flex:1;min-height:0}
.cz-pv{position:relative;flex:0 0 268px;min-height:0;touch-action:none;cursor:grab;
  background:linear-gradient(180deg,rgba(255,255,255,.52),rgba(255,255,255,.14));
  border-right:1px solid rgba(255,255,255,.6)}
.cz-pv:active{cursor:grabbing}
.cz-pv canvas{display:block;width:100%;height:100%}
.cz-pv .hint{position:absolute;left:0;right:0;bottom:9px;text-align:center;pointer-events:none;
  font-size:10.5px;font-weight:700;color:#6d8477;opacity:.85}
.cz-col{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0}
.cz-tabs{display:flex;gap:5px;padding:13px 14px 11px}
.cz-tabs button{flex:1;padding:8px 0;border:none;border-radius:11px;font:inherit;font-size:12.5px;font-weight:800;
  background:rgba(255,255,255,.5);color:#41604e;cursor:pointer}
.cz-tabs button.on{background:#2f9e6a;color:#fff;box-shadow:0 3px 12px rgba(47,158,106,.35)}
.cz-body{padding:2px 18px 14px;overflow-y:auto;flex:1}
.cz-pane{display:none}.cz-pane.on{display:block}
.cz-lb{font-size:11px;font-weight:800;color:#5d7466;margin:12px 0 6px;letter-spacing:.03em}
.cz-lb:first-child{margin-top:2px}
.cz-chips{display:flex;flex-wrap:wrap;gap:6px}
.cz-chips button{padding:7px 11px;border:none;border-radius:10px;font:inherit;font-size:12px;font-weight:700;
  background:rgba(255,255,255,.55);color:#35513f;cursor:pointer}
.cz-chips button.on{background:#2f9e6a;color:#fff}
.cz-sw{display:flex;flex-wrap:wrap;gap:7px}
.cz-sw i{width:26px;height:26px;border-radius:8px;cursor:pointer;border:2px solid transparent;
  box-shadow:0 1px 4px rgba(24,52,38,.16)}
.cz-sw i.on{border-color:#fff;box-shadow:0 0 0 2px #2f9e6a}
.cz-sl{margin-bottom:9px}
.cz-sl label{display:flex;justify-content:space-between;font-size:11.5px;font-weight:700;margin-bottom:2px}
.cz-sl label i{font-style:normal;color:#5d7466;font-variant-numeric:tabular-nums}
.cz-sl input{width:100%;accent-color:#2f9e6a}
.cz-meas{display:flex;gap:8px;margin-bottom:8px}
.cz-meas label{flex:1;font-size:11px;font-weight:700;color:#5d7466}
.cz-meas input{width:100%;margin-top:3px;padding:7px 9px;border-radius:9px;font:inherit;font-size:13px;font-weight:700;
  border:1px solid rgba(255,255,255,.8);background:rgba(255,255,255,.6);color:#1d2a22}
.cz-read{display:flex;gap:8px;margin:10px 0 2px}
.cz-read div{flex:1;background:rgba(255,255,255,.5);border-radius:11px;padding:8px 11px}
.cz-read span{display:block;font-size:10px;font-weight:700;color:#5d7466}
.cz-read b{font-size:15px;font-variant-numeric:tabular-nums}
.cz-wide{width:100%;padding:9px;border:none;border-radius:11px;font:inherit;font-size:12.5px;font-weight:800;
  background:rgba(255,255,255,.6);color:#35513f;cursor:pointer;margin-top:4px}
.cz-ft{display:flex;gap:8px;padding:12px 18px 16px;border-top:1px solid rgba(255,255,255,.6)}
.cz-ft button{flex:1;padding:11px;border:none;border-radius:13px;font:inherit;font-size:13px;font-weight:800;cursor:pointer}
.cz-ft .ok{background:#2f9e6a;color:#fff;box-shadow:0 4px 16px rgba(47,158,106,.35)}
.cz-ft .no{background:rgba(255,255,255,.55);color:#41604e;flex:0 0 90px}
.cz-msg{padding:0 18px 10px;font-size:11.5px;font-weight:700;color:#5d7466;min-height:15px}
.cz-msg.ok{color:#1f8a5c}.cz-msg.bad{color:#c2703a}
@media(max-width:560px){
  .cz{width:100%;max-height:90vh;border-radius:20px}
  .cz-main{flex-direction:column}
  .cz-pv{flex:0 0 30vh;border-right:none;border-bottom:1px solid rgba(255,255,255,.6)}
  .cz-tabs{padding:11px 14px}
}
`;

const TABS = [['body','체형'], ['hair','헤어'], ['wear','옷'], ['color','색']];

// ── 3D 미리보기 ────────────────────────────────────────────────────
//  조명값과 색공간을 맵과 똑같이 맞춘다. 여기서 고른 색이 맵에서 다르게
//  보이면 미리보기가 아니라 거짓말이 된다. (맵: hemi .76 + sun .58 + amb .11)
function mountPreview(host){
  const canvas = document.createElement('canvas');
  host.insertBefore(canvas, host.firstChild);

  const renderer = new THREE.WebGLRenderer({canvas, alpha:true, antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xf0f5f1, 0.76));
  const sun = new THREE.DirectionalLight(0xfffdf7, 0.58);
  sun.position.set(4, 7, 6); scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.11));

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 60);
  const turntable = new THREE.Group(); scene.add(turntable);

  let rig = null, want = null, yaw = 0.26, raf = 0, t0 = 0;

  function build(){
    const {look, body} = want; want = null;
    if (rig) disposeAvatar(rig);
    rig = buildAvatar(look, body);
    turntable.add(rig.root);

    // 키를 바꿔도 전신이 화면에 꽉 차게 잡는다. root 스케일이 RIG_SCALE*height 이므로
    // 실제 세계 높이는 topY(체형) 에 그걸 곱한 값이다.
    // ⚠ RIG_SCALE 을 여기 숫자로 베껴 두면 안 된다 — 비율을 바꿨을 때 카메라만
    //   옛 값에 남아 머리가 잘렸다.
    const h = topY(rig.bodyParams) * RIG_SCALE * rig.bodyParams.height;
    camera.position.set(0, h * 0.55, h * 2.75);
    camera.lookAt(0, h * 0.50, 0);
  }

  function resize(){
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;                 // 모달이 닫혀 있으면 0 이 나온다
    renderer.setSize(w, h, false);        // CSS 크기는 스타일시트가 정한다
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);

  function loop(){
    raf = requestAnimationFrame(loop);
    // 슬라이더를 끌면 input 이 초당 수십 번 온다. 그때마다 메시 수십 개를 새로
    // 만들면 미리보기가 끊긴다. 프레임당 한 번으로 모은다.
    if (want) build();
    if (!rig) return;
    poseAvatar(rig, 'idle', 'none', (performance.now() - t0) / 1000);
    turntable.rotation.y = yaw;
    renderer.render(scene, camera);
  }

  // 드래그 회전 — 가로만 받는다. 세로로 돌리면 툰 셰이딩의 광원 각도가 무너진다.
  let drag = null;
  host.addEventListener('pointerdown', e => {
    drag = {x: e.clientX, yaw};
    host.setPointerCapture(e.pointerId);
  });
  host.addEventListener('pointermove', e => {
    if (drag) yaw = drag.yaw + (e.clientX - drag.x) * 0.011;
  });
  const drop = () => { drag = null; };
  host.addEventListener('pointerup', drop);
  host.addEventListener('pointercancel', drop);

  return {
    set(look, body){ want = {look, body}; },
    start(){ if (raf) return; t0 = performance.now(); resize(); loop(); },
    stop(){ cancelAnimationFrame(raf); raf = 0; },
  };
}

/**
 * @param opts.onChange(look, body)  값이 바뀔 때마다 (미리보기 갱신)
 * @param opts.onSave(look, body)    저장 버튼 → {ok, where, error} 를 돌려줘야 한다
 * @param opts.onClose()             닫힐 때
 * @returns {open(look, body, me), close()}
 */
export function mountCustomizer(opts){
  document.head.appendChild(Object.assign(document.createElement('style'), {textContent: CSS}));

  const back = document.createElement('div'); back.className = 'cz-back';
  back.innerHTML = `
    <div class="cz" role="dialog" aria-label="아바타 꾸미기">
      <div class="cz-hd"><b>아바타 꾸미기</b><span class="who"></span></div>
      <div class="cz-main">
      <div class="cz-pv"><span class="hint">드래그해서 돌려보기</span></div>
      <div class="cz-col">
      <div class="cz-tabs">${TABS.map(([k,n],i)=>
        `<button data-tab="${k}"${i?'':' class="on"'}>${n}</button>`).join('')}</div>
      <div class="cz-body">
        <div class="cz-pane on" data-pane="body">
          <div class="cz-read"><div><span>등신</span><b class="r-head">—</b></div>
                               <div><span>키</span><b class="r-tall">—</b></div></div>
          <div class="cz-lb">키 · 몸무게로 만들기</div>
          <div class="cz-meas">
            <label>키 (cm)<input class="m-h" type="number" value="165" min="130" max="200"></label>
            <label>몸무게 (kg)<input class="m-w" type="number" value="56" min="25" max="150"></label>
          </div>
          <button class="cz-wide m-apply">이 값으로 만들기</button>
          <div class="cz-lb">직접 조절</div>
          <div class="sliders"></div>
        </div>
        <div class="cz-pane" data-pane="hair"><div class="cz-lb">헤어</div><div class="cz-chips hair"></div></div>
        <div class="cz-pane" data-pane="wear">
          <div class="cz-lb">상의</div><div class="cz-chips tops"></div>
          <div class="cz-lb">하의</div><div class="cz-chips bots"></div>
        </div>
        <div class="cz-pane" data-pane="color"><div class="colors"></div></div>
      </div>
      </div>
      </div>
      <div class="cz-msg"></div>
      <div class="cz-ft"><button class="no">취소</button><button class="ok">저장</button></div>
    </div>`;
  document.body.appendChild(back);

  const q = sel => back.querySelector(sel);
  const msgEl = q('.cz-msg');
  const setMsg = (t, c='') => { msgEl.textContent = t; msgEl.className = 'cz-msg ' + c; };
  const pv = mountPreview(q('.cz-pv'));

  let look = {...DEFAULT_LOOK}, body = {...BODY_BASE}, base = null;

  const emit = () => { opts.onChange(look, body); pv.set(look, body); sync(); };

  // 탭
  q('.cz-tabs').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    back.querySelectorAll('.cz-tabs button').forEach(x => x.classList.toggle('on', x === b));
    back.querySelectorAll('.cz-pane').forEach(p => p.classList.toggle('on', p.dataset.pane === b.dataset.tab));
  };

  // 체형 슬라이더
  const sliders = {};
  for (const [key, label, min, max] of BODY_SLIDERS){
    const d = document.createElement('div'); d.className = 'cz-sl';
    d.innerHTML = `<label>${label}<i>1.00</i></label><input type="range" min="${min}" max="${max}" step="0.01">`;
    q('.sliders').appendChild(d);
    const inp = d.querySelector('input');
    sliders[key] = {inp, out: d.querySelector('i')};
    inp.oninput = () => { body[key] = +inp.value; emit(); };
  }
  q('.m-apply').onclick = () => {
    body = fromMeasurements(+q('.m-h').value, +q('.m-w').value).body;
    emit();
  };

  // 헤어 · 옷
  const chips = (host, list, key) => list.forEach(it => {
    const b = document.createElement('button');
    b.textContent = it.name; b.dataset.v = it.id;
    b.onclick = () => { look[key] = it.id; emit(); };
    host.appendChild(b);
  });
  chips(q('.hair'), HAIR_STYLES, 'hairStyle');
  chips(q('.tops'), TOPS, 'topStyle');
  chips(q('.bots'), BOTTOMS, 'bottomStyle');

  // 색
  const SLOTS = [['skin','피부','skin'], ['hair','머리','hair'], ['top','상의','cloth'],
                 ['bottom','하의','cloth'], ['shoe','신발','shoe'], ['tie','포인트','cloth']];
  for (const [slot, label, pal] of SLOTS){
    const h = document.createElement('div'); h.className = 'cz-lb'; h.textContent = label;
    const row = document.createElement('div'); row.className = 'cz-sw';
    for (const c of PALETTE[pal]){
      const i = document.createElement('i');
      i.style.background = '#' + c.toString(16).padStart(6,'0');
      i.dataset.c = c; i.dataset.slot = slot;
      i.onclick = () => { look[slot] = c; emit(); };
      row.appendChild(i);
    }
    q('.colors').append(h, row);
  }

  function sync(){
    q('.r-head').textContent = headsRatio(body).toFixed(2);
    q('.r-tall').textContent = heightM(body).toFixed(2) + 'm';
    for (const [k] of BODY_SLIDERS){
      sliders[k].inp.value = body[k];
      sliders[k].out.textContent = (+body[k]).toFixed(2);
    }
    back.querySelectorAll('.hair button').forEach(b => b.classList.toggle('on', b.dataset.v === look.hairStyle));
    back.querySelectorAll('.tops button').forEach(b => b.classList.toggle('on', b.dataset.v === look.topStyle));
    back.querySelectorAll('.bots button').forEach(b => b.classList.toggle('on', b.dataset.v === look.bottomStyle));
    back.querySelectorAll('.cz-sw i').forEach(i => i.classList.toggle('on', +i.dataset.c === look[i.dataset.slot]));
  }

  // 닫을 땐 루프만 멈춘다(컨텍스트는 마운트 때 만든 걸 계속 쓴다).
  function close(){ back.classList.remove('on'); pv.stop(); opts.onClose?.(); }

  q('.no').onclick = () => { look = {...base.look}; body = {...base.body}; opts.onChange(look, body); close(); };
  q('.ok').onclick = async () => {
    const r = await opts.onSave(look, body);
    if (!r?.ok){ setMsg('저장 실패 — ' + (r?.error || '알 수 없는 오류'), 'bad'); return; }
    setMsg(r.where === 'account' ? '계정에 저장했습니다.' : '이 브라우저에 저장했습니다.', 'ok');
    setTimeout(close, 550);
  };
  // 빈 곳을 눌러 닫기. click 이 아니라 pointerdown 으로 잡는다 —
  // 프리뷰에서 시작한 드래그가 모달 밖에서 끝나면 click 이 공통 조상인
  // .cz-back 으로 올라와, 돌려보기만 했는데 모달이 닫혀 버린다.
  back.addEventListener('pointerdown', e => { if (e.target === back) q('.no').click(); });

  return {
    open(l, b, me){
      look = {...l}; body = {...b};
      base = {look: {...l}, body: {...b}};       // 취소하면 여기로 되돌린다
      q('.who').innerHTML = me
        ? `${me.name}님<br>계정에 저장됩니다`
        : '손님 모드<br>이 브라우저에만 저장됩니다';
      setMsg('');
      sync();
      back.classList.add('on');
      // 'on' 을 먼저 붙여야 한다 — 숨어 있는 동안엔 패널 크기가 0이라 프레이밍이 깨진다.
      pv.set(look, body);
      pv.start();
    },
    close,
    isOpen: () => back.classList.contains('on'),
  };
}
