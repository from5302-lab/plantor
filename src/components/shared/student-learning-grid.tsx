"use client";

import { useState, useEffect } from "react";
import {
  addDoc, collection, deleteDoc, doc, getDocs,
  onSnapshot, query, serverTimestamp, updateDoc, where, orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { SERVICES } from "@/data/site";
import { Check, X, ChevronDown } from "lucide-react";
import { ServiceIcon } from "@/components/ui/service-icon";
import { AddTaskFormBatch, EditableTaskCard } from "@/components/shared/add-task-form";
import { getWeekDates, todayStr } from "@/lib/learn-utils";
import { REASONS_6HDL } from "@/lib/types";
import type { Task, TaskCheck } from "@/lib/types";

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
const GRID = "180px repeat(7, 1fr)";

function tsToDate(ts: unknown): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts === "object" && "toDate" in (ts as object))
    return (ts as { toDate: () => Date }).toDate();
  return null;
}

function parseTask(d: import("firebase/firestore").QueryDocumentSnapshot): Task {
  return {
    id: d.id,
    childId: d.data().childId,
    serviceSlug: d.data().serviceSlug,
    partSlug: d.data().partSlug ?? null,
    title: d.data().title,
    scheduleDays: d.data().scheduleDays ?? [],
    time: d.data().time ?? null,
    externalUrl: d.data().externalUrl ?? null,
    progressLabel: d.data().progressLabel ?? null,
    level: d.data().level ?? null,
    setName: d.data().setName ?? null,
    deleteRequested: d.data().deleteRequested ?? false,
    order: d.data().order ?? 0,
    active: d.data().active ?? true,
    createdBy: d.data().createdBy,
    status: d.data().status,
    adminComment: d.data().adminComment ?? null,
    createdAt: tsToDate(d.data().createdAt),
    confirmedAt: tsToDate(d.data().confirmedAt),
  };
}

// ── 검토 대기 과제 행 ─────────────────────────────────────────────────────────

