"use client";

import { useState, useEffect } from "react";
import { T } from "@/lib/design-tokens";

const RED = "#e53e3e";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}분 ${String(s).padStart(2, "0")}초`;
}

export function AttendanceWidget({
  startTime,
  interrupted,
  onEnd,
  onRestart,
}: {
  startTime: Date;
  interrupted: boolean;
  onEnd: () => void;
  onRestart?: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  const bg = interrupted ? RED : T.teal;
  const btnBase: React.CSSProperties = { flex: 1, height: 34, borderRadius: T.radius.sm, fontSize: 12, fontWeight: 600, color: T.white, cursor: "pointer" };

  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 900, backgroundColor: bg, borderRadius: T.radius.lg, boxShadow: T.shadowFloat, padding: "14px 18px", minWidth: 220, transition: "background-color 0.3s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: interrupted ? T.white : "#ff3b30", flexShrink: 0, boxShadow: interrupted ? "none" : "0 0 0 3px rgba(255,59,48,0.5)", animation: interrupted ? "none" : "recpulse 1.5s infinite" }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: T.white, letterSpacing: "-0.1px" }}>
          {interrupted ? "화면 공유가 끊겼어요!" : "학습활동 모니터 중이에요!"}
        </span>
      </div>

      {!interrupted && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", marginBottom: 12, paddingLeft: 16 }}>⏱ {formatDuration(elapsed)}</div>}
      {interrupted && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.9)", marginBottom: 12, paddingLeft: 16, lineHeight: 1.5 }}>화면 공유를 다시 시작하거나<br/>수업을 종료해 주세요.</div>}

      <div style={{ display: "flex", gap: 8 }}>
        {interrupted && onRestart && (
          <button onClick={onRestart} style={{ ...btnBase, border: "none", backgroundColor: "rgba(255,255,255,0.25)", fontWeight: 700 }}>↺ 다시 공유</button>
        )}
        <button onClick={onEnd} style={{ ...btnBase, border: "none", backgroundColor: "rgba(0,0,0,0.2)" }}>학습 마치기</button>
      </div>

      <style>{`@keyframes recpulse { 0%,100%{box-shadow:0 0 0 3px rgba(255,59,48,0.5)} 50%{box-shadow:0 0 0 7px rgba(255,59,48,0.15)} }`}</style>
    </div>
  );
}
