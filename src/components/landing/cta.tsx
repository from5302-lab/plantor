import Link from "next/link";

export function Cta() {
  return (
    <section className="px-6 max-[600px]:px-4" style={{ backgroundColor: "#f6f5f4", paddingTop: 80, paddingBottom: 80 }}>
      <div style={{ margin: "0 auto", maxWidth: 600, textAlign: "center" }}>
        <div style={{ marginBottom: 20 }}><img src="/favicon.svg" alt="" width={56} height={56} style={{ display: "block", margin: "0 auto" }} /></div>
        <h2
          style={{
            fontSize: "clamp(26px, 4vw, 36px)",
            fontWeight: 700,
            letterSpacing: "-0.75px",
            lineHeight: 1.2,
            color: "rgba(0,0,0,0.95)",
            margin: 0,
          }}
        >
          지금 바로 시작하세요.
        </h2>
        <div style={{ marginTop: 32 }}>
          <Link
            href="/signup"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 52,
              padding: "0 36px",
              borderRadius: 4,
              backgroundColor: "#38a848",
              color: "#ffffff",
              fontSize: 16,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            지금 신청하기 →
          </Link>
        </div>
      </div>
    </section>
  );
}
