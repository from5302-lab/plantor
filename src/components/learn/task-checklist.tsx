"use client";

import { useEffect, useState } from "react";
import { addDoc, collection, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { ExternalLink } from "lucide-react";
import { SERVICES } from "@/data/site";
import { ServiceIcon } from "@/components/ui/service-icon";
import { REASONS_6HDL } from "@/lib/types";
import type { Task, TaskCheck, LearningLog } from "@/lib/types";
import { AutoResultCard } from "./auto-result-card";

// 클릭 시 교사 계정으로 진도를 실시간 스크래핑하는 서비스
const AUTO_VERIFIED_SLUGS = new Set(["autovoca", "classcard-middle", "dailykor", "class5"]);

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("sv-SE");
}

// 만회일 선택지: 내일 / 모레 / (3일 이상 남았으면) 이번 주 토요일 / 나중에
export function makeupOptions(today: string): Array<{ label: string; value: string | null }> {
  const opts: Array<{ label: string; value: string | null }> = [
    { label: "내일", value: addDays(today, 1) },
    { label: "모레", value: addDays(today, 2) },
  ];
  const dow = new Date(today + "T00:00:00").getDay(); // 0=일 … 6=토
  const toSat = (6 - dow + 7) % 7;
  if (toSat >= 3) opts.push({ label: "이번 주 토요일", value: addDays(today, toSat) });
  opts.push({ label: "나중에 정할게", value: null });
  return opts;
}

/** "2026-07-15" → "7/15" */
export function shortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * 오늘 할 일 체크리스트 — 과제마다 우측 단일 상태 버튼 하나로 진행한다.
 *   ①시작 전 [학습하러 가기] → ②학습 중 [완료 확인하기/완료했어요](+↗ 재열기) → ③인증 중 → ④완료
 * 당일 미완료(6hdl) 입력은 없다 — 다음날 "못한 과제 돌아보기"에서 사유·만회일을 입력한다.
 */
