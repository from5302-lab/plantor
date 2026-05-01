import Link from "next/link";
import { T } from "@/lib/design-tokens";

export function SignupCtaBanner() {
  return (
    <section
      className="section-pad px-6 max-[600px]:px-4"
      style={{
        backgroundColor: T.white,
        borderTop: T.border,
        borderBottom: T.border,
        paddingTop: 80,
        paddingBottom: 80,
      }}
    >
      <div style={{ margin: "0 auto", maxWidth: 600, textAlign: "center" }}>
        <Link
          href="/signup"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            height: 56,
            padding: "0 48px",
            borderRadius: 4,
            backgroundColor: T.blue,
            color: T.white,
            fontSize: 17,
            fontWeight: 700,
            textDecoration: "none",
            letterSpacing: "-0.2px",
          }}
        >
          지금 신청하기 →
        </Link>
      </div>
    </section>
  );
}
