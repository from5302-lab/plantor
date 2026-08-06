"use client";

import { T } from "@/lib/design-tokens";

/** 6축 각각 고유 색상 */
const CATEGORY_COLORS: Record<string, string> = {
  "Grammar & Mechanics": "#5B8DEF",
  "Vocabulary Range": "#1f7a33",
  "Sentence Complexity": "#9B59B6",
  "Organization": "#E67E22",
  "Argument & Evidence": "#E84393",
  "Voice & Style": "#00B894",
};

interface Props {
  label: string;
  score: number;
  maxScore?: number;
}

export function ScoreBar({ label, score, maxScore = 10 }: Props) {
  const pct = Math.round((score / maxScore) * 100);
  const color = CATEGORY_COLORS[label] ?? T.teal;

  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 500, color: T.textPrimary }}>
          {label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
          {score}/{maxScore}
        </span>
      </div>
      <div
        style={{
          height: 8,
          background: "rgba(0,0,0,0.06)",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: color,
            borderRadius: 4,
            transition: "width 0.6s ease",
          }}
        />
      </div>
    </div>
  );
}
