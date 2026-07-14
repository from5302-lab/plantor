"use client";

import { useState } from "react";
import { updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { SERVICES } from "@/data/site";
import { ServiceIcon } from "@/components/ui/service-icon";
import { REASONS_6HDL } from "@/lib/types";
import type { Task, TaskCheck } from "@/lib/types";
import { makeupOptions, shortDate } from "./task-checklist";

// 클릭 시 교사 계정으로 진도를 실시간 스크래핑하는 서비스 (task-checklist와 동일)
const AUTO_VERIFIED_SLUGS = new Set(["autovoca", "classcard-middle", "dailykor", "class5"]);

/** 만회 대상: 제 날짜가 지난 미완료 체크 중 최근 7일 이내 + (만회일 도래 또는 미정) */
export function makeupTargets(checks: TaskCheck[], today: string): TaskCheck[] {
  const weekAgo = new Date(today + "T00:00:00");
  weekAgo.setDate(weekAgo.getDate() - 7);
  const cutoff = weekAgo.toLocaleDateString("sv-SE");
  return checks
    .filter((c) => c.status === "not_done" && c.date < today && c.date >= cutoff
      && (c.makeupDate == null || c.makeupDate <= today))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 만회 과제 섹션 — 6hdl로 미룬 과제를 학생이 스스로 정한 날에 다시 해결한다.
 * 자동인증 과목은 실시간 인증으로 실제 학습이 확인돼야 만회 완료(made_up) 처리.
 */
export function MakeupSection({ tasks, checks, today, readOnly = false }: {
  tasks: Task[];           // 확정 과제 전체 (요일 무관 — 만회 과제 라벨 해석용)
  checks: TaskCheck[];     // makeupTargets() 결과
  today: string;
  readOnly?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [planFor, setPlanFor] = useState<string | null>(null); // 만회일 (재)설정 중인 checkId

  if (checks.length === 0) return null;

  async function handleComplete(check: TaskCheck, task: Task) {
    if (readOnly || busy) return;
    setBusy(check.id);
    setMsg((p) => ({ ...p, [check.id]: "" }));
    try {
      if (AUTO_VERIFIED_SLUGS.has(task.serviceSlug)) {
        // 오늘 진도를 실제 스크래핑 → 완료 확인 시 서버 reconcile이 made_up으로 전환
        const call = httpsCallable(functions, "verifyAutoProgress");
        const res = await call({ serviceSlug: task.serviceSlug });
        const status = (res.data as { autoStatus?: string })?.autoStatus;
        if (status !== "완료") {
          setMsg((p) => ({ ...p, [check.id]: `아직 완료로 확인되지 않았어요 (${status ?? "미확인"}) · 학습을 마친 뒤 다시 눌러 주세요` }));
        }
      } else {
        await updateDoc(doc(db, "taskChecks", check.id), { status: "made_up", madeUpAt: serverTimestamp() });
      }
    } catch (e) {
      setMsg((p) => ({ ...p, [check.id]: e instanceof Error ? e.message : "인증 실패" }));
    } finally { setBusy(null); }
  }

  async function handleReplan(check: TaskCheck, makeupDate: string | null) {
    if (readOnly) return;
    await updateDoc(doc(db, "taskChecks", check.id), { makeupDate }).catch(() => undefined);
    setPlanFor(null);
  }

  return (
    <>
      <div className="text-[10px] font-bold tracking-[0.1em] text-p-muted uppercase pl-1 mb-1.5 mt-5">만회 과제</div>
      <div className="bg-white border border-black/10 rounded-xl overflow-hidden">
        {checks.map((check, i) => {
          const task = tasks.find((t) => t.id === check.taskId);
          if (!task) return null;
          const svc = SERVICES.find((s) => s.slug === task.serviceSlug);
          const part = svc?.parts?.find((p) => p.slug === task.partSlug);
          const label = task.progressLabel ? `${svc?.name ?? task.serviceSlug} ${task.progressLabel}` : part ? part.name : task.title;
          const reasonInfo = check.reason ? REASONS_6HDL.find((r) => r.slug === check.reason) : null;
          const overdue = check.makeupDate != null && check.makeupDate < today;
          return (
            <div key={check.id} style={{ borderTop: i > 0 ? "1px solid rgba(0,0,0,0.05)" : "none" }}>
              <div className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-[14px] font-semibold text-black/95">
                    {svc && <ServiceIcon service={svc} size={16} />}
                    <span className="truncate">{label}</span>
                  </div>
                  <div className="text-[11px] text-p-secondary mt-0.5">
                    {shortDate(check.date)} 과제{reasonInfo ? ` · ${reasonInfo.icon} ${reasonInfo.name}` : ""}
                    {check.makeupDate == null
                      ? " · 만회일 미정"
                      : overdue
                        ? <span className="text-[#c00000] font-semibold"> · 만회 밀림 ({shortDate(check.makeupDate)})</span>
                        : " · 오늘 만회하는 날!"}
                  </div>
                  {msg[check.id] && <div className="text-[11px] font-medium mt-0.5" style={{ color: "#92660a" }}>{msg[check.id]}</div>}
                </div>
                {!readOnly && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => setPlanFor(planFor === check.id ? null : check.id)}
                      className="text-[11px] font-medium px-2 py-1.5 rounded bg-transparent text-p-muted border border-black/10 cursor-pointer">
                      {check.makeupDate == null ? "만회일 정하기" : "다시 계획"}
                    </button>
                    <button onClick={() => handleComplete(check, task)} disabled={busy === check.id}
                      className="text-xs font-semibold px-3 py-1.5 rounded cursor-pointer border-none text-white"
                      style={{ backgroundColor: "#38a848", opacity: busy === check.id ? 0.5 : 1 }}>
                      {busy === check.id ? "인증 중…" : "했어요!"}
                    </button>
                  </div>
                )}
              </div>
              {planFor === check.id && (
                <div className="px-5 pb-3 flex flex-wrap gap-2">
                  {makeupOptions(today).map((opt) => (
                    <button key={opt.label} onClick={() => handleReplan(check, opt.value)}
                      className="px-3 py-1.5 rounded-lg border border-black/10 bg-p-bg cursor-pointer text-[12px] font-semibold text-p-secondary">
                      {opt.label}{opt.value ? ` (${shortDate(opt.value)})` : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