export function TaskChecklist({
  tasks,
  taskChecks,
  childId,
  date,
  readOnly = false,
  autoLogsBySlug = {},
}: {
  tasks: Task[];
  taskChecks: TaskCheck[];
  childId: string;
  date: string;
  readOnly?: boolean;
  autoLogsBySlug?: Record<string, LearningLog>;
}) {
  const [submitting, setSubmitting] = useState<string | null>(null);
  // "학습하러 가기"를 누른 과제 — 버튼이 완료 확인 단계로 넘어간다 (오늘 하루 localStorage 유지)
  const startedKey = `plantor_startedTasks_${date}`;
  const [startedTasks, setStartedTasks] = useState<Set<string>>(new Set());
  useEffect(() => {
    try { setStartedTasks(new Set(JSON.parse(localStorage.getItem(startedKey) ?? "[]") as string[])); } catch { /* 무시 */ }
  }, [startedKey]);

  // 학습 사이트 새 탭으로 열고 시작 상태 기록
  function handleGoStudy(task: Task, url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
    setStartedTasks((prev) => {
      const next = new Set(prev).add(task.id);
      try { localStorage.setItem(startedKey, JSON.stringify([...next])); } catch { /* 무시 */ }
      return next;
    });
  }
  // 자동인증 진행 상태 (taskId → 로딩/에러/미완료판정)
  const [autoVerifying, setAutoVerifying] = useState<Record<string, boolean>>({});
  const [autoError, setAutoError] = useState<Record<string, string>>({});
  // 인증 결과가 "완료"가 아닐 때의 상태(진행중/시작전) — 체크는 남지 않고 안내만
  const [notComplete, setNotComplete] = useState<Record<string, string>>({});

  // "완료 확인" 클릭 = 서버 인증 요청. 교사 계정으로 오늘 진도를 조회해 완료면 서버가 done(agent) 기록
  //   → 스냅샷으로 체크가 채워짐. 완료가 아니면 done이 안 생기고 안내만 뜬다.
  async function runAutoVerify(task: Task) {
    setAutoError((p) => ({ ...p, [task.id]: "" }));
    setNotComplete((p) => ({ ...p, [task.id]: "" }));
    setAutoVerifying((p) => ({ ...p, [task.id]: true }));
    try {
      const call = httpsCallable(functions, "verifyAutoProgress");
      const res = await call({ serviceSlug: task.serviceSlug });
      const status = (res.data as { autoStatus?: string })?.autoStatus;
      if (status && status !== "완료") setNotComplete((p) => ({ ...p, [task.id]: status }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "진도 확인 실패";
      setAutoError((p) => ({ ...p, [task.id]: msg }));
    } finally {
      setAutoVerifying((p) => ({ ...p, [task.id]: false }));
    }
  }

  async function handleMarkDone(task: Task) {
    if (readOnly) return;
    // 자동인증 과목: 자기체크로 done을 쓰지 않는다. 클릭 = 서버 인증 요청일 뿐.
    //   서버 스크래핑이 "완료"를 확인해야만 done(agent)이 기록되고 체크가 채워진다.
    if (AUTO_VERIFIED_SLUGS.has(task.serviceSlug)) {
      await runAutoVerify(task);
      return;
    }
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
      setSubmitting(null);
      return;
    }
    setSubmitting(null);
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
        const isAuto = AUTO_VERIFIED_SLUGS.has(task.serviceSlug);
        const isVerifying = !!autoVerifying[task.id];
        const isLoading = submitting === task.id || isVerifying;
        const notCompleteStatus = notComplete[task.id];
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

        // 학습 사이트 링크: 과제 지정 링크 우선, 없으면 서비스 학생 접속 주소
        const studyUrl = task.externalUrl || svc?.studentUrl || null;
        // ①시작 전: 링크가 있고 아직 안 눌렀으면 [학습하러 가기]. 링크 없는 과제는 곧장 ② 단계
        const notStarted = !isDone && !isNotDone && !startedTasks.has(task.id) && !!studyUrl;

        return (
          <div key={task.id}>
            <div className="flex items-center px-5 py-[15px] gap-3.5">
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
                </div>
                {isNotDone && reasonInfo && (
                  <div className="text-[11px] text-[#c00000] font-medium mt-0.5 pl-6">
                    {reasonInfo.icon} {reasonInfo.name}{check?.reasonNote ? ` · ${check.reasonNote}` : ""}
                    {check?.makeupDate && <span className="text-p-secondary"> · 🔁 {shortDate(check.makeupDate)} 만회 예정</span>}
                  </div>
                )}
                {!isDone && notCompleteStatus && (
                  <div className="text-[11px] font-medium mt-0.5 pl-6" style={{ color: "#92660a" }}>
                    아직 완료로 확인되지 않았어요 ({notCompleteStatus}) · 학습을 마친 뒤 다시 눌러 인증하세요
                  </div>
                )}
              </div>

              {/* 단일 상태 버튼: 학습하러 가기 → 완료 확인(+↗) → 인증 중 → 완료 */}
              <div className="flex items-center gap-1.5 shrink-0">
                {isDone ? (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#f0faf1] text-[#2a8438]">완료 ✓</span>
                ) : isNotDone ? (
                  /* 6hdl 입력된 과거 방식 데이터 호환 — 만회는 만회 과제 섹션에서 */
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-p-bg text-p-muted">만회 대기</span>
                ) : notStarted ? (
                  <button onClick={() => handleGoStudy(task, studyUrl!)}
                    className="h-[30px] inline-flex items-center rounded-lg border-none px-3 text-[12px] font-bold text-white cursor-pointer"
                    style={{ backgroundColor: "#38a848" }}>
                    학습하러 가기
                  </button>
                ) : (
                  <>
                    {/* 학습 사이트 다시 열기 */}
                    {studyUrl && (
                      <button onClick={() => window.open(studyUrl, "_blank", "noopener,noreferrer")}
                        title="학습 사이트 다시 열기"
                        className="w-[30px] h-[30px] shrink-0 inline-flex items-center justify-center rounded-lg bg-transparent border border-black/10 cursor-pointer">
                        <ExternalLink size={13} className="text-p-muted" />
                      </button>
                    )}
                    {!readOnly && (
                      <button onClick={() => !isLoading && handleMarkDone(task)} disabled={isLoading}
                        className="h-[30px] inline-flex items-center rounded-lg px-3 text-[12px] font-bold cursor-pointer bg-white"
                        style={{ border: "1.5px solid #38a848", color: "#2a8438", opacity: isLoading ? 0.6 : 1 }}>
                        {isVerifying ? "인증 중…" : isLoading ? "저장 중…" : isAuto ? "완료 확인하기" : "완료했어요"}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* 자동인증 결과 (오토보카/클래스카드) — 카드 여백은 래퍼 책임 */}
            {AUTO_VERIFIED_SLUGS.has(task.serviceSlug) && (
              <div className="mx-4 mb-3 empty:hidden">
                <AutoResultCard
                  log={autoLogsBySlug[task.serviceSlug]}
                  loading={autoVerifying[task.id]}
                  error={autoError[task.id]}
                />
              </div>
            )}

            {!isLast && <div className="h-px bg-black/5 mx-5" />}
          </div>
        );
      })}
    </>
  );
}
