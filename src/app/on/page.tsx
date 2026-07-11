import type { Metadata } from "next";
import { T } from "@/lib/design-tokens";
import { FitText } from "@/components/ui/fit-text";
import {
  ON_ACCENT,
  ON_HERO,
  PREMIUM_CLASSES,
  ON_WHY,
  ON_STEPS,
  ON_TEACHER,
} from "@/data/one-on-one";

export const metadata: Metadata = {
  title: "1:1 프리미엄 직강 — Plantor",
  description:
    "선생님이 직접 가르치는 1:1 프리미엄 클래스. 바이브코딩 · 클래스5 · 매일국어 · 클래스카드.",
  openGraph: {
    title: "1:1 프리미엄 직강 — Plantor",
    description:
      "선생님이 직접 가르치는 1:1 프리미엄 클래스. 강사가 직접 진단하고 밀착 지도합니다.",
    url: "https://plantor.web.app/on",
    siteName: "Plantor",
    locale: "ko_KR",
    type: "website",
  },
};

const EYEBROW: React.CSSProperties = {
  marginBottom: 10,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: ON_ACCENT,
};

const SECTION_TITLE: React.CSSProperties = {
  fontSize: "clamp(24px, 4vw, 34px)",
  fontWeight: 700,
  letterSpacing: "-0.6px",
  color: T.textPrimary,
  margin: 0,
};

