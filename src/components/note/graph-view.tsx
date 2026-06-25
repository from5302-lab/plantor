"use client";

import { useEffect, useRef, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import type { FunctionPlotOptions } from "function-plot";

export function GraphView({ node, updateAttributes }: NodeViewProps) {
  const fn = (node.attrs.fn as string) ?? "";
  const targetRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;
    if (!fn.trim()) {
      target.innerHTML = "";
      setError(false);
      return;
    }
    let cancelled = false;
    import("function-plot").then(({ default: functionPlot }) => {
      const el = targetRef.current;
      if (cancelled || !el) return;
      try {
        el.innerHTML = "";
        // function-plot의 fn 타입(Function)이 느슨해 문자열식은 캐스팅으로 전달
        functionPlot({
          target: el,
          width: el.clientWidth || 360,
          height: 240,
          grid: true,
          data: [{ fn }],
        } as unknown as FunctionPlotOptions);
        setError(false);
      } catch {
        el.innerHTML = "";
        if (!cancelled) setError(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fn]);

  const showGraph = !!fn.trim() && !error;

  return (
    <NodeViewWrapper className="graph-node" contentEditable={false}>
      <div className="graph-input-row">
        <span className="graph-prefix">y =</span>
        <input
          className="graph-input"
          value={fn}
          placeholder="함수식 (예: x^2, sin(x))"
          spellCheck={false}
          onChange={(e) => updateAttributes({ fn: e.target.value })}
        />
      </div>
      <div className="graph-render">
        {!fn.trim() && <span className="graph-hint">함수식을 입력하면 그래프가 그려집니다</span>}
        {!!fn.trim() && error && <span className="graph-error">함수식을 해석할 수 없어요</span>}
        <div
          ref={targetRef}
          className="graph-target"
          style={{ display: showGraph ? "block" : "none" }}
        />
      </div>
      <style>{styles}</style>
    </NodeViewWrapper>
  );
}

const styles = `
  .graph-node {
    border: 1px solid rgba(0,0,0,0.1);
    border-radius: 8px;
    padding: 12px;
    margin: 6px 0;
    background: #fff;
  }
  .graph-input-row { display: flex; align-items: center; gap: 6px; }
  .graph-prefix {
    font-size: 13px;
    color: rgba(0,0,0,0.5);
    font-family: "SFMono-Regular", Menlo, Consolas, monospace;
  }
  .graph-input {
    flex: 1;
    border: 1px solid rgba(0,0,0,0.12);
    border-radius: 5px;
    padding: 6px 9px;
    font-size: 13px;
    font-family: "SFMono-Regular", Menlo, Consolas, monospace;
    color: rgba(0,0,0,0.85);
    outline: none;
  }
  .graph-input:focus { border-color: rgba(0,0,0,0.4); }
  .graph-render {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 120px;
    margin-top: 8px;
  }
  .graph-target { width: 100%; }
  .graph-target svg { max-width: 100%; }
  .graph-hint, .graph-error { font-size: 13px; color: rgba(0,0,0,0.4); }
  .graph-error { color: #b91c1c; }
`;
