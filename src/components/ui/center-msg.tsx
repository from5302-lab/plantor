import { T } from "@/lib/design-tokens";

export function CenterMsg({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: T.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
    }}>
      <span style={{ fontSize: 14, color: T.textSecondary }}>{children}</span>
    </div>
  );
}
