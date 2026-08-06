"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { ModalOverlay } from "@/components/ui/modal-overlay";
import { T } from "@/lib/design-tokens";
import { AvatarView } from "./avatar-view";
import {
  BADGES, RARITY, SHOP_BY_ID, SHOP_ITEMS, SLOT_LABEL, TOTAL_BADGES,
  type ShopItem, type ShopSlot,
} from "@/lib/rewards/catalog";
import type { RewardState } from "@/lib/hooks/useRewards";

// 뱃지함 · 상점을 한 모달에서 탭으로 오간다 (정적 export라 별도 라우트를 만들지 않는다).

// 꾸미기 슬롯 노출 순서 — 티가 많이 나는 것부터
const SLOTS: ShopSlot[] = ["base", "frame", "nameStyle", "background", "effect"];

/** 뱃지로만 열리는 아이템은 값이 0이라 "0P"로 보이면 고장 난 것처럼 읽힌다. */
function priceLabel(it: ShopItem) {
  if (it.cost > 0) return `${it.cost.toLocaleString("ko-KR")}P`;
  return it.badgeCode ? "뱃지 보상 · 무료" : "무료";
}

export function BadgeVault({ state }: { state: RewardState }) {
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
 * 꾸미기 상점.
 *
 * 파는 게 CSS 효과라 **크게 보여줘야 팔린다** — 30px 원으로는 회전 링이 안 보인다.
 * 그래서 (1) 큰 무대 미리보기 (2) 눌러서 내 아바타에 바로 입혀보기(구매 전) 를 둔다.
 * 못 사는 아이템도 계속 움직이게 둔다. 갖고 싶어야 모은다.
 */
export function Shop({ state }: { state: RewardState }) {
  const [slot, setSlot] = useState<ShopSlot>("frame");
  const [tryOn, setTryOn] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  // 입어본 상태 = 실제 착용 위에 덧씌운 미리보기
  const preview = { ...state.equipped, ...tryOn };
  const previewName = SHOP_BY_ID.get(String(preview.nameStyle ?? ""))?.cssClass ?? "";

  // 지금 무대에 올라와 있지만 아직 안 산 것
  const trying = Object.entries(tryOn)
    .map(([sl, id]) => ({ sl, item: SHOP_BY_ID.get(id) }))
    .find(({ item }) => item && !state.owned.has(item.id));

  const lockOf = (it: ShopItem) => {
    if (it.badgeCode && !state.badges.some((b) => b.code === it.badgeCode)) return "뱃지 필요";
    if (it.minLevel && state.level < it.minLevel) return `Lv.${it.minLevel}`;
    return null;
  };

  async function buyAndWear(it: ShopItem) {
    setBusy(it.id); setMsg("");
    try {
      if (!state.owned.has(it.id)) await httpsCallable(functions, "purchaseShopItem")({ itemId: it.id });
      await httpsCallable(functions, "equipAvatarItem")({ slot: it.slot, itemId: it.id });
      setTryOn((prev) => { const n = { ...prev }; delete n[it.slot]; return n; });
    } catch (e) {
      setMsg((e as { message?: string })?.message ?? "처리에 실패했어요.");
    } finally { setBusy(null); }
  }

  const items = SHOP_ITEMS.filter((i) => i.slot === slot);
  // 효과가 큰 슬롯은 2열로 크게 — 작으면 회전·그라데가 안 읽힌다
  const wide = slot === "frame" || slot === "nameStyle" || slot === "effect";

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── 무대 ── 스크롤해도 늘 보여야 한다. 입어보는 결과가 여기 뜨기 때문 */}
      <div
        className="rounded-2xl px-3 sm:px-4 py-3 sm:py-4 mb-3 flex items-center gap-3 sm:gap-4 shrink-0"
        style={{ background: "linear-gradient(160deg,#fbfbfa,#f2f1ef)", border: "1px solid rgba(0,0,0,0.06)" }}
      >
        <AvatarView equipped={preview} size={72} />
        <div className="min-w-0 flex-1">
          <div className={`text-[19px] font-bold text-black/90 truncate ${previewName}`}>
            {state.name || "내 이름"}
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: state.title.color }}>
            {state.title.name} Lv.{state.level}
          </div>
          <div className="text-[13px] font-bold mt-1" style={{ color: T.teal }}>
            ⭐ {state.points.toLocaleString("ko-KR")}P
          </div>
        </div>
      </div>

      {/* ── 입어본 것 구매 바 ── */}
      {trying?.item && (
        <div
          className="rounded-xl px-3 py-2.5 mb-3 flex items-center gap-2 shrink-0"
          style={{ background: RARITY[trying.item.rarity].bg, border: `1.5px solid ${RARITY[trying.item.rarity].ring}` }}
        >
          <span className="text-[12px] font-bold" style={{ color: RARITY[trying.item.rarity].fg }}>
            {trying.item.name}
          </span>
          <span className="text-[11px] text-p-secondary">입어보는 중</span>
          <button
            onClick={() => buyAndWear(trying.item!)}
            disabled={!!lockOf(trying.item) || trying.item.cost > state.points || busy === trying.item.id}
            className="ml-auto rounded-lg px-3 py-1.5 text-[12px] font-bold text-white cursor-pointer disabled:opacity-40"
            style={{ background: T.teal }}
          >
            {lockOf(trying.item) ?? (trying.item.cost > state.points
              ? "포인트 부족"
              : trying.item.cost === 0
                ? "무료로 받기"
                : `${trying.item.cost.toLocaleString("ko-KR")}P 구매`)}
          </button>
        </div>
      )}

      {/* ── 슬롯 탭 ── */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1 shrink-0">
        {SLOTS.map((sl) => (
          <button
            key={sl}
            onClick={() => setSlot(sl)}
            className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer"
            style={{ background: sl === slot ? T.teal : "rgba(0,0,0,0.04)", color: sl === slot ? "#fff" : "#615d59" }}
          >
            {SLOT_LABEL[sl]}
          </button>
        ))}
      </div>

      {/* ── 아이템 ── 여기만 스크롤한다 (패널 높이는 탭이 바뀌어도 그대로) */}
      <div className={`flex-1 min-h-0 overflow-y-auto grid content-start gap-2 mt-2 -mx-0.5 px-0.5 pb-1 ${wide ? "grid-cols-2" : "grid-cols-3"}`}>
        {items.map((it) => {
          const owned = state.owned.has(it.id);
          const wearing = preview[it.slot] === it.id;
          const lock = lockOf(it);
          const r = RARITY[it.rarity];

          return (
            <button
              key={it.id}
              onClick={() => setTryOn((prev) => ({ ...prev, [it.slot]: it.id }))}
              className="rounded-xl p-2.5 text-center cursor-pointer"
              style={{
                background: wearing ? r.bg : "#fff",
                border: `1.5px solid ${wearing ? r.ring : "rgba(0,0,0,0.08)"}`,
                // 잠긴 것도 흐리게만 — 안 보이면 갖고 싶지도 않다
                opacity: lock ? 0.72 : 1,
              }}
            >
              <ItemPreview item={it} big={wide} base={preview} name={state.name || "내 이름"} />
              <div className="mt-1.5 text-[11px] font-bold truncate" style={{ color: r.fg }}>{it.name}</div>
              <div className="text-[10px] text-p-muted">
                {owned ? (wearing ? "착용 중" : "보유") : lock ?? priceLabel(it)}
              </div>
            </button>
          );
        })}
      </div>

      {msg && <p className="mt-2 text-[12px] text-[#c00000] shrink-0">{msg}</p>}
      <p className="mt-2 text-[11px] text-p-muted text-center shrink-0">눌러서 입어보고, 마음에 들면 구매하세요.</p>
    </div>
  );
}

