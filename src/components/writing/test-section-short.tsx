"use client";

import { T } from "@/lib/design-tokens";
import { SHORT_RESPONSE_PROMPT } from "@/lib/writing/test-data";

interface Props {
  response: string;
  onChange: (text: string) => void;
  onNext: () => void;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function TestSectionShort({ response, onChange, onNext }: Props) {
  const wc = wordCount(response);
  const minMet = wc >= SHORT_RESPONSE_PROMPT.minWords;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 24px" }}>
      <div style={{ marginBottom: 24 }}>
        <div className="overline" style={{ marginBottom: 8 }}>
          Section 1 — Short Response
        </div>
        <div style={{ fontSize: 13, color: T.textMuted }}>
          Write 4-5 sentences
        </div>
      </div>

      <div className="card-base" style={{ padding: "20px 24px", marginBottom: 20 }}>
        <p style={{ fontSize: 14, color: T.textSecondary, marginBottom: 8 }}>
          {SHORT_RESPONSE_PROMPT.instruction}
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
          &ldquo;{SHORT_RESPONSE_PROMPT.prompt}&rdquo;
        </p>
      </div>

      <textarea
        value={response}
        onChange={(e) => onChange(e.target.value)}
        className="input-base"
        style={{
          minHeight: 180,
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
          {wc} words {!minMet && `(min ${SHORT_RESPONSE_PROMPT.minWords})`}
        </span>
      </div>

      <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
        <button
          className="btn-primary"
          disabled={!minMet}
          onClick={onNext}
          style={{
            background: minMet ? T.teal : "rgba(0,0,0,0.08)",
            color: minMet ? "#fff" : T.textMuted,
            border: "none",
            borderRadius: 4,
            padding: "10px 24px",
            fontSize: 15,
            fontWeight: 600,
            cursor: minMet ? "pointer" : "default",
          }}
        >
          Next Section →
        </button>
      </div>
    </div>
  );
}
