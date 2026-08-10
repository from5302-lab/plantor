"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ModalOverlay } from "@/components/ui/modal-overlay";
import { getWeekDates } from "@/lib/learn-utils";
import {
  useOpenFamilyMail, useSendFamilyMail, weekMondayStr, type FamilyMail,
} from "@/lib/hooks/useFamilyMail";

// 자녀에게 편지를 쓴다. 선물은 **자녀가 이번 주 번 XP에 얹는 매칭**만 된다 —
// 부모가 임의로 포인트를 주면 학습으로 버는 경제가 무너진다.
// 미리보기 금액은 여기서 계산하지만 확정은 서버가 다시 한다(functions/src/family-mail.ts).
const POINT_RATE = 0.2;   // rewards-config.ts XP.POINT_RATE
const MATCH_CAP = 200;    // family-mail.ts MATCH_CAP
const MAX_TEXT = 200;

const previewPoints = (weekXp: number, mult: number) =>
  Math.min(MATCH_CAP, Math.max(0, Math.round(weekXp * POINT_RATE * mult)));

export function FamilyMailModal({ childId, childName, mail, onClose }: {
  childId: string;
  childName: string;
  /** 이 자녀와 주고받은 편지 (부모 구독분에서 걸러 넘긴다 — 구독을 두 번 열지 않는다) */
  mail: FamilyMail[];
  onClose: () => void;
}) {
  const send = useSendFamilyMail();
  const open = useOpenFamilyMail();
  const [text, setText] = useState("");
  const [mult, setMult] = useState(0);
  const [weekXp, setWeekXp] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 이번 주 XP — 매칭 기준값. 서버와 같은 원장(children/{id}/xpLedger)을 읽는다.
  useEffect(() => {
    let alive = true;
    (async () => {
      const week = getWeekDates();
      try {
        const snap = await getDocs(query(
          collection(db, "children", childId, "xpLedger"),
          where("date", ">=", week[0]), where("date", "<=", week[6]),
        ));
        if (alive) setWeekXp(snap.docs.reduce((s, d) => s + (Number(d.data().xp) || 0), 0));
      } catch {
        if (alive) setWeekXp(0);
      }
    })();
    return () => { alive = false; };
  }, [childId]);

  // 이번 주에 이미 선물을 얹었으면 다시 못 얹는다(서버도 같은 키로 막는다)
  const thisWeek = weekMondayStr();
  const alreadyMatched = mail.some((m) => m.gift?.weekKey === thisWeek);

  // 자녀 답장은 열어야 안 읽음 표시가 사라진다
  useEffect(() => {
    const unread = mail.filter((m) => m.dir === "toParent" && !m.read);
    unread.forEach((m) => { open(m.id).catch(() => {}); });
  }, [mail, open]);

  async function onSend() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await send({ childId, text: text.trim(), mult: mult || undefined });
      setText("");
      setMult(0);
    } catch (e) {
      setError((e as { message?: string })?.message ?? "편지를 보내지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalOverlay onClose={onClose} align="top" padding="16px">
      <div
        className="w-full max-w-[440px] rounded-2xl bg-white p-5 mt-[6vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between">
          <h2 className="m-0 text-[17px] font-bold text-black/95">💌 {childName}에게 편지</h2>
          <button onClick={onClose} className="border-none bg-transparent text-[13px] text-p-muted cursor-pointer">닫기</button>
        </div>
        <p className="mt-1 mb-3 text-[12px] text-p-muted leading-relaxed">
          가족만 봅니다. 피드에는 올라가지 않아요.
        </p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
          rows={4}
          placeholder="오늘 하루 어땠어?"
          className="w-full resize-none rounded-xl border border-black/10 p-3 text-[14px] leading-relaxed outline-none focus:border-p-green"
        />
        <div className="mt-1 text-right text-[11px] text-p-muted tabular-nums">{text.length}/{MAX_TEXT}</div>

        {/* 매칭 선물 */}
        <div className="mt-2 rounded-xl bg-p-bg p-3">
          <div className="text-[12px] font-semibold text-black/80">
            이번 주 {childName}이(가) 모은 XP{" "}
            <span className="tabular-nums">{weekXp === null ? "…" : weekXp.toLocaleString("ko-KR")}</span>
          </div>
          {alreadyMatched ? (
            <div className="mt-2 text-[12px] text-p-muted">
              이번 주 선물은 이미 보냈어요. 다음 주에 다시 얹을 수 있어요.
            </div>
          ) : (
            <>
              <div className="mt-2 flex gap-1.5">
                {[0, 0.5, 1].map((m) => (
                  <button
                    key={m}
                    onClick={() => setMult(m)}
                    className="flex-1 rounded-lg py-1.5 text-[12px] font-bold border-none cursor-pointer"
                    style={{
                      background: mult === m ? "#eafaf1" : "rgba(0,0,0,0.04)",
                      color: mult === m ? "#1f7a33" : "#3d3a37",
                      boxShadow: mult === m ? "inset 0 0 0 1px rgba(31,122,51,0.28)" : "none",
                    }}
                  >
                    {m === 0 ? "안 얹기" : `×${m}`}
                  </button>
                ))}
              </div>
              {mult > 0 && weekXp !== null && (
                <div className="mt-2 text-[12px] font-semibold" style={{ color: "#1f7a33" }}>
                  선물 {previewPoints(weekXp, mult).toLocaleString("ko-KR")}포인트 — 편지를 열면 들어가요
                  {previewPoints(weekXp, mult) === MATCH_CAP && <span className="text-p-muted"> (주당 상한)</span>}
                </div>
              )}
            </>
          )}
        </div>

        {error && <div className="mt-2 text-[12px] text-[#c00000]">{error}</div>}

        <button
          onClick={onSend}
          disabled={!text.trim() || busy}
          className="mt-3 w-full rounded-xl py-3 text-[14px] font-bold text-white border-none cursor-pointer disabled:opacity-40"
          style={{ background: "#1f7a33" }}
        >
          {busy ? "보내는 중…" : "편지 보내기"}
        </button>

        {/* 주고받은 편지 */}
        {mail.length > 0 && (
          <div className="mt-5 flex flex-col gap-2">
            <div className="text-[12px] font-semibold text-p-muted">주고받은 편지</div>
            {mail.map((m) => (
              <div
                key={m.id}
                className="rounded-xl p-3 text-[13px] leading-relaxed"
                style={{
                  background: m.dir === "toChild" ? "rgba(0,0,0,0.03)" : "#f2fbf4",
                  border: m.dir === "toParent" ? "1px solid rgba(31,122,51,0.18)" : "none",
                }}
              >
                <div className="mb-1 flex items-center justify-between text-[11px] text-p-muted">
                  <span>{m.dir === "toChild" ? "내가 보냄" : `${m.fromName} 답장`}</span>
                  <span className="tabular-nums">
                    {m.createdAt?.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }) ?? ""}
                  </span>
                </div>
                <div className="whitespace-pre-wrap text-black/85">{m.text}</div>
                {m.gift && (
                  <div className="mt-1.5 text-[11.5px] font-semibold" style={{ color: m.giftClaimed ? "#1f7a33" : "#a39e98" }}>
                    🎁 {m.gift.points.toLocaleString("ko-KR")}포인트 {m.giftClaimed ? "· 받았어요" : "· 아직 안 열었어요"}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalOverlay>
  );
}
