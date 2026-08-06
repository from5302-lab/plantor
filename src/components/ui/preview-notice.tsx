"use client";

import { useEffect, useState } from "react";

/**
 * 어드민 미리보기 전용 안내.
 *
 * 미리보기의 목적은 **학생·학부모가 보는 화면을 그대로 파악하는 것**이다.
 * 그래서 화면에 "여기는 잠겼습니다" 류의 문구를 심으면 안 된다 — 그 순간
 * 운영자가 보는 화면이 학생 화면과 달라져 파악이 안 된다.
 *
 * 대신 버튼은 학생 것과 똑같이 그리고, 눌렀을 때만 저장을 건너뛰며
 * 화면 아래에 잠깐 알린다. 눌린 느낌은 그대로 두고 데이터만 지킨다.
 */
const EVENT = "plantor:preview-blocked";

export function notifyPreview(message = "미리보기라 저장되지 않았어요") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: message }));
}

export function PreviewNotice() {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function onBlocked(e: Event) {
      setMsg(String((e as CustomEvent).detail ?? ""));
      clearTimeout(timer);
      timer = setTimeout(() => setMsg(null), 2200);
    }
    window.addEventListener(EVENT, onBlocked);
    return () => { window.removeEventListener(EVENT, onBlocked); clearTimeout(timer); };
  }, []);

  if (!msg) return null;
  return (
    <div className="fixed inset-x-0 bottom-5 z-[2000] flex justify-center px-4 pointer-events-none">
      <div className="rounded-lg bg-black/80 px-4 py-2.5 text-[13px] font-semibold text-white">
        {msg}
      </div>
    </div>
  );
}
