"use client";

import { useState } from "react";
import { T } from "@/lib/design-tokens";
import { SHOP_BY_ID } from "@/lib/rewards/catalog";
import { useMarkBadgesSeen, useRewards } from "@/lib/hooks/useRewards";
import { AvatarView } from "./avatar-view";
import { BadgeDiscoveryModal } from "./badge-discovery-modal";
import { RewardPanels } from "./reward-panels";

// /learn 첫 화면 최상단 위젯 — 레벨·XP 진행바·포인트·뱃지.
// 배치(09·13·17·21시)로 뒤늦게 발견된 뱃지는 여기서 큐로 연출된다.

export function RewardHeader({ childId, childName, isDemo = false, readOnly = false, previewEquipped, onPanel, activePanel = null }: {
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
}) {
  const state = useRewards(childId, !isDemo);
  const markSeen = useMarkBadgesSeen();
  const [panel, setPanel] = useState<null | "badges" | "shop">(null);
  const [dismissed, setDismissed] = useState<string[]>([]);

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

  return (
    <>
      <div
        className={`mb-5 rounded-2xl px-4 py-3.5 ${themeCls}`}
        style={{ background: T.white, border: T.borderSubtle, boxShadow: T.shadow }}
      >
        <div className="flex items-center gap-3">
          <button onClick={() => (onPanel ? onPanel("shop") : setPanel("shop"))} aria-label="아바타 꾸미기">
            <AvatarView equipped={eq} size={54} />
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[14px] font-bold truncate" style={{ color: state.title.color }}>
                {state.title.name}
              </span>
              <span className="text-[13px] font-bold" style={{ color: T.teal }}>Lv.{state.level}</span>
              {state.streak >= 3 && (
                <span className="ml-auto text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-[#fff4e5] text-[#a86a00] shrink-0">
                  🔥 {state.streak}일 연속
                </span>
              )}
            </div>

            {/* XP 진행바 */}
            <div className="mt-1.5 h-2 rounded-full bg-black/[0.06] overflow-hidden">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${xpCls}`}
                style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${T.teal}, #7bd18a)` }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-p-muted tabular-nums">
              <span>{state.xpInLevel.toLocaleString("ko-KR")} / {state.xpNeeded.toLocaleString("ko-KR")} XP</span>
              <span>다음 레벨까지 {(state.xpNeeded - state.xpInLevel).toLocaleString("ko-KR")}</span>
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
          title={state.title.name}
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
