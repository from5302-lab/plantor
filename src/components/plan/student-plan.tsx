"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
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

// ── 데모 데이터 ────────────────────────────────────────────────────────────────
// 로그인 없이 화면을 보기 위한 가짜 계획. 확정 2건 + 검토 중 1건으로
// 두 섹션이 모두 보이게 둔다(빈 화면만 보면 카드 위계를 확인할 수 없다).

const DEMO_SUBSCRIPTIONS = [
  { id: "d1", childId: "demo-child", serviceSlug: "class5", status: "active", monthlyPrice: 0, startDate: null, endDate: null },
  { id: "d2", childId: "demo-child", serviceSlug: "dailykor", status: "active", monthlyPrice: 0, startDate: null, endDate: null },
  { id: "d3", childId: "demo-child", serviceSlug: "autovoca", status: "active", monthlyPrice: 0, startDate: null, endDate: null },
];

const DEMO_TASKS: Task[] = [
  {
    id: "dt1", childId: "demo-child", serviceSlug: "class5", partSlug: "reading",
    title: "Reading", scheduleDays: [0, 2, 4], externalUrl: null, progressLabel: null,
    level: null, setName: "Wonderful WORLD BASIC 4", deleteRequested: false, order: 0,
    active: true, createdBy: "student", status: "confirmed", adminComment: null,
    createdAt: null, confirmedAt: null,
  },
  {
    id: "dt2", childId: "demo-child", serviceSlug: "dailykor", partSlug: "daily",
    title: "오늘의 학습", scheduleDays: [0, 1, 2, 3, 4], externalUrl: null, progressLabel: null,
    level: null, setName: null, deleteRequested: false, order: 1,
    active: true, createdBy: "student", status: "confirmed", adminComment: null,
    createdAt: null, confirmedAt: null,
  },
  {
    id: "dt3", childId: "demo-child", serviceSlug: "autovoca", partSlug: "vol-6",
    title: "[6권] 480단어", scheduleDays: [1, 3], externalUrl: null, progressLabel: null,
    level: null, setName: null, deleteRequested: false, order: 2,
    active: true, createdBy: "student", status: "draft", adminComment: null,
    createdAt: null, confirmedAt: null,
  },
];

// ── 메인 ───────────────────────────────────────────────────────────────────────

export function StudentPlan({ userId, userEmail, previewChildId, embedded = false, isDemo = false }: {
  userId: string;
  userEmail?: string | null;
  /** 어드민 미리보기 — 이 학생의 계획을 그대로 보여준다(추가·삭제는 화면에서 막는다) */
  previewChildId?: string;
  /** 프로필 화면의 탭 안에서 쓸 때 — 배경·여백은 바깥 화면에 맡긴다 */
  embedded?: boolean;
  /** 로그인 없이 화면만 보는 데모(?demo=true) */
  isDemo?: boolean;
}) {
  const { childId, childName, subscriptions, ready } = useChildData({
    userId, userEmail, previewChildId, isDemo,
    demoData: isDemo ? { subscriptions: DEMO_SUBSCRIPTIONS, logs: [], allLogs: [] } : undefined,
  });
  const subscribedSlugs = subscriptions.map(s => s.serviceSlug);
  const [tasks, setTasks] = useState<Task[]>(isDemo ? DEMO_TASKS : []);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!childId || isDemo) return;
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
        partSlug: d.data().partSlug ?? null,
        progressLabel: d.data().progressLabel ?? null,
        level: d.data().level ?? null,
        setName: d.data().setName ?? null,
        deleteRequested: d.data().deleteRequested ?? false,
      })));
    });
  }, [childId, isDemo]);

  async function handleDelete(task: Task) {
    if (!confirm(`"${task.title}" 과제를 취소할까요?`)) return;
    await deleteDoc(doc(db, "tasks", task.id));
  }

  if (!ready) return <CenterMsg>로딩 중…</CenterMsg>;

  if (!childId) {
    return (
      <PageWrap paddingBottom="96px" embedded={embedded}>
        <Card style={{ maxWidth: 440, margin: "0 auto", padding: "40px 32px", textAlign: "center" }}>
          <p className="m-0 text-sm text-p-secondary">학생 정보가 연결되지 않았습니다.</p>
        </Card>
      </PageWrap>
    );
  }

  const draftTasks = tasks.filter(t => t.status === "draft");
  const confirmedTasks = tasks.filter(t => t.status === "confirmed");

  return (
    <PageWrap paddingBottom="96px" embedded={embedded}>
      <div className="max-w-[480px] mx-auto">

        {/* 헤더 — 프로필 탭 안에서는 통째로 뺀다.
            탭 라벨이 이미 "계획하기"이고 위에 프로필 카드가 있어, 제목을 또 얹으면
            같은 말을 세 번 하는 셈이다("계획하기" / "나의 학습 계획" / "○○의 주간 계획표").
            독립 페이지(/plan)에서는 제목이 필요하므로 유지하되 장식 라벨은 걷어냈다. */}
        {!embedded && (
          <div className="mb-7">
            <div className="text-[24px] font-bold text-black/95 tracking-[-0.6px]">나의 학습 계획</div>
            <div className="mt-1.5 text-sm text-p-secondary">{childName}의 주간 계획표</div>
          </div>
        )}

        {/* 과제 추가 버튼 / 폼.
            미리보기에서는 자리를 두되 잠근다 — 통째로 숨기면 화면이 고장난 것처럼 보이고,
            누를 수 있게 두면 규칙(tasks.create 는 본인 계정만)이 막아 실패한다. */}
        {previewChildId ? (
          <div className="w-full h-11 rounded-[10px] border-[1.5px] border-dashed border-black/[0.12] text-p-muted text-sm font-semibold mb-6 flex items-center justify-center gap-1.5">
            <Plus size={16} strokeWidth={2.5} aria-hidden /> 주간 과제 추가하기 <span className="text-[12px] font-medium">(미리보기에서는 잠김)</span>
          </div>
        ) : !showForm ? (
          <button
            onClick={() => setShowForm(true)}
            // 이 화면의 유일한 주요 액션인데 muted 글자라 가장 약한 요소였다.
            className="w-full h-11 rounded-[10px] border-[1.5px] border-dashed border-black/[0.18] bg-transparent text-p-secondary text-sm font-semibold cursor-pointer mb-6 flex items-center justify-center gap-1.5"
          >
            <Plus size={16} strokeWidth={2.5} aria-hidden /> 주간 과제 추가하기
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
            {/* muted(#a39e98)는 배경 대비 2.3:1 로 AA 미달이었다.
                정작 확정 과제가 이 화면의 주 목록인데 라벨이 가장 안 읽혔다. */}
            <div className="text-[11px] font-bold text-p-secondary tracking-[0.08em] mb-2.5">
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
