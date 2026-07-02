"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  collection,
  addDoc, doc, serverTimestamp,
  getDocs, query, where, deleteDoc, Timestamp, onSnapshot, orderBy,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { SERVICES } from "@/data/site";
import { T } from "@/lib/design-tokens";
import type { LearningLog, AutoStatus, Task, TaskCheck } from "@/lib/types";
import { useChildData } from "@/lib/hooks/useChildData";
import { useAttendanceSession } from "@/lib/hooks/useAttendanceSession";
import { useWindowTracking } from "@/lib/hooks/useWindowTracking";
import { todayStr, getWeekDates, formatDateHeader, calcStreak } from "@/lib/learn-utils";
import { PageWrap } from "@/components/ui/page-wrap";
import { Card } from "@/components/ui/card";
import { CenterMsg } from "@/components/ui/center-msg";
import { TaskChecklist } from "./task-checklist";
import { ConsentModal } from "./consent-modal";
import { AttendanceWidget } from "./attendance-widget";
import { ScreenshotModal } from "./screenshot-modal";

// 자동 인증(Classcard 스크래핑)을 사용하는 서비스 slug 목록
const AUTO_VERIFIED_SLUGS = new Set(["classcard-middle", "autovoca", "dailykor"]);

// ─── Demo data ────────────────────────────────────────────────────────────────

function buildDemoLogs(): LearningLog[] {
  const logs: LearningLog[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = d.toLocaleDateString("sv-SE");
    logs.push({ id: `demo-log-${i}-a`, serviceSlug: "class5", date });
    if (i > 0) logs.push({ id: `demo-log-${i}-b`, serviceSlug: "dailykor", date });
  }
  return logs;
}

