import { T } from "@/lib/design-tokens";
import { SITE } from "@/data/site";
import { FitText } from "@/components/ui/fit-text";

export function Hero() {
  return (
    <section
      className="section-pad px-6 max-[600px]:px-4"
      style={{
        backgroundColor: T.white,
        paddingTop: 80,
        paddingBottom: 72,
        textAlign: "center",
      }}
    >
      <div style={{ margin: "0 auto", maxWidth: "min(92vw, 1100px)" }}>
        <p
          style={{
            marginBottom: 12,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: T.textMuted,
          }}
        >
          {SITE.tagline}
        </p>

        <FitText
          as="h1"
          style={{
            fontWeight: 700,
            lineHeight: 1.15,
            letterSpacing: "-1.5px",
            color: T.textPrimary,
          }}
        >
          <span style={{ display: "block" }}>학원이 쓰는 학습 프로그램</span>
          <span style={{ display: "block" }}>
            <span style={{ color: T.blue }}>집에서 월 1.5만원</span>부터
          </span>
        </FitText>

        <div
          style={{
            marginTop: 36,
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            width: "100%",
          }}
        >
          <a
            href="#services"
            className="btn-primary"
            style={{
              flex: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 48,
              borderRadius: 4,
              backgroundColor: T.blue,
              color: T.white,
              fontSize: 15,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            서비스 보기
          </a>
        </div>
      </div>
    </section>
  );
}
