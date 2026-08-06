"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { notifyPreview } from "@/components/ui/preview-notice";
import { ModalOverlay } from "@/components/ui/modal-overlay";
import { T } from "@/lib/design-tokens";
import { AvatarView } from "./avatar-view";
import {
  BADGES, BADGE_BY_CODE, RARITY, SHOP_BY_ID, SHOP_ITEMS, SLOT_LABEL, TOTAL_BADGES,
  badgeSlots, effectLabel,
  type ShopItem, type ShopSlot,
} from "@/lib/rewards/catalog";
import type { RewardState } from "@/lib/hooks/useRewards";

// 뱃지함 · 상점을 한 모달에서 탭으로 오간다 (정적 export라 별도 라우트를 만들지 않는다).

// 꾸미기 슬롯 노출 순서 — 티가 많이 나는 것부터
const SLOTS: ShopSlot[] = ["base", "frame", "nameStyle", "cardTheme", "xpBar", "background", "effect"];

/** 미리보기를 크게(2열) 띄울 슬롯 — 작게 그리면 무늬·움직임이 안 읽혀 팔리지 않는다. */
const WIDE_SLOTS = new Set<ShopSlot>(["frame", "nameStyle", "effect", "cardTheme", "xpBar", "background"]);

/** 뱃지로만 열리는 아이템은 값이 0이라 "0P"로 보이면 고장 난 것처럼 읽힌다. */
function priceLabel(it: ShopItem) {
  if (it.cost > 0) return `${it.cost.toLocaleString("ko-KR")}P`;
  return it.badgeCode ? "뱃지 보상 · 무료" : "무료";
}

