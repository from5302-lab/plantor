"use client";

import { useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

type Token = { text: string; label: string | null };

// 영어 구문분석 라벨 — 문장성분 5종 + 품사 5종 (수업에서 가장 흔한 세트)
const LABELS: { key: string; name: string; color: string; group: "문장성분" | "품사" }[] = [
  { key: "S", name: "주어", color: "#2563eb", group: "문장성분" },
  { key: "V", name: "동사", color: "#dc2626", group: "문장성분" },
  { key: "O", name: "목적어", color: "#16a34a", group: "문장성분" },
  { key: "C", name: "보어", color: "#9333ea", group: "문장성분" },
  { key: "M", name: "수식어", color: "#ea580c", group: "문장성분" },
  { key: "n", name: "명사", color: "#0891b2", group: "품사" },
  { key: "adj", name: "형용사", color: "#ca8a04", group: "품사" },
  { key: "adv", name: "부사", color: "#65a30d", group: "품사" },
  { key: "prep", name: "전치사", color: "#db2777", group: "품사" },
  { key: "conj", name: "접속사", color: "#4f46e5", group: "품사" },
];

const colorOf = (key: string | null) => LABELS.find((l) => l.key === key)?.color;
const nameOf = (key: string | null) => LABELS.find((l) => l.key === key)?.name;

export function SyntaxView({ node, updateAttributes }: NodeViewProps) {
  const sentence = (node.attrs.sentence as string) ?? "";
  const tokens = (node.attrs.tokens as Token[]) ?? [];
  const [draft, setDraft] = useState(sentence);
  const [selected, setSelected] = useState<number | null>(null);

  const tokenize = () => {
    const parts = draft.trim().split(/\s+/).filter(Boolean);
    updateAttributes({ sentence: draft, tokens: parts.map((t) => ({ text: t, label: null })) });
    setSelected(null);
  };

  const edit = () => {
    setDraft(sentence);
    updateAttributes({ tokens: [] });
    setSelected(null);
  };

  const setLabel = (key: string | null) => {
    if (selected == null) return;
    updateAttributes({
      tokens: tokens.map((t, i) => (i === selected ? { ...t, label: key } : t)),
    });
  };

  // 입력 단계
  if (tokens.length === 0) {
    return (
      <NodeViewWrapper className="syntax-node" contentEditable={false}>
        <textarea
          className="syntax-textarea"
          rows={2}
          value={draft}
          placeholder="분석할 영어 문장을 입력하세요"
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          className="syntax-btn"
          disabled={!draft.trim()}
          onMouseDown={(e) => {
            e.preventDefault();
            tokenize();
          }}
        >
          분석하기
        </button>
        <style>{styles}</style>
      </NodeViewWrapper>
    );
  }

  // 태깅 단계
  return (
    <NodeViewWrapper className="syntax-node" contentEditable={false}>
      <div className="syntax-tokens">
        {tokens.map((t, i) => (
          <button
            key={i}
            className={`syntax-token ${selected === i ? "is-sel" : ""}`}
            style={t.label ? { borderBottomColor: colorOf(t.label) } : undefined}
            onMouseDown={(e) => {
              e.preventDefault();
              setSelected(selected === i ? null : i);
            }}
          >
            <span className="tok-text">{t.text}</span>
            {t.label && (
              <span className="tok-label" style={{ color: colorOf(t.label) }}>
                {nameOf(t.label)}
              </span>
            )}
          </button>
        ))}
      </div>

      {selected != null && (
        <div className="syntax-palette">
          {(["문장성분", "품사"] as const).map((group) => (
            <div key={group} className="palette-group">
              <span className="palette-glabel">{group}</span>
              {LABELS.filter((l) => l.group === group).map((l) => (
                <button
                  key={l.key}
                  className="palette-btn"
                  style={{ color: l.color, borderColor: l.color }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setLabel(l.key);
                  }}
                >
                  {l.name}
                </button>
              ))}
            </div>
          ))}
          <button
            className="palette-clear"
            onMouseDown={(e) => {
              e.preventDefault();
              setLabel(null);
            }}
          >
            라벨 지우기
          </button>
        </div>
      )}

      <button
        className="syntax-edit"
        onMouseDown={(e) => {
          e.preventDefault();
          edit();
        }}
      >
        문장 수정
      </button>
      <style>{styles}</style>
    </NodeViewWrapper>
  );
}

const styles = `
  .syntax-node {
    border: 1px solid rgba(0,0,0,0.1);
    border-radius: 8px;
    padding: 12px;
    margin: 6px 0;
    background: #fff;
  }
  .syntax-textarea {
    width: 100%;
    border: 1px solid rgba(0,0,0,0.12);
    border-radius: 5px;
    padding: 8px 10px;
    font-size: 14px;
    font-family: inherit;
    color: rgba(0,0,0,0.85);
    outline: none;
    resize: vertical;
  }
  .syntax-textarea:focus { border-color: rgba(0,0,0,0.4); }
  .syntax-btn {
    margin-top: 8px;
    padding: 6px 14px;
    border: 1px solid rgba(0,0,0,0.4);
    border-radius: 5px;
    background: #fff;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
  }
  .syntax-btn:disabled { opacity: 0.4; cursor: default; }

  .syntax-tokens {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 4px;
    align-items: flex-end;
  }
  .syntax-token {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    border: none;
    border-bottom: 2px solid transparent;
    background: transparent;
    padding: 2px 3px 1px;
    cursor: pointer;
    font-family: inherit;
    border-radius: 3px 3px 0 0;
  }
  .syntax-token:hover { background: rgba(0,0,0,0.04); }
  .syntax-token.is-sel { background: rgba(35,131,226,0.12); }
  .tok-text { font-size: 16px; color: rgba(0,0,0,0.88); line-height: 1.4; }
  .tok-label { font-size: 10px; font-weight: 600; }

  .syntax-palette {
    margin-top: 12px;
    padding: 10px;
    background: rgba(0,0,0,0.03);
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .palette-group { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
  .palette-glabel { font-size: 11px; color: rgba(0,0,0,0.45); width: 52px; flex-shrink: 0; }
  .palette-btn {
    border: 1px solid;
    background: #fff;
    border-radius: 12px;
    padding: 3px 10px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .palette-clear {
    align-self: flex-start;
    border: none;
    background: transparent;
    color: rgba(0,0,0,0.5);
    font-size: 12px;
    cursor: pointer;
    text-decoration: underline;
    font-family: inherit;
    padding: 0;
  }
  .syntax-edit {
    margin-top: 10px;
    border: none;
    background: transparent;
    color: rgba(0,0,0,0.5);
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
    padding: 0;
  }
  .syntax-edit:hover { color: rgba(0,0,0,0.8); }
`;
