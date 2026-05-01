"use client";

import { useEffect, useState } from "react";
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "@/lib/firebase";
import { SERVICES } from "@/data/site";
import { ServiceIcon } from "@/components/ui/service-icon";
import { ProfileSummaryBadge } from "@/components/plan/student-profile-form";
import type { MemberChild, Task, Subscription } from "@/lib/types";

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

const ARROW = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23615d59'/%3E%3C/svg%3E")`;
const SELECT_BASE: React.CSSProperties = {
  cursor: "pointer", borderRadius: 8, border: "1px solid rgba(0,0,0,0.1)",
  backgroundColor: "#ffffff", color: "rgba(0,0,0,0.95)",
  backgroundImage: ARROW, backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center", backgroundSize: "10px 6px",
  WebkitAppearance: "none", MozAppearance: "none", appearance: "none",
  outline: "none",
};

function tsToDate(ts: unknown): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts === "object" && "toDate" in (ts as object))
    return (ts as { toDate: () => Date }).toDate();
  return null;
}

// ── 요일 선택 ─────────────────────────────────────────────────────────────────

function DayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  function toggle(d: number) {
    onChange(value.includes(d) ? value.filter(x => x !== d) : [...value, d].sort());
  }
  return (
    <div className="flex gap-1">
      {DAY_LABELS.map((label, i) => (
        <button key={i} onClick={() => toggle(i)} type="button"
          className="w-[30px] h-[30px] rounded-full text-xs font-semibold cursor-pointer"
          style={{
            border: value.includes(i) ? "2px solid #38a848" : "1px solid rgba(0,0,0,0.1)",
            backgroundColor: value.includes(i) ? "#38a848" : "transparent",
            color: value.includes(i) ? "#ffffff" : "#a39e98",
          }}>
          {label}
        </button>
      ))}
    </div>
  );
}

// ── 과제 추가 폼 ───────────────────────────────────────────────────────────────

