import type { CSSProperties } from "react";

export const T = {
  bg: "#f6f5f4",
  white: "#ffffff",
  textPrimary: "rgba(0,0,0,0.95)",
  textSecondary: "#615d59",
  textMuted: "#a39e98",
  border: "1px solid rgba(0,0,0,0.1)",
  borderSubtle: "1px solid rgba(0,0,0,0.06)",
  /** card / panel shadow */
  shadow:
    "rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.85px, rgba(0,0,0,0.02) 0px 0.8px 2.93px, rgba(0,0,0,0.01) 0px 0.175px 1.04px",
  /** floating widget / modal shadow */
  shadowFloat: "rgba(0,0,0,0.12) 0px 8px 32px, rgba(0,0,0,0.08) 0px 2px 8px",
  teal: "#38a848",
  blue: "#38a848",
  radius: { sm: "4px", md: "12px", lg: "16px" },
} as const;

export const INPUT_STYLE: CSSProperties = {
  width: "100%",
  borderRadius: 4,
  border: "1px solid #dddddd",
  backgroundColor: T.white,
  padding: "10px 12px",
  fontSize: 14,
  color: T.textPrimary,
  outline: "none",
  boxSizing: "border-box",
};

export const LABEL_STYLE: CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "rgba(0,0,0,0.85)",
  marginBottom: 6,
};
