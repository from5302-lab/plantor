"use client";

import { useCallback, useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import AnalysisView from "@/components/m2gosa/AnalysisView";
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

type HistoryItem = {
  id: string;
  titleKo: string;
  titleEn: string;
  topicTag: string;
  createdAt: number;
};

export default function M2GosaPage() {
  const { user, loading: authLoading, signIn, signOut } = useAuth();

  const [passage, setPassage] = useState("");
  const [topic, setTopic] = useState("자동 감지");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PassageAnalysis | null>(null);
  const [shareMsg, setShareMsg] = useState("");

  const [history, setHistory] = useState<HistoryItem[]>([]);

  // 로그인 폼
  const [loginId, setLoginId] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authErr, setAuthErr] = useState("");

  const loadHistory = useCallback(async () => {
    if (!user) {
      setHistory([]);
      return;
    }
    try {
      const fn = httpsCallable<void, HistoryItem[]>(functions, "getMyM2gosaSheets");
      const res = await fn();
      setHistory(res.data);
    } catch {
      /* 기록 조회 실패는 조용히 무시 */
    }
  }, [user]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function handleLogin() {
    if (!loginId || !loginPw) return;
    setAuthBusy(true);
    setAuthErr("");
    try {
      await signIn(loginId.trim(), loginPw);
      setLoginId("");
      setLoginPw("");
    } catch {
      setAuthErr("아이디 또는 비밀번호를 확인해 주세요.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function openSheet(id: string) {
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const fn = httpsCallable<{ id: string }, PassageAnalysis>(
        functions,
        "getM2gosaSheet",
      );
      const res = await fn({ id });
      setResult({ ...res.data, id });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("분석지를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function handleShare() {
    if (!result?.id) return;
    const url = `${window.location.origin}/m2gosa/view?id=${result.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: result.titleKo || "지문 분석", url });
        return;
      }
    } catch {
      /* 공유 취소 시 클립보드로 폴백 */
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareMsg("공유 링크를 복사했어요!");
      setTimeout(() => setShareMsg(""), 2500);
    } catch {
      setShareMsg(url);
    }
  }

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
      loadHistory();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "분석에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: "24px 16px 80px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        {/* 상단 바: 로그인 상태 */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
            minHeight: 32,
          }}
        >
          {!authLoading && user && (
            <>
              <span style={{ fontSize: 13, color: C.sub }}>
                {user.displayName || "내 계정"}님
              </span>
              <button
                onClick={signOut}
                style={{
                  fontSize: 12.5,
                  color: C.sub,
                  background: "#fff",
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  padding: "5px 10px",
                  cursor: "pointer",
                }}
              >
                로그아웃
              </button>
            </>
          )}
          {!authLoading && !user && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#9ca3af", marginRight: 2 }}>
                로그인하면 기록이 저장돼요
              </span>
              <input
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="아이디"
                style={inputMini}
              />
              <input
                value={loginPw}
                onChange={(e) => setLoginPw(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                type="password"
                placeholder="비밀번호"
                style={inputMini}
              />
              <button
                onClick={handleLogin}
                disabled={authBusy}
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "#fff",
                  background: C.teal,
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 12px",
                  cursor: "pointer",
                }}
              >
                {authBusy ? "…" : "로그인"}
              </button>
            </div>
          )}
        </div>
        {authErr && (
          <p style={{ color: "#dc2626", fontSize: 12, textAlign: "right", margin: "-6px 0 8px" }}>
            {authErr}
          </p>
        )}

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
            marginBottom: 20,
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
          </div>

          {error && (
            <p style={{ color: "#dc2626", fontSize: 13, marginTop: 10 }}>{error}</p>
          )}
        </div>

        {/* 내 분석 기록 */}
        {user && history.length > 0 && (
          <div
            style={{
              background: "#fff",
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: "14px 16px",
              marginBottom: 24,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 10 }}>
              내 분석 기록 ({history.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {history.map((h) => (
                <button
                  key={h.id}
                  onClick={() => openSheet(h.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    borderRadius: 6,
                    padding: "8px 8px",
                    cursor: "pointer",
                    fontSize: 13.5,
                    color: C.ink,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f6f5f4")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: 11,
                      color: C.teal,
                      background: "#e7f3f1",
                      borderRadius: 5,
                      padding: "2px 7px",
                    }}
                  >
                    {h.topicTag || "분석"}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h.titleKo || h.titleEn || "(제목 없음)"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 결과 */}
        {loading && (
          <p style={{ textAlign: "center", color: C.sub, fontSize: 14 }}>
            지문을 분석하고 있습니다. 30초~1분 정도 걸릴 수 있어요…
          </p>
        )}
        {result?.id && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              maxWidth: 860,
              margin: "0 auto 12px",
            }}
          >
            <button
              onClick={handleShare}
              aria-label="공유 링크"
              title="공유 링크 복사"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                background: "#fff",
                color: C.teal,
                border: `1px solid ${C.teal}`,
                borderRadius: 8,
                cursor: "pointer",
                padding: 0,
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </button>
            {shareMsg && (
              <span style={{ fontSize: 13, color: C.teal, wordBreak: "break-all" }}>
                {shareMsg}
              </span>
            )}
          </div>
        )}
        {result && <AnalysisView data={result} />}
      </div>
    </div>
  );
}

const inputMini: React.CSSProperties = {
  borderRadius: 6,
  border: `1px solid ${C.border}`,
  padding: "6px 10px",
  fontSize: 13,
  width: 110,
  outline: "none",
};
