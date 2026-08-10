"use client";

import { useState } from "react";
import { ModalOverlay } from "@/components/ui/modal-overlay";
import {
  useFamilyMail, useOpenFamilyMail, useSendFamilyMail, type FamilyMail,
} from "@/lib/hooks/useFamilyMail";

// 학생 편지함 — 부모가 보낸 편지를 열고 답장한다.
// 선물(포인트)은 **열 때** 들어온다. 봉투를 여는 순간이 이 기능의 전부라
// 목록에서 미리 금액을 보여주지 않는다.

const MAX_TEXT = 200;

export function FamilyMailBox({ uid }: { uid: string }) {
  const { items, unread, ready } = useFamilyMail(uid, "child");
  const [open, setOpen] = useState(false);

  if (!ready) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mb-5 w-full rounded-2xl px-4 py-3 text-[13px] font-bold border-none cursor-pointer flex items-center gap-2"
        style={{
          background: unread.length ? "#f2fbf4" : "rgba(0,0,0,0.035)",
          color: unread.length ? "#1f7a33" : "#3d3a37",
          boxShadow: unread.length ? "inset 0 0 0 1px rgba(31,122,51,0.25)" : "none",
        }}
      >
        <span className="text-[16px] leading-none">{unread.length ? "💌" : "📭"}</span>
        {unread.length ? `안 읽은 편지 ${unread.length}통` : "편지함"}
        <span className="ml-auto text-[12px] font-medium text-p-muted">열기</span>
      </button>

      {open && <MailPanel items={items} onClose={() => setOpen(false)} />}
    </>
  );
}

function MailPanel({ items, onClose }: { items: FamilyMail[]; onClose: () => void }) {
  const openMail = useOpenFamilyMail();
  const send = useSendFamilyMail();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 방금 연 편지에서 받은 포인트 — 목록으로 돌아가도 한 번은 보이게 남긴다 */
  const [gotPoints, setGotPoints] = useState<Record<string, number>>({});

  async function onOpenMail(m: FamilyMail) {
    if (m.read) return;
    try {
      const res = await openMail(m.id);
      if (res.claimed) setGotPoints((p) => ({ ...p, [m.id]: res.points }));
    } catch {
      /* 이미 열린 편지 — 목록이 곧 갱신된다 */
    }
  }

  async function onSend() {
    if (!reply.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await send({ text: reply.trim() });
      setReply("");
    } catch (e) {
      setError((e as { message?: string })?.message ?? "답장을 보내지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalOverlay onClose={onClose} align="top" padding="16px">
      <div className="w-full max-w-[440px] rounded-2xl bg-white p-5 mt-[6vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-baseline justify-between">
          <h2 className="m-0 text-[17px] font-bold text-black/95">💌 편지함</h2>
          <button onClick={onClose} className="border-none bg-transparent text-[13px] text-p-muted cursor-pointer">닫기</button>
        </div>
        <p className="mt-1 mb-3 text-[12px] text-p-muted">가족만 봅니다.</p>

        {items.length === 0 ? (
          <div className="rounded-xl bg-p-bg px-4 py-6 text-center text-[13px] text-p-muted leading-relaxed">
            아직 편지가 없어요.<br />먼저 한 통 써 볼까요?
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((m) => {
              const mine = m.dir === "toParent";
              const sealed = !mine && !m.read;
              return (
                <button
                  key={m.id}
                  onClick={() => onOpenMail(m)}
                  disabled={!sealed}
                  className="w-full rounded-xl p-3 text-left border-none"
                  style={{
                    background: sealed ? "#f2fbf4" : mine ? "rgba(0,0,0,0.03)" : "#fffdf5",
                    boxShadow: sealed ? "inset 0 0 0 1px rgba(31,122,51,0.28)" : "none",
                    cursor: sealed ? "pointer" : "default",
                  }}
                >
                  <div className="mb-1 flex items-center justify-between text-[11px] text-p-muted">
                    <span>{mine ? "내가 보냄" : `${m.fromName}`}</span>
                    <span className="tabular-nums">
                      {m.createdAt?.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }) ?? ""}
                    </span>
                  </div>
                  {sealed ? (
                    <div className="text-[14px] font-bold" style={{ color: "#1f7a33" }}>
                      ✉️ 눌러서 열어보기
                    </div>
                  ) : (
                    <>
                      <div className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-black/85">{m.text}</div>
                      {m.gift && (
                        <div className="mt-1.5 text-[12px] font-bold" style={{ color: "#1f7a33" }}>
                          🎁 +{(gotPoints[m.id] ?? m.gift.points).toLocaleString("ko-KR")}포인트
                          <span className="ml-1 font-medium text-p-muted">
                            이번 주 {m.gift.weekXp.toLocaleString("ko-KR")}XP ×{m.gift.mult}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-4">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value.slice(0, MAX_TEXT))}
            rows={3}
            placeholder="답장 쓰기"
            className="w-full resize-none rounded-xl border border-black/10 p-3 text-[14px] leading-relaxed outline-none focus:border-p-green"
          />
          <div className="mt-1 text-right text-[11px] text-p-muted tabular-nums">{reply.length}/{MAX_TEXT}</div>
          {error && <div className="mt-1 text-[12px] text-[#c00000]">{error}</div>}
          <button
            onClick={onSend}
            disabled={!reply.trim() || busy}
            className="mt-2 w-full rounded-xl py-2.5 text-[13px] font-bold text-white border-none cursor-pointer disabled:opacity-40"
            style={{ background: "#1f7a33" }}
          >
            {busy ? "보내는 중…" : "보내기"}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
