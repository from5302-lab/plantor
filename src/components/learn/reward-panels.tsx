"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { ModalOverlay } from "@/components/ui/modal-overlay";
import { T } from "@/lib/design-tokens";
import { AvatarView } from "./avatar-view";
import { BADGES, RARITY, TOTAL_BADGES } from "@/lib/rewards/catalog";
import type { RewardState } from "@/lib/hooks/useRewards";

// 뱃지함 · 상점을 한 모달에서 탭으로 오간다 (정적 export라 별도 라우트를 만들지 않는다).

function BadgeVault({ state }: { state: RewardState }) {
  const owned = new Set(state.badges.map((b) => b.code));
  const earned = BADGES.filter((b) => owned.has(b.code));
  const openLocked = BADGES.filter((b) => !owned.has(b.code) && !b.hidden);
  const hiddenLeft = BADGES.filter((b) => !owned.has(b.code) && b.hidden).length;

  return (
    <div>
      <div className="text-[13px] font-bold text-black/85 mb-2">
        모은 뱃지 {earned.length}
        <span className="text-p-muted font-semibold"> / {TOTAL_BADGES}</span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {earned.map((b) => {
          const r = RARITY[b.rarity];
          return (
            <div key={b.code} className="rounded-xl p-2 text-center" style={{ background: r.bg, border: `1.5px solid ${r.ring}` }} title={b.desc}>
              <div className="text-[26px] leading-none">{b.emoji}</div>
              <div className="mt-1 text-[10px] font-bold truncate" style={{ color: r.fg }}>{b.name}</div>
            </div>
          );
        })}
        {/* 미획득 히든은 조건을 끝까지 감춘다 — 개수만 알려준다 */}
        {Array.from({ length: Math.min(hiddenLeft, 8) }).map((_, i) => (
          <div key={`h-${i}`} className="rounded-xl p-2 text-center bg-black/[0.03] border border-black/[0.06]">
            <div className="text-[26px] leading-none opacity-25">❓</div>
            <div className="mt-1 text-[10px] font-bold text-p-muted">???</div>
          </div>
        ))}
      </div>

      {hiddenLeft > 0 && (
        <div className="mt-2.5 text-[12px] text-p-secondary">
          숨은 뱃지 <b>{hiddenLeft}개</b>가 더 있어요. 조건은 비밀 — 하다 보면 나타납니다.
        </div>
      )}

      {openLocked.length > 0 && (
        <>
          <div className="mt-4 mb-1.5 text-[12px] font-bold text-p-secondary">도전 중</div>
          <div className="flex flex-col gap-1.5">
            {openLocked.map((b) => (
              <div key={b.code} className="flex items-center gap-2 rounded-lg bg-black/[0.02] px-2.5 py-2">
                <span className="text-[18px] opacity-40">{b.emoji}</span>
                <span className="text-[12px] font-semibold text-black/70">{b.name}</span>
                <span className="ml-auto text-[11px] text-p-muted">{b.desc}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * 상점 — 준비중.
 * 포인트는 계속 쌓이고(현재 22명 12,308P), 열리는 즉시 쓸 수 있다.
 * 아이템 목록·구매는 서버(purchaseShopItem)에서도 함께 막아두었다.
 */
function Shop({ state }: { state: RewardState }) {
  return (
    <div className="py-8 text-center">
      <div className="flex justify-center mb-4">
        <AvatarView equipped={state.equipped} size={64} />
      </div>
      <div className="text-[15px] font-bold text-black/85">상점 준비 중</div>
      <p className="mt-1.5 text-[12.5px] text-p-secondary" style={{ lineHeight: 1.7, wordBreak: "keep-all" }}>
        캐릭터를 꾸밀 수 있는 아이템을 만들고 있어요.<br />
        그때까지 모은 포인트는 그대로 남아 있으니 걱정 마세요.
      </p>
      <div
        className="inline-flex items-baseline gap-1 mt-4 rounded-lg px-3 py-2"
        style={{ background: "#f0faf1" }}
      >
        <span className="text-[12px] text-p-secondary">지금까지 모은 포인트</span>
        <b className="text-[16px] font-bold tabular-nums" style={{ color: "#2a8438" }}>
          {state.points.toLocaleString("ko-KR")}
        </b>
        <span className="text-[12px] font-bold" style={{ color: "#2a8438" }}>P</span>
      </div>
    </div>
  );
}

/** 피드 공개 토글 — 비교가 부담되는 학생이 학습 자체를 피하지 않도록 빠져나갈 문을 둔다. */
function FeedPrivacy({ state }: { state: RewardState }) {
  const [optOut, setOptOut] = useState(state.feedOptOut);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    if (saving) return;
    const next = !optOut;
    setSaving(true);
    setOptOut(next);
    try {
      await httpsCallable(functions, "setFeedOptOut")({ optOut: next });
    } catch {
      setOptOut(!next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 pt-3.5 border-t border-black/[0.07] flex items-start gap-3">
      <div className="min-w-0">
        <div className="text-[12px] font-bold text-black/80">학습 피드에 올리기</div>
        <div className="text-[11px] text-p-muted mt-0.5">
          끄면 내 뱃지·레벨이 친구들 피드에 올라가지 않아요.
        </div>
      </div>
      <button
        onClick={toggle}
        disabled={saving}
        role="switch"
        aria-checked={!optOut}
        className="ml-auto shrink-0 rounded-full px-3 py-1.5 text-[12px] font-bold cursor-pointer"
        style={{
          background: optOut ? "rgba(0,0,0,0.05)" : T.teal,
          color: optOut ? "#615d59" : "#fff",
          opacity: saving ? 0.6 : 1,
        }}
      >
        {optOut ? "꺼짐" : "켜짐"}
      </button>
    </div>
  );
}

export function RewardPanels({ state, tab, onTab, onClose }: {
  state: RewardState;
  tab: "badges" | "shop";
  onTab: (t: "badges" | "shop") => void;
  onClose: () => void;
}) {
  return (
    <ModalOverlay onClose={onClose} align="top" padding="16px" zIndex={1100}>
      <div
        style={{ width: "100%", maxWidth: 440, background: T.white, borderRadius: 18, padding: 16, marginTop: 40, boxShadow: T.shadowFloat }}
      >
        <div className="flex items-center gap-1.5 mb-3">
          {(["badges", "shop"] as const).map((t) => (
            <button
              key={t}
              onClick={() => onTab(t)}
              className="px-3 py-1.5 rounded-full text-[12px] font-bold"
              style={{ background: t === tab ? T.teal : "rgba(0,0,0,0.04)", color: t === tab ? "#fff" : "#615d59" }}
            >
              {t === "badges" ? "뱃지함" : "상점"}
            </button>
          ))}
          <button onClick={onClose} className="ml-auto text-[13px] font-bold text-p-muted px-2">닫기</button>
        </div>

        {tab === "badges" ? <BadgeVault state={state} /> : <Shop state={state} />}
        {tab === "badges" && <FeedPrivacy state={state} />}
      </div>
    </ModalOverlay>
  );
}
