import type { CSSProperties } from "react";
import { T } from "@/lib/design-tokens";

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={{
      backgroundColor: T.white,
      border: T.border,
      borderRadius: T.radius.md,
      boxShadow: T.shadow,
      ...style,
    }}>
      {children}
    </div>
  );
}
