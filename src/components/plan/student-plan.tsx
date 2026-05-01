"use client";

import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { SERVICES } from "@/data/site";
import { ServiceIcon } from "@/components/ui/service-icon";
import { useChildData } from "@/lib/hooks/useChildData";
import { CenterMsg } from "@/components/ui/center-msg";
import { PageWrap } from "@/components/ui/page-wrap";
import { Card } from "@/components/ui/card";
import { StudentProfileForm } from "@/components/plan/student-profile-form";
import type { Task } from "@/lib/types";

const ARROW = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23615d59'/%3E%3C/svg%3E")`;
const SELECT_STYLE: React.CSSProperties = {
  height: 40, borderRadius: 8, border: "1px solid rgba(0,0,0,0.1)",
  padding: "0 36px 0 12px", fontSize: 13,
  color: "rgba(0,0,0,0.95)", backgroundColor: "#ffffff",
  backgroundImage: ARROW, backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center", backgroundSize: "10px 6px",
  WebkitAppearance: "none", MozAppearance: "none", appearance: "none",
  outline: "none", cursor: "pointer",
};

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

function tsToDate(ts: unknown): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts === "object" && "toDate" in (ts as object)) return (ts as { toDate: () => Date }).toDate();
  return null;
}

// ── 요일 선택 버튼 ─────────────────────────────────────────────────────────────

function DayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  function toggle(d: number) {
    onChange(value.includes(d) ? value.filter(x => x !== d) : [...value, d].sort());
  }
  return (
    <div className="flex gap-1">
      {DAY_LABELS.map((label, i) => (
        <button key={i} onClick={() => toggle(i)} type="button"
          className="w-8 h-8 rounded-full text-xs font-semibold cursor-pointer"
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
  const availableServices = SERVICES.filter(s => subscribedSlugs.includes(s.slug));
  const [serviceSlug, setServiceSlug] = useState(availableServices[0]?.slug ?? "");
  const [title, setTitle] = useState("");
  const [scheduleDays, setScheduleDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!title.trim() || scheduleDays.length === 0) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "tasks"), {
        childId,
        serviceSlug,
        title: title.trim(),
        scheduleDays,
        externalUrl: null,
        order: Date.now(),
        active: true,
        createdBy: "student",
        status: "draft",
        adminComment: null,
        createdAt: serverTimestamp(),
        confirmedAt: null,
      });
      setTitle("");
      setScheduleDays([0, 1, 2, 3, 4]);
      onDone();
    } finally { setSaving(false); }
  }

  return (
    <Card style={{ padding: "16px 18px", marginBottom: 20 }}>
      <div className="text-xs font-bold text-p-muted mb-3 tracking-[0.06em]">새 과제 추가</div>
      <div className="flex flex-col gap-2.5">
        <select value={serviceSlug} onChange={e => setServiceSlug(e.target.value)} style={SELECT_STYLE}>
          {availableServices.map(s => (
            <option key={s.slug} value={s.slug}>{s.name}</option>
          ))}
        </select>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="과제 제목 (예: 3단원 2차시 받아쓰기)"
          className="h-10 rounded-lg border border-black/10 px-3 text-[13px] text-black/95 outline-none"
        />
        <div>
          <div className="text-[11px] text-p-muted mb-1.5">학습 요일</div>
          <DayPicker value={scheduleDays} onChange={setScheduleDays} />
        </div>
        <button
          onClick={handleSubmit}
          disabled={!title.trim() || scheduleDays.length === 0 || saving}
          className="h-10 rounded-lg border-none bg-p-green text-white text-sm font-bold cursor-pointer"
          style={{ opacity: saving || !title.trim() || scheduleDays.length === 0 ? 0.5 : 1 }}
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </Card>
  );
}

// ── 과제 카드 ──────────────────────────────────────────────────────────────────

