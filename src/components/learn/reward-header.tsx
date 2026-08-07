"use client";

import { useState } from "react";
import { Flame } from "lucide-react";
import { T } from "@/lib/design-tokens";
import { SERVICES } from "@/data/site";
import { ServiceIcon } from "@/components/ui/service-icon";
import { BADGE_BY_CODE, SHOP_BY_ID } from "@/lib/rewards/catalog";
import { useActiveServiceSlugs } from "@/lib/hooks/useActiveServiceSlugs";
import { useMarkBadgesSeen, useRewards } from "@/lib/hooks/useRewards";
import { AvatarView } from "./avatar-view";
import { BadgeDiscoveryModal } from "./badge-discovery-modal";
import { RewardPanels } from "./reward-panels";

// /learn 첫 화면 최상단 위젯 — 레벨·XP 진행바·포인트·뱃지.
// 배치(09·13·17·21시)로 뒤늦게 발견된 뱃지는 여기서 큐로 연출된다.

export function RewardHeader({ childId, childName, isDemo = false, readOnly = false, previewEquipped, onPanel, activePanel = null, showIdentity = false, note, nameClass = "" }: {
  childId: string | null;
  childName: string;
  isDemo?: boolean;
  readOnly?: boolean;
  /** 상점에서 입어보는 중인 조합. 주면 실제 착용 대신 이걸 그린다(구매 전 미리보기). */
  previewEquipped?: Record<string, string | null | undefined>;
  /**
   * 주면 뱃지·상점을 모달로 띄우지 않고 바깥에 넘긴다(프로필 화면은 아래 프레임에서 전환).
   * 없으면 지금처럼 모달을 연다 — /learn 단독 화면은 아래에 전환할 프레임이 없다.
   */
  onPanel?: (p: "badges" | "shop") => void;
  /** 바깥에서 열려 있는 패널 — 카드 버튼이 지금 무엇을 보고 있는지 표시한다 */
  activePanel?: "badges" | "shop" | null;
  /**
   * 프로필 화면용 — 이름·학년·학습 중인 서비스를 카드 안에 넣어 한 장의 명함으로 만든다.
   * /learn 단독 화면은 위에 날짜·인사가 따로 있어 켜지 않는다.
   */
  showIdentity?: boolean;
  /** 이름 옆 꼬리표 (학부모 화면의 "자녀") */
  note?: string;
  /** 이름 스타일 아이템의 CSS 클래스 — 이름을 사는 슬롯이라 이름에 입혀야 보인다 */
  nameClass?: string;
}) {
  const state = useRewards(childId, !isDemo);
  const markSeen = useMarkBadgesSeen();
  const [panel, setPanel] = useState<null | "badges" | "shop">(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  // 지금 학습 중인 서비스 — 스레드의 bio 자리에 파비콘으로 세운다
  const activeSlugs = useActiveServiceSlugs(showIdentity ? childId : null);

  // 아직 안 보여준 뱃지 → 발견 연출 큐 (읽기전용 미리보기에서는 띄우지 않는다).
  // seen 플래그가 서버에 반영되기까지 시차가 있어, 닫은 것은 로컬에서도 걸러낸다.
  const queue = readOnly || isDemo
    ? []
    : state.unseen.map((b) => b.code).filter((c) => !dismissed.includes(c));

  if (isDemo || !childId || !state.ready) return null;

  const pct = Math.round(state.progress * 100);
  // 카드 테마·경험치 바 — 아바타 밖에서 파는 꾸미기. 없으면 기본 모습 그대로다.
  const eq = previewEquipped ?? state.equipped;
  const themeCls = SHOP_BY_ID.get(String(eq.cardTheme ?? ""))?.cssClass ?? "";
  const xpCls = SHOP_BY_ID.get(String(eq.xpBar ?? ""))?.cssClass ?? "";
  const services = activeSlugs
    .map((slug) => SERVICES.find((s) => s.slug === slug))
    .filter((s): s is NonNullable<typeof s> => !!s);

  return (
    <>
      <div
        className={`mb-5 rounded-2xl px-4 py-3.5 ${themeCls}`}
        style={{ background: T.white, border: T.borderSubtle, boxShadow: T.shadow }}
      >
        {/* 이름 + 아바타 — 스레드 프로필처럼 이름이 왼쪽에서 시작하고 아바타가 오른쪽 끝에 선다.
            전에는 이름이 카드 **밖에** 따로 한 줄을 차지했다. 명함이라면 이름이 명함 안에 있어야 한다. */}
        {showIdentity && (
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className={`truncate text-[20px] font-bold leading-tight text-black/95 ${nameClass}`} style={{ letterSpacing: "-0.4px" }}>
                  {childName}
                </span>
                {note && <span className="shrink-0 text-[11px] text-p-secondary">{note}</span>}
              </div>
              {/* 스레드의 @핸들 자리 — 이 학생이 어디쯤 와 있는지 한 줄 */}
              {/* 칭호(씨앗·새싹…)를 걷어낸 자리 — 장착한 뱃지가 그 사람을 말한다.
                  칭호는 레벨과 같은 것을 두 이름으로 부르고 있어 자리값을 못 했다. */}
              <div className="mt-0.5 flex items-center gap-1.5 text-[13px]">
                {state.grade && <span className="font-medium text-p-secondary">{state.grade}</span>}
                {state.grade && <span className="text-black/15">·</span>}
                {state.equippedBadges.map((code) => {
                  const b = BADGE_BY_CODE.get(code);
                  return b ? <span key={code} className="text-[15px] leading-none" title={b.name}>{b.emoji}</span> : null;
                })}
                {/* 아직 아무것도 안 낀 학생 — 자리가 비면 뭘 할 수 있는지 모른다.
                    딴 뱃지가 있을 때만 권한다. 하나도 없는데 권하면 재촉이 된다. */}
                {state.equippedBadges.length === 0 && state.badges.length > 0 && (
                  <button
                    onClick={() => (onPanel ? onPanel("badges") : setPanel("badges"))}
                    className="rounded-md bg-[#f0faf1] px-1.5 py-0.5 text-[11px] font-bold text-[#1f7a33] border-none cursor-pointer"
                  >
                    뱃지 끼우기
                  </button>
                )}
                <span className="font-bold" style={{ color: T.teal }}>Lv.{state.level}</span>
                {state.streak >= 3 && (
                  <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-[#fff4e5] px-1.5 py-0.5 text-[11px] font-bold text-[#a86a00]">
                    <Flame size={11} strokeWidth={2.5} aria-hidden />{state.streak}일
                  </span>
                )}
              </div>
            </div>
            <button onClick={() => (onPanel ? onPanel("shop") : setPanel("shop"))} aria-label="아바타 꾸미기" className="shrink-0">
              <AvatarView equipped={eq} size={64} />
            </button>
          </div>
        )}

        {/* 스레드의 bio 자리 — "이 학생이 무엇을 하는 사람인지". 파비콘만으로 읽힌다. */}
        {showIdentity && services.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {services.map((s) => (
              <span
                key={s.slug}
                title={s.name}
                className="inline-flex items-center gap-1 rounded-lg bg-black/[0.035] px-2 py-1"
              >
                <ServiceIcon service={s} size={15} />
                <span className="text-[11.5px] font-semibold text-black/70">{s.name}</span>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          {!showIdentity && (
            <button onClick={() => (onPanel ? onPanel("shop") : setPanel("shop"))} aria-label="아바타 꾸미기">
              <AvatarView equipped={eq} size={54} />
            </button>
          )}

          <div className="flex-1 min-w-0">
            {!showIdentity && (
              <div className="flex items-center gap-1.5">
                {state.equippedBadges.map((code) => {
                  const b = BADGE_BY_CODE.get(code);
                  return b ? <span key={code} className="text-[15px] leading-none" title={b.name}>{b.emoji}</span> : null;
                })}
                {state.equippedBadges.length === 0 && state.badges.length > 0 && (
                  <button
                    onClick={() => (onPanel ? onPanel("badges") : setPanel("badges"))}
                    className="rounded-md bg-[#f0faf1] px-1.5 py-0.5 text-[11px] font-bold text-[#1f7a33] border-none cursor-pointer"
                  >
                    뱃지 끼우기
                  </button>
                )}
                <span className="text-[13px] font-bold" style={{ color: T.teal }}>Lv.{state.level}</span>
                {state.streak >= 3 && (
                  <span className="ml-auto shrink-0 inline-flex items-center gap-0.5 rounded-full bg-[#fff4e5] px-1.5 py-0.5 text-[11px] font-bold text-[#a86a00]">
                    <Flame size={11} strokeWidth={2.5} aria-hidden />{state.streak}일 연속
                  </span>
                )}
              </div>
            )}

            {/* XP 진행바 */}
            <div className={`${showIdentity ? "" : "mt-1.5"} h-2 rounded-full bg-black/[0.06] overflow-hidden`}>
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${xpCls}`}
                style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${T.teal}, #7bd18a)` }}
              />
            </div>
            {/* "다음 레벨까지 N" 은 뺐다 — 280/500 이 이미 남은 양을 말한다. 같은 숫자를 두 번 적는 셈. */}
            <div className="mt-1 text-[11px] text-p-secondary tabular-nums">
              {state.xpInLevel.toLocaleString("ko-KR")} / {state.xpNeeded.toLocaleString("ko-KR")} XP
            </div>
          </div>
        </div>

        {/* 뱃지·상점 진입. 프로필 화면에서는 이 두 버튼이 곧 탭이라(onPanel),
            지금 보고 있는 쪽을 눌린 상태로 표시한다. 모달로 띄우면 카드 위에 덮여
            같은 화면을 두 겹으로 보게 된다. */}
        <div className="mt-3 flex gap-1.5">
          <PanelButton
            label={`🎖️ 뱃지 ${state.badges.length}개`}
            active={activePanel === "badges"}
            onClick={() => (onPanel ? onPanel("badges") : setPanel("badges"))}
          />
          {/* 남의 카드에서도 상점을 열 수 있다 — 둘러보기는 데이터를 바꾸지 않는다.
              막히는 건 구매 버튼뿐이다. */}
          <PanelButton
            label={`⭐ ${state.points.toLocaleString("ko-KR")}P 상점`}
            active={activePanel === "shop"}
            onClick={() => (onPanel ? onPanel("shop") : setPanel("shop"))}
          />
        </div>
      </div>

      {panel && (
        <RewardPanels state={state} tab={panel} onTab={setPanel} onClose={() => setPanel(null)} readOnly={readOnly} />
      )}

      {queue.length > 0 && (
        <BadgeDiscoveryModal
          codes={queue}
          name={childName || "플랜토"}
          grade={state.grade}
          level={state.level}
          onClose={() => { markSeen(queue); setDismissed((prev) => [...prev, ...queue]); }}
        />
      )}
    </>
  );
}

/** 카드 아래 진입 버튼. 프로필 화면에서는 탭 노릇을 하므로 선택 상태가 보여야 한다. */
function PanelButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-2 rounded-xl text-[12px] font-bold"
      style={{
        background: active ? "#eafaf1" : "rgba(0,0,0,0.04)",
        color: active ? "#1f7a33" : "#3d3a37",
        boxShadow: active ? "inset 0 0 0 1px rgba(31,122,51,0.28)" : "none",
      }}
    >
      {label}
    </button>
  );
}