export function BadgeVault({ state, readOnly = false }: { state: RewardState; readOnly?: boolean }) {
  const owned = new Set(state.badges.map((b) => b.code));
  const earned = BADGES.filter((b) => owned.has(b.code));
  const slots = badgeSlots(state.level);
  // 장착은 서버가 검증한다. 여기서는 눌린 즉시 반응하도록 낙관적으로 그리고,
  // 실패하면 되돌린다 — 뱃지판을 오가며 기다리게 하면 끼우는 재미가 죽는다.
  const [equipped, setEquipped] = useState<string[] | null>(null);
  const [msg, setMsg] = useState("");
  const on = equipped ?? state.equippedBadges;

  async function toggle(code: string) {
    const next = on.includes(code) ? on.filter((c) => c !== code) : [...on, code].slice(-slots);
    setEquipped(next); setMsg("");
    // 미리보기: 화면은 학생이 누른 것과 똑같이 바뀌고 저장만 건너뛴다.
    if (readOnly) { notifyPreview(); return; }
    try {
      await httpsCallable(functions, "equipBadges")({ codes: next });
    } catch (e) {
      setEquipped(on);
      setMsg((e as { message?: string })?.message ?? "장착에 실패했어요.");
    }
  }
  // 공개 뱃지는 연속 학습 4단계(3·7·30·100일)다. 미획득분을 전부 늘어놓으면
  // 연속 2일인 학생에게 "100일의 기적 2/100일"까지 보여 목표가 아니라 벽으로 읽힌다.
  // 손에 닿는 두 개만 남긴다.
  const openLocked = BADGES.filter((b) => !owned.has(b.code) && !b.hidden).slice(0, 2);
  const hiddenLeft = BADGES.filter((b) => !owned.has(b.code) && b.hidden).length;

  return (
    <div>
      <div className="text-[15px] font-bold text-black/90 tracking-[-0.2px] mb-2">
        모은 뱃지 {earned.length}
        <span className="text-p-muted font-semibold"> / {TOTAL_BADGES}</span>
      </div>

      {/* 미리보기에서도 학생과 같은 문구를 보여준다 — 화면이 달라지면 파악이 안 된다 */}
      <div className="mb-2 text-[12px] text-p-secondary">
        뱃지를 눌러 장착하세요. 지금 <b className="text-black/75">{slots}개</b>까지 낄 수 있어요
        {slots < 3 && <span className="text-p-muted"> · Lv.{slots === 1 ? 10 : 30}에 한 칸 더</span>}
      </div>

      {/* 한 줄 가로 스크롤 — 상점과 같은 리듬. 격자로 깔면 뱃지가 늘수록 세로로만 길어진다.
          카드는 정사각 고정폭이라 개수가 달라도 목록으로 읽힌다. */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-0.5 px-0.5 pb-1">
        {earned.map((b) => {
          const r = RARITY[b.rarity];
          const isOn = on.includes(b.code);
          return (
            <button
              key={b.code}
              onClick={() => toggle(b.code)}
              title={`${b.desc}${effectLabel(b.code) ? ` · ${effectLabel(b.code)}` : ""}`}
              className="relative w-[92px] h-[92px] shrink-0 rounded-xl p-1.5 flex flex-col items-center justify-center cursor-pointer"
              style={{
                background: r.bg,
                border: `1.5px solid ${isOn ? "#1f7a33" : r.ring}`,
                boxShadow: isOn ? "inset 0 0 0 2px rgba(31,122,51,0.35)" : "none",
              }}
            >
              {isOn && (
                <span className="absolute top-1 right-1 rounded-full bg-p-green px-1.5 py-px text-[9px] font-bold text-white">장착</span>
              )}
              <div className="text-[30px] leading-none">{b.emoji}</div>
              <div className="mt-1 w-full truncate text-center text-[11px] font-bold" style={{ color: r.fg }}>{b.name}</div>
            </button>
          );
        })}
        {/*
          미획득 히든은 조건을 끝까지 감춘다 — 개수만 알려준다.
          자리표시는 줄을 채우는 만큼만. 정확한 개수는 바로 아래 문장이 말한다.
          흐림은 opacity 대신 색으로 준다(DESIGN.md 규칙 10).
        */}
        {Array.from({ length: Math.min(hiddenLeft, 2) }).map((_, i) => (
          <div key={`h-${i}`} className="w-[92px] h-[92px] shrink-0 rounded-xl bg-black/[0.02] border border-black/[0.05] flex flex-col items-center justify-center">
            <div className="text-[30px] leading-none text-[#d8d4cf]">?</div>
            <div className="mt-1 text-[11px] font-bold text-p-muted">???</div>
          </div>
        ))}
      </div>

      {msg && <p className="mt-2 text-[12px] text-[#c00000]">{msg}</p>}

      {/* 장착한 뱃지가 실제로 무엇을 해주는지 — 끼운 이유가 보여야 다음에 또 고른다 */}
      {on.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-1">
          {on.map((code) => {
            const label = effectLabel(code);
            const b = BADGE_BY_CODE.get(code);
            if (!label || !b) return null;
            return (
              <div key={code} className="flex items-center gap-1.5 rounded-lg bg-[#f0faf1] px-2.5 py-1.5 text-[11.5px]">
                <span className="text-[14px] leading-none">{b.emoji}</span>
                <span className="font-semibold text-black/70">{b.name}</span>
                <span className="ml-auto font-bold text-[#1f7a33]">{label}</span>
              </div>
            );
          })}
        </div>
      )}

      {hiddenLeft > 0 && (
        <div className="mt-2.5 text-[12px] text-p-secondary">
          숨은 뱃지 <b>{hiddenLeft}개</b>가 더 있어요. 조건은 비밀 — 하다 보면 나타납니다.
        </div>
      )}

      {openLocked.length > 0 && (
        <>
          <div className="mt-4 mb-1.5 text-[12px] font-bold text-p-secondary">도전 중</div>
          <div className="flex flex-col gap-1.5">
            {openLocked.map((b) => {
              // 공개 뱃지는 전부 연속 학습(st-N)이라 지금 며칠째인지로 진행도를 낼 수 있다.
              // 전에는 desc("7일 연속으로 학습했어요")를 그대로 붙였는데, 획득 알림용
              // 과거형 문장이라 도전 중 목록에서는 이미 딴 것처럼 읽혔다.
              const target = Number(b.code.startsWith("st-") ? b.code.slice(3) : NaN);
              const pct = Number.isFinite(target) && target > 0
                ? Math.max(0, Math.min(100, Math.round((state.streak / target) * 100)))
                : null;
              return (
                <div key={b.code} className="flex items-center gap-2.5 rounded-lg bg-black/[0.02] px-2.5 py-2">
                  <span className="text-[18px] shrink-0">{b.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-black/70">{b.name}</div>
                    {pct !== null && (
                      <div className="mt-1 h-1.5 rounded-full bg-black/[0.06] overflow-hidden">
                        <div className="h-full rounded-full bg-p-green" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                  <span className="text-[11px] font-semibold text-p-secondary shrink-0 tabular-nums">
                    {pct !== null ? `${state.streak} / ${target}일` : b.desc}
                  </span>
                </div>
              );
            })}
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
export function Shop({ state, readOnly = false, hideStage = false, tryOn: tryOnProp, onTryOn }: {
  state: RewardState;
  readOnly?: boolean;
  /** 프로필 화면처럼 위에 이미 카드가 있을 때 — 무대를 두 번 그리지 않는다 */
  hideStage?: boolean;
  /** 입어보기 상태를 바깥이 들고 있을 때(위 카드에 그대로 비춘다) */
  tryOn?: Record<string, string>;
  onTryOn?: Dispatch<SetStateAction<Record<string, string>>>;
}) {
  const [slot, setSlot] = useState<ShopSlot>("frame");
  const [tryOnLocal, setTryOnLocal] = useState<Record<string, string>>({});
  const tryOn = tryOnProp ?? tryOnLocal;
  const setTryOn = onTryOn ?? setTryOnLocal;
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
    // 미리보기: 버튼은 학생 것과 똑같이 보이고 눌리되, 포인트를 쓰지 않는다.
    if (readOnly) { notifyPreview(); return; }
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
  const wide = WIDE_SLOTS.has(slot);

  return (
    <div className="flex flex-col">
      {/* ── 무대 ── 입어보는 결과가 여기 뜬다.
          프로필 화면에서는 바로 위에 프로필 카드가 있어 두 번 그리지 않는다(hideStage).
          그때는 입어보기 결과가 그 카드에 그대로 비친다. */}
      {!hideStage && (
        <div
          className="rounded-2xl px-3 sm:px-4 py-3 sm:py-4 mb-3 flex items-center gap-3 sm:gap-4 shrink-0"
          style={{ background: "linear-gradient(160deg,#fbfbfa,#f2f1ef)", border: "1px solid rgba(0,0,0,0.06)" }}
        >
          <AvatarView equipped={preview} size={72} />
          <div className="min-w-0 flex-1">
            <div className={`text-[19px] font-bold text-black/90 truncate ${previewName}`}>
              {state.name || "내 이름"}
            </div>
            <div className="text-[12px] mt-0.5 text-p-secondary">Lv.{state.level}</div>
            <div className="text-[13px] font-bold mt-1" style={{ color: T.teal }}>
              ⭐ {state.points.toLocaleString("ko-KR")}P
            </div>
          </div>
        </div>
      )}

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
          {/* 남의 카드(학부모·미리보기)에서는 입어보기까지만. 구매·착용 콜러블은 호출자 본인의
              학생을 찾으므로(rewards-api.ts resolveChild) 눌러도 실패한다. */}
          {(
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
          )}
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

      {/* ── 아이템 ── 한 줄 가로 스크롤.
          격자로 깔면 슬롯 하나에 수십 개라 세로로 한참 내려가고, 화면 대부분이
          카드 사이 여백이 된다. 한 줄이면 훑기가 빠르고 슬롯 탭과 리듬이 맞는다. */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar mt-2 -mx-0.5 px-0.5 pb-1">
        {items.map((it) => {
          const owned = state.owned.has(it.id);
          const wearing = preview[it.slot] === it.id;
          const lock = lockOf(it);
          const r = RARITY[it.rarity];

          return (
            <button
              key={it.id}
              onClick={() => setTryOn((prev) => ({ ...prev, [it.slot]: it.id }))}
              className={`shrink-0 rounded-xl p-2.5 text-center cursor-pointer ${wide ? "w-[132px]" : "w-[104px]"}`}
              style={{
                // 희귀도를 카드에서 읽히게 한다. 전에는 이름 글자 색만 달라서
                // 전설과 일반이 스크롤 중에 똑같아 보였다. 영웅·전설만 은은히 물들인다.
                background: wearing ? r.bg : (it.rarity === "epic" || it.rarity === "legend" ? r.bg : "#fff"),
                border: `1.5px solid ${wearing || it.rarity === "legend" ? r.ring : "rgba(0,0,0,0.08)"}`,
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
      <p className="mt-2 text-[11px] text-p-muted text-center shrink-0">
눌러서 입어보고, 마음에 들면 구매하세요.
      </p>
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

  // 카드 테마 — 프로필 카드를 줄여서 그대로 보여준다. 색 견본만 두면 어디에 쓰이는지 모른다.
  if (item.slot === "cardTheme") {
    return (
      <div
        className={`rounded-lg px-2 py-2 flex items-center gap-2 ${item.cssClass ?? ""}`}
        style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.06)" }}
      >
        <AvatarView equipped={base} size={22} />
        <span className="flex-1 min-w-0">
          <span className="block h-1.5 rounded-full bg-black/[0.10]" />
          <span className="mt-1 block h-1.5 w-2/3 rounded-full bg-black/[0.07]" />
        </span>
      </div>
    );
  }

  // 경험치 바 — 반쯤 찬 상태로 보여준다. 빈 바는 색이 안 보이고, 꽉 찬 바는 늘 저럴 것처럼 읽힌다.
  if (item.slot === "xpBar") {
    return (
      <div className="py-2">
        <div className="h-2 rounded-full bg-black/[0.06] overflow-hidden">
          <div
            className={`h-full w-3/5 rounded-full ${item.cssClass ?? ""}`}
            style={{ background: "linear-gradient(90deg, #1f7a33, #7bd18a)" }}
          />
        </div>
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
          {/* 상점은 읽기 전용에서도 연다 — 둘러보기·입어보기는 데이터를 바꾸지 않는다.
              막는 것은 구매 버튼 하나면 충분하다. */}
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

        <div className="flex-1 min-h-0 flex flex-col">
          {tab === "badges" ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <BadgeVault state={state} />
              {/* 피드 공개설정도 본인만 바꾼다 */}
              {!readOnly && <FeedPrivacy state={state} />}
            </div>
          ) : <Shop state={state} readOnly={readOnly} />}
        </div>
      </div>
    </ModalOverlay>
  );
}
