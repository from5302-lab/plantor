"use client";

import { useState } from "react";
import { addDoc, collection, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { SERVICES } from "@/data/site";
import { ServiceIcon } from "@/components/ui/service-icon";
import { REASONS_6HDL } from "@/lib/types";
import type { Task, TaskCheck } from "@/lib/types";

export function TaskChecklist({
  tasks,
  taskChecks,
  childId,
  date,
  readOnly = false,
}: {
  tasks: Task[];
  taskChecks: TaskCheck[];
  childId: string;
  date: string;
  readOnly?: boolean;
}) {
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [showReasonFor, setShowReasonFor] = useState<string | null>(null);
  const [reasonNote, setReasonNote] = useState("");

  // 미완료 태스크 (체크 없거나 not_done)
  const incompleteTasks = tasks.filter(t => {
    const check = taskChecks.find(c => c.taskId === t.id && c.date === date);
    return !check || check.status !== "done";
  });

  async function handleMarkDone(task: Task) {
    if (readOnly) return;
    setSubmitting(task.id);
    try {
      const existing = taskChecks.find(c => c.taskId === task.id && c.date === date);
      if (existing) {
        await updateDoc(doc(db, "taskChecks", existing.id), {
          status: "done", checkedBy: "student", checkedAt: serverTimestamp(),
          reason: null, reasonNote: null,
        });
      } else {
        await addDoc(collection(db, "taskChecks"), {
          taskId: task.id, childId, date,
          status: "done", detail: null,
          reason: null, reasonNote: null,
          checkedBy: "student", checkedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "오류");
    } finally { setSubmitting(null); }
  }

  async function handleSubmitReason(taskId: string, reasonSlug: string) {
    if (readOnly) return;
    setSubmitting(taskId);
    try {
      const existing = taskChecks.find(c => c.taskId === taskId && c.date === date);
      if (existing) {
        await updateDoc(doc(db, "taskChecks", existing.id), {
          status: "not_done", reason: reasonSlug,
          reasonNote: reasonNote.trim() || null,
          checkedBy: "student", checkedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, "taskChecks"), {
          taskId, childId, date,
          status: "not_done", detail: null,
          reason: reasonSlug, reasonNote: reasonNote.trim() || null,
          checkedBy: "student", checkedAt: serverTimestamp(),
        });
      }
      setShowReasonFor(null);
      setReasonNote("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "오류");
    } finally { setSubmitting(null); }
  }

  if (tasks.length === 0) {
    return (
      <div className="px-6 py-7 text-center text-[13px] text-p-muted">
        오늘 예정된 과제가 없어요
      </div>
    );
  }

  return (
    <>
      {tasks.map((task, index) => {
        const svc = SERVICES.find(s => s.slug === task.serviceSlug);
        const check = taskChecks.find(c => c.taskId === task.id && c.date === date);
        const isDone = check?.status === "done";
        const isNotDone = check?.status === "not_done";
        const isLoading = submitting === task.id;
        const isLast = index === tasks.length - 1;
        const part = svc?.parts?.find(p => p.slug === task.partSlug);

        const label = task.progressLabel
          ? `${svc?.name ?? task.serviceSlug} ${task.progressLabel}`
          : part
          ? `${part.category ? `${part.category} · ` : ""}${part.name}`
          : task.title;

        const reasonInfo = check?.reason
          ? REASONS_6HDL.find(r => r.slug === check.reason)
          : null;

        return (
          <div key={task.id}>
            <div className="flex items-center px-5 py-[15px] gap-3.5">
              {/* 체크 원 */}
              <div
                onClick={() => !readOnly && !isDone && !isLoading && handleMarkDone(task)}
                className="w-[26px] h-[26px] rounded-full shrink-0 flex items-center justify-center"
                style={{
                  backgroundColor: isDone ? "#2a9d99" : isNotDone ? "#fff5f5" : "transparent",
                  border: isDone ? "2px solid #2a9d99" : isNotDone ? "2px solid #c00000" : "2px solid rgba(0,0,0,0.2)",
                  cursor: readOnly ? "default" : isDone ? "default" : isLoading ? "wait" : "pointer",
                }}
              >
                {isDone && <span className="text-white text-xs font-bold leading-none">✓</span>}
                {isNotDone && <span className="text-[#c00000] text-xs font-bold leading-none">✕</span>}
                {isLoading && !isDone && !isNotDone && <span className="w-2 h-2 rounded-full bg-black/15 block" />}
              </div>

              {/* 과제 정보 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-[15px] font-semibold"
                  style={{
                    color: isDone ? "#a39e98" : "rgba(0,0,0,0.95)",
                    textDecoration: isDone ? "line-through" : "none",
                    letterSpacing: "-0.1px",
                  }}>
                  {svc && <ServiceIcon service={svc} size={18} />}
                  <span className="truncate">{label}</span>
                  {task.time && <span className="text-[12px] font-semibold text-[#2a8438] shrink-0">{task.time}</span>}
                </div>
                {isNotDone && reasonInfo && (
                  <div className="text-[11px] text-[#c00000] font-medium mt-0.5 pl-6">
                    {reasonInfo.icon} {reasonInfo.name}{check?.reasonNote ? ` · ${check.reasonNote}` : ""}
                  </div>
                )}
              </div>

              {/* 우측 버튼 */}
              <div className="flex items-center gap-2 shrink-0">
                {isDone ? (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#f0faf1] text-[#2a8438]">완료</span>
                ) : readOnly ? null : isNotDone ? (
                  <button onClick={() => handleMarkDone(task)} disabled={isLoading}
                    className="text-xs font-semibold px-3 py-1.5 rounded bg-transparent text-p-muted border border-black/10 cursor-pointer"
                    style={{ opacity: isLoading ? 0.5 : 1 }}>
                    완료로 변경
                  </button>
                ) : (
                  <button onClick={() => setShowReasonFor(task.id)}
                    className="text-xs font-medium px-2.5 py-1.5 rounded bg-transparent text-p-muted border border-black/10 cursor-pointer">
                    못했어요
                  </button>
                )}
              </div>
            </div>

            {/* 6Hdl 사유 선택 */}
            {showReasonFor === task.id && (
              <div className="px-5 pb-4">
                <div className="bg-p-bg rounded-[10px] p-4">
                  <div className="text-[11px] font-bold text-p-muted mb-3 tracking-[0.06em]">왜 못했나요?</div>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {REASONS_6HDL.map(r => (
                      <button key={r.slug}
                        onClick={() => handleSubmitReason(task.id, r.slug)}
                        disabled={isLoading}
                        className="flex flex-col items-center gap-1 py-2.5 rounded-lg border border-black/10 bg-white cursor-pointer"
                        style={{ opacity: isLoading ? 0.5 : 1 }}>
                        <span className="text-lg">{r.icon}</span>
                        <span className="text-[11px] font-semibold text-p-secondary">{r.name}</span>
                      </button>
                    ))}
                  </div>
                  <input value={reasonNote} onChange={e => setReasonNote(e.target.value)}
                    placeholder="메모 (선택)"
                    className="w-full h-[32px] rounded-[7px] px-2.5 text-xs text-black/95 bg-white box-border mb-2"
                    style={{ border: "1px solid rgba(0,0,0,0.1)" }} />
                  <button onClick={() => { setShowReasonFor(null); setReasonNote(""); }}
                    className="w-full h-[30px] rounded-[7px] text-xs font-semibold cursor-pointer bg-white text-p-muted"
                    style={{ border: "1px solid rgba(0,0,0,0.1)" }}>
                    취소
                  </button>
                </div>
              </div>
            )}

            {!isLast && <div className="h-px bg-black/5 mx-5" />}
          </div>
        );
      })}

      {/* 전체 미완료 요약 */}
      {incompleteTasks.length > 0 && incompleteTasks.every(t => {
        const c = taskChecks.find(ch => ch.taskId === t.id && ch.date === date);
        return c && c.status === "not_done";
      }) && (
        <div className="px-5 py-3 bg-[#fff5f5] border-t border-[rgba(200,0,0,0.1)]">
          <div className="text-[12px] font-semibold text-[#c00000]">
            미완료 과제 {incompleteTasks.length}건 — 사유가 모두 입력되었어요
          </div>
        </div>
      )}
    </>
  );
}
