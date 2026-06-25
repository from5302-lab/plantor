"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { T } from "@/lib/design-tokens";
import { TestProgressBar } from "./test-progress-bar";
import { TestSectionShort } from "./test-section-short";
import { TestSectionEssay } from "./test-section-essay";
import { combineAiScores, totalScore } from "@/lib/writing/test-scoring";
import { SHORT_RESPONSE_PROMPT, ESSAY_INTRO_PROMPT } from "@/lib/writing/test-data";
import { getLevel, INITIAL_ANSWERS, type SectionType, type TestAnswers, type AiGradingResult, type TestResult } from "@/lib/writing/test-types";

const SECTION_TIMES: Record<SectionType, number> = {
  short: 300,
  essay: 420,
};

const SECTION_ORDER: SectionType[] = ["short", "essay"];

export function LevelTest() {
  const router = useRouter();
  const [section, setSection] = useState<SectionType>("short");
  const [answers, setAnswers] = useState<TestAnswers>({ ...INITIAL_ANSWERS });
  const [timeLeft, setTimeLeft] = useState(SECTION_TIMES.short);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sectionTime = SECTION_TIMES[section];

  // 타이머
  useEffect(() => {
    if (submitting) return;
    setTimeLeft(SECTION_TIMES[section]);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleNextSection();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, submitting]);

  const handleNextSection = useCallback(() => {
    const idx = SECTION_ORDER.indexOf(section);
    if (idx < SECTION_ORDER.length - 1) {
      setSection(SECTION_ORDER[idx + 1]);
    }
  }, [section]);

  // 제출
  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    if (timerRef.current) clearInterval(timerRef.current);

    try {
      const gradeWriting = httpsCallable<
        { section: number; prompt: string; response: string },
        AiGradingResult
      >(functions, "gradeWriting");

      // 두 편 동시 채점
      const [s1Result, s2Result] = await Promise.all([
        gradeWriting({
          section: 3,
          prompt: SHORT_RESPONSE_PROMPT.prompt,
          response: answers.shortResponse,
        }),
        gradeWriting({
          section: 4,
          prompt: ESSAY_INTRO_PROMPT.prompt,
          response: answers.essayResponse,
        }),
      ]);

      // AI 점수 합산
      const scores = combineAiScores(s1Result.data.scores, s2Result.data.scores);
      const total = totalScore(scores);
      const level = getLevel(total);

      const result: TestResult = {
        completedAt: new Date().toISOString(),
        totalScore: total,
        level: level.level,
        levelName: level.name,
        scores,
        feedback: {
          ...s1Result.data.feedback,
          ...s2Result.data.feedback,
        },
        errorPatterns: [...s1Result.data.errorPatterns, ...s2Result.data.errorPatterns],
        strengths: [...s1Result.data.strengths, ...s2Result.data.strengths],
        overallComment: s2Result.data.overallComment || s1Result.data.overallComment,
        sections: {
          short: { response: answers.shortResponse, aiResult: s1Result.data },
          essay: { response: answers.essayResponse, aiResult: s2Result.data },
        },
      };

      localStorage.setItem("writing_test_result", JSON.stringify(result));
      router.push("/writing/test/result");
    } catch (err) {
      console.error("Grading error:", err);
      setError("채점 중 오류가 발생했습니다. 다시 시도해주세요.");
      setSubmitting(false);
    }
  }

  if (submitting) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 16 }}>
        <div
          style={{
            width: 48,
            height: 48,
            border: "4px solid rgba(0,0,0,0.08)",
            borderTopColor: T.teal,
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <p style={{ fontSize: 16, fontWeight: 600, color: T.textPrimary }}>AI가 글을 분석하고 있어요...</p>
        <p style={{ fontSize: 14, color: T.textMuted }}>잠시만 기다려주세요</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div>
      <TestProgressBar currentSection={section} timeLeft={timeLeft} totalTime={sectionTime} />

      {error && (
        <div style={{ maxWidth: 640, margin: "16px auto", padding: "12px 16px", background: "#fff5f5", border: "1px solid #ffcdd2", borderRadius: 8, color: "#c62828", fontSize: 14 }}>
          {error}
        </div>
      )}

      {section === "short" && (
        <TestSectionShort
          response={answers.shortResponse}
          onChange={(t) => setAnswers((p) => ({ ...p, shortResponse: t }))}
          onNext={handleNextSection}
        />
      )}
      {section === "essay" && (
        <TestSectionEssay
          response={answers.essayResponse}
          onChange={(t) => setAnswers((p) => ({ ...p, essayResponse: t }))}
          onSubmit={handleSubmit}
          submitting={submitting}
        />
      )}
    </div>
  );
}