function DraftTaskRow({ task, onConfirm, onReject, onDelete }: {
  task: Task;
  onConfirm: (comment: string) => void;
  onReject: (comment: string) => void;
  onDelete: () => void;
}) {
  const [comment, setComment] = useState(task.adminComment ?? "");
  const svc = SERVICES.find(s => s.slug === task.serviceSlug);
  const isStudentDraft = task.status === "draft" && task.createdBy === "student";
  return (
    <div className="bg-white rounded-[10px] mb-1.5 p-[12px_14px]"
      style={{ border: isStudentDraft ? "1.5px solid #38a848" : "1px solid rgba(0,0,0,0.1)" }}>
      <div className="flex items-center gap-2 mb-2">
        {svc && <ServiceIcon service={svc} size={14} />}
        <span className="text-[12px] font-semibold text-black/95">{task.title}</span>
        <div className="flex gap-[3px] ml-auto shrink-0">
          {DAY_LABELS.map((l, i) => (
            <span key={i} className="text-[9px] font-semibold px-[4px] py-px rounded-[3px]"
              style={{ backgroundColor: task.scheduleDays.includes(i) ? "#38a848" : "#f6f5f4", color: task.scheduleDays.includes(i) ? "#fff" : "#a39e98" }}>{l}</span>
          ))}
        </div>
      </div>
      <div className="flex gap-1.5">
        <input value={comment} onChange={e => setComment(e.target.value)}
          placeholder="코멘트 (선택)"
          className="flex-1 h-[28px] rounded-[6px] px-2 text-[11px] text-black/95 bg-p-bg box-border"
          style={{ border: "1px solid rgba(0,0,0,0.06)" }} />
        <button onClick={() => onConfirm(comment)}
          className="h-[28px] px-2.5 rounded-[6px] border-none bg-p-green text-white text-[11px] font-bold cursor-pointer">확정</button>
        <button onClick={() => onReject(comment)}
          className="h-[28px] px-2.5 rounded-[6px] bg-white text-p-muted text-[11px] font-semibold cursor-pointer"
          style={{ border: "1px solid rgba(0,0,0,0.1)" }}>반려</button>
        <button onClick={onDelete}
          className="h-[28px] px-1.5 rounded-[6px] bg-white text-p-muted text-[11px] cursor-pointer flex items-center justify-center"
          style={{ border: "1px solid rgba(0,0,0,0.1)" }}><X size={12} /></button>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export function StudentLearningGrid({
  childId,
  childName,
  subscribedSlugs,
  weekOffset = 0,
}: {
  childId: string;
  childName: string;
  subscribedSlugs: string[];
  weekOffset?: number;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskChecks, setTaskChecks] = useState<TaskCheck[]>([]);
  const [toggling, setToggling] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const weekDates = getWeekDates(weekOffset);
  const today = todayStr();

  // tasks 구독
  useEffect(() => {
    return onSnapshot(
      query(collection(db, "tasks"), where("childId", "==", childId), orderBy("createdAt", "desc")),
      (snap) => setTasks(snap.docs.map(parseTask))
    );
  }, [childId]);

  // taskChecks 구독
  useEffect(() => {
    const dates = getWeekDates(weekOffset);
    return onSnapshot(
      query(collection(db, "taskChecks"),
        where("childId", "==", childId),
        where("date", ">=", dates[0]), where("date", "<=", dates[6])),
      (snap) => setTaskChecks(snap.docs.map(d => ({
        id: d.id,
        taskId: d.data().taskId ?? "",
        childId: d.data().childId ?? "",
        date: d.data().date ?? "",
        status: d.data().status ?? "error",
        detail: d.data().detail ?? null,
        reason: d.data().reason ?? null,
        reasonNote: d.data().reasonNote ?? null,
        checkedBy: d.data().checkedBy ?? "admin",
        checkedAt: tsToDate(d.data().checkedAt),
      })))
    );
  }, [childId, weekOffset]);

  const confirmedTasks = tasks.filter(t => t.status === "confirmed");
  const draftTasks = tasks.filter(t => t.status === "draft");
  const pastDates = weekDates.filter(d => d <= today);

  let scheduled = 0, done = 0;
  confirmedTasks.forEach(task => {
    pastDates.forEach(date => {
      const dow = (new Date(date + "T00:00:00").getDay() + 6) % 7;
      if (task.scheduleDays.includes(dow)) {
        scheduled++;
        if (taskChecks.find(c => c.taskId === task.id && c.date === date)?.status === "done") done++;
      }
    });
  });
  const pct = scheduled > 0 ? Math.round((done / scheduled) * 100) : 0;

  async function handleToggleCheck(task: Task, date: string) {
    if (toggling) return;
    setToggling(`${task.id}-${date}`);
    try {
      const existing = taskChecks.find(c => c.taskId === task.id && c.date === date);
      if (existing) {
        await deleteDoc(doc(db, "taskChecks", existing.id));
      } else {
        await addDoc(collection(db, "taskChecks"), {
          taskId: task.id, childId, date,
          status: "done", detail: null,
          reason: null, reasonNote: null,
          checkedBy: "admin", checkedAt: serverTimestamp(),
        });
      }
    } finally { setToggling(null); }
  }

  async function handleDeleteTask(task: Task) {
    if (!confirm(`"${task.title}" 과제를 삭제할까요?`)) return;
    const checksSnap = await getDocs(query(collection(db, "taskChecks"), where("taskId", "==", task.id)));
    await Promise.all(checksSnap.docs.map(d => deleteDoc(d.ref)));
    await deleteDoc(doc(db, "tasks", task.id));
  }

  async function handleConfirmTask(task: Task, comment: string) {
    await updateDoc(doc(db, "tasks", task.id), {
      status: "confirmed", adminComment: comment || null, confirmedAt: serverTimestamp(),
    });
  }

  async function handleRejectTask(task: Task, comment: string) {
    await updateDoc(doc(db, "tasks", task.id), { adminComment: comment || null });
  }

  return (
    <div className="border-t border-black/[0.06]">
      {/* 날짜 헤더 */}
      <div className="px-4 pt-2 pb-1" style={{ display: "grid", gridTemplateColumns: GRID }}>
        <div className="text-[10px] text-p-muted font-semibold flex items-center gap-1">
          {done}/{scheduled}건
          <span style={{ color: pct >= 80 ? "#1a7f4b" : pct >= 50 ? "#92660a" : "#a39e98" }}>({pct}%)</span>
        </div>
        {weekDates.map((date, i) => {
          const isToday = date === today;
          return (
            <div key={date} className="text-center">
              <div className="text-[10px] font-semibold leading-[1.3]"
                style={{ color: isToday ? "rgba(0,0,0,0.95)" : "#a39e98" }}>{DAY_LABELS[i]}</div>
              <div className="text-[10px]"
                style={{ fontWeight: isToday ? 700 : 400, color: isToday ? "rgba(0,0,0,0.95)" : "#a39e98" }}>
                {new Date(date + "T00:00:00").getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* 과제 그리드 행 */}
      {confirmedTasks.map((task, idx) => {
        const svc = SERVICES.find(s => s.slug === task.serviceSlug);
        const part = svc?.parts?.find(p => p.slug === task.partSlug);
        const label = task.progressLabel
          ? `${svc?.name ?? task.serviceSlug} ${task.progressLabel}`
          : part ? part.name : task.title;

        return (
          <div key={task.id} className="items-center px-4 py-2"
            style={{
              display: "grid", gridTemplateColumns: GRID, alignItems: "center",
              borderBottom: idx < confirmedTasks.length - 1 || expanded ? "1px solid rgba(0,0,0,0.05)" : "none",
            }}>
            <div className="flex items-center gap-[5px] text-xs text-p-secondary pr-2 overflow-hidden">
              {svc && <ServiceIcon service={svc} size={13} />}
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
              {task.deleteRequested && (
                <span className="text-[9px] font-bold rounded-full px-[5px] py-px shrink-0" style={{ backgroundColor: "#fff5f5", color: "#c00000" }}>삭제요청</span>
              )}
            </div>
            {weekDates.map((date, dayIdx) => {
              const isFuture = date > today;
              const isToday = date === today;
              const isScheduled = task.scheduleDays.includes(dayIdx);
              const check = taskChecks.find(c => c.taskId === task.id && c.date === date);
              const isDone = check?.status === "done";
              const isNotDone = check?.status === "not_done";
              const key = `${task.id}-${date}`;
              const isThis = toggling === key;
              const reasonInfo = check?.reason ? REASONS_6HDL.find(r => r.slug === check.reason) : null;

              if (!isScheduled) {
                return <div key={date} className="flex justify-center"><span className="text-[10px] text-black/10">-</span></div>;
              }

              return (
                <div key={date} className="flex flex-col items-center gap-0.5">
                  <div onClick={() => !isFuture && !toggling && handleToggleCheck(task, date)}
                    title={isDone ? "완료 (클릭→취소)" : isNotDone ? `미완료${reasonInfo ? ` (${reasonInfo.name})` : ""}` : isFuture ? "" : "클릭→완료"}
                    className="w-[26px] h-[26px] rounded-md flex items-center justify-center"
                    style={{
                      backgroundColor: isThis ? "rgba(0,0,0,0.08)" : isDone ? "#38a848" : isNotDone ? "#fff5f5" : isFuture ? "rgba(0,0,0,0.03)" : "rgba(0,0,0,0.07)",
                      border: isToday ? "2px solid rgba(0,0,0,0.95)" : isNotDone ? "1.5px solid #c00000" : "1.5px solid transparent",
                      cursor: isFuture ? "default" : toggling ? "wait" : "pointer",
                      transition: "background-color 0.12s",
                    }}>
                    {isDone && !isThis && <Check size={12} className="text-white" strokeWidth={3} />}
                    {isNotDone && !isThis && <X size={12} className="text-[#c00000]" strokeWidth={3} />}
                    {isThis && <span className="text-[8px] text-p-muted">…</span>}
                  </div>
                  {reasonInfo && <span className="text-[8px] leading-none" title={`${reasonInfo.name}${check?.reasonNote ? `: ${check.reasonNote}` : ""}`}>{reasonInfo.icon}</span>}
                </div>
              );
            })}
          </div>
        );
      })}

      {confirmedTasks.length === 0 && !expanded && (
        <div className="px-4 py-3 text-[12px] text-p-muted text-center">등록된 과제가 없어요</div>
      )}

      {/* 펼침 토글 */}
      <div onClick={() => setExpanded(v => !v)}
        className="flex items-center justify-center gap-1 py-1.5 cursor-pointer select-none border-t border-black/[0.04]">
        <span className="text-[10px] text-p-muted font-semibold">
          {expanded ? "접기" : `과제 관리${draftTasks.length > 0 ? ` · 검토 ${draftTasks.length}` : ""}`}
        </span>
        <ChevronDown size={12} className="text-p-muted" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
      </div>

      {/* 과제 관리 아코디언 */}
      {expanded && (
        <div className="p-[12px_16px_16px] bg-p-bg/50" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
          {draftTasks.length > 0 && (
            <div className="mb-3.5">
              <div className="text-[10px] font-bold text-p-green tracking-[0.08em] mb-2">검토 대기</div>
              {draftTasks.map(task => (
                <DraftTaskRow key={task.id} task={task}
                  onConfirm={(c) => handleConfirmTask(task, c)}
                  onReject={(c) => handleRejectTask(task, c)}
                  onDelete={() => handleDeleteTask(task)} />
              ))}
            </div>
          )}
          {confirmedTasks.length > 0 && (
            <div className="mb-2.5">
              <div className="text-[10px] font-bold text-p-muted tracking-[0.08em] mb-2">확정 과제 {confirmedTasks.length}건</div>
              {confirmedTasks.map(task => (
                <EditableTaskCard key={task.id} task={task} subscribedSlugs={subscribedSlugs} role="admin"
                  onDelete={() => handleDeleteTask(task)} />
              ))}
            </div>
          )}
          {tasks.length === 0 && !showAddForm && (
            <div className="py-3 text-[13px] text-p-muted text-center">등록된 과제가 없어요</div>
          )}
          {!showAddForm ? (
            <button onClick={() => setShowAddForm(true)}
              className="w-full h-[34px] rounded-[8px] text-xs font-semibold cursor-pointer text-p-muted mt-1"
              style={{ border: "1.5px dashed rgba(0,0,0,0.15)", backgroundColor: "transparent" }}>+ 과제 추가</button>
          ) : (
            <AddTaskFormBatch childId={childId} subscribedSlugs={subscribedSlugs} createdBy="admin" onDone={() => setShowAddForm(false)} />
          )}
        </div>
      )}
    </div>
  );
}
