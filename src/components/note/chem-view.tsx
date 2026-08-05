"use client";

import { useEffect, useRef, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

type SmiDrawerInstance = {
  draw: (
    smiles: string,
    target: Element,
    theme?: string,
    onSuccess?: () => void,
    onError?: (err: unknown) => void,
  ) => void;
};

declare global {
  interface Window {
    SmiDrawer?: new (moleculeOptions?: object, reactionOptions?: object) => SmiDrawerInstance;
  }
}

// dist 번들을 한 번만 로드 (window.SmiDrawer 노출)
let loadPromise: Promise<void> | null = null;
function loadSmiles(): Promise<void> {
  if (typeof window !== "undefined" && window.SmiDrawer) return Promise.resolve();
  if (!loadPromise) {
    loadPromise = import("smiles-drawer/dist/smiles-drawer.min.js").then(() => undefined);
  }
  return loadPromise;
}

export function ChemView({ node, updateAttributes }: NodeViewProps) {
  const smiles = (node.attrs.smiles as string) ?? "";
  const svgRef = useRef<SVGSVGElement>(null);
  const [error, setError] = useState(false);

  // 입력이 바뀌면 오류 표시를 먼저 지운다 — 새 식의 판정은 그리기 콜백이 내린다.
  // 이펙트에서 지우면 이전 오류 문구가 한 번 더 그려진 뒤에야 사라진다
  // (React 공식 "prop이 바뀔 때 state 조정" 패턴)
  const [prevSmiles, setPrevSmiles] = useState(smiles);
  if (smiles !== prevSmiles) {
    setPrevSmiles(smiles);
    setError(false);
  }

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    if (!smiles.trim()) {
      svg.innerHTML = "";
      return;
    }
    let cancelled = false;
    loadSmiles().then(() => {
      if (cancelled || !window.SmiDrawer) return;
      try {
        svg.innerHTML = "";
        const drawer = new window.SmiDrawer({});
        drawer.draw(
          smiles,
          svg,
          "light",
          () => !cancelled && setError(false),
          () => !cancelled && setError(true),
        );
      } catch {
        if (!cancelled) setError(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [smiles]);

  return (
    <NodeViewWrapper className="chem-node" contentEditable={false}>
      <input
        className="chem-input"
        value={smiles}
        placeholder="SMILES 입력 (예: CCO, c1ccccc1)"
        spellCheck={false}
        onChange={(e) => updateAttributes({ smiles: e.target.value })}
      />
      <div className="chem-render">
        {!smiles.trim() && <span className="chem-hint">분자식을 입력하면 구조가 그려집니다</span>}
        {!!smiles.trim() && error && <span className="chem-error">잘못된 SMILES 식이에요</span>}
        <svg
          ref={svgRef}
          className="chem-svg"
          style={{ display: !!smiles.trim() && !error ? "block" : "none" }}
        />
      </div>
      <style>{styles}</style>
    </NodeViewWrapper>
  );
}

const styles = `
  .chem-node {
    border: 1px solid rgba(0,0,0,0.1);
    border-radius: 8px;
    padding: 12px;
    margin: 6px 0;
    background: #fff;
  }
  .chem-input {
    width: 100%;
    border: 1px solid rgba(0,0,0,0.12);
    border-radius: 5px;
    padding: 6px 9px;
    font-size: 13px;
    font-family: "SFMono-Regular", Menlo, Consolas, monospace;
    color: rgba(0,0,0,0.85);
    outline: none;
  }
  .chem-input:focus { border-color: rgba(0,0,0,0.4); }
  .chem-render {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 120px;
    margin-top: 8px;
  }
  .chem-svg { max-width: 100%; height: auto; }
  .chem-hint, .chem-error { font-size: 13px; color: rgba(0,0,0,0.4); }
  .chem-error { color: #b91c1c; }
`;
