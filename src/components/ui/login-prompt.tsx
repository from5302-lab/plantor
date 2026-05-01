import { T } from "@/lib/design-tokens";
import { PageWrap } from "./page-wrap";
import { Card } from "./card";

export function LoginPrompt({ message }: { message?: string }) {
  return (
    <PageWrap>
      <Card style={{ maxWidth: 440, margin: "0 auto", padding: "40px 32px", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: T.textPrimary, letterSpacing: "-0.25px" }}>
          로그인이 필요합니다
        </h2>
        <p style={{ marginTop: 12, fontSize: 14, color: T.textSecondary, lineHeight: 1.6 }}>
          {message ?? "계속하려면 먼저 로그인해 주세요."}
        </p>
      </Card>
    </PageWrap>
  );
}
