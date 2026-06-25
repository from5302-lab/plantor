"use client";

import { useEffect, useState } from "react";
import { collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { T } from "@/lib/design-tokens";
import { SERVICES } from "@/data/site";
import { formatDate } from "@/lib/format";
import { ServiceIcon } from "@/components/ui/service-icon";
import { REASONS_6HDL } from "@/lib/types";
import type { Child, Subscription, WeeklyLog, WalletCoupon, Task, TaskCheck } from "@/lib/types";
import type { RenewalTarget } from "./renewal-modal";
import { StudentWeekJournal, type JournalStudent } from "./direct-journal-panel";

function tsToDate(ts: unknown): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts === "object" && "toDate" in (ts as object))
    return (ts as { toDate: () => Date }).toDate();
  return null;
}

// ── 자녀 카드 목록 ─────────────────────────────────────────────────────────────

interface ChildrenSectionProps {
  children: Child[];
  subscriptions: Subscription[];
  weeklyLogs: WeeklyLog[];
  weekOffset: number;
  setWeekOffset: React.Dispatch<React.SetStateAction<number>>;
  weekDates: string[];
  today: string;
  weekLabel: string;
  now: Date;
  setRenewalTarget: (target: RenewalTarget | null) => void;
  familyId: string;
  userId: string;
  userName: string | null;
  walletCoupons: WalletCoupon[];
  journalStudents: JournalStudent[];
}

