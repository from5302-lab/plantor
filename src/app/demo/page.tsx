"use client";

// 학생 학습계획 프로세스 체험용 데모 (로그인·Firestore 없이 로컬 상태로만 동작)
// 실제 플로우: ① 학생이 주간 계획 초안 작성(draft) → ② 선생님 확정(confirmed) → ③ 오늘 학습 체크

import { useMemo, useState } from "react";
import { SERVICES } from "@/data/site";
import { ServiceIcon } from "@/components/ui/service-icon";
import { REASONS_6HDL } from "@/lib/types";
import { X, Check } from "lucide-react";

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

// 데모용 구독 과목 (정승원 학생이 매일국어·클래스5·오토보카·클래스카드 수강 중이라고 가정)
const DEMO_SLUGS = ["dailykor", "class5", "autovoca", "classcard-middle"];

type DemoTask = {
  id: string;
  serviceSlug: string;
  partSlug: string;
  title: string;
  scheduleDays: number[];
  status: "draft" | "confirmed";
};
type DemoCheck = { status: "done" | "not_done"; reason?: string; reasonNote?: string };

function buildTitle(serviceSlug: string, partSlug: string): string {
  const svc = SERVICES.find((s) => s.slug === serviceSlug);
  if (!svc) return "";
  if (partSlug && svc.parts) {
    const part = svc.parts.find((p) => p.slug === partSlug);
    return part?.name ?? svc.name;
  }
  return svc.name;
}

function todayIdx(): number {
  const d = new Date().getDay(); // 0=일 … 6=토
  return d === 0 ? 6 : d - 1;    // 0=월 … 6=일
}

// ── 요일 선택 ────────────────────────────────────────────────────────────────
function DayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="flex gap-1">
      {DAY_LABELS.map((label, i) => (
        <button key={i} type="button"
          onClick={() => onChange(value.includes(i) ? value.filter((x) => x !== i) : [...value, i].sort())}
          className="flex-1 h-8 rounded-md text-xs font-semibold cursor-pointer"
          style={{
            border: value.includes(i) ? "2px solid #38a848" : "1px solid rgba(0,0,0,0.1)",
            backgroundColor: value.includes(i) ? "#38a848" : "transparent",
            color: value.includes(i) ? "#fff" : "#a39e98",
          }}>
          {label}
        </button>
      ))}
    </div>
  );
}

const ARROW = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23615d59'/%3E%3C/svg%3E")`;
const SEL: React.CSSProperties = {
  cursor: "pointer", borderRadius: 8, border: "1px solid rgba(0,0,0,0.1)",
  backgroundColor: "#fff", color: "rgba(0,0,0,0.95)",
  backgroundImage: ARROW, backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center", backgroundSize: "10px 6px",
  WebkitAppearance: "none", MozAppearance: "none", appearance: "none", outline: "none",
};