const DEMO_SUBSCRIPTIONS = [
  { id: "demo-sub-1", childId: "", serviceSlug: "class5", status: "active", monthlyPrice: 0, startDate: null, endDate: null },
  { id: "demo-sub-2", childId: "", serviceSlug: "dailykor", status: "active", monthlyPrice: 0, startDate: null, endDate: null },
  { id: "demo-sub-3", childId: "", serviceSlug: "classcard-middle", status: "active", monthlyPrice: 0, startDate: null, endDate: null },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function LearnDashboard({
  userId,
  userName,
  userEmail,
  isDemo = false,
  readOnly = false,
  previewChildId,
  previewLoginId,
}: {
  userId: string;
  userName: string | null;
  userEmail?: string | null;
  isDemo?: boolean;
  readOnly?: boolean;
  previewChildId?: string;
  previewLoginId?: string;
}) {
  const {
    childId, childName, childGrade, childLoginId, subscriptions,
    logs, setLogs, allLogs, setAllLogs,
    todayAttended, ready,
  } = useChildData({
    userId,
    userEmail,
    isDemo,
    previewChildId,
    previewLoginId,
    demoData: isDemo ? {
      subscriptions: DEMO_SUBSCRIPTIONS,
      logs: [{ id: "demo-log-0-a", serviceSlug: "class5", date: todayStr() }],
      allLogs: buildDemoLogs(),
    } : undefined,
  });

  // 태스크 + 체크 상태
  const [todayTasks, setTodayTasks] = useState<Task[]>([]);
  const [todayTaskChecks, setTodayTaskChecks] = useState<TaskCheck[]>([]);
  // 확정 과제 총 개수(요일 무관) — 0이면 아직 학습 계획이 없는 첫 진입 상태
  const [confirmedCount, setConfirmedCount] = useState(0);

  // 오늘 요일에 해당하는 확정 태스크 구독
  useEffect(() => {
    if (!childId || isDemo) return;
    const unsub = onSnapshot(
      query(collection(db, "tasks"), where("childId", "==", childId), where("status", "==", "confirmed")),
      (snap) => {
        const today = new Date();
        const dow = (today.getDay() + 6) % 7; // 0=월
        const tasks: Task[] = [];
        snap.docs.forEach(d => {
          const scheduleDays = d.data().scheduleDays ?? [];
          if (!scheduleDays.includes(dow)) return;
          tasks.push({
            id: d.id, childId: d.data().childId,
            serviceSlug: d.data().serviceSlug,
            partSlug: d.data().partSlug ?? null,
            title: d.data().title,
            scheduleDays,
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
            createdAt: null, confirmedAt: null,
          });
        });
        setTodayTasks(tasks);
        setConfirmedCount(snap.docs.length);
      }
    );
    return unsub;
  }, [childId, isDemo]);

  // 오늘 taskChecks 구독
  useEffect(() => {
    if (!childId || isDemo) return;
    const unsub = onSnapshot(
      query(collection(db, "taskChecks"), where("childId", "==", childId), where("date", "==", todayStr())),
      (snap) => setTodayTaskChecks(snap.docs.map(d => ({
        id: d.id,
        taskId: d.data().taskId ?? "",
        childId: d.data().childId ?? "",
        date: d.data().date ?? "",
        status: d.data().status ?? "error",
        detail: d.data().detail ?? null,
        reason: d.data().reason ?? null,
        reasonNote: d.data().reasonNote ?? null,
        checkedBy: d.data().checkedBy ?? "student",
        checkedAt: null,
      })))
    );
    return unsub;
  }, [childId, isDemo]);

  const [submitting, setSubmitting] = useState<string | null>(null);
  const [startedSlugs, setStartedSlugs] = useState<Set<string>>(new Set());
  const [savedSlug, setSavedSlug] = useState<string | null>(null);
  const [showMonitoringToast, setShowMonitoringToast] = useState(false);
  const [showScreenshot, setShowScreenshot] = useState<string | null>(null);
  const isMobile = typeof navigator !== "undefined" && !navigator.mediaDevices?.getDisplayMedia;

  function showToast() {
    setShowMonitoringToast(true);
    setTimeout(() => setShowMonitoringToast(false), 2500);
  }

  const {
    attendanceState, setAttendanceState,
    sessionId, sessionStart,
    interrupted, setInterrupted,
    interruptCount, setInterruptCount,
    sessionIdRef,
    startScreenShare, endSession, restoreSession,
  } = useAttendanceSession({ childId, isDemo, onMobileStart: showToast });

  const [timeSummary, setTimeSummary] = useState<Record<string, number>>({});

  const { windowsRef, handleWindowOpened, recordSlugTime, getTimeSummary } = useWindowTracking({
    active: attendanceState === "sharing",
    childId,
    isDemo,
    sessionIdRef,
  });

  // ── 세션 복원 (새로고침 대응) ──
  const sessionKey = childId ? `plantor_session_${childId}` : null;

  useEffect(() => {
    if (!sessionKey || attendanceState !== "idle") return;
    try {
      const saved = localStorage.getItem(sessionKey);
      if (!saved) return;
      const data = JSON.parse(saved) as {
        date: string; attendanceState: string; sessionId: string | null;
        sessionStart: string; startedSlugs: string[];
      };
      if (data.date !== todayStr()) { localStorage.removeItem(sessionKey); return; }
      if (data.attendanceState === "sharing" || data.attendanceState === "done") {
        if (data.startedSlugs?.length) setStartedSlugs(new Set(data.startedSlugs));
        restoreSession(data);
      }
    } catch { localStorage.removeItem(sessionKey!); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  useEffect(() => {
    if (!sessionKey) return;
    if (attendanceState === "idle" || attendanceState === "consent") return;
    if (attendanceState === "done") { localStorage.removeItem(sessionKey); return; }
    localStorage.setItem(sessionKey, JSON.stringify({
      date: todayStr(),
      attendanceState,
      sessionId,
      sessionStart: sessionStart?.toISOString() ?? null,
      startedSlugs: [...startedSlugs],
    }));
  }, [attendanceState, sessionId, sessionStart, startedSlugs, sessionKey]);

  // 탭 이탈 감지 (PC 전용)
  useEffect(() => {
    if (attendanceState !== "sharing" || isMobile) return;
    let hiddenAt: number | null = null;
    function handleVisibility() {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else if (hiddenAt !== null) {
        const secs = Math.round((Date.now() - hiddenAt) / 1000);
        hiddenAt = null;
        if (secs > 3 && windowsRef.current.size === 0) {
          setInterruptCount((c) => c + 1);
          alert(`학습 외 화면에 머물렀어요 (${secs}초). 수업 화면으로 돌아왔어요! 👀`);
        }
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [attendanceState, isMobile, windowsRef, setInterruptCount]);

  // ── 수업 종료 래퍼 ──
  const handleEndSession = useCallback(async () => {
    const doneSlugs = new Set(logs.filter((l) => !l.flagged).map((l) => l.serviceSlug));
    setTimeSummary(getTimeSummary());
    await endSession(startedSlugs, doneSlugs);
  }, [endSession, startedSlugs, logs, getTimeSummary]);

  // ── 인증샷 제출 → 완료 처리 ──
  const handleScreenshotSubmit = useCallback(async (blob: Blob) => {
    const slug = showScreenshot;
    setShowScreenshot(null);
    if (!slug) return;
    recordSlugTime(slug);
    const slugDuration = getTimeSummary()[slug] ?? 0;
    let screenshotUrl: string | null = null;
    if (!isDemo) {
      try {
        const path = `screenshots/${childId}/${slug}_${Date.now()}.jpg`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, blob);
        screenshotUrl = await getDownloadURL(storageRef);
      } catch (err) {
        alert("인증샷 전송 중 오류가 발생했어요. 다시 시도해 주세요.");
        return;
      }
    }
    await markDone(slug, screenshotUrl ?? undefined, slugDuration);
    setSavedSlug(slug);
    setTimeout(() => setSavedSlug(null), 2500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showScreenshot, childId, isDemo, recordSlugTime]);

  async function markDone(serviceSlug: string, screenshotUrl?: string, durationSeconds = 0) {
    if (!childId || readOnly) return;
    setSubmitting(serviceSlug);
    try {
      if (isDemo) {
        await new Promise((r) => setTimeout(r, 300));
        setLogs((prev) => [...prev, { id: `demo-${Date.now()}`, serviceSlug, date: todayStr() }]);
        setAllLogs((prev) => [...prev, { id: `demo-all-${Date.now()}`, serviceSlug, date: todayStr() }]);
        return;
      }
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 90);
      const displayId = childLoginId || `pln_${childId.slice(0, 4).toLowerCase()}`;
      await addDoc(collection(db, "learningLogs"), {
        childId, serviceSlug, date: todayStr(), method: "self", confirmedAt: serverTimestamp(),
        screenshotUrl: screenshotUrl ?? null,
        screenshotExpiresAt: screenshotUrl ? Timestamp.fromDate(expiresAt) : null,
        grade: childGrade,
        displayId,
        durationSeconds: durationSeconds > 0 ? durationSeconds : null,
        reportCount: 0,
        flagged: false,
      });
    } catch (err) { alert(err instanceof Error ? err.message : "기록 중 오류가 발생했습니다."); }
    finally { setSubmitting(null); }
  }

  async function handleRedo(serviceSlug: string) {
    if (!childId || readOnly) return;
    setSubmitting(serviceSlug);
    try {
      if (isDemo) {
        await new Promise((r) => setTimeout(r, 200));
        setLogs((prev) => prev.filter((l) => l.serviceSlug !== serviceSlug));
        setAllLogs((prev) => prev.filter((l) => !(l.serviceSlug === serviceSlug && l.date === todayStr())));
        return;
      }
      const snap = await getDocs(query(
        collection(db, "learningLogs"),
        where("childId", "==", childId),
        where("serviceSlug", "==", serviceSlug),
        where("date", "==", todayStr()),
      ));
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    } catch (err) { alert(err instanceof Error ? err.message : "오류가 발생했습니다."); }
    finally { setSubmitting(null); }
  }

  if (!ready) return <CenterMsg>로딩 중…</CenterMsg>;

  if (!childId) {
    return (
      <PageWrap paddingBottom="96px">
        <Card style={{ maxWidth: 440, margin: "0 auto", padding: "40px 32px", textAlign: "center" }}>
          <div className="mb-4"><img src="/favicon.svg" alt="" width={56} height={56} /></div>
          <h2 className="m-0 text-[22px] font-bold text-black/95 tracking-[-0.25px]">학생 정보가 연결되지 않았습니다</h2>
          <p className="mt-3 text-sm text-p-secondary leading-relaxed">부모님이 서비스를 신청하면 학습 홈이 활성화됩니다.</p>
        </Card>
      </PageWrap>
    );
  }

  const streak = calcStreak(allLogs);
  const todayDone = todayTasks.filter(t => todayTaskChecks.find(c => c.taskId === t.id && c.status === "done")).length;
  const todayTotal = todayTasks.length;
  const allDone = todayTotal > 0 && todayDone === todayTotal;

  const autoStatusMap: Record<string, AutoStatus> = {};
  for (const sub of subscriptions) {
    if (AUTO_VERIFIED_SLUGS.has(sub.serviceSlug)) {
      const autoLog = logs.find((l) => l.serviceSlug === sub.serviceSlug && l.method === "auto");
      autoStatusMap[sub.serviceSlug] = autoLog?.autoStatus ?? "시작전";
    }
  }

  const doneSlugs = new Set(
    logs
      .filter((l) => !l.flagged)
      .filter((l) => l.method !== "auto" || l.autoStatus === "완료")
      .map((l) => l.serviceSlug)
  );
  const logDates = new Set(allLogs.map((l) => l.date));
  const today = todayStr();
  const weekDates = getWeekDates();
  const { month, day, weekday } = formatDateHeader();
  const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

  if (attendanceState === "done") {
    const newStreak = calcStreak([...allLogs, { id: "new", serviceSlug: subscriptions[0]?.serviceSlug ?? "", date: todayStr() }]);
    const weekDoneCount = weekDates.filter((d) => d <= today && logDates.has(d)).length;
    const weekPastCount = weekDates.filter((d) => d <= today).length;

    return (
      <PageWrap paddingBottom="96px">
        <div className="max-w-[480px] mx-auto">
          <Card style={{ padding: "40px 28px" }}>
            <div className="text-center mb-7">
              <div className="text-[52px] mb-3">🎉</div>
              <h2 className="m-0 mb-1.5 text-[22px] font-extrabold text-black/95 tracking-[-0.4px]">오늘 학습 완료!</h2>
              <p className="m-0 text-sm text-p-secondary">수고했어, {childName}! 오늘도 멋지게 해냈어.</p>
            </div>

            {subscriptions.length > 0 && (
              <div className="bg-p-bg rounded-[10px] px-4 py-3.5 mb-5 flex flex-col gap-2.5">
                {subscriptions.map((sub) => {
                  const svc = SERVICES.find((s) => s.slug === sub.serviceSlug);
                  const secs = timeSummary[sub.serviceSlug] ?? 0;
                  const timeLabel = secs >= 60
                    ? `${Math.floor(secs / 60)}분 ${secs % 60 > 0 ? `${secs % 60}초` : ""}`.trim()
                    : secs > 0 ? `${secs}초` : null;
                  return (
                    <div key={sub.id} className="flex items-center gap-2.5">
                      <span className="text-base shrink-0">✅</span>
                      <span className="text-sm font-semibold text-black/95 flex-1">{svc?.name ?? sub.serviceSlug}</span>
                      {timeLabel && (
                        <span className="text-xs text-p-muted font-medium">⏱ {timeLabel}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2.5 mb-6">
              <div className="flex-1 bg-p-bg rounded-[10px] py-3 text-center">
                <div className="text-xl font-extrabold text-black/95">🔥 {newStreak}일</div>
                <div className="text-[11px] text-p-muted mt-0.5">연속 학습</div>
              </div>
              <div className="flex-1 bg-p-bg rounded-[10px] py-3 text-center">
                <div className="text-xl font-extrabold text-black/95">
                  {weekDoneCount}<span className="text-[13px] font-medium text-p-muted">/{weekPastCount}일</span>
                </div>
                <div className="text-[11px] text-p-muted mt-0.5">이번 주</div>
              </div>
            </div>

            <button
              onClick={() => setAttendanceState("idle")}
              className="w-full h-12 rounded-xl border-none bg-p-teal text-white text-[15px] font-bold cursor-pointer tracking-[-0.1px]"
            >
              학습 마치기
            </button>
          </Card>
        </div>
      </PageWrap>
    );
  }

  return (
    <PageWrap paddingBottom="96px">
      <div className="max-w-[480px] mx-auto">

        {attendanceState === "consent" && (
          <ConsentModal onAgree={() => { setAttendanceState("idle"); startScreenShare(); }} onCancel={() => setAttendanceState("idle")} />
        )}
        {showScreenshot && (
          <ScreenshotModal onSubmit={handleScreenshotSubmit} onCancel={() => setShowScreenshot(null)} />
        )}
        {attendanceState === "sharing" && sessionStart && (
          <AttendanceWidget startTime={sessionStart} interrupted={interrupted} onEnd={handleEndSession} onRestart={startScreenShare} />
        )}
        {savedSlug && (
          <div
            className="fixed bottom-[88px] left-1/2 -translate-x-1/2 z-[950] bg-p-teal text-white text-sm font-bold px-6 py-3 rounded-full whitespace-nowrap pointer-events-none"
            style={{ boxShadow: T.shadowFloat }}
          >
            📸 인증샷 저장 완료!
          </div>
        )}
        {showMonitoringToast && (
          <div
            className="fixed bottom-[88px] left-1/2 -translate-x-1/2 z-[950] bg-p-teal text-white text-sm font-bold px-6 py-3 rounded-full whitespace-nowrap pointer-events-none"
            style={{ boxShadow: T.shadowFloat }}
          >
            학습 모니터링을 시작합니다
          </div>
        )}

        {/* 데모 배너 */}
        {isDemo && (
          <div className="mb-6 px-4 py-2.5 bg-[#fffbeb] border-[1.5px] border-[#f59e0b] rounded flex items-center justify-between gap-3">
            <span className="text-[13px] font-semibold text-[#92400e]">👀 데모 모드 — 실제 데이터가 아닙니다</span>
            <a href="/account" className="text-xs font-semibold text-p-green no-underline shrink-0">로그인 →</a>
          </div>
        )}

        {/* 날짜 헤더 */}
        <div className="mb-8">
          <div className="text-[11px] font-semibold tracking-[0.12em] text-p-muted uppercase mb-1">{weekday}</div>
          <div className="text-[38px] font-bold text-black/95 tracking-[-1.5px] leading-[1.05]">{month} {day}</div>
          <div className="mt-2 text-[15px] font-medium text-p-secondary flex items-center gap-1.5">
            안녕, {childName || userName}! <img src="/favicon.svg" alt="" width={16} height={16} />
          </div>
        </div>

        {/* 주간 스트릭 바 */}
        <Card style={{ padding: "14px 20px", marginBottom: 12 }}>
          <div className="flex justify-between items-center">
            {weekDates.map((date, i) => {
              const isToday = date === today;
              const isPast = date < today;
              const isDone = logDates.has(date);
              let bgColor = "transparent";
              let borderStyle = "1.5px solid rgba(0,0,0,0.1)";
              let textColor: string = "#a39e98";
              if (isDone) { bgColor = "#38a848"; borderStyle = "2px solid #38a848"; textColor = "#ffffff"; }
              else if (isToday) { borderStyle = "2px solid rgba(0,0,0,0.95)"; textColor = "rgba(0,0,0,0.95)"; }
              else if (!isPast) { borderStyle = "1.5px solid rgba(0,0,0,0.08)"; }
              return (
                <div key={date} className="flex flex-col items-center gap-[5px]">
                  <span
                    className="text-[10px] font-semibold tracking-[0.06em] uppercase"
                    style={{ color: isToday ? "rgba(0,0,0,0.95)" : "#a39e98" }}
                  >{DAY_LABELS[i]}</span>
                  <div
                    className="w-[30px] h-[30px] rounded-full flex items-center justify-center"
                    style={{ backgroundColor: bgColor, border: borderStyle }}
                  >
                    {isDone
                      ? <span className="text-white text-xs font-bold">✓</span>
                      : <span className="text-[10px]" style={{ fontWeight: isToday ? 700 : 400, color: textColor }}>{new Date(date + "T00:00:00").getDate()}</span>
                    }
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* 스트릭 stat */}
        <div className="flex items-center gap-2 px-1 py-2 mb-5">
          <span className="text-[13px] font-semibold text-p-secondary">🔥 {streak}일 연속</span>
          <span className="text-black/15">·</span>
          <span className="text-[13px] font-semibold text-p-secondary">오늘 {todayDone}/{todayTotal} 완료</span>
        </div>

        {/* 전체 완료 배너 */}
        {allDone && todayTotal > 0 && (
          <div className="mb-4 px-5 py-3.5 bg-[#edfaf8] border-[1.5px] border-p-teal rounded-xl flex items-center gap-3">
            <span className="text-[22px] shrink-0">🎉</span>
            <div>
              <div className="text-[15px] font-bold text-p-teal tracking-[-0.1px]">오늘 학습 완료!</div>
              <div className="text-xs text-p-secondary mt-0.5">내일도 이렇게 해보자!</div>
            </div>
          </div>
        )}

        {/* 출석하기 */}
        {attendanceState === "idle" && (
          <div className="mb-4">
            {todayAttended ? (
              <div className="px-5 py-3 bg-[#edfaf8] border-[1.5px] border-p-teal rounded-xl flex items-center gap-2.5">
                <span className="text-[18px]">✅</span>
                <span className="text-sm font-semibold text-p-teal">오늘 출석 완료</span>
              </div>
            ) : readOnly ? null : (
              <button
                onClick={() => setAttendanceState("consent")}
                className="w-full h-12 rounded-xl border-none bg-p-teal text-white text-[15px] font-bold cursor-pointer tracking-[-0.1px] flex items-center justify-center gap-2"
              >
                <img src="/favicon.svg" alt="" width={16} height={16} /><span>출석하기 (화면 공유 시작)</span>
              </button>
            )}
          </div>
        )}

        {/* 첫 진입 온보딩: 확정 과제가 하나도 없으면 학습 계획부터 안내 */}
        {!isDemo && confirmedCount === 0 ? (
          <Card style={{ padding: "32px 24px", textAlign: "center" }}>
            <div className="text-4xl mb-3">📅</div>
            <h2 className="m-0 text-[18px] font-bold text-black/95 tracking-[-0.2px]">먼저 학습 계획을 세워볼까요?</h2>
            <p className="mt-2.5 text-[13px] text-p-secondary leading-relaxed">
              이번 주에 어떤 과목을 며칠 할지 정하면,<br />
              매일 &lsquo;오늘 할 일&rsquo;이 이 화면에 나타나요.
            </p>
            <Link
              href="/plan"
              className="inline-flex items-center justify-center gap-1 mt-5 h-11 px-6 rounded-xl bg-p-green text-white text-sm font-bold no-underline"
            >
              학습 계획 세우러 가기 →
            </Link>
            <p className="mt-4 text-[11px] text-p-muted leading-relaxed">
              이미 계획을 세웠다면, 선생님이 확정하면 여기에 표시돼요.
            </p>
          </Card>
        ) : (
          <>
            {/* 오늘 할 일 (태스크 기반) */}
            <div className="text-[10px] font-bold tracking-[0.1em] text-p-muted uppercase pl-1 mb-1.5">오늘 할 일</div>
            <Card style={{ overflow: "hidden", padding: 0 }}>
              {childId && (
                <TaskChecklist
                  tasks={todayTasks}
                  taskChecks={todayTaskChecks}
                  childId={childId}
                  date={todayStr()}
                  readOnly={readOnly}
                />
              )}
            </Card>
          </>
        )}

        {/* 배지 */}
        {streak >= 3 && (
          <Card style={{ marginTop: 12, padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
            <span className="text-[22px] shrink-0">{streak >= 30 ? "🏆" : streak >= 14 ? "🥇" : streak >= 7 ? "🥈" : "🥉"}</span>
            <div>
              <div className="text-sm font-semibold text-black/95 tracking-[-0.1px]">
                {streak >= 30 ? "30일 연속 달성!" : streak >= 14 ? "2주 연속 공부 중" : streak >= 7 ? "일주일 연속 공부 중" : "3일 연속 공부 중"}
              </div>
              <div className="text-xs text-p-secondary mt-0.5">잘하고 있어, 계속 이어가자!</div>
            </div>
          </Card>
        )}

      </div>
    </PageWrap>
  );
}
