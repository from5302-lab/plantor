"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, validateId } from "@/lib/auth-context";
import { INPUT_STYLE } from "@/lib/design-tokens";
import { ModalOverlay } from "@/components/ui/modal-overlay";

export function AuthModal({ onClose }: { onClose: () => void }) {
  const { signIn, role } = useAuth();
  const router = useRouter();
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [pendingRedirect, setPendingRedirect] = useState(false);

  // 로그인 후 role이 확정되면 리다이렉트
  useEffect(() => {
    if (!pendingRedirect || !role) return;
    onClose();
    if (role === "student") router.push("/learn");
    else if (role === "parent") router.push("/account");
    else if (role === "admin") router.push("/admin");
  }, [pendingRedirect, role, onClose, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const idErr = validateId(id);
    if (idErr) { setError(idErr); return; }
    setBusy(true);
    try {
      await signIn(id.toLowerCase(), password);
      setPendingRedirect(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "문제가 발생했습니다.";
      if (msg.includes("user-not-found") || msg.includes("invalid-credential"))
        setError("아이디 또는 비밀번호가 틀렸습니다.");
      else setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalOverlay onClose={onClose} zIndex={100} padding="0 16px">
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          backgroundColor: "#ffffff",
          border: "1px solid rgba(0,0,0,0.1)",
          borderRadius: 12,
          padding: 24,
          boxShadow:
            "rgba(0,0,0,0.04) 0px 14px 28px, rgba(0,0,0,0.05) 0px 23px 52px",
        }}
      >
        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "rgba(0,0,0,0.95)", letterSpacing: "-0.2px" }}>
            로그인
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#a39e98", padding: 4 }}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="text"
            placeholder="아이디 (영문 소문자 + 숫자, 6~15자)"
            value={id}
            onChange={(e) => setId(e.target.value.toLowerCase())}
            required
            autoComplete="username"
            style={INPUT_STYLE}
          />
          <div style={{ position: "relative" }}>
            <input
              type={showPw ? "text" : "password"}
              placeholder="비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              style={{ ...INPUT_STYLE, paddingRight: 40 }}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 2, fontSize: 13, color: "#a39e98", lineHeight: 1 }}
            >
              {showPw ? "숨김" : "보기"}
            </button>
          </div>

          {error && (
            <div style={{ borderRadius: 4, backgroundColor: "#fff5f5", border: "1px solid rgba(200,0,0,0.15)", padding: "8px 12px", fontSize: 12, color: "#c00000" }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{
              borderRadius: 4,
              backgroundColor: "#38a848",
              padding: "10px 0",
              fontSize: 14,
              fontWeight: 700,
              color: "#ffffff",
              border: "none",
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.7 : 1,
              marginTop: 4,
            }}
          >
            {busy ? "처리 중…" : "로그인"}
          </button>
        </form>

        <p style={{ marginTop: 16, textAlign: "center", fontSize: 12, color: "#a39e98" }}>
          아직 계정이 없으신가요?{" "}
          <button
            onClick={() => { onClose(); router.push("/signup"); }}
            style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 600, color: "#38a848", textDecoration: "underline", textUnderlineOffset: 2, fontSize: 12, padding: 0 }}
          >
            수강신청하기
          </button>
        </p>
      </div>
    </ModalOverlay>
  );
}
