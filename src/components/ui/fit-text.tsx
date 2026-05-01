"use client";

import { useRef, useEffect, CSSProperties, ElementType } from "react";

/**
 * 부모 너비의 widthRatio(기본 0.9 = 90%)를 채우도록 font-size를 자동 조정.
 * white-space: nowrap 강제 적용 → 항상 한 줄 유지.
 */
export function FitText({
  children,
  as: Tag = "h2",
  widthRatio = 0.9,
  style,
}: {
  children: React.ReactNode;
  as?: ElementType;
  widthRatio?: number;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const fit = () => {
      const parent = el.parentElement;
      if (!parent) return;
      // max-content로 실제 텍스트 너비를 측정 (block 자식 포함)
      el.style.fontSize = "16px";
      el.style.width = "max-content";
      const textWidth = el.getBoundingClientRect().width;
      el.style.width = "";
      if (!textWidth) return;
      const ratio = (parent.clientWidth * widthRatio) / textWidth;
      el.style.fontSize = `${16 * ratio}px`;
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el.parentElement ?? document.body);
    return () => ro.disconnect();
  }, [widthRatio]);

  const props = { ref, style: { whiteSpace: "nowrap" as const, margin: 0, ...style } };
  return <Tag {...props}>{children}</Tag>;
}
