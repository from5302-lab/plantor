"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import type {
  Chunk,
  FlowStage,
  GrammarCheck,
  PassageAnalysis,
  Sentence,
} from "@/lib/m2gosa/types";

// EXAM4YOU 스타일 톤 (지문분석지 느낌)
const C = {
  ink: "#1f2937",
  sub: "#4b5563",
  muted: "#9ca3af",
  teal: "#0f766e",
  tealBg: "#e7f3f1",
  tealLine: "#0f766e",
  role: "#2563eb", // 역할 라벨 (S/V/O…)
  gloss: "#b91c1c", // 뜻풀이
  highlight: "#fff3bf", // 핵심어 형광
  border: "#e5e7eb",
  cardShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
  radius: 8,
};

const ROLE_LABEL: Record<string, string> = {
  S: "S",
  V: "V",
  O: "O",
  IO: "I.O",
  DO: "D.O",
  C: "C",
  OC: "O.C",
  M: "M",
  conj: "접속",
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "inline-block",
        fontSize: 13,
        fontWeight: 700,
        color: "#fff",
        background: C.teal,
        padding: "4px 12px",
        borderRadius: C.radius,
        letterSpacing: "0.02em",
      }}
    >
      {children}
    </div>
  );
}

function ChunkView({ chunk }: { chunk: Chunk }) {
  const label = chunk.role ? ROLE_LABEL[chunk.role] : null;
  const textStyle: CSSProperties = {
    fontSize: 16,
    lineHeight: 1.4,
    color: C.ink,
    fontWeight: chunk.role === "V" ? 600 : 400,
    background: chunk.highlight ? C.highlight : "transparent",
    borderRadius: chunk.highlight ? 3 : 0,
    padding: chunk.highlight ? "0 2px" : 0,
  };
  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        margin: "0 5px 2px 0",
        verticalAlign: "bottom",
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: C.gloss,
          minHeight: 15,
          lineHeight: 1.2,
          whiteSpace: "nowrap",
        }}
      >
        {chunk.gloss || " "}
      </span>
      <span style={textStyle}>
        {chunk.bracket ? `⟨${chunk.text}⟩` : chunk.text}
      </span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.role,
          minHeight: 14,
          lineHeight: 1.2,
        }}
      >
        {label || " "}
      </span>
    </span>
  );
}

