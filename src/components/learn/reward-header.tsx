"use client";

import { useState } from "react";
import { T } from "@/lib/design-tokens";
import { useMarkBadgesSeen, useRewards } from "@/lib/hooks/useRewards";
import { AvatarView } from "./avatar-view";
import { BadgeDiscoveryModal } from "./badge-discovery-modal";
import { RewardPanels } from "./reward-panels";

// /learn 첫 화면 최상단 위젯 — 레벨·XP 진행바·포인트·뱃지.
// 배치(09·13·17·21시)로 뒤늦게 발견된 뱃지는 여기서 큐로 연출된다.

export function RewardHeader({ childId, childName, isDemo = false, readOnly = false }: {
  childId: string | null;
  childName: string;
  isDemo?: boolean;
  readOnly?: boolean;
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

  return (
    <>
      <div
        className="mb-5 rounded-2xl px-4 py-3.5"
        style={{ background: T.white, border: T.borderSubtle, boxShadow: T.shadow }}
      >
        <div className="flex items-center gap-3">
          <button onClick={() => setPanel("shop")} aria-label="아바타 꾸미기">
            <AvatarView equipped={state.equipped} size={54} />
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
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${T.teal}, #7bd18a)` }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-p-muted tabular-nums">
              <span>{state.xpInLevel.toLocaleString("ko-KR")} / {state.xpNeeded.toLocaleString("ko-KR")} XP</span>
              <span>다음 레벨까지 {(state.xpNeeded - state.xpInLevel).toLocaleString("ko-KR")}</span>
            </div>
          </div>
        </div>

        <div className="mt-3 flex gap-1.5">
          <button
            onClick={() => setPanel("badges")}
            className="flex-1 py-2 rounded-xl text-[12px] font-bold"
            style={{ background: "rgba(0,0,0,0.04)", color: "#3d3a37" }}
          >
            🎖️ 뱃지 {state.badges.length}개
          </button>
          <button
            onClick={() => setPanel("shop")}
            className="flex-1 py-2 rounded-xl text-[12px] font-bold"
            style={{ background: "rgba(0,0,0,0.04)", color: "#3d3a37" }}
          >
            ⭐ {state.points.toLocaleString("ko-KR")}P 상점
          </button>
        </div>
      </div>

      {panel && (
        <RewardPanels state={state} tab={panel} onTab={setPanel} onClose={() => setPanel(null)} />
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