function TaskCard({ task, onDelete }: { task: Task; onDelete: () => void }) {
  const svc = SERVICES.find(s => s.slug === task.serviceSlug);
  const isDraft = task.status === "draft";
  const today = new Date().getDay();
  const todayIdx = today === 0 ? 6 : today - 1;
  const isToday = task.scheduleDays.includes(todayIdx);

  return (
    <div
      className="bg-white rounded-xl px-4 py-3.5 mb-2 relative"
      style={{
        border: isDraft ? "1.5px solid #38a848" : isToday ? "1.5px solid #38a848" : "1px solid rgba(0,0,0,0.1)",
      }}
    >
      {isToday && !isDraft && (
        <div className="absolute top-2.5 right-9 text-[10px] font-bold text-p-teal tracking-[0.04em]">오늘</div>
      )}
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 shrink-0">
          {svc ? <ServiceIcon service={svc} size={20} /> : <span>📚</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-sm font-bold text-black/95">{task.title}</span>
            <span
              className="text-[11px] rounded-full px-2 py-0.5 font-semibold"
              style={{
                backgroundColor: isDraft ? "#eff6ff" : "#f0faf1",
                color: isDraft ? "#38a848" : "#2da040",
              }}
            >
              {isDraft ? "검토 중" : "확정"}
            </span>
          </div>
          <div className="flex gap-1 flex-wrap" style={{ marginBottom: task.adminComment ? 8 : 0 }}>
            {DAY_LABELS.map((label, i) => (
              <span
                key={i}
                className="text-[11px] font-semibold px-[7px] py-0.5 rounded"
                style={{
                  backgroundColor: task.scheduleDays.includes(i) ? (i === todayIdx ? "#38a848" : "#38a848") : "#f6f5f4",
                  color: task.scheduleDays.includes(i) ? "#ffffff" : "#a39e98",
                }}
              >
                {label}
              </span>
            ))}
          </div>
          {task.adminComment && (
            <div className="mt-2 px-[10px] py-2 bg-[#fffbeb] border border-[#f59e0b] rounded-md text-xs text-[#92400e] leading-[1.5]">
              💬 {task.adminComment}
            </div>
          )}
        </div>
        {isDraft && (
          <button
            onClick={onDelete}
            className="shrink-0 text-[13px] text-p-muted bg-transparent border-none cursor-pointer px-1 py-0.5"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

// ── 메인 ───────────────────────────────────────────────────────────────────────

export function StudentPlan({ userId, userEmail }: { userId: string; userEmail?: string | null }) {
  const { childId, childName, subscriptions, ready } = useChildData({ userId, userEmail });
  const subscribedSlugs = subscriptions.map(s => s.serviceSlug);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    if (!childId) return;
    const q = query(
      collection(db, "tasks"),
      where("childId", "==", childId),
      orderBy("createdAt", "desc"),
    );
    return onSnapshot(q, (snap) => {
      setTasks(snap.docs.map(d => ({
        id: d.id,
        childId: d.data().childId,
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
      })));
    });
  }, [childId]);

  async function handleDelete(task: Task) {
    if (!confirm(`"${task.title}" 과제를 취소할까요?`)) return;
    await deleteDoc(doc(db, "tasks", task.id));
  }

  if (!ready) return <CenterMsg>로딩 중…</CenterMsg>;

  if (!childId) {
    return (
      <PageWrap paddingBottom="96px">
        <Card style={{ maxWidth: 440, margin: "0 auto", padding: "40px 32px", textAlign: "center" }}>
          <p className="m-0 text-sm text-p-secondary">학생 정보가 연결되지 않았습니다.</p>
        </Card>
      </PageWrap>
    );
  }

  const draftTasks = tasks.filter(t => t.status === "draft");
  const confirmedTasks = tasks.filter(t => t.status === "confirmed");

  return (
    <PageWrap paddingBottom="96px">
      <div className="max-w-[480px] mx-auto">

        {/* 헤더 */}
        <div className="mb-7">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] font-semibold tracking-[0.12em] text-p-muted uppercase mb-1">WEEKLY PLAN</div>
              <div className="text-[28px] font-bold text-black/95 tracking-[-0.8px]">나의 학습 계획</div>
              <div className="mt-1.5 text-sm text-p-secondary">{childName}의 주간 계획표</div>
            </div>
            <button
              onClick={() => setShowProfile(v => !v)}
              className="h-[34px] px-3.5 rounded-lg border border-black/10 bg-white text-p-secondary text-xs font-semibold cursor-pointer shrink-0 mt-1"
            >
              📋 내 프로필
            </button>
          </div>
        </div>

        {/* 학습 프로필 폼 */}
        {showProfile && childId && (
          <StudentProfileForm childId={childId} onClose={() => setShowProfile(false)} />
        )}

        {/* 과제 추가 버튼 / 폼 */}
        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="w-full h-11 rounded-[10px] border-[1.5px] border-dashed border-black/[0.18] bg-transparent text-p-muted text-sm font-semibold cursor-pointer mb-6 flex items-center justify-center gap-1.5"
          >
            + 과제 추가하기
          </button>
        ) : (
          <AddTaskForm childId={childId} subscribedSlugs={subscribedSlugs} onDone={() => setShowForm(false)} />
        )}

        {/* 검토 중 (draft) */}
        {draftTasks.length > 0 && (
          <div className="mb-6">
            <div className="text-[11px] font-bold text-p-green tracking-[0.08em] mb-2.5">
              📋 선생님 검토 중 {draftTasks.length}건
            </div>
            {draftTasks.map(task => (
              <TaskCard key={task.id} task={task} onDelete={() => handleDelete(task)} />
            ))}
          </div>
        )}

        {/* 확정된 과제 */}
        {confirmedTasks.length > 0 && (
          <div className="mb-6">
            <div className="text-[11px] font-bold text-p-muted tracking-[0.08em] mb-2.5">
              ✅ 확정된 과제 {confirmedTasks.length}건
            </div>
            {confirmedTasks.map(task => (
              <TaskCard key={task.id} task={task} onDelete={() => handleDelete(task)} />
            ))}
          </div>
        )}

        {/* 빈 상태 */}
        {tasks.length === 0 && !showForm && (
          <div className="py-12 text-center">
            <div className="text-4xl mb-3">📝</div>
            <div className="text-[15px] font-semibold text-black/95 mb-1.5">아직 과제가 없어요</div>
            <div className="text-[13px] text-p-secondary">위 버튼을 눌러 공부할 과제를 추가해 보세요!</div>
          </div>
        )}

      </div>
    </PageWrap>
  );
}
