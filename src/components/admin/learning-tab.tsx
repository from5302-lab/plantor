"use client";

import { useEffect, useState } from "react";
import {
  addDoc, collection, deleteDoc, doc,
  onSnapshot, query, serverTimestamp, where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { T } from "@/lib/design-tokens";
import { SERVICES } from "@/data/site";
import { ServiceIcon } from "@/components/ui/service-icon";
import { getWeekDates, todayStr } from "@/lib/learn-utils";
import type { MemberChild, MemberSub } from "./members-tab";

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
const GRID = "140px repeat(7, 1fr)";

type WeekLog = { id: string; childId: string; serviceSlug: string; date: string };
type TimeLog = { childId: string; serviceSlug: string; date: string; durationSeconds: number };

export function LearningTab({
  allChildren,
  allSubs,
  onResetAttendance,
}: {
  allChildren: MemberChild[];
  allSubs: MemberSub[];
  onResetAttendance?: (childId: string, childName: string) => void;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekLogs, setWeekLogs] = useState<WeekLog[]>([]);
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [toggling, setToggling] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const weekDates = getWeekDates(weekOffset);
  const today = todayStr();
  const weekLabel = weekOffset === 0 ? "이번 주" : weekOffset === -1 ? "지난 주" : `${Math.abs(weekOffset)}주 전`;

  useEffect(() => {
    const dates = getWeekDates(weekOffset);
    const unsubLogs = onSnapshot(
      query(collection(db, "learningLogs"), where("date", ">=", dates[0]), where("date", "<=", dates[6])),
      (snap) => setWeekLogs(snap.docs.map((d) => ({
        id: d.id, childId: d.data().childId ?? "", serviceSlug: d.data().serviceSlug ?? "", date: d.data().date ?? "",
      })))
    );
    const unsubTime = onSnapshot(
      query(collection(db, "learningTimeLogs"), where("date", ">=", dates[0]), where("date", "<=", dates[6])),
      (snap) => setTimeLogs(snap.docs.map((d) => ({
        childId: d.data().childId ?? "", serviceSlug: d.data().serviceSlug ?? "",
        date: d.data().date ?? "", durationSeconds: d.data().durationSeconds ?? 0,
      })))
    );
    return () => { unsubLogs(); unsubTime(); };
  }, [weekOffset]);

  const q = searchQuery.trim().toLowerCase();
  const activeChildren = allChildren
    .filter((c) => allSubs.some((s) => s.childId === c.id && s.status === "active"))
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.loginId.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  const pastDates = weekDates.filter((d) => d <= today);
  let totalPossible = 0, totalDone = 0;
  activeChildren.forEach((child) => {
    const subs = allSubs.filter((s) => s.childId === child.id && s.status === "active");
    subs.forEach((sub) => {
      pastDates.forEach((date) => {
        totalPossible++;
        if (weekLogs.some((l) => l.childId === child.id && l.serviceSlug === sub.serviceSlug && l.date === date)) totalDone++;
      });
    });
  });
  const pct = totalPossible > 0 ? Math.round((totalDone / totalPossible) * 100) : 0;

  async function handleToggle(childId: string, serviceSlug: string, date: string) {
    const key = `${childId}-${serviceSlug}-${date}`;
    if (toggling) return;
    const existing = weekLogs.find((l) => l.childId === childId && l.serviceSlug === serviceSlug && l.date === date);
    setToggling(key);
    try {
      if (existing) {
        await deleteDoc(doc(db, "learningLogs", existing.id));
      } else {
        await addDoc(collection(db, "learningLogs"), {
          childId, serviceSlug, date, method: "admin", confirmedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "오류");
    } finally {
      setToggling(null);
    }
  }

  return (
    <>
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="bg-transparent border border-black/10 rounded-md cursor-pointer text-[15px] px-2.5 py-0.5 text-p-muted"
          >‹</button>
          <span className="text-sm font-semibold text-black/95 min-w-[60px] text-center">{weekLabel}</span>
          <button
            onClick={() => setWeekOffset((w) => Math.min(0, w + 1))}
            disabled={weekOffset === 0}
            className="bg-transparent border border-black/10 rounded-md text-[15px] px-2.5 py-0.5"
            style={{ cursor: weekOffset === 0 ? "default" : "pointer", color: weekOffset === 0 ? "rgba(0,0,0,0.2)" : "#a39e98" }}
          >›</button>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-p-muted pointer-events-none">🔍</span>
            <input
              type="text"
              placeholder="이름·아이디"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border border-black/10 rounded-full py-[3px] pr-2.5 pl-6 text-xs outline-none w-[120px] text-black/95 bg-white"
            />
          </div>
          <span className="text-xs text-p-muted">{totalDone}/{totalPossible}건</span>
          <span
            className="text-base font-extrabold"
            style={{ color: pct >= 80 ? "#1a7f4b" : pct >= 50 ? "#92660a" : "#615d59" }}
          >{pct}%</span>
        </div>
      </div>

      {activeChildren.length === 0 ? (
        <div className="rounded-xl border-[1.5px] border-dashed border-black/[0.12] bg-white py-16 px-6 text-center text-sm text-p-muted">
          활성 구독 학생이 없습니다.
        </div>
      ) : (
        <>
          {/* 날짜 헤더 행 */}
          <div className="mb-1.5 px-4" style={{ display: "grid", gridTemplateColumns: GRID, gap: 0 }}>
            <div />
            {weekDates.map((date, i) => {
              const isToday = date === today;
              return (
                <div key={date} className="text-center">
                  <div
                    className="text-[10px] font-semibold leading-[1.3]"
                    style={{ color: isToday ? "rgba(0,0,0,0.95)" : "#a39e98" }}
                  >{DAY_LABELS[i]}</div>
                  <div
                    className="text-[10px]"
                    style={{ fontWeight: isToday ? 700 : 400, color: isToday ? "rgba(0,0,0,0.95)" : "#a39e98" }}
                  >
                    {new Date(date + "T00:00:00").getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 자녀별 카드 */}
          <div className="flex flex-col gap-2">
            {activeChildren.map((child) => {
              const childSubs = allSubs.filter((s) => s.childId === child.id && s.status === "active");
              const childTotal = childSubs.length * pastDates.length;
              const childDone = childSubs.reduce((sum, sub) =>
                sum + pastDates.filter((date) =>
                  weekLogs.some((l) => l.childId === child.id && l.serviceSlug === sub.serviceSlug && l.date === date)
                ).length, 0);
              const childPct = childTotal > 0 ? Math.round((childDone / childTotal) * 100) : 0;

              return (
                <div key={child.id} className="bg-white border border-black/10 rounded-xl overflow-hidden" style={{ boxShadow: T.shadow }}>
                  {/* 자녀 헤더 */}
                  <div className="flex items-center justify-between px-4 py-2 bg-p-bg border-b border-black/[0.06]">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[13px] text-black/95">{child.name}</span>
                      {child.grade && <span className="text-[11px] text-p-muted">{child.grade}</span>}
                      {onResetAttendance && (
                        <button
                          onClick={() => onResetAttendance(child.id, child.name)}
                          title="오늘 출석 초기화"
                          className="bg-transparent border-none cursor-pointer text-[15px] px-0.5 py-0 leading-none"
                        >🔄</button>
                      )}
                    </div>
                    <span
                      className="text-xs font-bold"
                      style={{ color: childPct >= 80 ? "#1a7f4b" : childPct >= 50 ? "#92660a" : "#a39e98" }}
                    >
                      {childDone}/{childTotal}일 ({childPct}%)
                    </span>
                  </div>

                  {/* 서비스별 행 */}
                  {childSubs.map((sub, idx) => {
                    const svc = SERVICES.find((s) => s.slug === sub.serviceSlug);
                    return (
                      <div
                        key={sub.id}
                        className="items-center px-4 py-2"
                        style={{
                          display: "grid",
                          gridTemplateColumns: GRID,
                          alignItems: "center",
                          borderBottom: idx < childSubs.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
                        }}
                      >
                        {/* 서비스명 */}
                        <div className="flex items-center gap-[5px] text-xs text-p-secondary pr-2 overflow-hidden">
                          {svc && <ServiceIcon service={svc} size={13} />}
                          <span className="overflow-hidden text-ellipsis whitespace-nowrap">{svc?.name ?? sub.serviceSlug}</span>
                        </div>

                        {/* 날짜 셀 */}
                        {weekDates.map((date) => {
                          const isFuture = date > today;
                          const isToday = date === today;
                          const isDone = weekLogs.some((l) => l.childId === child.id && l.serviceSlug === sub.serviceSlug && l.date === date);
                          const key = `${child.id}-${sub.serviceSlug}-${date}`;
                          const isThis = toggling === key;
                          const secs = timeLogs.filter((l) => l.childId === child.id && l.serviceSlug === sub.serviceSlug && l.date === date).reduce((s, l) => s + l.durationSeconds, 0);
                          const minLabel = secs >= 60 ? `${Math.floor(secs / 60)}분` : secs > 0 ? `${secs}초` : null;

                          return (
                            <div key={date} className="flex flex-col items-center gap-0.5">
                              <div
                                onClick={() => !isFuture && !toggling && handleToggle(child.id, sub.serviceSlug, date)}
                                title={isDone ? "클릭 → 완료 취소" : isFuture ? "" : "클릭 → 완료 처리"}
                                className="w-[26px] h-[26px] rounded-md flex items-center justify-center"
                                style={{
                                  backgroundColor: isThis ? "rgba(0,0,0,0.08)" : isDone ? "#38a848" : isFuture ? "rgba(0,0,0,0.03)" : "rgba(0,0,0,0.07)",
                                  border: isToday ? "2px solid rgba(0,0,0,0.95)" : "1.5px solid transparent",
                                  cursor: isFuture ? "default" : toggling ? "wait" : "pointer",
                                  opacity: isThis ? 0.6 : 1,
                                  transition: "background-color 0.12s",
                                }}
                              >
                                {isDone && !isThis && <span className="text-white text-[11px] font-bold">✓</span>}
                                {isThis && <span className="text-[8px] text-p-muted">…</span>}
                              </div>
                              {minLabel && <span className="text-[9px] text-p-teal font-semibold leading-none">{minLabel}</span>}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