function CheckBox({ check }: { check: GrammarCheck }) {
  const [picked, setPicked] = useState<number | null>(null);
  const parts = check.prompt.split("___");
  const answered = picked !== null;
  const correct = picked === check.answer;

  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${C.teal}`,
        borderRadius: C.radius,
        padding: "10px 12px",
        marginTop: 10,
        background: "#fafafa",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: C.teal, marginBottom: 8 }}>
        CHECK · {check.label}
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.9, color: C.ink }}>
        {parts.map((p, i) => (
          <span key={i}>
            {p}
            {i < parts.length - 1 && (
              <span style={{ display: "inline-flex", gap: 6, margin: "0 6px", verticalAlign: "middle" }}>
                {check.options.map((opt, oi) => {
                  const isAnswer = oi === check.answer;
                  const isPicked = oi === picked;
                  let bg = "#fff";
                  let color = C.ink;
                  let border = C.border;
                  if (answered) {
                    if (isAnswer) {
                      bg = "#dcfce7";
                      color = "#15803d";
                      border = "#86efac";
                    } else if (isPicked) {
                      bg = "#fee2e2";
                      color = "#b91c1c";
                      border = "#fca5a5";
                    }
                  }
                  return (
                    <button
                      key={oi}
                      onClick={() => !answered && setPicked(oi)}
                      disabled={answered}
                      style={{
                        padding: "3px 12px",
                        borderRadius: 6,
                        background: bg,
                        color,
                        border: `1px solid ${border}`,
                        fontWeight: 600,
                        fontSize: 14,
                        cursor: answered ? "default" : "pointer",
                      }}
                    >
                      {opt}
                    </button>
                  );
                })}
              </span>
            )}
          </span>
        ))}
      </div>
      {answered && (
        <div
          style={{
            fontSize: 13,
            marginTop: 8,
            fontWeight: 600,
            color: correct ? "#15803d" : "#b91c1c",
          }}
        >
          {correct
            ? "정답이에요! 👍"
            : `아쉬워요. 정답은 "${check.options[check.answer]}"`}
        </div>
      )}
    </div>
  );
}

function SentenceBlock({ s, showMz }: { s: Sentence; showMz: boolean }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          style={{
            flexShrink: 0,
            fontSize: 12,
            fontWeight: 700,
            color: "#fff",
            background: C.sub,
            width: 20,
            height: 20,
            borderRadius: 6,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {s.num}
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end" }}>
          {s.chunks.map((c, i) => (
            <ChunkView key={i} chunk={c} />
          ))}
        </div>
      </div>

      <div
        style={{
          fontSize: 14,
          color: C.sub,
          lineHeight: 1.6,
          margin: "4px 0 0 28px",
          paddingLeft: 8,
          borderLeft: `2px solid ${C.tealBg}`,
        }}
      >
        <span style={{ color: C.teal, fontWeight: 700, marginRight: 6 }}>해석</span>
        {s.ko}
      </div>

      {showMz && s.mz && (
        <div
          style={{
            fontSize: 14,
            color: "#9a3412",
            lineHeight: 1.6,
            margin: "6px 0 0 28px",
            paddingLeft: 8,
            borderLeft: `2px solid #fde0c8`,
            background: "#fff7ed",
            borderRadius: "0 6px 6px 0",
            padding: "4px 8px",
          }}
        >
          <span style={{ color: "#c2410c", fontWeight: 700, marginRight: 6 }}>
            쉬운 해석
          </span>
          {s.mz}
        </div>
      )}

      {s.notes.length > 0 && (
        <ol
          style={{
            margin: "8px 0 0 28px",
            paddingLeft: 18,
            fontSize: 13,
            color: C.sub,
            lineHeight: 1.65,
          }}
        >
          {s.notes.map((n, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              {n}
            </li>
          ))}
        </ol>
      )}

      <div style={{ marginLeft: 28 }}>
        {s.check && <CheckBox check={s.check} />}
        {s.grammarPlus && (
          <div
            style={{
              border: `1px solid ${C.border}`,
              borderLeft: `3px solid #d97706`,
              borderRadius: C.radius,
              padding: "10px 12px",
              marginTop: 10,
              background: "#fffdf5",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#b45309",
                marginBottom: 6,
              }}
            >
              Grammar+ · {s.grammarPlus.title}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.65, color: C.ink }}>
              {s.grammarPlus.body}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FlowCheckView({ flow }: { flow: FlowStage[] }) {
  return (
    <div>
      <SectionTitle>Flow Check</SectionTitle>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(auto-fit, minmax(200px, 1fr))`,
          gap: 10,
          marginTop: 10,
        }}
      >
        {flow.map((f, i) => (
          <div
            key={i}
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: C.radius,
              overflow: "hidden",
              background: "#fff",
            }}
          >
            <div
              style={{
                background: C.tealBg,
                color: C.teal,
                fontSize: 12,
                fontWeight: 700,
                padding: "6px 10px",
              }}
            >
              {f.stage} ({f.range})
            </div>
            <div
              style={{
                padding: "8px 10px",
                fontSize: 13,
                lineHeight: 1.6,
                color: C.sub,
              }}
            >
              {f.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AnalysisView({ data }: { data: PassageAnalysis }) {
  const hasMz = data.sentences.some((s) => s.mz);
  const [showMz, setShowMz] = useState(false);
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        boxShadow: C.cardShadow,
        padding: "24px 22px",
        maxWidth: 860,
        margin: "0 auto",
      }}
    >
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#fff",
            background: C.teal,
            padding: "3px 10px",
            borderRadius: 6,
          }}
        >
          {data.topicTag}
        </span>
        <span style={{ fontSize: 12, color: C.muted }}>{data.grade}</span>
      </div>

      <h2 style={{ fontSize: 19, fontWeight: 700, color: C.ink, lineHeight: 1.4, margin: 0 }}>
        {data.titleEn}
      </h2>
      <p style={{ fontSize: 14, color: C.muted, margin: "4px 0 16px" }}>{data.titleKo}</p>

      {/* 요약 화살표 박스 */}
      <div
        style={{
          background: C.tealBg,
          border: `1px solid ${C.teal}22`,
          borderRadius: C.radius,
          padding: "12px 14px",
          marginBottom: 16,
        }}
      >
        {data.summary.map((s, i) => (
          <div key={i}>
            {i > 0 && (
              <div style={{ textAlign: "center", color: C.teal, fontSize: 14 }}>↓</div>
            )}
            <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.6, textAlign: "center" }}>
              {s}
            </div>
          </div>
        ))}
      </div>

      {/* 내용 요약 */}
      <div style={{ marginBottom: 18 }}>
        <SectionTitle>내용</SectionTitle>
        <p style={{ fontSize: 14, lineHeight: 1.75, color: C.sub, marginTop: 8 }}>
          {data.content}
        </p>
      </div>

      {/* Flow Check */}
      <div style={{ marginBottom: 22 }}>
        <FlowCheckView flow={data.flow} />
      </div>

      {/* 문장별 구문분석 */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <SectionTitle>지문 분석</SectionTitle>
          {hasMz && (
            <button
              onClick={() => setShowMz((v) => !v)}
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: showMz ? "#fff" : "#c2410c",
                background: showMz ? "#c2410c" : "#fff7ed",
                border: "1px solid #f0a36b",
                borderRadius: 6,
                padding: "4px 10px",
                cursor: "pointer",
              }}
            >
              {showMz ? "✓ 쉬운 해석 켜짐" : "쉬운 해석(MZ체) 보기"}
            </button>
          )}
        </div>
        <div style={{ marginTop: 14 }}>
          {data.sentences.map((s) => (
            <SentenceBlock key={s.num} s={s} showMz={showMz} />
          ))}
        </div>
      </div>

      {/* 원문 문제 */}
      <div style={{ marginBottom: 22 }}>
        <SectionTitle>원본 문제</SectionTitle>
        <div
          style={{
            marginTop: 12,
            border: `1px solid ${C.border}`,
            borderRadius: C.radius,
            padding: "14px 16px",
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 700, color: C.ink, margin: "0 0 10px" }}>
            {data.question.stem}
          </p>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.75,
              color: C.ink,
              whiteSpace: "pre-wrap",
              margin: "0 0 12px",
            }}
          >
            {data.question.passage}
          </p>
          <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
            {data.question.choices.map((c, i) => {
              const correct = i + 1 === data.question.answer;
              return (
                <li
                  key={i}
                  style={{
                    fontSize: 14,
                    lineHeight: 1.8,
                    color: correct ? C.teal : C.sub,
                    fontWeight: correct ? 700 : 400,
                  }}
                >
                  {"①②③④⑤⑥⑦⑧⑨⑩"[i] || `${i + 1}.`} {c}
                  {correct && " ✓"}
                </li>
              );
            })}
          </ol>
          {data.question.explanation && (
            <div
              style={{
                marginTop: 12,
                fontSize: 13,
                lineHeight: 1.65,
                color: C.sub,
                background: "#fafafa",
                borderRadius: 6,
                padding: "10px 12px",
              }}
            >
              <span style={{ color: C.teal, fontWeight: 700, marginRight: 6 }}>
                [정답 {data.question.answer}]
              </span>
              {data.question.explanation}
            </div>
          )}
        </div>
      </div>

      {/* 어휘 */}
      <div style={{ marginBottom: 18 }}>
        <SectionTitle>WORDS &amp; EXPRESSIONS</SectionTitle>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "4px 18px",
            marginTop: 12,
            border: `1px solid ${C.border}`,
            borderRadius: C.radius,
            padding: "12px 14px",
          }}
        >
          {data.words.map((w, i) => (
            <div
              key={i}
              style={{ fontSize: 13, lineHeight: 1.7, display: "flex", gap: 8 }}
            >
              <span style={{ fontWeight: 600, color: C.ink, minWidth: 110 }}>{w.en}</span>
              <span style={{ color: C.sub }}>{w.ko}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 출제 가능 유형 */}
      {data.questionTypes.length > 0 && (
        <div>
          <SectionTitle>출제 가능 유형</SectionTitle>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {data.questionTypes.map((t, i) => (
              <span
                key={i}
                style={{
                  fontSize: 13,
                  color: C.teal,
                  background: C.tealBg,
                  border: `1px solid ${C.teal}33`,
                  borderRadius: 6,
                  padding: "4px 10px",
                }}
              >
                ✓ {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
