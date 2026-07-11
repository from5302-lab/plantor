"use client";

// 플랜 관리 탭 — 확정 대기 초안(확정/거절) 중심 + 전체 학생 계획
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { StudentLearningGrid } from "@/components/shared/student-learning-grid";
import type { Service } from "@/data/site";
import { useServices } from "@/lib/services-context";
import type { MemberChild, Subscription } from "@/lib/types";

const GRADE_ORDER = ["미취학", "초1", "초2", "초3", "초4", "초5", "초6", "중1", "중2", "중3", "고1", "고2", "고3"];
function gradeIdx(g: string) { const i = GRADE_ORDER.indexOf(g); return i === -1 ? GRADE_ORDER.length : i; }
function svcName(slug: string, services: Service[]) { return services.find((s) => s.slug === slug)?.name ?? slug; }

type TodayStatus = "pending" | "done" | "none";

const SELECT_CLS = "h-9 appearance-none rounded-lg border border-black/10 bg-white pl-2.5 pr-8 text-[13px] text-black/90 cursor-pointer outline-none focus:border-p-green";
const SELECT_ARROW = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23a39e98'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center",
} as const;

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
  const { allServices } = useServices();
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | TodayStatus>("");
  const [sortKey, setSortKey] = useState<"status" | "name" | "grade">("status");

  // 직강(1:1) 학생 수강과목: 구독 문서가 아니라 directClasses에 저장 → loginId로 매핑
  const [directSlugsByLogin, setDirectSlugsByLogin] = useState<Map<string, string[]>>(new Map());
  useEffect(() => {
    const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    return onSnapshot(query(collection(db, "directClasses"), where("status", "==", "active")), (snap) => {
      const map = new Map<string, string[]>();
      snap.forEach((d) => {
        const cls = d.data();
        if (cls.expiry && cls.expiry < todayKst) return; // 만료 수업 제외
        for (const st of (cls.students ?? []) as Array<{ studentLoginId?: string; serviceSlugs?: string[] }>) {
          const lid = (st.studentLoginId ?? "").toLowerCase();
          if (!lid) continue;
          const slugs = st.serviceSlugs ?? (cls.serviceSlugs as string[] | undefined) ?? [];
          map.set(lid, [...new Set([...(map.get(lid) ?? []), ...slugs])]);
        }
      });
      setDirectSlugsByLogin(map);
    });
  }, []);

  // 계정(로그인 아이디)이 있는 학생 전원 — 구독/직강 수강과목을 합쳐 표시
  const students = useMemo(() => {
    const slugsByChild = new Map<string, string[]>();
    for (const s of allSubs) {
      if (!s.childId) continue;
      const arr = slugsByChild.get(s.childId) ?? [];
      if (!arr.includes(s.serviceSlug)) arr.push(s.serviceSlug);
      slugsByChild.set(s.childId, arr);
    }
    return allChildren
      .filter((c) => c.loginId) // 계정 있는 학생 전원
      .map((c) => {
        const subSlugs = slugsByChild.get(c.id) ?? [];
        const dirSlugs = directSlugsByLogin.get(c.loginId.toLowerCase()) ?? [];
        const slugs = [...new Set([...subSlugs, ...dirSlugs])];
        const today = todayByChild[c.id] ?? { total: 0, done: 0 };
        return { id: c.id, name: c.name, grade: c.grade, loginId: c.loginId, slugs, drafts: draftByChild[c.id] ?? 0, today, status: classify(today) };
      });
  }, [allChildren, allSubs, draftByChild, todayByChild, directSlugsByLogin]);

  // 필터 옵션 (실제 데이터 기준)
  const gradeOpts = useMemo(() => [...new Set(students.map((s) => s.grade).filter(Boolean))].sort((a, b) => gradeIdx(a) - gradeIdx(b)), [students]);
  const subjectOpts = useMemo(() => [...new Set(students.flatMap((s) => s.slugs))], [students]);

  // 필터 적용
  const q = search.trim();
  const filtered = students.filter((s) => {
    if (q && !s.name.includes(q)) return false;
    if (gradeFilter && s.grade !== gradeFilter) return false;
    if (subjectFilter && !s.slugs.includes(subjectFilter)) return false;
    if (statusFilter && s.status !== statusFilter) return false;
    return true;
  });

  // 정렬
  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === "name") return a.name.localeCompare(b.name, "ko");
    if (sortKey === "grade") return (gradeIdx(a.grade) - gradeIdx(b.grade)) || a.name.localeCompare(b.name, "ko");
    // status: 안 한 사람 먼저 → 확정대기 → 이름
    return (RANK[a.status] - RANK[b.status]) || (b.drafts - a.drafts) || a.name.localeCompare(b.name, "ko");
  });

  const pendingStudents = students.filter((s) => s.drafts > 0);
  const draftTotal = pendingStudents.reduce((n, s) => n + s.drafts, 0);
  const doneCnt = students.filter((s) => s.status === "done").length;
  const notDoneCnt = students.filter((s) => s.status === "pending").length;
  const noneCnt = students.filter((s) => s.status === "none").length;
  const activeFilterCount = (gradeFilter ? 1 : 0) + (subjectFilter ? 1 : 0) + (statusFilter ? 1 : 0) + (q ? 1 : 0);
  function resetFilters() { setSearch(""); setGradeFilter(""); setSubjectFilter(""); setStatusFilter(""); }

  return (
    <div>
      {/* 오늘 현황 요약 (클릭 시 상태 필터) */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
        <span className="font-bold text-black/95">오늘 학습 현황</span>
        {([["pending", "안 한 사람", notDoneCnt, "#fff5f5", "#c00000"], ["done", "완료", doneCnt, "#f0faf1", "#2a8438"], ["none", "과제 없음", noneCnt, "#f6f5f4", "#a39e98"]] as const).map(([st, label, cnt, bg, fg]) => (
          <button key={st} onClick={() => setStatusFilter((prev) => (prev === st ? "" : st))}
            className="rounded-md px-2 py-0.5 font-semibold cursor-pointer border"
            style={{ backgroundColor: bg, color: fg, borderColor: statusFilter === st ? fg : "transparent" }}>
            {label} {cnt}
          </button>
        ))}
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

      {/* 필터 + 정렬 바 */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="학생 이름 검색"
          className="h-9 flex-1 min-w-[140px] rounded-lg border border-black/10 px-3 text-[13px] outline-none focus:border-p-green"
        />
        <select className={SELECT_CLS} style={SELECT_ARROW} value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
          <option value="">전체 학년</option>
          {gradeOpts.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select className={SELECT_CLS} style={SELECT_ARROW} value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
          <option value="">전체 과목</option>
          {subjectOpts.map((slug) => <option key={slug} value={slug}>{svcName(slug, allServices)}</option>)}
        </select>
        <select className={SELECT_CLS} style={SELECT_ARROW} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "" | TodayStatus)}>
          <option value="">전체 상태</option>
          <option value="pending">안 한 사람</option>
          <option value="done">오늘 완료</option>
          <option value="none">오늘 과제 없음</option>
        </select>
        <select className={SELECT_CLS} style={SELECT_ARROW} value={sortKey} onChange={(e) => setSortKey(e.target.value as "status" | "name" | "grade")}>
          <option value="status">정렬: 오늘 상태순</option>
          <option value="name">정렬: 이름순</option>
          <option value="grade">정렬: 학년순</option>
        </select>
      </div>
      <div className="mb-3 flex items-center gap-2 text-[12px] text-p-muted">
        <span>{sorted.length}명 표시</span>
        {activeFilterCount > 0 && (
          <button onClick={resetFilters} className="rounded-md border border-black/10 bg-white px-2 py-0.5 text-[12px] font-semibold text-p-secondary cursor-pointer">
            필터 초기화 ({activeFilterCount})
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="py-12 text-center text-[13px] text-p-muted">해당하는 학생이 없어요.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {sorted.map((s) => (
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
              <StudentLearningGrid childId={s.id} childName={s.name} subscribedSlugs={s.slugs} defaultExpanded={s.drafts > 0} adminLoginId={s.loginId} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
