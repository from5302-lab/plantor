"use client";

import { doc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { SERVICES } from "@/data/site";
import { ServiceIcon } from "@/components/ui/service-icon";
import { ReportButton } from "./report-button";

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m === 0) return `${s}초`;
  return s > 0 ? `${m}분 ${s}초` : `${m}분`;
}

export type FeedLog = {
  id: string;
  childId: string;
  serviceSlug: string;
  screenshotUrl: string;
  confirmedAt: Date;
  grade?: string;
  displayId?: string;
  reportCount?: number;
  flagged?: boolean;
  durationSeconds?: number | null;
};

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return "방금 전";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export function FeedCard({ log, myUid, isAdmin = false }: { log: FeedLog; myUid: string | null; isAdmin?: boolean }) {
  const svc = SERVICES.find((s) => s.slug === log.serviceSlug);
  const displayId = log.displayId ?? `pln_${log.childId.slice(0, 4).toLowerCase()}`;
  const grade = log.grade ?? "";

  return (
    <div className="bg-white border-b border-black/[0.07] px-5 py-4">
      <div className="flex gap-3">

        {/* 왼쪽: 서비스 아이콘 (아바타 역할) */}
        <div className="shrink-0">
          <div className="w-10 h-10 rounded-full bg-p-bg border border-black/10 flex items-center justify-center overflow-hidden">
            {svc ? <ServiceIcon service={svc} size={22} /> : <span className="text-lg">📚</span>}
          </div>
          {/* 스레드 연결선 */}
          <div className="w-0.5 bg-black/[0.08] rounded-sm mx-auto mt-1.5" style={{ height: "calc(100% - 46px)", minHeight: 20 }} />
        </div>

        {/* 오른쪽: 내용 */}
        <div className="flex-1 min-w-0">
          {/* 헤더 */}
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              {grade && <span className="text-[13px] font-bold text-black/95">{grade}</span>}
              <span className="text-[13px] text-p-muted font-mono">{displayId}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-p-muted">{timeAgo(log.confirmedAt)}</span>
              <ReportButton logId={log.id} myUid={myUid} flagged={log.flagged ?? false} reportCount={log.reportCount ?? 0} />
              {isAdmin && (
                <button
                  onClick={async () => {
                    if (!confirm("이 인증샷을 삭제할까요?")) return;
                    await deleteDoc(doc(db, "learningLogs", log.id));
                  }}
                  className="text-[11px] font-semibold px-2 py-1 rounded-md border border-[rgba(200,0,0,0.3)] bg-[#fff5f5] text-[#c00000] cursor-pointer"
                >
                  삭제
                </button>
              )}
            </div>
          </div>

          {/* 서비스명 + 학습시간 */}
          <div className="text-sm font-medium text-p-secondary mb-2.5 flex items-center gap-2">
            <span>{svc?.name ?? log.serviceSlug} 학습 완료 ✅</span>
            {log.durationSeconds && log.durationSeconds > 0 && (
              <span className="text-xs text-p-teal font-semibold">⏱ {formatDuration(log.durationSeconds)}</span>
            )}
          </div>

          {/* 박제 배지 */}
          {log.flagged && (
            <div className="inline-flex items-center gap-1.5 bg-[#fff5f5] border border-[rgba(200,0,0,0.2)] rounded-md px-2.5 py-1 mb-2.5">
              <span className="text-[11px]">🚨</span>
              <span className="text-[11px] font-bold text-[#c00000]">신고 {log.reportCount}건 — 커뮤니티에 의해 검증됨</span>
            </div>
          )}

          {/* 인증샷 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={log.screenshotUrl}
            alt="학습 인증샷"
            className="w-full max-w-[480px] rounded-[10px] border border-black/10 block object-cover"
            style={{ filter: log.flagged ? "grayscale(50%) opacity(0.75)" : "none" }}
          />
        </div>
      </div>
    </div>
  );
}
