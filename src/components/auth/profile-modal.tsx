"use client";

import { useEffect, useState } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  type User,
} from "firebase/auth";
import { collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

type Tab = "info" | "password";

function fmtPhone(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)} ${d.slice(3)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`;
}

export function ProfileModal({ user, role, onClose }: { user: User; role: string; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("info");

  // ── 기본 정보 (학부모) ──────────────────────────────────────────────────────
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [parentName, setParentName] = useState("");
  const [phone, setPhone] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneDone, setPhoneDone] = useState(false);

  useEffect(() => {
    if (role !== "parent") return;
    getDocs(query(collection(db, "families"), where("userId", "==", user.uid))).then((snap) => {
      if (!snap.empty) {
        const d = snap.docs[0];
        setFamilyId(d.id);
        setParentName(d.data().parentName ?? "");
        const p = fmtPhone(d.data().phone ?? "");
        setPhone(p);
        setNewPhone(p);
      }
    });
  }, [user.uid, role]);

  async function savePhone() {
    if (!familyId || newPhone === phone) return;
    setPhoneSaving(true);
    try {
      await updateDoc(doc(db, "families", familyId), { phone: newPhone });
      setPhone(newPhone);
      setPhoneDone(true);
      setTimeout(() => setPhoneDone(false), 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "저장 오류");
    } finally {
      setPhoneSaving(false);
    }
  }

  // ── 비밀번호 변경 ──────────────────────────────────────────────────────────
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwDone, setPwDone] = useState(false);

  async function savePassword() {
    if (!user.email) return;
    if (newPw.length < 6) { setPwError("비밀번호는 6자 이상이어야 합니다."); return; }
    if (newPw !== confirmPw) { setPwError("새 비밀번호가 일치하지 않습니다."); return; }
    setPwError("");
    setPwSaving(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPw);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPw);
      setPwDone(true);
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setPwError("현재 비밀번호가 틀렸습니다.");
      } else if (code === "auth/too-many-requests") {
        setPwError("너무 많이 시도했습니다. 잠시 후 다시 해주세요.");
      } else {
        setPwError(err instanceof Error ? err.message : "변경 중 오류가 발생했습니다.");
      }
    } finally {
      setPwSaving(false);
    }
  }

  const loginId = user.email?.replace("@plantor.app", "") ?? "";

  const tabCls = (t: Tab) =>
    `flex-1 py-2 text-[13px] font-semibold border-none cursor-pointer rounded-lg transition-colors ${
      tab === t
        ? "bg-white text-black/95 shadow-[0_1px_4px_rgba(0,0,0,0.08)]"
        : "bg-transparent text-p-muted"
    }`;

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 bg-black/40 z-[200]" />
      <div className="fixed inset-0 flex items-center justify-center z-[201] px-5">
        <div className="bg-white rounded-[16px] px-6 py-7 w-full max-w-[380px]" style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.15)" }}>

          {/* 헤더 */}
          <div className="flex items-center justify-between mb-5">
            <div className="text-[15px] font-bold text-black/95">내 정보</div>
            <button onClick={onClose} className="bg-transparent border-none cursor-pointer text-xl text-p-muted px-2 py-1 leading-none">×</button>
          </div>

          {/* 탭 */}
          <div className="flex gap-1 bg-p-bg rounded-[10px] p-1 mb-6">
            <button className={tabCls("info")} onClick={() => setTab("info")}>기본 정보</button>
            <button className={tabCls("password")} onClick={() => setTab("password")}>비밀번호 변경</button>
          </div>

          {/* ── 기본 정보 탭 ── */}
          {tab === "info" && (
            <div className="flex flex-col gap-4">
              {/* 이름 */}
              <div>
                <label className="text-[11px] font-semibold text-p-muted tracking-[0.06em]">이름</label>
                <div className="mt-1 px-3 py-2.5 rounded-lg bg-p-bg text-sm text-p-secondary">
                  {role === "parent" ? (parentName || user.displayName || "-") : (user.displayName || "-")}
                </div>
              </div>

              {/* 학습 ID */}
              <div>
                <label className="text-[11px] font-semibold text-p-muted tracking-[0.06em]">학습 ID</label>
                <div className="mt-1 px-3 py-2.5 rounded-lg bg-p-bg text-sm font-mono text-p-secondary">
                  {loginId || "-"}
                </div>
              </div>

              {/* 전화번호 — 학부모만 */}
              {role === "parent" && (
                <div>
                  <label className="text-[11px] font-semibold text-p-muted tracking-[0.06em]">전화번호</label>
                  <div className="mt-1 flex gap-2">
                    <input
                      type="tel"
                      value={newPhone}
                      onChange={(e) => {
                        setNewPhone(fmtPhone(e.target.value));
                      }}
                      placeholder="010 0000 0000"
                      className="flex-1 px-3 py-2.5 rounded-lg border border-black/10 text-sm outline-none text-black/95"
                    />
                    <button
                      onClick={savePhone}
                      disabled={phoneSaving || newPhone === phone}
                      className="px-4 rounded-lg border-none text-[13px] font-semibold whitespace-nowrap cursor-pointer"
                      style={{
                        backgroundColor: phoneDone ? "#1a7f4b" : newPhone === phone ? "rgba(0,0,0,0.07)" : "#38a848",
                        color: newPhone === phone ? "#a39e98" : "#ffffff",
                        cursor: newPhone === phone ? "default" : "pointer",
                      }}
                    >
                      {phoneDone ? "저장됨 ✓" : phoneSaving ? "저장 중…" : "저장"}
                    </button>
                  </div>
                </div>
              )}

              {role === "student" && (
                <p className="text-xs text-p-muted text-center mt-1 leading-relaxed">
                  이름 변경은 선생님께 문의해 주세요.
                </p>
              )}
            </div>
          )}

          {/* ── 비밀번호 변경 탭 ── */}
          {tab === "password" && (
            <div className="flex flex-col gap-3.5">
              {pwDone ? (
                <div className="text-center py-5">
                  <div className="text-[32px] mb-2.5">🔒</div>
                  <div className="text-[15px] font-bold text-black/95 mb-1.5">비밀번호 변경 완료</div>
                  <p className="text-[13px] text-p-secondary">새 비밀번호로 로그인하세요.</p>
                  <button onClick={onClose} className="mt-4 h-10 px-6 rounded bg-p-green text-white text-[13px] font-semibold border-none cursor-pointer">확인</button>
                </div>
              ) : (
                <>
                  {[
                    { label: "현재 비밀번호", value: currentPw, set: setCurrentPw },
                    { label: "새 비밀번호", value: newPw, set: setNewPw },
                    { label: "새 비밀번호 확인", value: confirmPw, set: setConfirmPw },
                  ].map(({ label, value, set }) => (
                    <div key={label}>
                      <label className="text-[11px] font-semibold text-p-muted tracking-[0.06em]">{label}</label>
                      <input
                        type="password"
                        value={value}
                        onChange={(e) => { set(e.target.value); setPwError(""); }}
                        className="mt-1 input-base"
                      />
                    </div>
                  ))}

                  {pwError && (
                    <div className="text-xs text-[#c00000] px-3 py-2 bg-[#fff5f5] rounded-md">
                      {pwError}
                    </div>
                  )}

                  <button
                    onClick={savePassword}
                    disabled={pwSaving || !currentPw || !newPw || !confirmPw}
                    className="mt-1 w-full h-11 rounded border-none text-sm font-semibold cursor-pointer"
                    style={{
                      backgroundColor: (!currentPw || !newPw || !confirmPw) ? "rgba(0,0,0,0.08)" : "#38a848",
                      color: (!currentPw || !newPw || !confirmPw) ? "#a39e98" : "#ffffff",
                      cursor: (!currentPw || !newPw || !confirmPw) ? "default" : "pointer",
                    }}
                  >
                    {pwSaving ? "변경 중…" : "비밀번호 변경"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
