"use client";

import type { NoteMeta } from "@/lib/note/firestore";

type Props = {
  meta: NoteMeta | undefined;
  onClick: () => void;
};

export function MetaBar({ meta, onClick }: Props) {
  const m = meta ?? {};
  const parts: string[] = [];

  const ctx = [m.grade, m.subject, m.publisher].filter(Boolean).join(" · ");
  if (ctx) parts.push(ctx);
  if (m.largeUnit) parts.push(m.largeUnit);
  if (m.middleUnit) parts.push(m.middleUnit);
  if (m.smallUnit) parts.push(m.smallUnit);

  return (
    <button className="meta-bar" onClick={onClick} type="button">
      {parts.length === 0 ? (
        <span className="meta-bar-empty">📚 단원 선택</span>
      ) : (
        parts.map((p, i) => (
          <span key={i} className="meta-crumb-wrap">
            {i > 0 && <span className="meta-crumb-sep">/</span>}
            <span className="meta-crumb">{p}</span>
          </span>
        ))
      )}
      <style>{styles}</style>
    </button>
  );
}

const styles = `
  .meta-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0;
    width: 100%;
    background: transparent;
    border: none;
    padding: 8px 12px;
    margin-bottom: 8px;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
    font-family: inherit;
  }
  .meta-bar:hover { background: rgba(0,0,0,0.04); }
  .meta-crumb-wrap { display: inline-flex; align-items: center; }
  .meta-crumb {
    font-size: 13px;
    font-weight: 500;
    color: rgba(0,0,0,0.75);
    padding: 2px 6px;
    border-radius: 3px;
  }
  .meta-crumb-sep {
    font-size: 13px;
    color: rgba(0,0,0,0.25);
    margin: 0 2px;
    user-select: none;
  }
  .meta-bar-empty {
    font-size: 13px;
    color: rgba(0,0,0,0.35);
    padding: 2px 0;
  }
`;
