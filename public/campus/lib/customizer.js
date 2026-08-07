// ══════════════════════════════════════════════════════════════════
//  아바타 꾸미기 — 맵 위에 뜨는 글래스모피즘 모달
//
//  별도 페이지가 아니라 맵 안에서 연다. 미리보기는 맵에 서 있는 내 아바타
//  자체다 — 렌더러를 두 개 돌리지 않아도 되고, 바꾸는 즉시 실제 모습으로 보인다.
//
//  이 파일은 DOM과 상태만 맡는다. 아바타를 다시 만드는 일은 호출한 쪽(맵)이 한다.
// ══════════════════════════════════════════════════════════════════
import {
  BODY_BASE, BODY_SLIDERS, HAIR_STYLES, TOPS, BOTTOMS, PALETTE,
  DEFAULT_LOOK, fromMeasurements, headsRatio, heightM,
} from './avatar.js';

const CSS = `
.cz-back{position:fixed;inset:0;z-index:50;display:none;align-items:center;justify-content:center;
  background:rgba(28,48,38,.28);backdrop-filter:blur(3px);padding:16px}
.cz-back.on{display:flex}
.cz{width:min(420px,100%);max-height:min(84vh,720px);display:flex;flex-direction:column;
  border-radius:22px;overflow:hidden;
  background:rgba(255,255,255,.58);
  backdrop-filter:blur(22px) saturate(150%);-webkit-backdrop-filter:blur(22px) saturate(150%);
  border:1px solid rgba(255,255,255,.7);
  box-shadow:0 10px 46px rgba(24,52,38,.22), inset 0 1px 0 rgba(255,255,255,.85);
  font-family:"Pretendard","Apple SD Gothic Neo",system-ui,sans-serif;color:#1d2a22}
.cz-hd{display:flex;align-items:center;gap:8px;padding:15px 18px 12px}
.cz-hd b{font-size:15px;font-weight:800}
.cz-hd .who{font-size:11.5px;font-weight:700;color:#5d7466;margin-left:auto;text-align:right;line-height:1.4}
.cz-tabs{display:flex;gap:5px;padding:0 14px 11px}
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
@media(max-width:520px){.cz{width:100%;max-height:88vh;border-radius:20px}}
`;

const TABS = [['body','체형'], ['hair','헤어'], ['wear','옷'], ['color','색']];

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
      <div class="cz-msg"></div>
      <div class="cz-ft"><button class="no">취소</button><button class="ok">저장</button></div>
    </div>`;
  document.body.appendChild(back);

  const q = sel => back.querySelector(sel);
  const msgEl = q('.cz-msg');
  const setMsg = (t, c='') => { msgEl.textContent = t; msgEl.className = 'cz-msg ' + c; };

  let look = {...DEFAULT_LOOK}, body = {...BODY_BASE}, base = null;

  const emit = () => { opts.onChange(look, body); sync(); };

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

  function close(){ back.classList.remove('on'); opts.onClose?.(); }

  q('.no').onclick = () => { look = {...base.look}; body = {...base.body}; opts.onChange(look, body); close(); };
  q('.ok').onclick = async () => {
    const r = await opts.onSave(look, body);
    if (!r?.ok){ setMsg('저장 실패 — ' + (r?.error || '알 수 없는 오류'), 'bad'); return; }
    setMsg(r.where === 'account' ? '계정에 저장했습니다.' : '이 브라우저에 저장했습니다.', 'ok');
    setTimeout(close, 550);
  };
  back.onclick = e => { if (e.target === back) q('.no').click(); };

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
    },
    close,
    isOpen: () => back.classList.contains('on'),
  };
}
