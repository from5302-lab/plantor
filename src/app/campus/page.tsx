"use client";

/**
 * 캠퍼스(3D 학원 맵).
 *
 * 정적 HTML(public/campus/index.html)이었는데 앱 라우트로 옮겼다.
 * 상단 네비바를 캠퍼스 안에서도 유지하고, 로그인 모달이 페이지 이동 없이
 * 그 자리에서 열리게 하기 위해서다. 그래서 맵 자체의 로그인 칩은 없앴다.
 *
 * 맵 로직은 /campus/lib/map.js 에 그대로 둔다(번들 밖). 여기서는 DOM만 그리고
 * 모듈을 붙였다 뗀다 — three.js 를 Next 번들에 넣지 않으려는 것이다.
 */

import { useEffect, useRef, useState } from "react";
import "./campus.css";
import { pickQuip } from "./loading-quips";

export default function CampusPage() {
  const errRef = useRef<HTMLDivElement>(null);
  // 3D 가 준비될 때까지 덮는 로딩 화면. map.js 가 window.__ready 를 세운다.
  const [loading, setLoading] = useState(true);
  const [stuck, setStuck] = useState(false);
  const [quip, setQuip] = useState("");

  // 문구는 마운트 뒤에 뽑는다 — 서버 렌더와 값이 달라 하이드레이션이 어긋난다.
  useEffect(() => {
    setQuip(pickQuip());
    // 로딩이 길어지면 한 줄만 붙들고 있지 않는다. 두세 개는 읽히게 돌린다.
    const rotate = setInterval(() => setQuip(prev => pickQuip(prev)), 2600);

    const w = window as unknown as { __ready?: boolean };
    const done = () => { clearInterval(rotate); clearInterval(poll); setLoading(false); };
    const poll = setInterval(() => { if (w.__ready) done(); }, 120);
    // 3D 가 끝내 안 뜨는 환경(구형 기기·WebGL 차단)이 있다. 로딩 화면을 그냥 걷으면
    // 빈 초록 화면만 남아 무엇이 잘못됐는지 알 수 없다 — 실패 상태로 바꿔 준다.
    const bail = setTimeout(() => { clearInterval(rotate); setStuck(true); }, 15000);
    return () => { clearInterval(rotate); clearInterval(poll); clearTimeout(bail); };
  }, []);

  useEffect(() => {
    // three 의 애드온(GLTFLoader 등)은 `import ... from 'three'` 라는 맨 스펙파이어를
    // 쓴다. 그걸 풀어 주는 importmap 을 맵 모듈보다 **먼저** 꽂아야 한다.
    // 이미 붙어 있으면 다시 넣지 않는다(브라우저는 import map 을 하나만 받는다).
    if (!document.querySelector('script[type="importmap"]')) {
      const im = document.createElement("script");
      im.type = "importmap";
      im.textContent = JSON.stringify({
        imports: {
          "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
          "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/",
        },
      });
      document.head.appendChild(im);
    }

    // 번들러를 거치지 않도록 <script type="module"> 로 직접 붙인다.
    // (webpack 이 절대경로 동적 import 를 해석하려 들면 정적 export 에서 깨진다)
    const el = document.createElement("script");
    el.type = "module";
    el.textContent = `
      import { mountCampus } from '/campus/lib/map.js';
      try { window.__campusDispose = await mountCampus(); }
      catch (e) {
        console.error('[campus]', e);
        const box = document.getElementById('err');
        if (box) { box.style.display = 'block'; box.textContent = '3D 로드 실패: ' + (e?.message || e); }
      }
    `;
    document.body.appendChild(el);

    return () => {
      const w = window as unknown as { __campusDispose?: () => void };
      try { w.__campusDispose?.(); } catch { /* 이미 정리됨 */ }
      w.__campusDispose = undefined;
      el.remove();
    };
  }, []);

  return (
    <div className="campus-root">
      <canvas id="cv" />

      <div className="hud">
        <div className="tools">
          <span id="count" hidden />
          <button id="roomBtn" className="chipbtn" hidden>방 꾸미기</button>
          <button id="dressBtn" className="chipbtn" hidden>꾸미기</button>
          {/* 포인트는 CTA 가 아니라 상태 표시다 — 초록 채움을 쓰지 않는다.
              숫자와 단위를 붙여 쓰면 "0P" 가 알파벳 OP 로 읽혀서 떼어 조판한다. */}
          <button id="bagBtn" className="chipbtn" aria-label="가방 열기">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
              <path d="M8 10h8" /><path d="M8 18h8" />
              <path d="M8 22v-6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6" />
              <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
            </svg>
            <b id="bagBells">0</b><i>P</i>
          </button>
        </div>

        {/* 가방·매점 패널과 방 꾸미기 툴바 — 내용은 맵(map.js)이 그때그때 그린다 */}
        <div className="panel" id="bagPanel" hidden />
        <div className="panel" id="shopPanel" hidden />
        <div className="panel" id="talkPanel" hidden />
        <div className="editbar" id="editBar" hidden />

        <div className="where" id="where">
          현재 위치 · <b>복도</b>
        </div>

        <div className="prompt" id="prompt">
          <h4 id="pTitle">내 방</h4>
          <p id="pSub">포인트로 넓히고 꾸미기</p>
          <button id="pBtn">
            {/* 동작 이름은 맵이 바꿔 쓴다(입장 / 나가기). 텍스트 노드째 다루면
                JSX 공백 처리에 따라 엉뚱한 자식을 잡으므로 span 으로 고정한다 */}
            <span id="pAct">입장</span> <kbd>Space</kbd>
          </button>
        </div>

        <div className="rot">
          <button id="rotL" aria-label="왼쪽으로 회전">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
          <button id="rotR" aria-label="오른쪽으로 회전">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          </button>
        </div>

        <div className="toast" id="toast" />
        <div id="err" ref={errRef} />
      </div>

      {/* 레벨 전환 암전. HUD 밖에 둔다 — .hud 는 pointer-events:none 이라
          전환 중 조작을 막지 못한다. 여기서 덮어야 실제로 막힌다. */}
      <div className="fade" id="fade" />

      {/* 첫 로딩 — 로고를 중심으로 링이 돌고 아래에 마을 소식 한 줄 */}
      {loading && (
        <div className="boot" role="status" aria-live="polite">
          <div className="boot-mark">
            <span className="boot-ring" aria-hidden="true" />
            <svg viewBox="0 0 96 96" width="46" height="46" aria-hidden="true">
              <path
                fill="#38a848"
                d="M 1.75 65.007812 L 27.445312 21.648438 L 55.066406 12.65625 L 90.078125 27.75 L 94.253906 59.871094 L 64.0625 83.316406 Z"
              />
              <path
                fill="#ffffff"
                d="M 50.8125 68.925781 L 40.554688 68.925781 L 40.554688 29.148438 L 51.988281 29.148438 C 56.453125 29.148438 59.609375 29.367188 61.460938 29.804688 C 63.289062 30.269531 64.828125 31.011719 66.074219 32.03125 C 67.566406 33.269531 68.695312 34.785156 69.453125 36.570312 C 70.261719 38.515625 70.652344 40.539062 70.628906 42.644531 C 70.628906 45.035156 70.234375 47.117188 69.453125 48.890625 C 68.710938 50.664062 67.585938 52.144531 66.074219 53.335938 C 64.875 54.257812 63.535156 54.890625 62.0625 55.234375 C 60.472656 55.617188 58.007812 55.8125 54.664062 55.808594 L 50.796875 55.808594 Z M 50.8125 47.070312 L 52.921875 47.070312 C 55.515625 47.070312 57.34375 46.710938 58.414062 45.992188 C 59.457031 45.269531 59.980469 44.050781 59.980469 42.328125 C 59.980469 40.65625 59.46875 39.46875 58.441406 38.761719 C 57.433594 38.058594 55.625 37.710938 53.011719 37.710938 L 50.8125 37.710938 Z"
              />
            </svg>
          </div>
          {stuck ? (
            <div className="boot-fail">
              <p className="boot-quip">3D 화면을 띄우지 못했어요.</p>
              <p className="boot-sub">브라우저가 3D(WebGL)를 지원하지 않거나 꺼져 있을 수 있어요.</p>
              <button type="button" className="boot-retry" onClick={() => location.reload()}>
                다시 시도
              </button>
            </div>
          ) : (
            <p className="boot-quip">{quip}</p>
          )}
        </div>
      )}
    </div>
  );
}