export default function DemoPage() {
  const [tab, setTab] = useState<"plan" | "teacher" | "today">("plan");
  const [tasks, setTasks] = useState<DemoTask[]>([]);
  const [checks, setChecks] = useState<Record<string, DemoCheck>>({});

  const services = useMemo(() => SERVICES.filter((s) => DEMO_SLUGS.includes(s.slug)), []);
  const drafts = tasks.filter((t) => t.status === "draft");
  const confirmed = tasks.filter((t) => t.status === "confirmed");
  const todayTasks = confirmed.filter((t) => t.scheduleDays.includes(todayIdx()));

  function reset() { setTasks([]); setChecks({}); setTab("plan"); }

  return (
    <div className="min-h-screen bg-p-bg pb-24">
      {/* 데모 배너 */}
      <div className="bg-[#1d4ed8] text-white text-center text-[13px] font-semibold py-2 px-4">
        🧪 체험용 데모 — 실제 데이터에 저장되지 않습니다
        <button onClick={reset} className="ml-3 underline decoration-white/60 cursor-pointer">초기화</button>
      </div>

      {/* 단계 탭 */}
      <div className="max-w-[480px] mx-auto px-4 pt-4">
        <div className="flex gap-1.5 rounded-xl bg-white p-1.5 border border-black/10">
          {([
            ["plan", "① 계획 세우기", "학생"],
            ["teacher", "② 선생님 확정", "선생님"],
            ["today", "③ 오늘 학습", "학생"],
          ] as const).map(([key, label, who]) => (
            <button key={key} onClick={() => setTab(key)}
              className="flex-1 rounded-lg py-2 text-[12px] font-bold cursor-pointer transition-colors"
              style={{
                backgroundColor: tab === key ? "#38a848" : "transparent",
                color: tab === key ? "#fff" : "#a39e98",
              }}>
              {label}
              {(key === "teacher" && drafts.length > 0) ? ` (${drafts.length})` : ""}
              <div className="text-[9px] font-medium opacity-80 mt-0.5">{who} 화면</div>
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-[480px] mx-auto px-4 pt-6">
        {tab === "plan" && <PlanView services={services} tasks={tasks} setTasks={setTasks} />}
        {tab === "teacher" && <TeacherView drafts={drafts} setTasks={setTasks} onGoToday={() => setTab("today")} />}
        {tab === "today" && <TodayView todayTasks={todayTasks} checks={checks} setChecks={setChecks} />}
      </div>
    </div>
  );
}

// ── ① 계획 세우기 (학생 /plan) ─────────────────────────────────────────────────
function PlanView({ services, tasks, setTasks }: {
  services: typeof SERVICES;
  tasks: DemoTask[];
  setTasks: React.Dispatch<React.SetStateAction<DemoTask[]>>;
}) {
  const [open, setOpen] = useState(tasks.length === 0);
  const [serviceSlug, setServiceSlug] = useState(services[0]?.slug ?? "");
  const [partSlug, setPartSlug] = useState(services[0]?.parts?.[0]?.slug ?? "");
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4]);

  const svc = services.find((s) => s.slug === serviceSlug);
  const parts = svc?.parts ?? [];
  const valid = buildTitle(serviceSlug, partSlug).trim() !== "" && days.length > 0;

  function add() {
    if (!valid) return;
    setTasks((prev) => [{
      id: crypto.randomUUID(), serviceSlug, partSlug,
      title: buildTitle(serviceSlug, partSlug), scheduleDays: [...days], status: "draft",
    }, ...prev]);
    // 다음 입력 초기화
    setDays([0, 1, 2, 3, 4]);
  }

  return (
    <div>
      <div className="mb-7">
        <div className="text-[11px] font-semibold tracking-[0.12em] text-p-muted uppercase mb-1">WEEKLY PLAN</div>
        <div className="text-[28px] font-bold text-black/95 tracking-[-0.8px]">나의 학습 계획</div>
        <div className="mt-1.5 text-sm text-p-secondary">정승원의 주간 계획표</div>
      </div>

      {!open ? (
        <button onClick={() => setOpen(true)}
          className="w-full h-11 rounded-[10px] border-[1.5px] border-dashed border-black/[0.18] bg-transparent text-p-muted text-sm font-semibold cursor-pointer mb-6 flex items-center justify-center gap-1.5">
          + 주간 과제 추가하기
        </button>
      ) : (
        <div className="mb-6">
          <div className="text-[11px] font-bold text-p-muted tracking-[0.06em] mb-3">주간 과제 구성</div>
          <div className="bg-white rounded-xl px-4 py-3.5 mb-3" style={{ border: "1px solid rgba(0,0,0,0.1)" }}>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2 items-center">
                <select value={serviceSlug}
                  onChange={(e) => {
                    const next = services.find((s) => s.slug === e.target.value);
                    setServiceSlug(e.target.value);
                    setPartSlug(next?.parts?.[0]?.slug ?? "");
                  }}
                  style={{ ...SEL, height: 36, padding: "0 30px 0 10px", fontSize: 13, flex: "0 0 auto" }}>
                  {services.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
                </select>
                {parts.length > 0 && (
                  <select value={partSlug} onChange={(e) => setPartSlug(e.target.value)}
                    style={{ ...SEL, height: 36, padding: "0 30px 0 10px", fontSize: 13, flex: "1 1 auto", minWidth: 100 }}>
                    {parts.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
                  </select>
                )}
              </div>
              <DayPicker value={days} onChange={setDays} />
            </div>
          </div>
          <button onClick={add} disabled={!valid}
            className="w-full h-10 rounded-xl border-none text-[13px] font-bold cursor-pointer bg-p-green text-white mb-2"
            style={{ opacity: valid ? 1 : 0.5 }}>
            이 과제 추가 (초안)
          </button>
          <button onClick={() => setOpen(false)}
            className="w-full h-9 rounded-xl text-[12px] font-semibold cursor-pointer bg-white text-p-muted"
            style={{ border: "1px solid rgba(0,0,0,0.1)" }}>
            닫기
          </button>
        </div>
      )}

      {tasks.length > 0 ? (
        <div>
          <div className="text-[11px] font-bold text-p-green tracking-[0.08em] mb-2.5">
            선생님 검토 대기 {tasks.filter((t) => t.status === "draft").length}건 · 확정 {tasks.filter((t) => t.status === "confirmed").length}건
          </div>
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t}
              onDelete={() => setTasks((prev) => prev.filter((x) => x.id !== t.id))} />
          ))}
          <p className="text-[12px] text-p-secondary mt-3 leading-relaxed">
            💡 추가한 과제는 <b>&lsquo;선생님 검토 중&rsquo;</b> 상태예요. 위 <b>②&nbsp;선생님 확정</b> 탭에서 확정하면
            <b> ③&nbsp;오늘 학습</b>에 나타납니다.
          </p>
        </div>
      ) : (
        <div className="py-12 text-center">
          <div className="text-4xl mb-3">📝</div>
          <div className="text-[15px] font-semibold text-black/95 mb-1.5">아직 과제가 없어요</div>
          <div className="text-[13px] text-p-secondary">위 버튼을 눌러 이번 주 학습 계획을 세워보세요!</div>
        </div>
      )}
    </div>
  );
}

