"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

const ID = "momglai01@outlook.com";
const KAKAO = "https://open.kakao.com/o/gs9aP64h";

type Step = { html: string; copy?: string; pwKey?: "chatgptPw" | "geminiPw" } | string;

function buildTools(chatgptPw: string, geminiPw: string) {
  const canvaPw = chatgptPw; // 캔바는 ChatGPT와 동일 비밀번호
  return [
    {
      iconUrl: "https://www.google.com/s2/favicons?domain=chat.openai.com&sz=64",
      name: "ChatGPT",
      url: "https://chat.openai.com",
      color: "#10a37f",
      steps: [
        "chat.openai.com 접속",
        "이메일 입력란은 비워두세요 ✋",
        '아래의 <strong>"Microsoft 계정으로 계속하기"</strong> 버튼 클릭',
        { html: `이메일: <code>${ID}</code>`, copy: ID },
        { html: `비밀번호: <code>${chatgptPw}</code>`, copy: chatgptPw, pwKey: "chatgptPw" as const },
      ] as Step[],
      warning: '로그인 중 "코드를 입력하세요" 화면이 나타나면<br/>→ <strong>"다른 방법으로 로그인하기"</strong> 클릭<br/>→ <strong>"비밀번호로 로그인"</strong> 선택',
    },
    {
      iconUrl: "https://www.google.com/s2/favicons?domain=gemini.google.com&sz=64",
      name: "제미나이 (Gemini)",
      url: "https://gemini.google.com",
      color: "#4285f4",
      steps: [
        "gemini.google.com 접속",
        '"Google로 로그인" 버튼 클릭',
        { html: `이메일: <code>${ID}</code>`, copy: ID },
        { html: `비밀번호: <code>${geminiPw}</code>`, copy: geminiPw, pwKey: "geminiPw" as const },
      ] as Step[],
      warning: null,
    },
    {
      iconUrl: "https://www.google.com/s2/favicons?domain=canva.com&sz=64",
      name: "캔바 (Canva)",
      url: "https://www.canva.com",
      color: "#7d2ae8",
      steps: [
        "canva.com 접속",
        "이메일 입력란은 비워두세요 ✋",
        '<strong>"Microsoft으로 계속"</strong> 버튼 클릭 <span style="font-size:12px;color:#a39e98">(안 보이면 "다른 방법으로 계속하기" 클릭)</span>',
        { html: `이메일: <code>${ID}</code>`, copy: ID },
        { html: `비밀번호: <code>${canvaPw}</code>`, copy: canvaPw, pwKey: "chatgptPw" as const },
      ] as Step[],
      warning: null,
    },
  ];
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      onClick={handleCopy}
      title="복사"
      style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", lineHeight: 1, display: "inline-flex", alignItems: "center", flexShrink: 0 }}
    >
      {copied
        ? <span style={{ fontSize: 11, color: "#1a7f4b", fontWeight: 700 }}>✓</span>
        /* eslint-disable-next-line @next/next/no-img-element */
        : <img src="/icons/copy.svg" width={15} height={15} alt="copy" style={{ display: "block" }} />}
    </button>
  );
}

function EditPasswordButton({
  pwKey,
  currentValue,
  onSaved,
}: {
  pwKey: "chatgptPw" | "geminiPw";
  currentValue: string;
  onSaved: (key: "chatgptPw" | "geminiPw", value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(currentValue);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!input.trim() || input.trim() === currentValue) { setEditing(false); return; }
    setSaving(true);
    try {
      const ref = doc(db, "config", "momsaipack");
      await setDoc(ref, { [pwKey]: input.trim() }, { merge: true });
      onSaved(pwKey, input.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setInput(currentValue); setEditing(true); }}
        title="비밀번호 수정"
        style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", lineHeight: 1, display: "inline-flex", alignItems: "center", flexShrink: 0, fontSize: 13 }}
      >
        ✏️
      </button>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
      <input
        autoFocus
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
        style={{ fontSize: 13, padding: "2px 6px", borderRadius: 4, border: "1.5px solid #4285f4", outline: "none", width: 140 }}
      />
      <button
        onClick={handleSave}
        disabled={saving}
        style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, border: "none", backgroundColor: "#4285f4", color: "#fff", cursor: "pointer" }}
      >
        {saving ? "…" : "저장"}
      </button>
      <button
        onClick={() => setEditing(false)}
        style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(0,0,0,0.15)", backgroundColor: "transparent", cursor: "pointer" }}
      >
        취소
      </button>
    </span>
  );
}

