"use client";

import { T } from "@/lib/design-tokens";
import { ESSAY_INTRO_PROMPT } from "@/lib/writing/test-data";

interface Props {
  response: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function TestSectionEssay({ response, onChange, onSubmit, submitting }: Props) {
  const wc = wordCount(response);
  const minMet = wc >= ESSAY_INTRO_PROMPT.minWords;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 24px" }}>
      <div style={{ marginBottom: 24 }}>
        <div className="overline" style={{ marginBottom: 8 }}>
          Section 2 — Essay Introduction
        </div>
        <div style={{ fontSize: 13, color: T.textMuted }}>
          Write an introduction paragraph with a hook, background, and thesis
        </div>
      </div>

      <div className="card-base" style={{ padding: "20px 24px", marginBottom: 20 }}>
        <p style={{ fontSize: 14, color: T.textSecondary, marginBottom: 8 }}>
          {ESSAY_INTRO_PROMPT.instruction}
        </p>
        <p
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: T.textPrimary,
            lineHeight: 1.5,
            margin: 0,
            fontStyle: "italic",
          }}
        >
          &ldquo;{ESSAY_INTRO_PROMPT.prompt}&rdquo;
        </p>
      </div>

      <textarea
        value={response}
        onChange={(e) => onChange(e.target.value)}
        className="input-base"
        style={{
          minHeight: 220,
          resize: "vertical",
          lineHeight: 1.6,
          fontSize: 15,
        }}
      />

      <div
        style={{
          marginTop: 8,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 13,
            color: minMet ? T.teal : T.textMuted,
            fontWeight: minMet ? 600 : 400,
          }}
        >
          {wc} words {!minMet && `(min ${ESSAY_INTRO_PROMPT.minWords})`}
        </span>
      </div>

      <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
        <button
          className="btn-primary"
          disabled={!minMet || submitting}
          onClick={onSubmit}
          style={{
            background: !minMet || submitting ? "rgba(0,0,0,0.08)" : T.teal,
            color: !minMet || submitting ? T.textMuted : "#fff",
            border: "none",
            borderRadius: 4,
            padding: "10px 24px",
            fontSize: 15,
            fontWeight: 600,
            cursor: !minMet || submitting ? "default" : "pointer",
          }}
        >
          {submitting ? "Analyzing..." : "Submit & View Results"}
        </button>
      </div>
    </div>
  );
}
