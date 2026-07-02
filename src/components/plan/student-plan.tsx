"use client";

import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, deleteDoc, doc, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AddTaskFormBatch, EditableTaskCard } from "@/components/shared/add-task-form";
import { useChildData } from "@/lib/hooks/useChildData";
import { CenterMsg } from "@/components/ui/center-msg";
import { PageWrap } from "@/components/ui/page-wrap";
import { Card } from "@/components/ui/card";
import type { Task } from "@/lib/types";

function tsToDate(ts: unknown): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts === "object" && "toDate" in (ts as object)) return (ts as { toDate: () => Date }).toDate();
  return null;
}

// ── 메인 ───────────────────────────────────────────────────────────────────────

export function StudentPlan({ userId, userEmail }: { userId: string; userEmail?: string | null }) {
  const { childId, childName, subscriptions, ready } = useChildData({ userId, userEmail });
  const subscribedSlugs = subscriptions.map(s => s.serviceSlug);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showForm, setShowForm] = useState(false);

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
        time: d.data().time ?? null,
        externalUrl: d.data().externalUrl ?? null,
        order: d.data().order ?? 0,
        active: d.data().active ?? true,
        createdBy: d.data().createdBy,
        status: d.data().status,
        adminComment: d.data().adminComment ?? null,
        createdAt: tsToDate(d.data().createdAt),
        confirmedAt: tsToDate(d.data().confirmedAt),
        partSlug: d.data().partSlug ?? null,
        progressLabel: d.data().progressLabel ?? null,
        level: d.data().level ?? null,
        setName: d.data().setName ?? null,
        deleteRequested: d.data().deleteRequested ?? false,
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
          <div>
            <div className="text-[11px] font-semibold tracking-[0.12em] text-p-muted uppercase mb-1">WEEKLY PLAN</div>
            <div className="text-[28px] font-bold text-black/95 tracking-[-0.8px]">나의 학습 계획</div>
            <div className="mt-1.5 text-sm text-p-secondary">{childName}의 주간 계획표</div>
          </div>
        </div>

        {/* 과제 추가 버튼 / 폼 */}
        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="w-full h-11 rounded-[10px] border-[1.5px] border-dashed border-black/[0.18] bg-transparent text-p-muted text-sm font-semibold cursor-pointer mb-6 flex items-center justify-center gap-1.5"
          >
            + 주간 과제 추가하기
          </button>
        ) : (
          <AddTaskFormBatch
            childId={childId}
            subscribedSlugs={subscribedSlugs}
            onDone={() => setShowForm(false)}
          />
        )}

        {/* 검토 중 (draft) */}
        {draftTasks.length > 0 && (
          <div className="mb-6">
            <div className="text-[11px] font-bold text-p-green tracking-[0.08em] mb-2.5">
              선생님 검토 중 {draftTasks.length}건
            </div>
            {draftTasks.map(task => (
              <EditableTaskCard key={task.id} task={task} subscribedSlugs={subscribedSlugs} onDelete={() => handleDelete(task)} />
            ))}
          </div>
        )}

        {/* 확정된 과제 */}
        {confirmedTasks.length > 0 && (
          <div className="mb-6">
            <div className="text-[11px] font-bold text-p-muted tracking-[0.08em] mb-2.5">
              확정된 과제 {confirmedTasks.length}건
            </div>
            {confirmedTasks.map(task => (
              <EditableTaskCard key={task.id} task={task} subscribedSlugs={subscribedSlugs} onDelete={() => handleDelete(task)} />
            ))}
          </div>
        )}

        {/* 빈 상태 */}
        {tasks.length === 0 && !showForm && (
          <div className="py-12 text-center">
            <div className="text-4xl mb-3">📝</div>
            <div className="text-[15px] font-semibold text-black/95 mb-1.5">아직 과제가 없어요</div>
            <div className="text-[13px] text-p-secondary">위 버튼을 눌러 이번 주 학습 계획을 세워보세요!</div>
          </div>
        )}

      </div>
    </PageWrap>
  );
}
