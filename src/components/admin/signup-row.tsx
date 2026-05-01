"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db, functions } from "@/lib/firebase";
import { SERVICES } from "@/data/site";
import { ServiceIcon } from "@/components/ui/service-icon";
import { formatDateTime, formatWon } from "@/lib/format";
import { buildPaymentGuide } from "@/lib/messages";
import { useServices } from "@/lib/services-context";

import type { SignupStatus, SignupChild, Signup } from "@/lib/types";
export type { SignupStatus, SignupChild, Signup };

const STATUS_STYLE: Record<SignupStatus, string> = {
  pending:        "bg-[#eff6ff] text-[#1d4ed8] border border-[rgba(29,78,216,0.2)]",
  accountPending: "bg-[#fdf4ff] text-[#7c3aed] border border-[rgba(124,58,237,0.2)]",
  confirmed:      "bg-[#f0faf1] text-[#2da040] border border-[rgba(56,168,72,0.15)]",
};

const btnCls = "rounded border border-black/10 bg-white px-3.5 py-1.5 text-[13px] font-medium text-p-secondary cursor-pointer";

const PARENT_SVC_NAMES: Record<string, string> = {
  momsaipack: "💻 엄마들을 위한 AI 패키지",
  "mom-webinar": "🙋‍♀️ [Mom&] 맘이랑 금요웨비나",
};

function SmsPreviewModal({ signup, displayMonthly, onClose }: { signup: Signup; displayMonthly: number; onClose: () => void }) {
  const [sending, setSending] = useState(false);
  const text = buildPaymentGuide(signup, displayMonthly > 0 ? displayMonthly : undefined);

  async function handleSend() {
    setSending(true);
    try {
      const fn = httpsCallable<{ phones: string[]; text: string }, { success: boolean }>(functions, "sendBulkSms");
      await fn({ phones: [signup.phone], text });
      alert("문자가 발송됐어요.");
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : "발송 실패");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", zIndex: 300 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        width: "min(480px, 92vw)", backgroundColor: "#fff", borderRadius: 12,
        boxShadow: "rgba(0,0,0,0.18) 0px 8px 32px", zIndex: 301, padding: "24px 24px 20px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>📱 문자 미리보기</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: "#a39e98", cursor: "pointer", padding: 4 }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: "#615d59", marginBottom: 6 }}>수신: {signup.phone}</div>
        <pre style={{
          whiteSpace: "pre-wrap", wordBreak: "break-word", backgroundColor: "#f6f5f4",
          borderRadius: 8, padding: "12px 14px", fontSize: 13, lineHeight: 1.65,
          color: "rgba(0,0,0,0.85)", margin: "0 0 16px", maxHeight: 320, overflowY: "auto",
        }}>{text}</pre>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} className={btnCls}>취소</button>
          <button onClick={handleSend} disabled={sending} style={{
            borderRadius: 6, border: "none", backgroundColor: "#38a848", color: "#fff",
            padding: "7px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
            opacity: sending ? 0.7 : 1,
          }}>
            {sending ? "발송 중…" : "발송"}
          </button>
        </div>
      </div>
    </>
  );
}

