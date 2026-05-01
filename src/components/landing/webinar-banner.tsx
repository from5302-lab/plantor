import { SITE } from "@/data/site";

export function WebinarBanner() {
  return (
    <section className="px-6 max-[600px]:px-4" style={{ backgroundColor: "#f6f5f4", paddingTop: 64, paddingBottom: 64 }}>
      <div style={{ margin: "0 auto", maxWidth: 900 }}>
        <div
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid rgba(0,0,0,0.1)",
            borderRadius: 16,
            padding: "clamp(24px, 5vw, 40px)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          <div>
            <p
              style={{
                marginBottom: 8,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#a39e98",
              }}
            >
              매주 금요일 · 무료
            </p>
            <h3
              style={{
                margin: 0,
                fontSize: "clamp(20px, 3vw, 26px)",
                fontWeight: 700,
                letterSpacing: "-0.5px",
                color: "rgba(0,0,0,0.95)",
              }}
            >
              🙋‍♀️ 금요일 밤, 엄마들의 30분
            </h3>
            <p
              style={{
                marginTop: 10,
                maxWidth: 420,
                fontSize: 14,
                lineHeight: 1.65,
                color: "#615d59",
              }}
            >
              &ldquo;뭘 시켜야 하지&rdquo; — 그 고민, 혼자 하지 마세요.
              <br />
              매주 금요일, 같은 고민 하는 엄마들이 모입니다.
            </p>
          </div>
          <a
            href={SITE.kakaoOpenChat}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 48,
              padding: "0 28px",
              borderRadius: 4,
              backgroundColor: "#38a848",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              flexShrink: 0,
            }}
          >
            무료로 참여하기 →
          </a>
        </div>
      </div>
    </section>
  );
}