// 학생 계획 화면의 과제 카드 (읽기 + 삭제)
function TaskCard({ task, onDelete }: { task: DemoTask; onDelete: () => void }) {
  const svc = SERVICES.find((s) => s.slug === task.serviceSlug);
  const isDraft = task.status === "draft";
  const isToday = task.scheduleDays.includes(todayIdx());
  return (
    <div className="bg-white rounded-xl px-4 py-3.5 mb-2 relative"
      style={{ border: isDraft || isToday ? "1.5px solid #38a848" : "1px solid rgba(0,0,0,0.1)" }}>
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 shrink-0">{svc ? <ServiceIcon service={svc} size={20} /> : <span>📚</span>}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-bold text-black/95">{task.title}</span>
            {isDraft
              ? <span className="text-[11px] rounded-full px-2 py-0.5 font-semibold" style={{ backgroundColor: "#eff6ff", color: "#38a848" }}>검토 중</span>
              : <span className="text-[11px] rounded-full px-2 py-0.5 font-semibold" style={{ backgroundColor: "#f0faf1", color: "#2a8438" }}>확정</span>}
          </div>
          <div className="flex gap-1">
            {DAY_LABELS.map((label, i) => (
              <span key={i} className="flex-1 text-center text-[11px] font-semibold py-1 rounded-md"
                style={{
                  backgroundColor: task.scheduleDays.includes(i) ? "#38a848" : "#f6f5f4",
                  color: task.scheduleDays.includes(i) ? "#fff" : "#a39e98",
                }}>
                {label}
              </span>
            ))}
          </div>
        </div>
        <button onClick={onDelete} title="삭제"
          className="shrink-0 text-p-muted bg-transparent border-none cursor-pointer px-1 py-0.5"><X size={14} /></button>
      </div>
    </div>
  );
}

