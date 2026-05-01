import { CORE_VALUES } from "@/data/site";
import { T } from "@/lib/design-tokens";

export function Values() {
  return (
    <section className="section-pad px-6 max-[600px]:px-4" style={{ backgroundColor: T.bg, paddingTop: 80, paddingBottom: 80 }}>
      <div style={{ margin: "0 auto", maxWidth: 1000 }}>
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
            THiNK
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
            학습비는 1/10, 학습효과는 3배
          </h2>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 20,
          }}
        >
          {CORE_VALUES.map((value) => (
            <div
              key={value.key}
              className="card-hover"
              style={{
                backgroundColor: T.white,
                border: T.border,
                borderRadius: 12,
                padding: 28,
                boxShadow: T.shadow,
              }}
            >
              <div style={{ marginBottom: 16, fontSize: 28 }}>{value.emoji}</div>
              <h3
                style={{
                  marginBottom: 8,
                  fontSize: 16,
                  fontWeight: 600,
                  lineHeight: 1.35,
                  letterSpacing: "-0.1px",
                  color: T.textPrimary,
                }}
              >
                {value.title}
              </h3>
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.65,
                  color: T.textSecondary,
                  margin: 0,
                }}
              >
                {value.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
