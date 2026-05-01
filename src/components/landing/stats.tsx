import { STATS } from "@/data/site";

export function Stats() {
  return (
    <section className="px-6 max-[600px]:px-4" style={{ backgroundColor: "#ffffff", paddingTop: 64, paddingBottom: 64 }}>
      <div style={{ margin: "0 auto", maxWidth: 800 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 24,
          }}
        >
          {STATS.map((stat) => (
            <div key={stat.label} style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: "clamp(28px, 4vw, 36px)",
                  fontWeight: 700,
                  letterSpacing: "-0.75px",
                  color: "rgba(0,0,0,0.95)",
                }}
              >
                {stat.value}
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#a39e98",
                }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