function AddTaskForm({ childId, subscribedSlugs, onDone }: { childId: string; subscribedSlugs: string[]; onDone: () => void }) {
  const availableServices = subscribedSlugs.length > 0
    ? SERVICES.filter(s => subscribedSlugs.includes(s.slug))
    : SERVICES.filter(s => s.category !== "community");
  const [serviceSlug, setServiceSlug] = useState(availableServices[0]?.slug ?? "");
  const [title, setTitle] = useState("");
  const [scheduleDays, setScheduleDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [externalUrl, setExternalUrl] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!title.trim() || scheduleDays.length === 0) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "tasks"), {
        childId, serviceSlug, title: title.trim(), scheduleDays,
        externalUrl: externalUrl.trim() || null,
        order: Date.now(), active: true,
        createdBy: "admin", status: "confirmed",
        adminComment: null,
        createdAt: serverTimestamp(), confirmedAt: serverTimestamp(),
      });
      setTitle(""); setExternalUrl("");
      onDone();
    } finally { setSaving(false); }
  }

  return (
    <div className="bg-p-bg rounded-[10px] px-4 py-3.5 my-2">
      <div className="text-[11px] font-bold text-p-muted mb-2.5 tracking-[0.06em]">과제 추가</div>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <select value={serviceSlug} onChange={e => setServiceSlug(e.target.value)}
            style={{ ...SELECT_BASE, height: 34, padding: "0 28px 0 10px", fontSize: 12, flex: "0 0 auto" }}>
            {availableServices.map(s => (
              <option key={s.slug} value={s.slug}>{s.name}</option>
            ))}
          </select>
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="과제 제목"
            className="flex-1 h-[34px] rounded-[7px] px-2.5 text-[13px] text-black/95 bg-white"
            style={{ border: "1px solid rgba(0,0,0,0.1)" }} />
        </div>
        <DayPicker value={scheduleDays} onChange={setScheduleDays} />
        <input value={externalUrl} onChange={e => setExternalUrl(e.target.value)}
          placeholder="링크 (선택)"
          className="h-[34px] rounded-[7px] px-2.5 text-xs text-black/95 bg-white"
          style={{ border: "1px solid rgba(0,0,0,0.1)" }} />
        <div className="flex gap-1.5">
          <button onClick={onDone}
            className="flex-1 h-[34px] rounded-[7px] text-xs font-semibold cursor-pointer bg-white text-p-muted"
            style={{ border: "1px solid rgba(0,0,0,0.1)" }}>
            취소
          </button>
          <button onClick={handleSubmit} disabled={!title.trim() || scheduleDays.length === 0 || saving}
            className="flex-[2] h-[34px] rounded-[7px] border-none text-xs font-bold cursor-pointer bg-p-green text-white"
            style={{ opacity: saving || !title.trim() || scheduleDays.length === 0 ? 0.5 : 1 }}>
            {saving ? "저장 중…" : "추가"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 과제 행 ────────────────────────────────────────────────────────────────────

function TaskRow({ task, onConfirm, onReject, onDelete }: {
  task: Task;
  onConfirm: (comment: string) => void;
  onReject: (comment: string) => void;
  onDelete: () => void;
}) {
  const [comment, setComment] = useState(task.adminComment ?? "");
  const svc = SERVICES.find(s => s.slug === task.serviceSlug);
  const isDraft = task.status === "draft";
  const isStudentDraft = isDraft && task.createdBy === "student";

  return (
    <div className="bg-white rounded-[10px] mb-1.5 p-[12px_14px]"
      style={{
        border: isStudentDraft ? "1.5px solid #38a848" : "1px solid rgba(0,0,0,0.1)",
      }}>
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 shrink-0">
          {svc ? <ServiceIcon service={svc} size={18} /> : <span>📚</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span className="text-[13px] font-bold text-black/95">{task.title}</span>
            {isStudentDraft && (
              <span className="text-[10px] rounded-full px-[7px] py-0.5 font-bold bg-[#eff6ff] text-p-green">학생 제출</span>
            )}
          </div>
          <div className="flex gap-[3px] flex-wrap"
            style={{ marginBottom: isStudentDraft ? 8 : 0 }}>
            {DAY_LABELS.map((label, i) => (
              <span key={i} className="text-[10px] font-semibold px-[5px] py-px rounded-[3px]"
                style={{
                  backgroundColor: task.scheduleDays.includes(i) ? "#38a848" : "#f6f5f4",
                  color: task.scheduleDays.includes(i) ? "#ffffff" : "#a39e98",
                }}>{label}</span>
            ))}
          </div>

          {isStudentDraft && (
            <div className="flex flex-col gap-1.5">
              <input value={comment} onChange={e => setComment(e.target.value)}
                placeholder="피드백 (선택)"
                className="h-[30px] rounded-[6px] px-2.5 text-xs text-black/95 bg-white"
                style={{ border: "1px solid rgba(0,0,0,0.1)" }} />
              <div className="flex gap-1.5">
                <button onClick={() => onConfirm(comment)}
                  className="flex-1 h-[30px] rounded-[6px] border-none bg-p-teal text-white text-xs font-bold cursor-pointer">
                  확정
                </button>
                <button onClick={() => onReject(comment)}
                  className="flex-1 h-[30px] rounded-[6px] bg-white text-p-muted text-xs font-semibold cursor-pointer"
                  style={{ border: "1px solid rgba(0,0,0,0.1)" }}>
                  반려
                </button>
              </div>
            </div>
          )}
        </div>
        <button onClick={onDelete}
          className="shrink-0 text-xs text-p-muted bg-none border-none cursor-pointer px-1 py-0.5">
          ✕
        </button>
      </div>
    </div>
  );
}

// ── 학생 아코디언 카드 ─────────────────────────────────────────────────────────

interface TaskSuggestion { title: string; scheduleDays: number[]; serviceSlug: string; }

function AiGeneratePanel({
  childId, subscribedSlugs,
  onAdd,
}: {
  childId: string;
  subscribedSlugs: string[];
  onAdd: (tasks: TaskSuggestion[]) => void;
}) {
  const availableServices = SERVICES.filter(s => subscribedSlugs.includes(s.slug));
  const [serviceSlug, setServiceSlug] = useState(availableServices[0]?.slug ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<TaskSuggestion[] | null>(null);

  const ARROW_AI = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23615d59'/%3E%3C/svg%3E")`;
  const selectStyle: React.CSSProperties = {
    height: 34, padding: "0 28px 0 10px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.1)",
    fontSize: 12, color: "rgba(0,0,0,0.95)", backgroundColor: "#ffffff",
    backgroundImage: ARROW_AI, backgroundRepeat: "no-repeat",
    backgroundPosition: "right 10px center", backgroundSize: "10px 6px",
    WebkitAppearance: "none", MozAppearance: "none", appearance: "none",
    outline: "none", cursor: "pointer",
  };

  async function handleGenerate() {
    setLoading(true); setError(null); setSuggestions(null);
    try {
      const fn = httpsCallable(getFunctions(), "generatePlan");
      const result = await fn({ childId, serviceSlug });
      const data = result.data as { tasks: Array<{ title: string; scheduleDays: number[] }>; serviceSlug: string };
      setSuggestions(data.tasks.map(t => ({ ...t, serviceSlug: data.serviceSlug })));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "AI 생성 실패");
    } finally { setLoading(false); }
  }

  async function handleAddAll() {
    if (!suggestions) return;
    onAdd(suggestions);
    setSuggestions(null);
  }

  return (
    <div className="rounded-[10px] p-[14px_16px] my-2" style={{ backgroundColor: "#f5f0ff", border: "1.5px solid #c4b5fd" }}>
      <div className="text-[11px] font-bold tracking-[0.06em] mb-2.5" style={{ color: "#7c3aed" }}>✨ AI 과제 자동 생성</div>

      {!suggestions ? (
        <div className="flex gap-2 items-center">
          <select value={serviceSlug} onChange={e => setServiceSlug(e.target.value)} style={selectStyle}>
            {availableServices.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
          </select>
          <button onClick={handleGenerate} disabled={loading || !serviceSlug}
            className="h-[34px] px-3.5 rounded-[8px] border-none text-xs font-bold cursor-pointer whitespace-nowrap text-white"
            style={{ backgroundColor: "#7c3aed", opacity: loading ? 0.7 : 1 }}>
            {loading ? "생성 중…" : "생성"}
          </button>
        </div>
      ) : (
        <div>
          <div className="text-[11px] mb-2" style={{ color: "#7c3aed" }}>아래 과제가 생성됐어요. 전체 추가하거나 닫아서 취소하세요.</div>
          {suggestions.map((s, i) => (
            <div key={i} className="flex items-center gap-2 py-1.5" style={{ borderBottom: "1px solid rgba(124,58,237,0.1)" }}>
              <span className="flex-1 text-xs font-medium text-black/95">{s.title}</span>
              <span className="text-[11px]" style={{ color: "#7c3aed" }}>
                {s.scheduleDays.map(d => ["월","화","수","목","금","토","일"][d]).join(" ")}
              </span>
            </div>
          ))}
          <div className="flex gap-1.5 mt-2.5">
            <button onClick={() => setSuggestions(null)}
              className="flex-1 h-[32px] rounded-[8px] text-xs font-semibold cursor-pointer bg-white"
              style={{ border: "1px solid #c4b5fd", color: "#7c3aed" }}>
              닫기
            </button>
            <button onClick={handleAddAll}
              className="flex-[2] h-[32px] rounded-[8px] border-none text-xs font-bold cursor-pointer text-white"
              style={{ backgroundColor: "#7c3aed" }}>
              전체 확정 추가
            </button>
          </div>
        </div>
      )}
      {error && <div className="mt-2 text-[11px]" style={{ color: "#dc2626" }}>{error}</div>}
    </div>
  );
}

function ChildAccordion({
  child, tasks, defaultOpen, subscribedSlugs,
  onConfirm, onReject, onDelete, onAddAiTasks,
}: {
  child: MemberChild;
  tasks: Task[];
  defaultOpen: boolean;
  subscribedSlugs: string[];
  onConfirm: (task: Task, comment: string) => void;
  onReject: (task: Task, comment: string) => void;
  onDelete: (task: Task) => void;
  onAddAiTasks: (childId: string, suggestions: TaskSuggestion[]) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);

  const draftTasks = tasks.filter(t => t.status === "draft");
  const confirmedTasks = tasks.filter(t => t.status === "confirmed");

  return (
    <div className="bg-white rounded-[12px] mb-2.5 overflow-hidden"
      style={{
        border: "1px solid rgba(0,0,0,0.1)",
        boxShadow: "rgba(0,0,0,0.04) 0px 2px 8px",
      }}>
      {/* 헤더 */}
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 p-[14px_16px] bg-none border-none cursor-pointer text-left">
        {/* 이름 + 학년 */}
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-[14px] font-bold text-black/95">{child.name}</span>
            <ProfileSummaryBadge childId={child.id} />
          </div>
          <div className="text-[11px] text-p-muted mt-px">{child.grade}</div>
        </div>

        {/* 배지 */}
        <div className="flex items-center gap-1.5 shrink-0">
          {draftTasks.length > 0 && (
            <span className="text-[11px] font-bold rounded-full px-[9px] py-[3px] bg-[#eff6ff] text-p-green">
              검토 {draftTasks.length}건
            </span>
          )}
          {confirmedTasks.length > 0 && (
            <span className="text-[11px] font-semibold rounded-full px-[9px] py-[3px] bg-p-bg text-p-muted">
              확정 {confirmedTasks.length}
            </span>
          )}
          {tasks.length === 0 && (
            <span className="text-[11px] text-p-muted">과제 없음</span>
          )}
          {/* 화살표 */}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
            style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
            <path d="M2 4l4 4 4-4" stroke="#615d59" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>

      {/* 펼쳐진 내용 */}
      {open && (
        <div className="p-[12px_16px_16px]" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>

          {/* 검토 대기 */}
          {draftTasks.length > 0 && (
            <div className="mb-3.5">
              <div className="text-[10px] font-bold text-p-green tracking-[0.08em] mb-2">
                📋 검토 대기
              </div>
              {draftTasks.map(task => (
                <TaskRow key={task.id} task={task}
                  onConfirm={(c) => onConfirm(task, c)}
                  onReject={(c) => onReject(task, c)}
                  onDelete={() => onDelete(task)} />
              ))}
            </div>
          )}

          {/* 확정 과제 */}
          {confirmedTasks.length > 0 && (
            <div className="mb-2.5">
              <div className="text-[10px] font-bold text-p-muted tracking-[0.08em] mb-2">
                ✅ 확정
              </div>
              {confirmedTasks.map(task => (
                <TaskRow key={task.id} task={task}
                  onConfirm={(c) => onConfirm(task, c)}
                  onReject={(c) => onReject(task, c)}
                  onDelete={() => onDelete(task)} />
              ))}
            </div>
          )}

          {tasks.length === 0 && !showAddForm && (
            <div className="py-3 text-[13px] text-p-muted text-center">
              등록된 과제가 없어요
            </div>
          )}

          {/* AI 생성 패널 */}
          {showAiPanel && subscribedSlugs.length > 0 && (
            <AiGeneratePanel
              childId={child.id}
              subscribedSlugs={subscribedSlugs}
              onAdd={(suggestions) => { onAddAiTasks(child.id, suggestions); setShowAiPanel(false); }}
            />
          )}

          {/* 과제 추가 / AI 버튼 행 */}
          {!showAddForm && (
            <div className="flex gap-1.5 mt-1">
              <button onClick={() => { setShowAddForm(true); setShowAiPanel(false); }}
                className="flex-1 h-[34px] rounded-[8px] text-xs font-semibold cursor-pointer text-p-muted"
                style={{ border: "1.5px dashed rgba(0,0,0,0.15)", backgroundColor: "transparent" }}>
                + 과제 추가
              </button>
              {subscribedSlugs.length > 0 && (
                <button onClick={() => { setShowAiPanel(v => !v); setShowAddForm(false); }}
                  className="h-[34px] px-3 rounded-[8px] text-xs font-bold cursor-pointer whitespace-nowrap"
                  style={{ border: "1.5px solid #c4b5fd", backgroundColor: showAiPanel ? "#f5f0ff" : "#ffffff", color: "#7c3aed" }}>
                  ✨ AI 생성
                </button>
              )}
            </div>
          )}
          {showAddForm && (
            <AddTaskForm childId={child.id} subscribedSlugs={subscribedSlugs} onDone={() => setShowAddForm(false)} />
          )}
        </div>
      )}
    </div>
  );
}

// ── 플랜 탭 메인 ───────────────────────────────────────────────────────────────

export function PlanTab({ allChildren, allSubs }: { allChildren: MemberChild[]; allSubs: Subscription[] }) {
  const [tasksByChild, setTasksByChild] = useState<Record<string, Task[]>>({});
  const [search, setSearch] = useState("");

  // 전체 학생 과제 한 번에 fetch (in 연산자)
  useEffect(() => {
    if (allChildren.length === 0) return;
    const ids = allChildren.map(c => c.id);

    // Firestore `in` 최대 30개 지원
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));

    const unsubs = chunks.map(chunk => {
      const q = query(
        collection(db, "tasks"),
        where("childId", "in", chunk),
        orderBy("createdAt", "desc"),
      );
      return onSnapshot(q, (snap) => {
        const grouped: Record<string, Task[]> = {};
        snap.docs.forEach(d => {
          const childId = d.data().childId as string;
          if (!grouped[childId]) grouped[childId] = [];
          grouped[childId].push({
            id: d.id,
            childId,
            serviceSlug: d.data().serviceSlug,
            title: d.data().title,
            scheduleDays: d.data().scheduleDays ?? [],
            externalUrl: d.data().externalUrl ?? null,
            order: d.data().order ?? 0,
            active: d.data().active ?? true,
            createdBy: d.data().createdBy,
            status: d.data().status,
            adminComment: d.data().adminComment ?? null,
            createdAt: tsToDate(d.data().createdAt),
            confirmedAt: tsToDate(d.data().confirmedAt),
          });
        });
        setTasksByChild(prev => ({ ...prev, ...grouped }));
      });
    });

    return () => unsubs.forEach(u => u());
  }, [allChildren]);

  async function handleAddAiTasks(childId: string, suggestions: TaskSuggestion[]) {
    for (const s of suggestions) {
      await addDoc(collection(db, "tasks"), {
        childId, serviceSlug: s.serviceSlug, title: s.title, scheduleDays: s.scheduleDays,
        externalUrl: null, order: Date.now(), active: true,
        createdBy: "admin", status: "confirmed",
        adminComment: null, createdAt: serverTimestamp(), confirmedAt: serverTimestamp(),
      });
    }
  }

  async function handleConfirm(task: Task, comment: string) {
    await updateDoc(doc(db, "tasks", task.id), {
      status: "confirmed", adminComment: comment || null, confirmedAt: serverTimestamp(),
    });
  }
  async function handleReject(task: Task, comment: string) {
    await updateDoc(doc(db, "tasks", task.id), { adminComment: comment || null });
  }
  async function handleDelete(task: Task) {
    if (!confirm(`"${task.title}" 과제를 삭제할까요?`)) return;
    await deleteDoc(doc(db, "tasks", task.id));
  }

  // 전체 검토 대기 건수
  const totalDraft = Object.values(tasksByChild).flat().filter(t => t.status === "draft").length;
  const pendingChildren = allChildren.filter(c => (tasksByChild[c.id] ?? []).some(t => t.status === "draft"));
  const filteredChildren = search.trim()
    ? allChildren.filter(c => c.name.includes(search.trim()) || c.grade.includes(search.trim()))
    : allChildren;

  return (
    <div className="max-w-[680px] py-6">

      {/* 검색창 */}
      <div className="mb-4 relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">🔍</span>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="학생 이름으로 검색"
          className="w-full h-10 rounded-[10px] pl-9 pr-3 text-[13px] text-black/95 bg-white box-border outline-none"
          style={{ border: "1px solid rgba(0,0,0,0.1)", boxSizing: "border-box" }}
        />
      </div>

      {/* 요약 배너 */}
      {totalDraft > 0 && (
        <div className="flex items-center gap-3 bg-[#eff6ff] rounded-[10px] p-[12px_16px] mb-5"
          style={{ border: "1px solid #38a848" }}>
          <span className="text-[18px]">📋</span>
          <div>
            <div className="text-[13px] font-bold text-p-green">
              검토 대기 {totalDraft}건
            </div>
            <div className="text-xs text-p-secondary mt-0.5">
              {pendingChildren.map(c => c.name).join(", ")}
            </div>
          </div>
        </div>
      )}

      {/* 학생 아코디언 목록 */}
      {filteredChildren.length === 0 ? (
        <div className="py-12 text-center text-p-muted text-sm">
          {search ? `"${search}" 검색 결과가 없어요.` : "등록된 학생이 없어요."}
        </div>
      ) : (
        filteredChildren.map(child => {
          const tasks = tasksByChild[child.id] ?? [];
          const hasDraft = tasks.some(t => t.status === "draft");
          const subscribedSlugs = allSubs.filter(s => s.childId === child.id).map(s => s.serviceSlug);
          return (
            <ChildAccordion
              key={child.id}
              child={child}
              tasks={tasks}
              defaultOpen={hasDraft}
              subscribedSlugs={subscribedSlugs}
              onConfirm={handleConfirm}
              onReject={handleReject}
              onDelete={handleDelete}
              onAddAiTasks={handleAddAiTasks}
            />
          );
        })
      )}
    </div>
  );
}
