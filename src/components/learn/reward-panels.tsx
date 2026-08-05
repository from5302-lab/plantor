"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { ModalOverlay } from "@/components/ui/modal-overlay";
import { T } from "@/lib/design-tokens";
import { AvatarView } from "./avatar-view";
import {
  BADGES, BADGE_BY_CODE, RARITY, SHOP_ITEMS, SLOT_LABEL, TOTAL_BADGES,
  type ShopSlot,
} from "@/lib/rewards/catalog";
import type { RewardState } from "@/lib/hooks/useRewards";

// 뱃지함 · 상점을 한 모달에서 탭으로 오간다 (정적 export라 별도 라우트를 만들지 않는다).

const SLOTS: ShopSlot[] = ["base", "hair", "outfit", "hat", "prop", "background", "frame", "effect"];

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

function Shop({ state }: { state: RewardState }) {
  const [slot, setSlot] = useState<ShopSlot>("outfit");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");

  async function buy(itemId: string) {
    setBusy(itemId); setMsg("");
    try {
      await httpsCallable(functions, "purchaseShopItem")({ itemId });
      await httpsCallable(functions, "equipAvatarItem")({ slot, itemId });
    } catch (e) {
      setMsg((e as { message?: string })?.message ?? "구매에 실패했어요.");
    } finally { setBusy(null); }
  }
  async function equip(itemId: string) {
    setBusy(itemId); setMsg("");
    try {
      await httpsCallable(functions, "equipAvatarItem")({ slot, itemId });
    } catch (e) {
      setMsg((e as { message?: string })?.message ?? "착용에 실패했어요.");
    } finally { setBusy(null); }
  }

  const items = SHOP_ITEMS.filter((i) => i.slot === slot);

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <AvatarView equipped={state.equipped} size={64} />
        <div>
          <div className="text-[13px] font-bold text-black/85">{state.title.emoji} {state.title.name} Lv.{state.level}</div>
          <div className="text-[12px] font-semibold" style={{ color: T.teal }}>⭐ {state.points.toLocaleString("ko-KR")}P</div>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-2 -mx-1 px-1">
        {SLOTS.map((s) => (
          <button
            key={s}
            onClick={() => setSlot(s)}
            className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold"
            style={{ background: s === slot ? T.teal : "rgba(0,0,0,0.04)", color: s === slot ? "#fff" : "#615d59" }}
          >
            {SLOT_LABEL[s]}
          </button>
        ))}
      </div>

      {msg && <div className="mb-2 text-[12px] font-semibold text-[#c00000]">{msg}</div>}

      <div className="grid grid-cols-3 gap-2">
        {items.map((item) => {
          const r = RARITY[item.rarity];
          const isOwned = state.owned.has(item.id);
          const isOn = state.equipped[item.slot] === item.id;
          const lockedByLevel = item.minLevel != null && state.level < item.minLevel;
          const lockedByBadge = item.badgeCode != null && !state.badges.some((b) => b.code === item.badgeCode);
          const locked = lockedByLevel || lockedByBadge;

          return (
            <div key={item.id} className="rounded-xl p-2 text-center" style={{ background: r.bg, border: `1.5px solid ${isOn ? T.teal : r.ring}` }}>
              <div className="text-[26px] leading-none" style={{ opacity: locked && !isOwned ? 0.3 : 1 }}>{item.emoji}</div>
              <div className="mt-1 text-[11px] font-bold truncate text-black/80">{item.name}</div>

              {isOwned ? (
                <button
                  onClick={() => equip(item.id)}
                  disabled={isOn || busy === item.id}
                  className="mt-1.5 w-full py-1 rounded-lg text-[11px] font-bold"
                  style={{ background: isOn ? "rgba(0,0,0,0.06)" : T.teal, color: isOn ? "#615d59" : "#fff" }}
                >
                  {isOn ? "착용 중" : "착용"}
                </button>
              ) : lockedByBadge ? (
                <div className="mt-1.5 text-[10px] font-bold" style={{ color: r.fg }}>
                  🔒 {BADGE_BY_CODE.get(item.badgeCode!)?.name} 뱃지
                </div>
              ) : lockedByLevel ? (
                <div className="mt-1.5 text-[10px] font-bold text-p-muted">🔒 Lv.{item.minLevel}</div>
              ) : (
                <button
                  onClick={() => buy(item.id)}
                  disabled={busy === item.id || state.points < item.cost}
                  className="mt-1.5 w-full py-1 rounded-lg text-[11px] font-bold"
                  style={{
                    background: state.points >= item.cost ? T.teal : "rgba(0,0,0,0.06)",
                    color: state.points >= item.cost ? "#fff" : "#a39e98",
                  }}
                >
                  {item.cost.toLocaleString("ko-KR")}P
                </button>
              )}
            </div>
          );
        })}
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