/**
 * 아이템 미리보기.
 *
 * 빈 원에 링만 그리면 "이게 뭐지"로 끝난다 — 꾸미기 상품은 **꾸밀 대상**이 있어야 팔린다.
 * 그래서 지금 내 아바타를 그대로 그리고 해당 슬롯만 이 아이템으로 갈아끼운다.
 */
function ItemPreview({ item, big, base, name }: {
  item: ShopItem;
  big?: boolean;
  base: Record<string, string | null | undefined>;
  name: string;
}) {
  // 이름 스타일은 아바타가 아니라 실제 내 이름으로 보여줘야 "내 이름이 저렇게 된다"가 온다
  if (item.slot === "nameStyle") {
    return (
      <div
        className={`font-bold text-black/85 truncate ${item.cssClass ?? ""}`}
        style={{ fontSize: big ? 22 : 16, lineHeight: 1.4 }}
      >
        {name}
      </div>
    );
  }
  return (
    <div className="flex justify-center py-0.5">
      <AvatarView equipped={{ ...base, [item.slot]: item.id }} size={big ? 52 : 34} />
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

export function RewardPanels({ state, tab, onTab, onClose, readOnly = false }: {
  state: RewardState;
  tab: "badges" | "shop";
  onTab: (t: "badges" | "shop") => void;
  onClose: () => void;
  /**
   * 남의 카드(학부모가 보는 자녀)에서는 조작을 전부 잠근다.
   * 상점 구매·아바타 착용·피드 공개설정 콜러블은 전부 **호출자 본인**의 학생을 찾으므로
   * (rewards-api.ts resolveChild) 학부모가 누르면 실패한다. 눌리게 두면 안 된다.
   */
  readOnly?: boolean;
}) {
  const tabs = readOnly ? (["badges"] as const) : (["badges", "shop"] as const);
  return (
    <ModalOverlay onClose={onClose} align="top" padding="12px" zIndex={1100}>
      {/*
        높이를 고정한다 — 탭마다 아이템 수가 달라 패널이 늘었다 줄었다 하면
        탭을 옮길 때마다 화면이 튄다. 안은 그리드만 스크롤한다.
        dvh 를 쓰는 이유: 모바일에서 주소창이 접히고 펼쳐질 때 vh 가 흔들린다.
      */}
      <div
        className="w-full max-w-[440px] rounded-[18px] p-3 sm:p-4 mt-2 sm:mt-10 flex flex-col"
        style={{ background: T.white, boxShadow: T.shadowFloat, height: "min(82dvh, 640px)" }}
      >
        <div className="flex items-center gap-1.5 mb-3 shrink-0">
          {tabs.map((t) => (
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

        <div className="flex-1 min-h-0 flex flex-col">
          {tab === "badges" || readOnly ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <BadgeVault state={state} />
              {/* 피드 공개설정도 본인만 바꾼다 */}
              {!readOnly && <FeedPrivacy state={state} />}
            </div>
          ) : <Shop state={state} />}
        </div>
      </div>
    </ModalOverlay>
  );
}
