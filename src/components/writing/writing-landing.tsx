"use client";

import { useRouter } from "next/navigation";
import { T } from "@/lib/design-tokens";

const FEATURES = [
  {
    icon: "📝",
    title: "12-Minute Level Test",
    desc: "글 2편만 쓰면 AI가 6가지 축으로 실력을 정밀 진단합니다.",
  },
  {
    icon: "📊",
    title: "6-Axis Score Report",
    desc: "Grammar, Vocabulary, Complexity, Organization, Argument, Style — 6가지 축으로 분석합니다.",
  },
  {
    icon: "🎯",
    title: "Korean Speaker Insights",
    desc: "한국어 화자가 자주 하는 실수 패턴을 정확히 짚어줍니다.",
  },
];

export function WritingLanding() {
  const router = useRouter();

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "60px 24px 80px" }}>
      {/* Hero */}
      <div style={{ textAlign: "center", marginBottom: 56 }}>
        <div
          style={{
            display: "inline-block",
            background: "#f0faf1",
            color: "#2a8438",
            fontSize: 12,
            fontWeight: 600,
            padding: "4px 12px",
            borderRadius: 9999,
            marginBottom: 20,
            letterSpacing: "0.125px",
          }}
        >
          Beta
        </div>
        <h1
          style={{
            fontSize: 40,
            fontWeight: 700,
            lineHeight: 1.15,
            letterSpacing: "-1.5px",
            color: T.textPrimary,
            marginBottom: 16,
          }}
        >
          Know Your Writing Level
        </h1>
        <p
          style={{
            fontSize: 18,
            fontWeight: 400,
            lineHeight: 1.5,
            color: T.textSecondary,
            maxWidth: 520,
            margin: "0 auto 32px",
          }}
        >
          12분이면 충분해요. 글 2편을 쓰면 AI가 6가지 축으로 실력을 진단하고, 한국 학생이 자주 놓치는 포인트를 짚어줍니다.
        </p>
        <button
          className="btn-primary"
          onClick={() => router.push("/writing/test")}
          style={{
            background: T.teal,
            color: "#ffffff",
            border: "none",
            borderRadius: 4,
            padding: "12px 32px",
            fontSize: 16,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          레벨테스트 시작하기
        </button>
        <p style={{ fontSize: 13, color: T.textMuted, marginTop: 12 }}>
          로그인 없이 바로 시작할 수 있어요
        </p>
      </div>

      {/* Features */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="card-base"
            style={{
              padding: "24px 28px",
              display: "flex",
              alignItems: "flex-start",
              gap: 16,
            }}
          >
            <span style={{ fontSize: 28, lineHeight: 1 }}>{f.icon}</span>
            <div>
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: T.textPrimary,
                  marginBottom: 6,
                }}
              >
                {f.title}
              </h3>
              <p style={{ fontSize: 14, color: T.textSecondary, lineHeight: 1.5, margin: 0 }}>
                {f.desc}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div style={{ marginTop: 56, textAlign: "center" }}>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: T.textPrimary,
            marginBottom: 24,
            letterSpacing: "-0.25px",
          }}
        >
          How It Works
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 16,
          }}
        >
          {[
            { step: "1", label: "Short Response", time: "5 min" },
            { step: "2", label: "Essay Introduction", time: "7 min" },
          ].map((s) => (
            <div
              key={s.step}
              style={{
                background: T.bg,
                borderRadius: 12,
                padding: "20px 16px",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: T.teal,
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 700,
                  marginBottom: 10,
                }}
              >
                {s.step}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary }}>{s.label}</div>
              <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>{s.time}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
