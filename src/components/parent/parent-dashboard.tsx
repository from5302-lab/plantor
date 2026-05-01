"use client";

import { useEffect, useState } from "react";
import {
  collection, query, where, onSnapshot, getDocs,
  doc, getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { SERVICES } from "@/data/site";
import { ServiceIcon } from "@/components/ui/service-icon";
import { PageWrap } from "@/components/ui/page-wrap";
import { Card } from "@/components/ui/card";
import { CenterMsg } from "@/components/ui/center-msg";
import { todayStr, getWeekDates, calcStreak } from "@/lib/learn-utils";

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

type Child = { id: string; name: string; grade?: string; loginId: string };
type LearningLog = {
  id: string;
  childId: string;
  serviceSlug: string;
  date: string;
  screenshotUrl?: string | null;
  method?: string;
};
type Subscription = { id: string; serviceSlug: string };

type ChildData = {
  child: Child;
  subscriptions: Subscription[];
  todayLogs: LearningLog[];
  weekLogs: LearningLog[];
  allLogs: LearningLog[];
};

export function ParentDashboard({ userId }: { userId: string }) {
  const [children, setChildren] = useState<Child[]>([]);
  const [childDataMap, setChildDataMap] = useState<Record<string, ChildData>>({});
  const [ready, setReady] = useState(false);
  const [expandedScreenshot, setExpandedScreenshot] = useState<string | null>(null);

  const today = todayStr();
  const weekDates = getWeekDates();

  // 1) userId → familyId → children
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const userSnap = await getDoc(doc(db, "users", userId));
      const userData = userSnap.data();

      let familyId: string | null = null;

      const famSnap = await getDocs(
        query(collection(db, "families"), where("userId", "==", userId))
      );
      if (!famSnap.empty) {
        familyId = famSnap.docs[0].id;
      }

      if (!familyId && userData?.plantor_id) {
        const famSnap2 = await getDocs(
          query(collection(db, "families"), where("parentId", "==", userData.plantor_id))
        );
        if (!famSnap2.empty) familyId = famSnap2.docs[0].id;
      }

      if (!familyId || cancelled) { setReady(true); return; }

      const childQ = query(collection(db, "children"), where("familyId", "==", familyId));
      const unsubChildren = onSnapshot(childQ, (snap) => {
        if (cancelled) return;
        const kids = snap.docs.map((d) => ({
          id: d.id,
          name: d.data().name ?? "",
          grade: d.data().grade,
          loginId: d.data().loginId ?? "",
        }));
        setChildren(kids);
        setReady(true);
      });

      return unsubChildren;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }

    const cleanup = load();
    return () => {
      cancelled = true;
      cleanup.then((unsub) => unsub?.());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // 2) 자녀별 구독 + 로그 실시간 구독
  useEffect(() => {
    if (!children.length) return;
    const unsubs: (() => void)[] = [];

    for (const child of children) {
      const childId = child.id;

      unsubs.push(onSnapshot(
        query(collection(db, "subscriptions"), where("childId", "==", childId), where("status", "==", "active")),
        (snap) => {
          const subs = snap.docs.map((d) => ({ id: d.id, serviceSlug: d.data().serviceSlug ?? "" }));
          setChildDataMap((prev) => ({
            ...prev,
            [childId]: { ...prev[childId], child, subscriptions: subs },
          }));
        }
      ));

      unsubs.push(onSnapshot(
        query(
          collection(db, "learningLogs"),
          where("childId", "==", childId),
          where("date", ">=", weekDates[0]),
          where("date", "<=", weekDates[6])
        ),
        (snap) => {
          const logs = snap.docs.map((d) => ({
            id: d.id,
            childId,
            serviceSlug: d.data().serviceSlug ?? "",
            date: d.data().date ?? "",
            screenshotUrl: d.data().screenshotUrl ?? null,
            method: d.data().method,
          }));
          const todayLogs = logs.filter((l) => l.date === today);
          setChildDataMap((prev) => ({
            ...prev,
            [childId]: { ...prev[childId], child, weekLogs: logs, todayLogs },
          }));
        }
      ));

      unsubs.push(onSnapshot(
        query(collection(db, "learningLogs"), where("childId", "==", childId)),
        (snap) => {
          const allLogs = snap.docs.map((d) => ({
            id: d.id,
            childId,
            serviceSlug: d.data().serviceSlug ?? "",
            date: d.data().date ?? "",
          }));
          setChildDataMap((prev) => ({
            ...prev,
            [childId]: { ...prev[childId], child, allLogs },
          }));
        }
      ));
    }

    return () => unsubs.forEach((u) => u());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children]);

  if (!ready) return <CenterMsg>로딩 중…</CenterMsg>;

  if (!children.length) {
    return (
      <PageWrap paddingBottom="96px">
        <Card style={{ maxWidth: 440, margin: "0 auto", padding: "40px 32px", textAlign: "center" }}>
          <div className="text-5xl mb-4">🌱</div>
          <h2 className="m-0 text-xl font-bold text-black/95">연결된 자녀가 없습니다</h2>
          <p className="mt-2.5 text-sm text-p-secondary leading-relaxed">
            서비스 신청이 승인되면 자녀 학습 현황이 여기에 나타납니다.
          </p>
        </Card>
      </PageWrap>
    );
  }

  return (
    <PageWrap paddingBottom="96px">
      <div className="max-w-[520px] mx-auto">

        {/* 헤더 */}
        <div className="mb-7">
          <div className="text-[22px] font-extrabold text-black/95 tracking-[-0.5px]">
            자녀 학습 현황
          </div>
          <div className="text-[13px] text-p-muted mt-1">
            {new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
          </div>
        </div>

        {/* 자녀별 카드 */}
        <div className="flex flex-col gap-4">
          {children.map((child) => {
            const data = childDataMap[child.id];
            const subs = data?.subscriptions ?? [];
            const todayLogs = data?.todayLogs ?? [];
            const weekLogs = data?.weekLogs ?? [];
            const allLogs = data?.allLogs ?? [];
            const streak = calcStreak(allLogs);
            const todayDone = new Set(todayLogs.map((l) => l.serviceSlug));
            const todayTotal = subs.length;
            const todayDoneCount = subs.filter((s) => todayDone.has(s.serviceSlug)).length;
            const allComplete = todayTotal > 0 && todayDoneCount === todayTotal;

            return (
              <Card key={child.id} style={{ overflow: "hidden", padding: 0 }}>
                {/* 자녀 헤더 */}
                <div
                  className="px-[18px] py-3.5 border-b border-black/10 flex items-center justify-between"
                  style={{ background: allComplete ? "#edfaf8" : "#f6f5f4" }}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0"
                      style={{
                        backgroundColor: allComplete ? "#38a848" : "rgba(0,0,0,0.1)",
                        color: allComplete ? "#ffffff" : "#a39e98",
                      }}
                    >
                      {allComplete ? "✓" : child.name[0]}
                    </div>
                    <div>
                      <div className="text-[15px] font-bold text-black/95">{child.name}</div>
                      {child.grade && <div className="text-[11px] text-p-muted mt-px">{child.grade}</div>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className="text-[13px] font-bold"
                      style={{ color: allComplete ? "#38a848" : "#615d59" }}
                    >
                      {todayDoneCount}/{todayTotal} 완료
                    </div>
                    {streak >= 2 && (
                      <div className="text-[11px] text-p-muted mt-0.5">🔥 {streak}일 연속</div>
                    )}
                  </div>
                </div>

                {/* 주간 달력 */}
                <div className="px-[18px] py-2.5 border-b border-black/10">
                  <div className="flex justify-between">
                    {weekDates.map((date, i) => {
                      const isToday = date === today;
                      const isFuture = date > today;
                      const hasDone = weekLogs.some((l) => l.date === date);
                      return (
                        <div key={date} className="flex flex-col items-center gap-1">
                          <span
                            className="text-[9px] font-semibold"
                            style={{ color: isToday ? "rgba(0,0,0,0.95)" : "#a39e98" }}
                          >
                            {DAY_LABELS[i]}
                          </span>
                          <div
                            className="w-[26px] h-[26px] rounded-full flex items-center justify-center"
                            style={{
                              backgroundColor: hasDone ? "#38a848" : "transparent",
                              border: isToday ? "2px solid rgba(0,0,0,0.95)" : `1.5px solid ${hasDone ? "#38a848" : "rgba(0,0,0,0.1)"}`,
                              opacity: isFuture ? 0.4 : 1,
                            }}
                          >
                            {hasDone
                              ? <span className="text-[10px] text-white font-bold">✓</span>
                              : <span
                                  className="text-[9px]"
                                  style={{ color: isToday ? "rgba(0,0,0,0.95)" : "#a39e98" }}
                                >{new Date(date + "T00:00:00").getDate()}</span>
                            }
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 오늘 서비스별 현황 */}
                {subs.length === 0 ? (
                  <div className="px-[18px] py-5 text-[13px] text-p-muted text-center">
                    활성 구독이 없습니다
                  </div>
                ) : (
                  <div className="py-2">
                    {subs.map((sub, idx) => {
                      const svc = SERVICES.find((s) => s.slug === sub.serviceSlug);
                      const log = todayLogs.find((l) => l.serviceSlug === sub.serviceSlug);
                      const done = !!log;
                      const hasScreenshot = !!log?.screenshotUrl;

                      return (
                        <div
                          key={sub.id}
                          className="flex items-center gap-3 px-[18px] py-2.5"
                          style={{ borderBottom: idx < subs.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none" }}
                        >
                          {/* 완료 뱃지 */}
                          <div
                            className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center"
                            style={{ backgroundColor: done ? "#38a848" : "rgba(0,0,0,0.06)" }}
                          >
                            {done && <span className="text-white text-xs font-bold">✓</span>}
                          </div>

                          {/* 서비스명 */}
                          <div className="flex-1 flex items-center gap-1.5">
                            {svc && <ServiceIcon service={svc} size={14} />}
                            <span
                              className="text-[13px] font-semibold"
                              style={{ color: done ? "rgba(0,0,0,0.95)" : "#a39e98" }}
                            >
                              {svc?.name ?? sub.serviceSlug}
                            </span>
                          </div>

                          {/* 인증샷 썸네일 */}
                          {hasScreenshot && log?.screenshotUrl && (
                            <button
                              onClick={() => setExpandedScreenshot(
                                expandedScreenshot === log.id ? null : log.id
                              )}
                              className="border-none bg-transparent cursor-pointer p-0 shrink-0"
                              title="인증샷 보기"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={log.screenshotUrl}
                                alt="인증샷"
                                className="w-10 h-10 object-cover rounded-md block"
                                style={{ border: "2px solid #38a848" }}
                              />
                            </button>
                          )}

                          {/* 상태 라벨 */}
                          {!done && (
                            <span className="text-[11px] text-p-muted shrink-0">미완료</span>
                          )}
                          {done && !hasScreenshot && log?.method === "admin" && (
                            <span className="text-[11px] text-p-muted shrink-0">선생님 확인</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 인증샷 확대 */}
                {subs.some((sub) => {
                  const log = todayLogs.find((l) => l.serviceSlug === sub.serviceSlug);
                  return log && expandedScreenshot === log.id && log.screenshotUrl;
                }) && (() => {
                  const expandedLog = todayLogs.find((l) => l.id === expandedScreenshot);
                  if (!expandedLog?.screenshotUrl) return null;
                  const svc = SERVICES.find((s) => s.slug === expandedLog.serviceSlug);
                  return (
                    <div className="px-[18px] pb-4">
                      <div className="text-[11px] font-semibold text-p-muted mb-2">
                        📸 {svc?.name ?? expandedLog.serviceSlug} 인증샷
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={expandedLog.screenshotUrl}
                        alt="인증샷 확대"
                        className="w-full rounded-[10px] block border border-black/10"
                      />
                    </div>
                  );
                })()}
              </Card>
            );
          })}
        </div>

        {/* 안내 */}
        <div className="mt-5 px-4 py-3 bg-p-bg rounded-xl text-xs text-p-muted leading-[1.6]">
          인증샷은 제출일로부터 90일간 보관됩니다. 학습 완료 시 문자로 알림이 발송됩니다.
        </div>
      </div>

      {/* 인증샷 전체화면 오버레이 */}
      {expandedScreenshot && (() => {
        const allLogs = Object.values(childDataMap).flatMap((d) => d?.todayLogs ?? []);
        const log = allLogs.find((l) => l.id === expandedScreenshot);
        if (!log?.screenshotUrl) return null;
        return (
          <div
            onClick={() => setExpandedScreenshot(null)}
            className="fixed inset-0 z-[1000] bg-[rgba(0,0,0,0.85)] flex items-center justify-center p-6"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={log.screenshotUrl}
              alt="인증샷 전체화면"
              className="max-w-full max-h-[90vh] rounded-xl block"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        );
      })()}
    </PageWrap>
  );
}
