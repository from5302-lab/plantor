"use client";

// 플랜 관리 탭 — 확정 대기 초안(확정/거절) 중심 + 전체 학생 계획
import { useMemo, useState } from "react";
import { StudentLearningGrid } from "@/components/shared/student-learning-grid";
import type { MemberChild, Subscription } from "@/lib/types";

type TodayStatus = "pending" | "done" | "none";

// 오늘 완료 현황 → 라벨/정렬 등급
function classify(t?: { total: number; done: number }): TodayStatus {
  if (!t || t.total === 0) return "none";
  return t.done >= t.total ? "done" : "pending";
}
const RANK: Record<TodayStatus, number> = { pending: 0, done: 1, none: 2 };

function TodayLabel({ status, done, total }: { status: TodayStatus; done: number; total: number }) {
  if (status === "done") {
    return <span className="text-[11px] rounded-md px-2 py-0.5 font-bold" style={{ backgroundColor: "#f0faf1", color: "#2a8438" }}>오늘 완료 ✓ {done}/{total}</span>;
  }
  if (status === "pending") {
    return <span className="text-[11px] rounded-md px-2 py-0.5 font-bold" style={{ backgroundColor: "#fff5f5", color: "#c00000" }}>안 한 사람 · {done}/{total}</span>;
  }
  return <span className="text-[11px] rounded-md px-2 py-0.5 font-semibold" style={{ backgroundColor: "#f6f5f4", color: "#a39e98" }}>오늘 과제 없음</span>;
}

export function PlanTab({ allChildren, allSubs, draftByChild, todayByChild }: {
  allChildren: MemberChild[];
  allSubs: Subscription[];
  draftByChild: Record<string, number>;
  todayByChild: Record<string, { total: number; done: number }>;
}) {
  const [search, setSearch] = useState("");

  // 구독 있는 학생만 추리고, 오늘 '안 한 사람'을 위로 정렬
  const students = useMemo(() => {
    const slugsByChild = new Map<string, string[]>();
    for (const s of allSubs) {
      if (!s.childId) continue;
      const arr = slugsByChild.get(s.childId) ?? [];
      if (!arr.includes(s.serviceSlug)) arr.push(s.serviceSlug);
      slugsByChild.set(s.childId, arr);
    }
    return allChildren
      .filter((c) => slugsByChild.has(c.id))
      .map((c) => {
        const today = todayByChild[c.id] ?? { total: 0, done: 0 };
        return { id: c.id, name: c.name, grade: c.grade, slugs: slugsByChild.get(c.id) ?? [], drafts: draftByChild[c.id] ?? 0, today, status: classify(today) };
      })
      .sort((a, b) => (RANK[a.status] - RANK[b.status]) || (b.drafts - a.drafts) || a.name.localeCompare(b.name, "ko"));
  }, [allChildren, allSubs, draftByChild, todayByChild]);

  const q = search.trim();
  const filtered = q ? students.filter((s) => s.name.includes(q)) : students;

  const pendingStudents = students.filter((s) => s.drafts > 0);
  const draftTotal = pendingStudents.reduce((n, s) => n + s.drafts, 0);
  const doneCnt = students.filter((s) => s.status === "done").length;
  const notDoneCnt = students.filter((s) => s.status === "pending").length;
  const noneCnt = students.filter((s) => s.status === "none").length;

  return (
    <div>
      {/* 오늘 현황 요약 */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px]">
        <span className="font-bold text-black/95">오늘 학습 현황</span>
        <span className="rounded-md px-2 py-0.5 font-semibold" style={{ backgroundColor: "#fff5f5", color: "#c00000" }}>안 한 사람 {notDoneCnt}</span>
        <span className="rounded-md px-2 py-0.5 font-semibold" style={{ backgroundColor: "#f0faf1", color: "#2a8438" }}>완료 {doneCnt}</span>
        <span className="rounded-md px-2 py-0.5 font-semibold" style={{ backgroundColor: "#f6f5f4", color: "#a39e98" }}>과제 없음 {noneCnt}</span>
      </div>

      {/* 확정 대기 배너 */}
      {draftTotal > 0 && (
        <div className="mb-4 rounded-xl border border-[rgba(56,168,72,0.25)] bg-[#f0faf1] px-4 py-3.5 text-[13px] leading-relaxed text-[#1e7a34]">
          <strong className="font-bold">📝 확정 대기 학습계획 {draftTotal}건</strong>
          <span className="text-[#3a9b52]"> · {pendingStudents.map((s) => s.name).join(", ")}</span>
          <br />
          학생이 올린 주간 계획이에요. 아래 학생 카드에서 확인 후 확정해 주세요.
        </div>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="학생 이름 검색"
        className="w-full h-10 rounded-lg border border-black/10 px-3.5 text-[13px] mb-4 outline-none focus:border-p-green"
      />

      {filtered.length === 0 ? (
        <div className="py-12 text-center text-[13px] text-p-muted">해당하는 학생이 없어요.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((s) => (
            <div key={s.id} className="rounded-xl border bg-white overflow-hidden"
              style={s.status === "pending"
                ? { borderColor: "rgba(200,0,0,0.35)", boxShadow: "0 0 0 1px rgba(200,0,0,0.12)" }
                : s.drafts > 0
                ? { borderColor: "rgba(56,168,72,0.4)", boxShadow: "0 0 0 1px rgba(56,168,72,0.15)" }
                : { borderColor: "rgba(0,0,0,0.1)" }}>
              <div className="flex items-center gap-2 px-4 pt-3 pb-2 flex-wrap">
                <span className="text-[14px] font-bold text-black/95">{s.name}</span>
                <span className="text-[11px] text-p-muted">{s.grade}</span>
                <TodayLabel status={s.status} done={s.today.done} total={s.today.total} />
                {s.drafts > 0 && (
                  <span className="text-[11px] rounded-md px-2 py-0.5 font-semibold ml-auto" style={{ backgroundColor: "#eff6ff", color: "#38a848" }}>
                    확정 대기 {s.drafts}
                  </span>
                )}
              </div>
              <StudentLearningGrid childId={s.id} childName={s.name} subscribedSlugs={s.slugs} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
