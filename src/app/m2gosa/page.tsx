"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import AnalysisView from "@/components/m2gosa/AnalysisView";
import { SAMPLE_18 } from "@/lib/m2gosa/sample";
import type { PassageAnalysis } from "@/lib/m2gosa/types";

const TOPIC_OPTIONS = [
  "자동 감지",
  "목적",
  "심경/분위기",
  "주제·제목·요지·주장",
  "함의/지칭",
  "빈칸",
  "어법",
  "어휘",
];

const C = {
  ink: "#1f2937",
  sub: "#4b5563",
  teal: "#0f766e",
  border: "#e5e7eb",
  bg: "#f6f5f4",
};

export default function M2GosaPage() {
  const [passage, setPassage] = useState("");
  const [topic, setTopic] = useState("자동 감지");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PassageAnalysis | null>(null);

  async function handleAnalyze() {
    if (passage.trim().length < 30) {
      setError("지문을 30자 이상 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const analyze = httpsCallable<
        { passage: string; topic: string },
        PassageAnalysis
      >(functions, "analyzePassage");
      const res = await analyze({
        passage: passage.trim(),
        topic: topic === "자동 감지" ? "" : topic,
      });
      setResult(res.data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "분석에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: "32px 16px 80px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.ink, margin: "0 0 4px" }}>
          영어 지문 구문분석
        </h1>
        <p style={{ fontSize: 14, color: C.sub, margin: "0 0 20px" }}>
          영어 지문을 붙여넣으면 문장별 구문분석·어법·어휘 자료를 자동으로 만들어 드립니다.
        </p>

        {/* 입력 영역 */}
        <div
          style={{
            background: "#fff",
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 18,
            marginBottom: 24,
          }}
        >
          <textarea
            value={passage}
            onChange={(e) => setPassage(e.target.value)}
            placeholder="여기에 영어 지문을 붙여넣으세요."
            rows={8}
            style={{
              width: "100%",
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              padding: "12px 14px",
              fontSize: 14,
              lineHeight: 1.6,
              color: C.ink,
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
              fontFamily: "inherit",
            }}
          />
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
              marginTop: 12,
            }}
          >
            <label style={{ fontSize: 13, color: C.sub }}>
              유형&nbsp;
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                style={{
                  borderRadius: 6,
                  border: `1px solid ${C.border}`,
                  padding: "6px 10px",
                  fontSize: 13,
                  color: C.ink,
                  background: "#fff",
                }}
              >
                {TOPIC_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            <button
              onClick={handleAnalyze}
              disabled={loading}
              style={{
                marginLeft: "auto",
                background: loading ? "#9ca3af" : C.teal,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "9px 22px",
                fontSize: 14,
                fontWeight: 600,
                cursor: loading ? "default" : "pointer",
              }}
            >
              {loading ? "분석 중…" : "분석하기"}
            </button>

            <button
              onClick={() => {
                setResult(SAMPLE_18);
                setError("");
              }}
              style={{
                background: "#fff",
                color: C.teal,
                border: `1px solid ${C.teal}`,
                borderRadius: 8,
                padding: "9px 16px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              예시 보기
            </button>
          </div>

          {error && (
            <p style={{ color: "#dc2626", fontSize: 13, marginTop: 10 }}>{error}</p>
          )}
        </div>

        {/* 결과 */}
        {loading && (
          <p style={{ textAlign: "center", color: C.sub, fontSize: 14 }}>
            지문을 분석하고 있습니다. 30초~1분 정도 걸릴 수 있어요…
          </p>
        )}
        {result && <AnalysisView data={result} />}
      </div>
    </div>
  );
}