export function SignupRow({ signup, onChangeStatus, onApproveAsFamily, onDelete, onResetPassword }: {
  signup: Signup;
  onChangeStatus: (id: string, status: SignupStatus) => void;
  onApproveAsFamily: (signup: Signup) => Promise<void> | void;
  onDelete: (id: string) => void;
  onResetPassword: (signupId: string) => void;
}) {
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [approving, setApproving] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const { signupServices } = useServices();

  async function handleApplyCoupon() {
    if (!signup.couponCode || applyingCoupon) return;
    setApplyingCoupon(true);
    try {
      const snap = await getDoc(doc(db, "coupons", signup.couponCode.toUpperCase()));
      if (!snap.exists()) { alert("쿠폰 코드를 찾을 수 없어요."); return; }
      const data = snap.data();
      const base = displayMonthly;
      const discount = data.discountType === "fixed"
        ? Math.min(data.discountAmount as number, base)
        : Math.round(base * (data.discountAmount as number) / 100);
      const referralDisc = signup.referralDiscount ?? 0;
      await updateDoc(doc(db, "signups", signup.id), {
        couponDiscount: discount,
        finalMonthly: base - discount - referralDisc,
      });
      alert(`쿠폰 적용 완료: -${formatWon(discount)}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "오류 발생");
    } finally {
      setApplyingCoupon(false);
    }
  }

  // estimatedMonthly가 0이면 서비스 목록에서 재계산
  const recalcTotal = (() => {
    const childTotal = (signup.children ?? []).reduce((sum, child) =>
      sum + (child.selectedServices ?? []).reduce((s, slug) => {
        const svc = signupServices.find((x) => x.slug === slug);
        return s + (svc?.pricePerMonth ?? 0);
      }, 0), 0);
    const parentTotal = (signup.parentServices ?? []).reduce((sum, slug) => {
      const svc = signupServices.find((x) => x.slug === slug);
      return sum + (svc?.pricePerMonth ?? 0);
    }, 0);
    return childTotal + parentTotal;
  })();
  const displayMonthly = signup.estimatedMonthly > 0 ? signup.estimatedMonthly : recalcTotal;
  const displayFinal = signup.finalMonthly > 0 ? signup.finalMonthly : (displayMonthly - (signup.couponDiscount ?? 0) - (signup.referralDiscount ?? 0));

  async function handleApprove() {
    if (approving) return;
    setApproving(true);
    try { await onApproveAsFamily(signup); }
    finally { setApproving(false); setPressed(false); }
  }

  return (
    <>
      {showSmsModal && <SmsPreviewModal signup={signup} displayMonthly={displayMonthly} onClose={() => setShowSmsModal(false)} />}
      <div className="bg-white border border-black/10 rounded-xl p-5" style={{ boxShadow: "rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.85px, rgba(0,0,0,0.02) 0px 0.8px 2.93px, rgba(0,0,0,0.01) 0px 0.175px 1.04px" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-bold text-black/95">{signup.parentName}</span>
              {signup.convertedFamilyId ? (
                <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-[#f0fff4] text-[#1a7f4b] border border-[rgba(26,127,75,0.2)]" title={`familyId: ${signup.convertedFamilyId}`}>
                  ✅ 등록완료
                </span>
              ) : (
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[signup.status]}`}>
                  {{ pending: "신규신청", accountPending: "계정생성 준비중", confirmed: "확인" }[signup.status]}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-p-muted">
              {formatDateTime(signup.createdAt)} · {signup.phone}
            </p>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-p-muted">예상 월</div>
            {(signup.couponDiscount ?? 0) > 0 || (signup.referralDiscount ?? 0) > 0 ? (
              <>
                <div className="text-xs text-p-muted line-through">{formatWon(displayMonthly)}</div>
                <div className="text-[15px] font-bold text-[#1a7f4b]">{formatWon(displayFinal)}</div>
                {signup.couponCode && <div className="text-[10px] text-[#1a7f4b] mt-px">🎟 {signup.couponCode} (-{formatWon(signup.couponDiscount)})</div>}
                {signup.referralCode && <div className="text-[10px] text-[#1a7f4b] mt-px">👥 추천 {signup.referralCode} (-{formatWon(signup.referralDiscount ?? 0)})</div>}
              </>
            ) : signup.couponCode || signup.referralCode ? (
              <>
                <div className="text-[15px] font-bold text-black/95">{formatWon(displayMonthly)}</div>
                <div className="text-[10px] text-[#c0392b] mt-px flex items-center gap-1.5 justify-end">
                  <span>⚠ 코드 미적용 ({signup.couponCode ?? signup.referralCode})</span>
                  {signup.couponCode && (
                    <button
                      onClick={handleApplyCoupon}
                      disabled={applyingCoupon}
                      style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, border: "1px solid rgba(192,0,0,0.3)", background: "#fff5f5", color: "#c0392b", cursor: "pointer", fontWeight: 600, opacity: applyingCoupon ? 0.6 : 1 }}
                    >
                      {applyingCoupon ? "…" : "재적용"}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="text-[15px] font-bold text-black/95">{formatWon(displayMonthly)}</div>
                <div className="text-[10px] text-p-muted mt-px">코드 없음</div>
              </>
            )}
          </div>
        </div>

        <div className="mt-3.5 flex flex-col gap-2">
          {signup.children.map((child, idx) => (
            <div key={idx} className="rounded-lg bg-p-bg px-3.5 py-3 text-[13px]">
              <div>
                <strong className="text-black/95">{child.name}</strong>
                <span className="ml-2 text-p-muted">{child.grade}</span>
                {child.loginId && <span className="ml-2 font-mono text-[11px] text-p-muted">ID: {child.loginId}</span>}
              </div>
              <ul className="m-0 mt-1.5 p-0 list-none flex flex-col gap-1">
                {child.selectedServices.map((slug) => {
                  const svc = SERVICES.find((s) => s.slug === slug);
                  return (
                    <li key={slug} className="flex items-center gap-1.5 text-p-secondary">
                      <span>·</span>
                      {svc && <ServiceIcon service={svc} size={14} />}
                      <span>{svc ? `${svc.name} — ${svc.priceLabel}` : slug}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {(signup.parentServices ?? []).length > 0 && (
            <div className="rounded-lg bg-[#f5f3ff] border border-[rgba(124,58,237,0.15)] px-3.5 py-2.5 text-[13px]">
              <div className="text-[11px] font-bold text-[#7c3aed] mb-1.5 tracking-[0.04em]">학부모 서비스</div>
              <ul className="m-0 p-0 list-none flex flex-col gap-1">
                {(signup.parentServices ?? []).map((slug) => {
                  return (
                    <li key={slug} className="flex items-center gap-1.5 text-p-secondary">
                      <span>·</span>
                      <span>{PARENT_SVC_NAMES[slug] ?? slug}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-3.5 flex flex-wrap gap-2">
          <button onClick={() => setShowSmsModal(true)} className={btnCls}>📱 문자 발송</button>
          {!signup.convertedFamilyId && signup.status === "pending" && (
            <button
              onClick={() => onChangeStatus(signup.id, "accountPending")}
              onMouseDown={() => setPressed(true)}
              onMouseUp={() => setPressed(false)}
              onMouseLeave={() => setPressed(false)}
              className="rounded border-none bg-[#1d4ed8] text-white px-3.5 py-1.5 text-[13px] font-bold cursor-pointer transition-transform"
              style={{ transform: pressed ? "scale(0.97)" : "scale(1)" }}
            >
              💰 입금 확인
            </button>
          )}
          {!signup.convertedFamilyId && signup.status === "accountPending" && (
            <button
              onClick={handleApprove}
              disabled={approving}
              onMouseDown={() => setPressed(true)}
              onMouseUp={() => setPressed(false)}
              onMouseLeave={() => setPressed(false)}
              className="rounded border-none bg-p-green text-white px-3.5 py-1.5 text-[13px] font-bold cursor-pointer transition-[transform,opacity]"
              style={{
                opacity: approving ? 0.7 : 1,
                transform: pressed && !approving ? "scale(0.97)" : "scale(1)",
                cursor: approving ? "wait" : "pointer",
              }}
            >
              {approving ? "처리 중…" : "✅ 계정 생성 완료 · 가족 등록"}
            </button>
          )}
          <button onClick={() => { if (confirm("이 신청을 삭제하시겠습니까? 되돌릴 수 없습니다.")) onDelete(signup.id); }} className="rounded border border-[rgba(200,0,0,0.2)] bg-[#fff5f5] text-[#c00000] px-3.5 py-1.5 text-[13px] font-medium cursor-pointer">
            🗑 삭제
          </button>
          {signup.status === "confirmed" && (
            <button onClick={() => onResetPassword(signup.id)} className={btnCls}>🔑 비밀번호 초기화</button>
          )}
        </div>
      </div>
    </>
  );
}
