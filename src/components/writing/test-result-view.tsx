"use client";

import { T } from "@/lib/design-tokens";
import { ScoreBar } from "./score-bar";
import { SCORE_LABELS, getLevel, type TestResult } from "@/lib/writing/test-types";

interface Props {
  result: TestResult;
}

export function TestResultView({ result }: Props) {
  const levelDef = getLevel(result.totalScore);

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 24px 80px" }}>
      {/* Level Hero */}
      <div
        style={{
          textAlign: "center",
          marginBottom: 40,
          padding: "32px 24px",
          background: T.bg,
          borderRadius: 16,
        }}
      >
        <div
          style={{
            display: "inline-block",
            background: "#f0faf1",
            color: "#2a8438",
            fontSize: 12,
            fontWeight: 600,
            padding: "4px 12px",
            borderRadius: 9999,
            marginBottom: 16,
            letterSpacing: "0.125px",
          }}
        >
          Your Result
        </div>
        <div
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: T.textPrimary,
            letterSpacing: "-2px",
            lineHeight: 1,
          }}
        >
          {result.totalScore}
          <span style={{ fontSize: 20, fontWeight: 400, color: T.textMuted }}>/60</span>
        </div>
        <div
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: T.teal,
            marginTop: 8,
          }}
        >
          {levelDef.label}: {levelDef.name}
        </div>
        <p style={{ fontSize: 15, color: T.textSecondary, marginTop: 8 }}>
          {levelDef.description}
        </p>
      </div>

      {/* 6-Axis Scores */}
      <div className="card-base" style={{ padding: "24px 28px", marginBottom: 24 }}>
        <h3
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: T.textPrimary,
            marginBottom: 20,
          }}
        >
          Score Breakdown
        </h3>
        {(Object.keys(SCORE_LABELS) as (keyof typeof SCORE_LABELS)[]).map((key) => (
          <ScoreBar key={key} label={SCORE_LABELS[key]} score={result.scores[key]} />
        ))}
      </div>

      {/* Strengths */}
      {result.strengths.length > 0 && (
        <div className="card-base" style={{ padding: "24px 28px", marginBottom: 16 }}>
          <h3
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: T.teal,
              marginBottom: 12,
            }}
          >
            Strengths
          </h3>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {result.strengths.map((s, i) => (
              <li
                key={i}
                style={{ fontSize: 14, color: T.textPrimary, lineHeight: 1.6, marginBottom: 4 }}
              >
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Error Patterns */}
      {result.errorPatterns.length > 0 && (
        <div className="card-base" style={{ padding: "24px 28px", marginBottom: 16 }}>
          <h3
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "#dd5b00",
              marginBottom: 12,
            }}
          >
            Areas to Improve
          </h3>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {result.errorPatterns.map((e, i) => (
              <li
                key={i}
                style={{ fontSize: 14, color: T.textPrimary, lineHeight: 1.6, marginBottom: 4 }}
              >
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* AI Comment */}
      {result.overallComment && (
        <div
          style={{
            padding: "20px 24px",
            background: T.bg,
            borderRadius: 12,
            marginBottom: 32,
          }}
        >
          <p style={{ fontSize: 14, color: T.textPrimary, lineHeight: 1.6, margin: 0 }}>
            {result.overallComment}
          </p>
        </div>
      )}

      {/* CTA */}
      <div style={{ textAlign: "center" }}>
        <button
          className="btn-primary"
          disabled
          style={{
            background: "rgba(0,0,0,0.08)",
            color: T.textMuted,
            border: "none",
            borderRadius: 4,
            padding: "12px 32px",
            fontSize: 16,
            fontWeight: 600,
            cursor: "default",
          }}
        >
          Daily Training Coming Soon
        </button>
        <p style={{ fontSize: 13, color: T.textMuted, marginTop: 12 }}>
          매일 15분씩 AI 코칭으로 글쓰기 실력을 키워보세요
        </p>
      </div>
    </div>
  );
}
