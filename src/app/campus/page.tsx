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

import { useEffect, useRef } from "react";
import "./campus.css";

export default function CampusPage() {
  const errRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
          <button id="dressBtn" hidden>꾸미기</button>
        </div>

        <div className="where" id="where">
          현재 위치 · <b>복도</b>
        </div>

        <div className="prompt" id="prompt">
          <h4 id="pTitle">개인 자습실</h4>
          <p id="pSub">플래닝 · 자습 인증</p>
          <button id="pBtn">
            입장 <kbd>Space</kbd>
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
    </div>
  );
}
