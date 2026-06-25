"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import type { SlashItem } from "@/lib/note/slash-command";

export type SlashMenuHandle = { onKeyDown: (e: KeyboardEvent) => boolean };

type MenuProps = {
  items: SlashItem[];
  command: (item: SlashItem) => void;
  clientRect?: (() => DOMRect | null) | null;
};

const SlashMenu = forwardRef<SlashMenuHandle, MenuProps>(function SlashMenu(
  { items, command, clientRect },
  ref,
) {
  const [selected, setSelected] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSelected(0), [items]);

  // 커서 위치 기준으로 팝업 배치 (아래 공간 부족하면 위로)
  useLayoutEffect(() => {
    const rect = clientRect?.();
    const box = boxRef.current;
    if (!rect || !box) return;
    const gap = 6;
    const left = Math.min(rect.left, window.innerWidth - box.offsetWidth - 12);
    box.style.left = `${Math.max(8, left)}px`;
    const spaceBelow = window.innerHeight - rect.bottom;
    box.style.top =
      spaceBelow < box.offsetHeight + 20
        ? `${rect.top - box.offsetHeight - gap}px`
        : `${rect.bottom + gap}px`;
  });

  const pick = (i: number) => {
    const it = items[i];
    if (it) command(it);
  };

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: (e) => {
        if (!items.length) return false;
        if (e.key === "ArrowDown") {
          setSelected((s) => (s + 1) % items.length);
          return true;
        }
        if (e.key === "ArrowUp") {
          setSelected((s) => (s - 1 + items.length) % items.length);
          return true;
        }
        if (e.key === "Enter") {
          pick(selected);
          return true;
        }
        return false;
      },
    }),
    [items, selected],
  );

  return (
    <div className="slash-box" ref={boxRef}>
      {items.length === 0 ? (
        <div className="slash-empty">결과 없음</div>
      ) : (
        items.map((it, i) => (
          <button
            key={it.title}
            className={`slash-item ${i === selected ? "is-sel" : ""}`}
            onMouseEnter={() => setSelected(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              pick(i);
            }}
          >
            <span className="slash-title">
              {it.title}
              {it.special && <span className="slash-tag">학습</span>}
            </span>
            {it.desc && <span className="slash-desc">{it.desc}</span>}
          </button>
        ))
      )}
      <style>{styles}</style>
    </div>
  );
});

export default SlashMenu;

// TipTap suggestion render 어댑터 — body에 팝업을 마운트/갱신/제거
export function slashRender() {
  let el: HTMLDivElement | null = null;
  let root: Root | null = null;
  const ref: { current: SlashMenuHandle | null } = { current: null };

  const draw = (props: {
    items: SlashItem[];
    command: (item: SlashItem) => void;
    clientRect?: (() => DOMRect | null) | null;
  }) => {
    root?.render(
      <SlashMenu
        ref={ref}
        items={props.items}
        command={props.command}
        clientRect={props.clientRect}
      />,
    );
  };

  return {
    onStart: (props: Parameters<typeof draw>[0]) => {
      el = document.createElement("div");
      el.className = "slash-popup-root";
      document.body.appendChild(el);
      root = createRoot(el);
      draw(props);
    },
    onUpdate: (props: Parameters<typeof draw>[0]) => draw(props),
    onKeyDown: (props: { event: KeyboardEvent }) => {
      if (props.event.key === "Escape") return false;
      return ref.current?.onKeyDown(props.event) ?? false;
    },
    onExit: () => {
      root?.unmount();
      el?.remove();
      root = null;
      el = null;
    },
  };
}

const styles = `
  .slash-popup-root { position: absolute; top: 0; left: 0; z-index: 300; }
  .slash-box {
    position: fixed;
    z-index: 300;
    min-width: 220px;
    max-width: 280px;
    max-height: 320px;
    overflow-y: auto;
    background: #fff;
    border: 1px solid rgba(0,0,0,0.1);
    border-radius: 8px;
    box-shadow: 0 6px 24px rgba(0,0,0,0.14);
    padding: 6px;
    font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
  }
  .slash-item {
    display: flex;
    flex-direction: column;
    gap: 1px;
    width: 100%;
    text-align: left;
    border: none;
    background: transparent;
    padding: 7px 10px;
    border-radius: 5px;
    cursor: pointer;
    font-family: inherit;
  }
  .slash-item.is-sel { background: rgba(35,131,226,0.1); }
  .slash-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 500;
    color: rgba(0,0,0,0.85);
  }
  .slash-tag {
    font-size: 10px;
    font-weight: 600;
    color: #2563eb;
    background: rgba(37,99,235,0.1);
    padding: 1px 5px;
    border-radius: 6px;
  }
  .slash-desc { font-size: 11px; color: rgba(0,0,0,0.45); }
  .slash-empty { padding: 10px 12px; font-size: 13px; color: rgba(0,0,0,0.4); }
`;
