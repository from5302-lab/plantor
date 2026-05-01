"use client";

import type { CSSProperties, ReactNode, KeyboardEvent } from "react";

export function ModalOverlay({
  children,
  onClose,
  onKeyDown,
  zIndex = 1000,
  align = "center",
  padding = "24px",
  style,
}: {
  children: ReactNode;
  onClose?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  zIndex?: number;
  align?: "center" | "top";
  padding?: string;
  style?: CSSProperties;
}) {
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") onClose?.();
    onKeyDown?.(e);
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
      style={{
        position: "fixed",
        inset: 0,
        zIndex,
        backgroundColor: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: align === "center" ? "center" : "flex-start",
        justifyContent: "center",
        overflowY: "auto",
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