export function MomsAiPackContent() {
  const { user, role, hasAiPackage, loading } = useAuth();
  const router = useRouter();
  const isAdmin = role === "admin";

  const [chatgptPw, setChatgptPw] = useState("whdgkqwlsmd01");
  const [geminiPw, setGeminiPw] = useState("whdgkqwlsmd");

  const allowed = role === "admin" || (role === "parent" && hasAiPackage);

  useEffect(() => {
    if (loading) return;
    if (!allowed) router.replace("/");
  }, [allowed, loading, router]);

  useEffect(() => {
    if (!allowed) return;
    getDoc(doc(db, "config", "momsaipack")).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.chatgptPw) setChatgptPw(data.chatgptPw);
        if (data.geminiPw) setGeminiPw(data.geminiPw);
      }
    });
  }, [allowed]);

  function handlePasswordSaved(key: "chatgptPw" | "geminiPw", value: string) {
    if (key === "chatgptPw") setChatgptPw(value);
    else setGeminiPw(value);
  }

  if (loading || !allowed) return null;

  const tools = buildTools(chatgptPw, geminiPw);

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#f6f5f4", padding: "40px 20px 80px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>

        {/* 헤더 */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#a39e98", marginBottom: 8 }}>Mom&amp; AI Package</p>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.5px", color: "rgba(0,0,0,0.95)", margin: 0 }}>
            엄마들을 위한 AI 패키지
          </h1>
          <p style={{ marginTop: 10, fontSize: 14, color: "#615d59", lineHeight: 1.6 }}>
            ChatGPT · 제미나이 · 캔바 공유 계정 접속 안내입니다.<br />
            패키지 내용은 상황에 따라 변경될 수 있어요.
          </p>
        </div>

        {/* 서비스별 카드 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {tools.map((tool) => (
            <div key={tool.name} style={{ backgroundColor: "#ffffff", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 16, overflow: "hidden", boxShadow: "rgba(0,0,0,0.04) 0px 4px 18px" }}>
              {/* 카드 헤더 */}
              <div style={{ backgroundColor: tool.color, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={tool.iconUrl} alt="" width={24} height={24} style={{ borderRadius: 4, display: "block" }} />
                  <span style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>{tool.name}</span>
                </div>
                <a
                  href={tool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, fontWeight: 600, color: "#fff", backgroundColor: "rgba(255,255,255,0.2)", padding: "5px 12px", borderRadius: 20, textDecoration: "none", whiteSpace: "nowrap" }}
                >
                  사이트 열기 →
                </a>
              </div>

              {/* 단계별 안내 */}
              <div style={{ padding: "20px 20px 8px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#a39e98", marginBottom: 12 }}>STEP BY STEP</div>
                <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                  {tool.steps.map((step, i) => {
                    const html = typeof step === "string" ? step : step.html;
                    const copy = typeof step === "string" ? undefined : step.copy;
                    const pwKey = typeof step === "string" ? undefined : step.pwKey;
                    const currentPw = pwKey === "chatgptPw" ? chatgptPw : pwKey === "geminiPw" ? geminiPw : undefined;
                    return (
                      <li key={i} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: "50%", backgroundColor: tool.color, color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {i + 1}
                        </span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                          <span
                            style={{ fontSize: 14, color: "rgba(0,0,0,0.85)", lineHeight: 1.6 }}
                            dangerouslySetInnerHTML={{ __html: html }}
                          />
                          {copy && <CopyButton value={copy} />}
                          {isAdmin && pwKey != null && (
                            <EditPasswordButton
                              pwKey={pwKey}
                              currentValue={currentPw ?? ""}
                              onSaved={handlePasswordSaved}
                            />
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>

              {/* 주의사항 */}
              {tool.warning && (
                <div style={{ margin: "12px 20px 20px", backgroundColor: "#fff5f5", border: "1px solid rgba(200,0,0,0.12)", borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#c00000", marginBottom: 6 }}>⚠️ 이럴 때는 이렇게!</div>
                  <div
                    style={{ fontSize: 13, color: "rgba(0,0,0,0.8)", lineHeight: 1.8 }}
                    dangerouslySetInnerHTML={{ __html: tool.warning }}
                  />
                </div>
              )}
              {!tool.warning && <div style={{ height: 20 }} />}
            </div>
          ))}
        </div>

        {/* 공통 주의사항 */}
        <div style={{ marginTop: 28, backgroundColor: "#ffffff", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 12, padding: "20px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(0,0,0,0.9)", marginBottom: 12 }}>📌 꼭 지켜주세요</div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              "비밀번호를 절대 변경하지 마세요 — 다른 회원분들이 접속할 수 없게 됩니다",
              "2차 인증 설정을 하지 마세요 — 공유 계정에서는 인증 코드를 받을 수 없습니다",
              "공유 계정에 개인정보나 보안이 필요한 자료는 저장하지 마세요 — 유출될 위험이 있습니다",
              "공용계정으로 바이브코딩을 하실 수 없습니다",
              "로그인이 안 될 경우 아래 오픈채팅으로 문의해 주세요",
            ].map((item, i) => (
              <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: "#615d59", lineHeight: 1.6 }}>
                <span style={{ flexShrink: 0, color: "#1f7a33", fontWeight: 700 }}>✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* 하단 CTA */}
        <div style={{ marginTop: 28, textAlign: "center" }}>
          <a
            href={KAKAO}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, backgroundColor: "#FEE500", color: "rgba(0,0,0,0.85)", fontSize: 14, fontWeight: 700, padding: "13px 28px", borderRadius: 8, textDecoration: "none" }}
          >
            💬 [Mom&amp;] 맘이랑 오픈채팅 문의
          </a>
        </div>

      </div>
    </main>
  );
}
