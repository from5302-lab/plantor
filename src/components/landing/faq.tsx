import { FAQS } from "@/data/site";
import { T } from "@/lib/design-tokens";

export function Faq() {
  return (
    <section className="section-pad px-6 max-[600px]:px-4" style={{ backgroundColor: T.white, paddingTop: 80, paddingBottom: 80 }}>
      <div style={{ margin: "0 auto", maxWidth: 680 }}>
        <div style={{ marginBottom: 48, textAlign: "center" }}>
          <p
            style={{
              marginBottom: 8,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: T.textMuted,
            }}
          >
            FAQ
          </p>
          <h2
            style={{
              fontSize: "clamp(26px, 4vw, 36px)",
              fontWeight: 700,
              letterSpacing: "-0.75px",
              color: T.textPrimary,
              margin: 0,
            }}
          >
            자주 묻는 질문
          </h2>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {FAQS.map((faq, i) => (
            <details
              key={i}
              className="faq-item"
              style={{
                backgroundColor: T.white,
                border: T.border,
                borderRadius: 12,
                padding: "18px 20px",
                boxShadow: T.shadow,
              }}
            >
              <summary
                style={{
                  display: "flex",
                  cursor: "pointer",
                  listStyle: "none",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  textAlign: "left",
                  fontSize: 15,
                  fontWeight: 600,
                  color: T.textPrimary,
                  letterSpacing: "-0.1px",
                }}
              >
                <span>{faq.q}</span>
                <span style={{ color: T.blue, fontSize: 18, fontWeight: 300, flexShrink: 0 }}>+</span>
              </summary>
              <p
                style={{
                  marginTop: 12,
                  marginBottom: 0,
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: T.textSecondary,
                }}
              >
                {faq.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