export default function OnPage() {
  return (
    <main style={{ backgroundColor: T.white }}>
      {/* ── Hero ───────────────────────────────────────────── */}
      <section
        className="section-pad px-6 max-[600px]:px-4"
        style={{
          background: `linear-gradient(180deg, rgba(92,78,220,0.06), ${T.white})`,
          paddingTop: 80,
          paddingBottom: 64,
          textAlign: "center",
        }}
      >
        <div style={{ margin: "0 auto", maxWidth: "min(92vw, 1000px)" }}>
          <p style={EYEBROW}>{ON_HERO.eyebrow}</p>
          <FitText
            as="h1"
            style={{
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: "-1.2px",
              color: T.textPrimary,
            }}
          >
            <span style={{ display: "block" }}>{ON_HERO.headline[0]}</span>
            <span style={{ display: "block", color: ON_ACCENT }}>
              {ON_HERO.headline[1]}
            </span>
          </FitText>
          <p
            style={{
              marginTop: 20,
              fontSize: 15,
              lineHeight: 1.7,
              color: T.textSecondary,
            }}
          >
            {ON_HERO.subhead}
          </p>
          <div style={{ marginTop: 32 }}>
            <a
              href={ON_HERO.contactUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                height: 52,
                padding: "0 40px",
                borderRadius: 6,
                backgroundColor: ON_ACCENT,
                color: T.white,
                fontSize: 16,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              {ON_HERO.contactLabel} →
            </a>
          </div>
        </div>
      </section>

      {/* ── 프리미엄 클래스 라인업 ───────────────────────────── */}
      <section
        className="section-pad px-6 max-[600px]:px-4"
        style={{ backgroundColor: T.bg, paddingTop: 72, paddingBottom: 72 }}
      >
        <div style={{ margin: "0 auto", maxWidth: 1000 }}>
          <div style={{ marginBottom: 40, textAlign: "center" }}>
            <p style={EYEBROW}>Premium Lineup</p>
            <h2 style={SECTION_TITLE}>직강으로 만나는 프리미엄 클래스</h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 20,
            }}
          >
            {PREMIUM_CLASSES.map((cls) => (
              <div
                key={cls.slug}
                className="card-hover"
                style={{
                  backgroundColor: T.white,
                  border: T.border,
                  borderRadius: 16,
                  padding: 24,
                  boxShadow: T.shadow,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 14,
                  }}
                >
                  <span style={{ fontSize: 30 }}>{cls.emoji}</span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "3px 10px",
                      borderRadius: 999,
                      backgroundColor: `${cls.accent}14`,
                      color: cls.accent,
                    }}
                  >
                    {cls.target}
                  </span>
                </div>

                <h3
                  style={{
                    margin: 0,
                    fontSize: 18,
                    fontWeight: 700,
                    letterSpacing: "-0.2px",
                    color: T.textPrimary,
                  }}
                >
                  {cls.name}
                </h3>
                <p
                  style={{
                    marginTop: 8,
                    marginBottom: 16,
                    fontSize: 13.5,
                    lineHeight: 1.6,
                    color: T.textSecondary,
                  }}
                >
                  {cls.hook}
                </p>

                <ul
                  style={{
                    margin: 0,
                    padding: 0,
                    listStyle: "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    marginBottom: 20,
                  }}
                >
                  {cls.bullets.map((b, i) => (
                    <li
                      key={i}
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "flex-start",
                        fontSize: 13,
                        lineHeight: 1.55,
                        color: T.textSecondary,
                      }}
                    >
                      <span style={{ color: cls.accent, fontWeight: 700, flexShrink: 0 }}>✓</span>
                      {b}
                    </li>
                  ))}
                </ul>

                <div
                  style={{
                    marginTop: "auto",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary }}>
                    {cls.priceLabel}
                  </span>
                  <a
                    href={ON_HERO.contactUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 12.5,
                      fontWeight: 700,
                      padding: "7px 14px",
                      borderRadius: 6,
                      backgroundColor: `${cls.accent}14`,
                      color: cls.accent,
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    상담 →
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 왜 프리미엄 직강인가 ─────────────────────────────── */}
      <section
        className="section-pad px-6 max-[600px]:px-4"
        style={{ backgroundColor: T.white, paddingTop: 72, paddingBottom: 72 }}
      >
        <div style={{ margin: "0 auto", maxWidth: 1000 }}>
          <div style={{ marginBottom: 40, textAlign: "center" }}>
            <p style={EYEBROW}>Why Direct</p>
            <h2 style={SECTION_TITLE}>왜 1:1 직강일까요?</h2>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 20,
            }}
          >
            {ON_WHY.map((v) => (
              <div
                key={v.title}
                className="card-hover"
                style={{
                  backgroundColor: T.white,
                  border: T.border,
                  borderRadius: 12,
                  padding: 28,
                  boxShadow: T.shadow,
                }}
              >
                <div style={{ marginBottom: 16, fontSize: 28 }}>{v.emoji}</div>
                <h3
                  style={{
                    marginBottom: 8,
                    fontSize: 16,
                    fontWeight: 600,
                    lineHeight: 1.35,
                    color: T.textPrimary,
                  }}
                >
                  {v.title}
                </h3>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: T.textSecondary }}>
                  {v.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 진행 방식 ───────────────────────────────────────── */}
      <section
        className="section-pad px-6 max-[600px]:px-4"
        style={{ backgroundColor: T.bg, paddingTop: 72, paddingBottom: 72 }}
      >
        <div style={{ margin: "0 auto", maxWidth: 900 }}>
          <div style={{ marginBottom: 40, textAlign: "center" }}>
            <p style={EYEBROW}>How it works</p>
            <h2 style={SECTION_TITLE}>이렇게 진행돼요</h2>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 16,
            }}
          >
            {ON_STEPS.map((s) => (
              <div
                key={s.n}
                style={{
                  backgroundColor: T.white,
                  border: T.border,
                  borderRadius: 12,
                  padding: 22,
                  boxShadow: T.shadow,
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    backgroundColor: ON_ACCENT,
                    color: T.white,
                    fontSize: 14,
                    fontWeight: 700,
                    marginBottom: 12,
                  }}
                >
                  {s.n}
                </span>
                <h3
                  style={{
                    margin: "0 0 6px",
                    fontSize: 15,
                    fontWeight: 700,
                    color: T.textPrimary,
                  }}
                >
                  {s.title}
                </h3>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: T.textSecondary }}>
                  {s.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 강사 소개 ───────────────────────────────────────── */}
      <section
        className="section-pad px-6 max-[600px]:px-4"
        style={{ backgroundColor: T.white, paddingTop: 72, paddingBottom: 72 }}
      >
        <div style={{ margin: "0 auto", maxWidth: 680 }}>
          <div style={{ marginBottom: 32, textAlign: "center" }}>
            <p style={EYEBROW}>Teacher</p>
            <h2 style={SECTION_TITLE}>강사 소개</h2>
          </div>
          <div
            style={{
              backgroundColor: T.bg,
              border: T.border,
              borderRadius: 16,
              padding: 32,
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                backgroundColor: `${ON_ACCENT}14`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
                fontSize: 32,
              }}
            >
              👩‍🏫
            </div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.textPrimary }}>
              {ON_TEACHER.name}
            </h3>
            <p style={{ margin: "4px 0 16px", fontSize: 13, fontWeight: 600, color: ON_ACCENT }}>
              {ON_TEACHER.role}
            </p>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.75, color: T.textSecondary }}>
              {ON_TEACHER.bio}
            </p>
          </div>
        </div>
      </section>

      {/* ── CTA 배너 ────────────────────────────────────────── */}
      <section
        className="section-pad px-6 max-[600px]:px-4"
        style={{ backgroundColor: ON_ACCENT, paddingTop: 72, paddingBottom: 72, textAlign: "center" }}
      >
        <div style={{ margin: "0 auto", maxWidth: 600 }}>
          <h2
            style={{
              margin: "0 0 20px",
              fontSize: "clamp(22px, 4vw, 30px)",
              fontWeight: 700,
              letterSpacing: "-0.5px",
              color: T.white,
            }}
          >
            우리 아이에게 맞는 1:1 수업, 지금 문의하세요
          </h2>
          <a
            href={ON_HERO.contactUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 54,
              padding: "0 44px",
              borderRadius: 6,
              backgroundColor: T.white,
              color: ON_ACCENT,
              fontSize: 16,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            {ON_HERO.contactLabel} →
          </a>
        </div>
      </section>
    </main>
  );
}
