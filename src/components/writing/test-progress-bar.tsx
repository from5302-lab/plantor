"use client";

import { T } from "@/lib/design-tokens";
import type { SectionType } from "@/lib/writing/test-types";

const SECTIONS: { key: SectionType; label: string }[] = [
  { key: "short", label: "Short Response" },
  { key: "essay", label: "Essay Intro" },
];

interface Props {
  currentSection: SectionType;
  timeLeft: number;
  totalTime: number;
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TestProgressBar({ currentSection, timeLeft, totalTime }: Props) {
  const currentIdx = SECTIONS.findIndex((s) => s.key === currentSection);
  const timeRatio = totalTime > 0 ? timeLeft / totalTime : 1;
  const isLow = timeLeft <= 30;

  return (
    <div
      style={{
        padding: "12px 24px",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      {/* 섹션 인디케이터 */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {SECTIONS.map((s, i) => {
          const isDone = i < currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  background: isDone ? T.teal : isCurrent ? T.teal : "rgba(0,0,0,0.06)",
                  color: isDone || isCurrent ? "#fff" : T.textMuted,
                  transition: "all 0.2s",
                }}
              >
                {isDone ? "✓" : i + 1}
              </div>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: isCurrent ? 600 : 400,
                  color: isCurrent ? T.textPrimary : T.textMuted,
                }}
              >
                {s.label}
              </span>
              {i < SECTIONS.length - 1 && (
                <div
                  style={{
                    width: 24,
                    height: 2,
                    background: isDone ? T.teal : "rgba(0,0,0,0.1)",
                    borderRadius: 1,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 타이머 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 80,
            height: 6,
            background: "rgba(0,0,0,0.06)",
            borderRadius: 3,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${timeRatio * 100}%`,
              height: "100%",
              background: isLow ? "#dd5b00" : T.teal,
              borderRadius: 3,
              transition: "width 1s linear",
            }}
          />
        </div>
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: isLow ? "#dd5b00" : T.textPrimary,
            fontVariantNumeric: "tabular-nums",
            minWidth: 40,
          }}
        >
          {formatTime(timeLeft)}
        </span>
      </div>
    </div>
  );
}