// ── ② 선생님 확정 (admin) ──────────────────────────────────────────────────────
function TeacherView({ drafts, setTasks, onGoToday }: {
  drafts: DemoTask[];
  setTasks: React.Dispatch<React.SetStateAction<DemoTask[]>>;
  onGoToday: () => void;
}) {
  function confirm(id: string) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: "confirmed" } : t)));
  }
  function reject(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }
  return (
    <div>
      <div className="mb-6">
        <div className="text-[11px] font-semibold tracking-[0.12em] text-p-muted uppercase mb-1">TEACHER REVIEW</div>
        <div className="text-[24px] font-bold text-black/95 tracking-[-0.6px]">학생이 올린 계획 검토</div>
        <div className="mt-1.5 text-sm text-p-secondary">확정하면 학생의 &lsquo;오늘 학습&rsquo;에 반영됩니다.</div>
      </div>

      {drafts.length === 0 ? (
        <div className="py-12 text-center">
          <div className="text-4xl mb-3">✅</div>
          <div className="text-[15px] font-semibold text-black/95 mb-1.5">검토할 초안이 없어요</div>
          <div className="text-[13px] text-p-secondary">① 계획 세우기에서 과제를 먼저 추가해보세요.</div>
        </div>
      ) : (
        <>
          {drafts.map((t) => {
            const svc = SERVICES.find((s) => s.slug === t.serviceSlug);
            return (
              <div key={t.id} className="bg-white rounded-xl px-4 py-3.5 mb-2" style={{ border: "1.5px solid #38a848" }}>
                <div className="flex items-center gap-2.5 mb-2.5">
                  <div className="shrink-0">{svc ? <ServiceIcon service={svc} size={20} /> : <span>📚</span>}</div>
                  <span className="text-sm font-bold text-black/95 flex-1">{t.title}</span>
                  <span className="text-[11px] rounded-full px-2 py-0.5 font-semibold" style={{ backgroundColor: "#eff6ff", color: "#38a848" }}>검토 중</span>
                </div>
                <div className="flex gap-1 mb-3">
                  {DAY_LABELS.map((label, i) => (
                    <span key={i} className="flex-1 text-center text-[11px] font-semibold py-1 rounded-md"
                      style={{
                        backgroundColor: t.scheduleDays.includes(i) ? "#38a848" : "#f6f5f4",
                        color: t.scheduleDays.includes(i) ? "#fff" : "#a39e98",
                      }}>
                      {label}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => reject(t.id)}
                    className="flex-1 h-9 rounded-lg text-[12px] font-semibold cursor-pointer bg-white text-[#c00000]"
                    style={{ border: "1px solid rgba(200,0,0,0.2)" }}>거절</button>
                  <button onClick={() => confirm(t.id)}
                    className="flex-[2] h-9 rounded-lg border-none text-[12px] font-bold cursor-pointer bg-p-green text-white flex items-center justify-center gap-1">
                    <Check size={14} strokeWidth={3} /> 확정
                  </button>
                </div>
              </div>
            );
          })}
          <button onClick={onGoToday}
            className="w-full h-10 rounded-xl border-none text-[13px] font-bold cursor-pointer bg-[#1d4ed8] text-white mt-3">
            오늘 학습 화면 보기 →
          </button>
        </>
      )}
    </div>
  );
}

// ── ③ 오늘 학습 (학생 /learn) ──────────────────────────────────────────────────
function TodayView({ todayTasks, checks, setChecks }: {
  todayTasks: DemoTask[];
  checks: Record<string, DemoCheck>;
  setChecks: React.Dispatch<React.SetStateAction<Record<string, DemoCheck>>>;
}) {
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const dateLabel = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long" }).format(new Date());
  const doneCount = todayTasks.filter((t) => checks[t.id]?.status === "done").length;

  function markDone(id: string) { setChecks((p) => ({ ...p, [id]: { status: "done" } })); }
  function submitReason(id: string, reason: string) {
    setChecks((p) => ({ ...p, [id]: { status: "not_done", reason, reasonNote: note.trim() || undefined } }));
    setReasonFor(null); setNote("");
  }

  return (
    <div>
      <div className="mb-5">
        <div className="text-[11px] font-semibold tracking-[0.12em] text-p-muted uppercase mb-1">TODAY</div>
        <div className="text-[24px] font-bold text-black/95 tracking-[-0.6px]">{dateLabel}</div>
        <div className="mt-1.5 text-sm text-p-secondary">오늘 할 일 {todayTasks.length}개 · 완료 {doneCount}개</div>
      </div>

      {todayTasks.length === 0 ? (
        <div className="bg-white rounded-2xl border border-black/10">
          <div className="px-6 py-10 text-center text-[13px] text-p-muted">오늘 예정된 과제가 없어요</div>
          <div className="px-6 pb-6 text-center text-[12px] text-p-secondary">
            ② 선생님 확정에서 <b>오늘 요일</b>이 포함된 과제를 확정하면 여기에 나타납니다.
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-black/10 overflow-hidden">
          {todayTasks.map((task, index) => {
            const svc = SERVICES.find((s) => s.slug === task.serviceSlug);
            const check = checks[task.id];
            const isDone = check?.status === "done";
            const isNotDone = check?.status === "not_done";
            const reasonInfo = check?.reason ? REASONS_6HDL.find((r) => r.slug === check.reason) : null;
            return (
              <div key={task.id}>
                <div className="flex items-center px-5 py-[15px] gap-3.5">
                  <div onClick={() => !isDone && markDone(task.id)}
                    className="w-[26px] h-[26px] rounded-full shrink-0 flex items-center justify-center"
                    style={{
                      backgroundColor: isDone ? "#2a9d99" : isNotDone ? "#fff5f5" : "transparent",
                      border: isDone ? "2px solid #2a9d99" : isNotDone ? "2px solid #c00000" : "2px solid rgba(0,0,0,0.2)",
                      cursor: isDone ? "default" : "pointer",
                    }}>
                    {isDone && <span className="text-white text-xs font-bold leading-none">✓</span>}
                    {isNotDone && <span className="text-[#c00000] text-xs font-bold leading-none">✕</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-[15px] font-semibold"
                      style={{ color: isDone ? "#a39e98" : "rgba(0,0,0,0.95)", textDecoration: isDone ? "line-through" : "none" }}>
                      {svc && <ServiceIcon service={svc} size={18} />}
                      <span className="truncate">{task.title}</span>
                    </div>
                    {isNotDone && reasonInfo && (
                      <div className="text-[11px] text-[#c00000] font-medium mt-0.5 pl-6">
                        {reasonInfo.icon} {reasonInfo.name}{check?.reasonNote ? ` · ${check.reasonNote}` : ""}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isDone ? (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#f0faf1] text-[#2a8438]">완료</span>
                    ) : isNotDone ? (
                      <button onClick={() => markDone(task.id)}
                        className="text-xs font-semibold px-3 py-1.5 rounded bg-transparent text-p-muted border border-black/10 cursor-pointer">완료로 변경</button>
                    ) : (
                      <button onClick={() => { setReasonFor(task.id); setNote(""); }}
                        className="text-xs font-medium px-2.5 py-1.5 rounded bg-transparent text-p-muted border border-black/10 cursor-pointer">못했어요</button>
                    )}
                  </div>
                </div>

                {reasonFor === task.id && (
                  <div className="px-5 pb-4">
                    <div className="bg-p-bg rounded-[10px] p-4">
                      <div className="text-[11px] font-bold text-p-muted mb-3 tracking-[0.06em]">왜 못했나요?</div>
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        {REASONS_6HDL.map((r) => (
                          <button key={r.slug} onClick={() => submitReason(task.id, r.slug)}
                            className="flex flex-col items-center gap-1 py-2.5 rounded-lg border border-black/10 bg-white cursor-pointer">
                            <span className="text-lg">{r.icon}</span>
                            <span className="text-[11px] font-semibold text-p-secondary">{r.name}</span>
                          </button>
                        ))}
                      </div>
                      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모 (선택)"
                        className="w-full h-[32px] rounded-[7px] px-2.5 text-xs text-black/95 bg-white box-border mb-2"
                        style={{ border: "1px solid rgba(0,0,0,0.1)" }} />
                      <button onClick={() => { setReasonFor(null); setNote(""); }}
                        className="w-full h-[30px] rounded-[7px] text-xs font-semibold cursor-pointer bg-white text-p-muted"
                        style={{ border: "1px solid rgba(0,0,0,0.1)" }}>취소</button>
                    </div>
                  </div>
                )}

                {index !== todayTasks.length - 1 && <div className="h-px bg-black/5 mx-5" />}
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[12px] text-p-secondary mt-4 leading-relaxed">
        💡 실제 화면에서는 <b>확정된 과제 중 오늘 요일</b>에 해당하는 것만 자동으로 표시되고,
        완료/못했어요 기록은 선생님·학부모 화면에서 함께 확인됩니다.
      </p>
    </div>
  );
}