export function ChildrenSection({
  children,
  subscriptions,
  weeklyLogs,
  weekOffset,
  setWeekOffset,
  weekDates,
  today,
  weekLabel,
  now,
  setRenewalTarget,
  familyId,
  userId,
  userName,
  walletCoupons,
  journalStudents,
}: ChildrenSectionProps) {
  // 태스크 + 체크 실시간 구독
  const [tasksByChild, setTasksByChild] = useState<Record<string, Task[]>>({});
  const [taskChecks, setTaskChecks] = useState<TaskCheck[]>([]);

  useEffect(() => {
    if (children.length === 0) return;
    const ids = children.map(c => c.id);
    const unsub = onSnapshot(
      query(collection(db, "tasks"), where("childId", "in", ids), where("status", "==", "confirmed")),
      (snap) => {
        const grouped: Record<string, Task[]> = {};
        ids.forEach(id => { grouped[id] = []; });
        snap.docs.forEach(d => {
          const cid = d.data().childId as string;
          if (!grouped[cid]) grouped[cid] = [];
          grouped[cid].push({
            id: d.id, childId: cid,
            serviceSlug: d.data().serviceSlug,
            partSlug: d.data().partSlug ?? null,
            title: d.data().title,
            scheduleDays: d.data().scheduleDays ?? [],
            externalUrl: d.data().externalUrl ?? null,
            progressLabel: d.data().progressLabel ?? null,
            level: d.data().level ?? null,
            setName: d.data().setName ?? null,
            deleteRequested: d.data().deleteRequested ?? false,
            order: d.data().order ?? 0, active: true,
            createdBy: d.data().createdBy, status: "confirmed",
            adminComment: null, createdAt: null, confirmedAt: null,
          });
        });
        setTasksByChild(grouped);
      }
    );
    return unsub;
  }, [children]);

  useEffect(() => {
    if (children.length === 0) return;
    const ids = children.map(c => c.id);
    const unsub = onSnapshot(
      query(collection(db, "taskChecks"), where("childId", "in", ids), where("date", ">=", weekDates[0]), where("date", "<=", weekDates[6])),
      (snap) => setTaskChecks(snap.docs.map(d => ({
        id: d.id,
        taskId: d.data().taskId ?? "",
        childId: d.data().childId ?? "",
        date: d.data().date ?? "",
        status: d.data().status ?? "error",
        detail: d.data().detail ?? null,
        reason: d.data().reason ?? null,
        reasonNote: d.data().reasonNote ?? null,
        checkedBy: d.data().checkedBy ?? "student",
        checkedAt: tsToDate(d.data().checkedAt),
      })))
    );
    return unsub;
  }, [children, weekDates[0]]);

  const pastDates = weekDates.filter(d => d <= today);

  return (
    <>
      <div className="flex flex-col gap-3">
        {children.map((child) => {
          const childSubs = subscriptions.filter((s) => s.childId === child.id);
          const childJournal = journalStudents.find((s) => s.studentName === child.name);
          const childTasks = tasksByChild[child.id] ?? [];
          const childChecks = taskChecks.filter(c => c.childId === child.id);

          // 태스크 기반 완료율
          let scheduled = 0, done = 0;
          childTasks.forEach(task => {
            pastDates.forEach(date => {
              const dow = (new Date(date + "T00:00:00").getDay() + 6) % 7;
              if (task.scheduleDays.includes(dow)) {
                scheduled++;
                if (childChecks.find(c => c.taskId === task.id && c.date === date)?.status === "done") done++;
              }
            });
          });
          const completionPct = scheduled > 0 ? Math.round((done / scheduled) * 100) : 0;

          // 6Hdl 사유 통계
          const weekReasons = childChecks.filter(c => c.status === "not_done" && c.reason);
          const reasonCounts: Record<string, number> = {};
          weekReasons.forEach(c => { reasonCounts[c.reason!] = (reasonCounts[c.reason!] ?? 0) + 1; });
          const topReason = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0];

          return (
            <div key={child.id} className="bg-white border border-black/10 rounded-xl p-5" style={{ boxShadow: T.shadow }}>
              <div className="flex items-center justify-between gap-2.5 mb-3">
                <div className="flex items-center gap-2">
                  <img src="/favicon.svg" alt="" width={16} height={16} />
                  <span className="text-[15px] font-bold text-black/95">{child.name}</span>
                  {child.grade && <span className="text-[13px] text-p-muted">{child.grade}</span>}
                </div>
                {child.loginId && <span className="rounded-full bg-p-bg px-2.5 py-[3px] font-mono text-[11px] text-p-secondary whitespace-nowrap">ID: {child.loginId}</span>}
              </div>

              {/* 주간 학습 현황 */}
              <div className="mb-3.5 bg-p-bg rounded-lg px-3.5 py-2.5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setWeekOffset(w => w - 1)} className="bg-transparent border-none cursor-pointer text-sm text-p-muted px-0.5 leading-none">‹</button>
                    <span className="text-[11px] font-semibold tracking-[0.08em] text-p-muted">{weekLabel} 학습</span>
                    <button onClick={() => setWeekOffset(w => Math.min(0, w + 1))} disabled={weekOffset === 0} className="bg-transparent border-none text-sm px-0.5 leading-none" style={{ cursor: weekOffset === 0 ? "default" : "pointer", color: weekOffset === 0 ? "rgba(0,0,0,0.15)" : "#a39e98" }}>›</button>
                  </div>
                  <span className="text-xs font-bold" style={{ color: completionPct >= 80 ? "#38a848" : completionPct >= 50 ? "#92660a" : "#a39e98" }}>
                    {done}/{scheduled}건 ({completionPct}%)
                  </span>
                </div>

                {/* 태스크별 주간 그리드 */}
                {childTasks.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {childTasks.map(task => {
                      const svc = SERVICES.find(s => s.slug === task.serviceSlug);
                      const part = svc?.parts?.find(p => p.slug === task.partSlug);
                      const label = task.progressLabel
                        ? `${svc?.name ?? ""} ${task.progressLabel}`
                        : part ? part.name : task.title;
                      return (
                        <div key={task.id} className="flex items-center gap-1.5">
                          <div className="w-[80px] shrink-0 flex items-center gap-1 overflow-hidden">
                            {svc && <ServiceIcon service={svc} size={11} />}
                            <span className="text-[10px] text-p-secondary truncate">{label}</span>
                          </div>
                          <div className="flex gap-0.5 flex-1">
                            {weekDates.map((date, i) => {
                              const isFuture = date > today;
                              const isToday = date === today;
                              const isScheduled = task.scheduleDays.includes(i);
                              const check = childChecks.find(c => c.taskId === task.id && c.date === date);
                              const isDone = check?.status === "done";
                              const isNotDone = check?.status === "not_done";
                              if (!isScheduled) return <div key={date} className="flex-1 h-[18px]" />;
                              return (
                                <div key={date} className="flex-1 h-[18px] rounded flex items-center justify-center"
                                  style={{
                                    backgroundColor: isDone ? "#38a848" : isNotDone ? "#fff5f5" : isFuture ? "rgba(0,0,0,0.04)" : "rgba(0,0,0,0.08)",
                                    border: isToday ? "1.5px solid rgba(0,0,0,0.95)" : isNotDone ? "1px solid #c00000" : "none",
                                  }}>
                                  {isDone && <span className="text-white text-[8px] font-bold">✓</span>}
                                  {isNotDone && <span className="text-[#c00000] text-[8px] font-bold">✕</span>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-[11px] text-p-muted text-center py-2">등록된 과제가 없어요</div>
                )}
              </div>

              {/* 수업일지 (직강 자녀만 — 일지가 있을 때) */}
              {childJournal && childJournal.logs.length > 0 && (
                <div className="mb-3.5">
                  <StudentWeekJournal logs={childJournal.logs} />
                </div>
              )}

              {/* 6Hdl 사유 분석 */}
              {weekReasons.length > 0 && (
                <div className="mb-3 bg-[#fff5f5] rounded-lg px-3.5 py-2.5">
                  <div className="text-[10px] font-bold text-[#c00000] tracking-[0.06em] mb-1.5">미완료 사유 ({weekReasons.length}건)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {REASONS_6HDL.map(r => {
                      const cnt = reasonCounts[r.slug] ?? 0;
                      if (cnt === 0) return null;
                      return (
                        <span key={r.slug} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white"
                          style={{ color: "#c00000", border: "1px solid rgba(200,0,0,0.15)" }}>
                          {r.icon} {r.name} {cnt}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 구독 서비스 목록 */}
              {childSubs.length === 0 ? (
                <p className="text-[13px] text-p-muted">구독 중인 서비스가 없습니다.</p>
              ) : (
                <ul className="m-0 p-0 list-none flex flex-col gap-2">
                  {childSubs.map((sub) => {
                    const svc = SERVICES.find((s) => s.slug === sub.serviceSlug);
                    const valid = !!sub.endDate && sub.endDate > now;
                    const isActive = sub.status === "active" && valid;
                    const isDirect = sub.status === "transferred" && valid;
                    const badgeLabel = (isActive || isDirect) ? "구독 중" : "정지중";
                    const badgeActive = isActive || isDirect;
                    return (
                      <li key={sub.id} className="flex items-center gap-2 bg-p-bg rounded-lg px-3.5 py-2.5">
                        <span className="flex items-center gap-1.5 text-sm font-medium text-black/95 flex-1 min-w-0">
                          {svc && <ServiceIcon service={svc} size={16} />}{svc?.name ?? sub.serviceSlug}
                        </span>
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold shrink-0 whitespace-nowrap" style={{ backgroundColor: badgeActive ? "#f0faf1" : "#fff5f5", color: badgeActive ? "#2da040" : "#c00000" }}>
                          {badgeLabel}
                        </span>
                        <div className="w-20 shrink-0 text-right">
                          {sub.endDate && <div className="text-[11px] text-p-muted">~ {formatDate(sub.endDate)}</div>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

    </>
  );
}

