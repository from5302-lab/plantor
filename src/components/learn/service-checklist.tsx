"use client";

import { useState } from "react";
import { T } from "@/lib/design-tokens";
import { SERVICES } from "@/data/site";
import { ServiceIcon } from "@/components/ui/service-icon";
import type { AutoStatus } from "@/lib/types";

const STATUS_STYLE: Record<AutoStatus, { bg: string; color: string; label: string }> = {
  "시작전": { bg: "rgba(0,0,0,0.06)", color: T.textMuted,  label: "시작전" },
  "진행중": { bg: "#fff3e0",          color: "#c45000",    label: "진행중" },
  "완료":   { bg: "#f0faf1",          color: "#2a8438",    label: "완료"   },
};

type Subscription = { id: string; serviceSlug: string; status: string };

const EXTERNAL_URLS: Record<string, string> = {
  class5: "https://play.class5.co.kr/",
  dailykor: "https://www.dailykor.com/front",
  "classcard-middle": "https://www.classcard.net/",
};

function formatDuration(secs: number): string {
  if (secs <= 0) return "";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m === 0) return `${s}초`;
  return s > 0 ? `${m}분 ${s}초` : `${m}분`;
}

export function ServiceChecklist({
  subscriptions,
  doneSlugs,
  submitting,
  onScreenshot,
  isSharing = false,
  onStartedSlugsChange,
  onRedo,
  onWindowOpened,
  timeSummary = {},
  autoStatusMap = {},
}: {
  subscriptions: Subscription[];
  doneSlugs: Set<string>;
  submitting: string | null;
  onScreenshot: (slug: string) => void;
  isSharing?: boolean;
  onStartedSlugsChange?: (slugs: Set<string>) => void;
  onRedo?: (slug: string) => void;
  onWindowOpened?: (slug: string, win: Window) => void;
  timeSummary?: Record<string, number>;
  autoStatusMap?: Record<string, AutoStatus>;
}) {
  const [startedSlugs, setStartedSlugs] = useState<Set<string>>(new Set());

  function updateStarted(slug: string) {
    const next = new Set([...startedSlugs, slug]);
    setStartedSlugs(next);
    onStartedSlugsChange?.(next);
  }

  if (subscriptions.length === 0) {
    return (
      <div className="px-6 py-7">
        <div className="text-center mb-5 text-[13px] text-p-muted">
          아직 신청한 학습 프로그램이 없어요.
        </div>
        <div className="flex flex-col gap-2 mb-5">
          {SERVICES.filter((s) => s.category !== "community").slice(0, 3).map((svc) => (
            <div key={svc.slug} className="flex items-center gap-3 px-3.5 py-2.5 bg-p-bg rounded">
              <ServiceIcon service={svc} size={20} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-black/95">{svc.name}</div>
                <div className="text-[11px] text-p-muted">{svc.priceLabel}</div>
              </div>
              <span className="text-[11px] text-p-muted">🔒</span>
            </div>
          ))}
        </div>
        <a
          href="/#services"
          className="flex items-center justify-center h-11 rounded bg-p-green text-white text-sm font-semibold no-underline"
        >
          부모님과 함께 신청하기 →
        </a>
      </div>
    );
  }

  return (
    <>
      {subscriptions.map((sub, index) => {
        const svc = SERVICES.find((s) => s.slug === sub.serviceSlug);
        if (!svc) return null;
        const autoStatus = autoStatusMap[sub.serviceSlug];
        const isAuto = autoStatus !== undefined;
        const done = isAuto ? autoStatus === "완료" : doneSlugs.has(sub.serviceSlug);
        const started = startedSlugs.has(sub.serviceSlug);
        const isLoading = submitting === sub.serviceSlug;
        const url = EXTERNAL_URLS[sub.serviceSlug] || svc.externalUrl;
        const isLast = index === subscriptions.length - 1;

        function openUrl() {
          if (!url) return;
          const win = window.open(url, "_blank");
          if (win) onWindowOpened?.(sub.serviceSlug, win);
        }

        function handleStart() {
          if (!isSharing) {
            alert("먼저 출석하기를 눌러 화면 공유를 시작해 주세요!");
            return;
          }
          openUrl();
          updateStarted(sub.serviceSlug);
        }

        return (
          <div key={sub.id}>
            <div className="flex items-center px-5 py-[15px] gap-3.5">
              {/* 체크 원 */}
              <div
                className="w-[26px] h-[26px] rounded-full shrink-0 flex items-center justify-center"
                style={{
                  backgroundColor: done ? T.teal : "transparent",
                  border: done ? `2px solid ${T.teal}` : "2px solid rgba(0,0,0,0.2)",
                }}
              >
                {done && <span className="text-white text-xs font-bold leading-none">✓</span>}
                {isLoading && !done && <span className="w-2 h-2 rounded-full bg-black/15 block" />}
              </div>

              {/* 과목 정보 */}
              <div className="flex-1 min-w-0">
                <div
                  className="flex items-center gap-1.5 text-[15px] font-semibold"
                  style={{
                    color: done ? T.textMuted : T.textPrimary,
                    textDecoration: done ? "line-through" : "none",
                    letterSpacing: "-0.1px",
                  }}
                >
                  <ServiceIcon service={svc} size={18} />{svc.name}
                </div>
                {done && timeSummary[sub.serviceSlug] > 0 && (
                  <div className="text-[11px] text-p-teal font-semibold mt-0.5 pl-6">
                    ⏱ {formatDuration(timeSummary[sub.serviceSlug])}
                  </div>
                )}
              </div>

              {/* 우측 버튼 영역 */}
              <div className="flex items-center gap-2 shrink-0">
                {isAuto ? (
                  <>
                    <span
                      className="text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{ backgroundColor: STATUS_STYLE[autoStatus].bg, color: STATUS_STYLE[autoStatus].color }}
                    >
                      {STATUS_STYLE[autoStatus].label}
                    </span>
                    {url && (
                      <button
                        onClick={openUrl}
                        className="text-xs font-medium px-2.5 py-1.5 rounded bg-transparent text-p-muted border border-black/10 cursor-pointer"
                      >
                        열기 ↗
                      </button>
                    )}
                  </>
                ) : done ? (
                  <>
                    {onRedo && (
                      <button
                        onClick={() => onRedo(sub.serviceSlug)}
                        disabled={isLoading}
                        className="text-xs font-semibold px-3 py-1.5 rounded bg-transparent text-p-muted border border-black/10 cursor-pointer"
                        style={{ opacity: isLoading ? 0.5 : 1, cursor: isLoading ? "default" : "pointer" }}
                      >
                        {isLoading ? "…" : "↺ 재학습"}
                      </button>
                    )}
                    {url && (
                      <button
                        onClick={openUrl}
                        className="text-xs font-semibold px-3 py-1.5 rounded bg-transparent text-p-muted border border-black/10 cursor-pointer"
                      >
                        열기 ↗
                      </button>
                    )}
                  </>
                ) : started ? (
                  <>
                    <button
                      onClick={() => onScreenshot(sub.serviceSlug)}
                      disabled={isLoading}
                      className="text-[13px] font-semibold px-3.5 py-1.5 rounded border-none text-white cursor-pointer"
                      style={{ backgroundColor: T.teal, opacity: isLoading ? 0.6 : 1, cursor: isLoading ? "default" : "pointer" }}
                    >
                      {isLoading ? "저장 중…" : "인증샷"}
                    </button>
                    {url && (
                      <button
                        onClick={handleStart}
                        className="text-xs font-medium px-2.5 py-1.5 rounded bg-transparent text-p-muted border border-black/10 cursor-pointer"
                      >
                        ↗ 열기
                      </button>
                    )}
                  </>
                ) : (
                  url && (
                    <button
                      onClick={handleStart}
                      className="text-[13px] font-semibold px-3.5 py-1.5 rounded border-none text-white cursor-pointer bg-p-green"
                    >
                      시작하기 →
                    </button>
                  )
                )}
              </div>
            </div>
            {!isLast && <div className="h-px bg-black/5 mx-5" />}
          </div>
        );
      })}
    </>
  );
}
