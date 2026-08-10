"use client";

import { useEffect, useState } from "react";
import {
  collection, query, where, onSnapshot, getDocs,
  doc, getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useServices } from "@/lib/services-context";
import { ServiceIcon } from "@/components/ui/service-icon";
import { PageWrap } from "@/components/ui/page-wrap";
import { Card } from "@/components/ui/card";
import { CenterMsg } from "@/components/ui/center-msg";
import { REASONS_6HDL } from "@/lib/types";
import type { LearningLog } from "@/lib/types";
import { todayStr, getWeekDates, calcStreak, taskLabel } from "@/lib/learn-utils";
import { AutoResultSection } from "@/components/learn/auto-result-card";
import { useFamilyMail } from "@/lib/hooks/useFamilyMail";
import { FamilyMailModal } from "./family-mail-modal";

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

function dow(dateStr: string): number {
  return (new Date(dateStr + "T00:00:00").getDay() + 6) % 7; // 0=월
}

type Child = { id: string; name: string; grade?: string; loginId: string };
type TaskT = {
  id: string;
  serviceSlug: string;
  partSlug: string | null;
  title: string;
  scheduleDays: number[];
  progressLabel: string | null;
};
type CheckT = {
  id: string;
  taskId: string;
  date: string;
  status: string;
  reason: string | null;
  reasonNote: string | null;
  checkedBy: string;
};
type ShotLog = { id: string; serviceSlug: string; screenshotUrl?: string | null };

type ChildData = {
  child: Child;
  tasks: TaskT[];
  checks: CheckT[];
  todayShots: ShotLog[];
  todayAuto: LearningLog[]; // 오늘 자동인증(스크래핑) 결과 — 과제 등록과 무관하게 표시
};

export function ParentDashboard({ userId }: { userId: string }) {
  const { allServices } = useServices();
  const [children, setChildren] = useState<Child[]>([]);
  const [childDataMap, setChildDataMap] = useState<Record<string, ChildData>>({});
  const [ready, setReady] = useState(false);
  const [expandedScreenshot, setExpandedScreenshot] = useState<string | null>(null);
  // 가족 편지함 — 구독은 여기 하나만 열고 자녀별로 걸러 모달에 넘긴다
  const { items: mail } = useFamilyMail(userId, "parent");
  const [mailChild, setMailChild] = useState<Child | null>(null);

  const today = todayStr();
  const weekDates = getWeekDates();
  const todayDow = dow(today);

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
    }

    const cleanup = load();
    return () => {
      cancelled = true;
      cleanup.then((unsub) => unsub?.());
    };
  }, [userId]);

  // 2) 자녀별 과제 + 체크 + 인증샷 실시간 구독
  useEffect(() => {
    if (!children.length) return;
    const unsubs: (() => void)[] = [];

    for (const child of children) {
      const childId = child.id;

      // 확정 과제
      unsubs.push(onSnapshot(
        query(collection(db, "tasks"), where("childId", "==", childId), where("status", "==", "confirmed")),
        (snap) => {
          const tasks: TaskT[] = snap.docs.map((d) => ({
            id: d.id,
            serviceSlug: d.data().serviceSlug ?? "",
            partSlug: d.data().partSlug ?? null,
            title: d.data().title ?? "",
            scheduleDays: d.data().scheduleDays ?? [],
            progressLabel: d.data().progressLabel ?? null,
          }));
          setChildDataMap((prev) => ({
            ...prev,
            [childId]: { ...prev[childId], child, tasks },
          }));
        }
      ));

      // 과제 체크 (전체) — childId 단일 필드 조회(복합 인덱스 불필요). 주간/streak는 클라에서 파생
      unsubs.push(onSnapshot(
        query(collection(db, "taskChecks"), where("childId", "==", childId)),
        (snap) => {
          const checks: CheckT[] = snap.docs.map((d) => ({
            id: d.id,
            taskId: d.data().taskId ?? "",
            date: d.data().date ?? "",
            status: d.data().status ?? "error",
            reason: d.data().reason ?? null,
            reasonNote: d.data().reasonNote ?? null,
            checkedBy: d.data().checkedBy ?? "student",
          }));
          setChildDataMap((prev) => ({
            ...prev,
            [childId]: { ...prev[childId], child, checks },
          }));
        }
      ));

      // 인증샷 + 자동인증 결과 (learningLogs — 표시 전용). childId 단일 필드 조회 후 오늘 것만 파생
      unsubs.push(onSnapshot(
        query(collection(db, "learningLogs"), where("childId", "==", childId)),
        (snap) => {
          const todayShots: ShotLog[] = snap.docs
            .filter((d) => (d.data().date ?? "") === today && d.data().screenshotUrl)
            .map((d) => ({
              id: d.id,
              serviceSlug: d.data().serviceSlug ?? "",
              screenshotUrl: d.data().screenshotUrl ?? null,
            }));
          const todayAuto: LearningLog[] = snap.docs
            .filter((d) => (d.data().date ?? "") === today && d.data().method === "auto")
            .map((d) => ({
              id: d.id,
              serviceSlug: d.data().serviceSlug ?? "",
              date: d.data().date ?? "",
              method: "auto",
              autoStatus: d.data().autoStatus,
              scrapedData: d.data().scrapedData ?? null,
            }));
          setChildDataMap((prev) => ({
            ...prev,
            [childId]: { ...prev[childId], child, todayShots, todayAuto },
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
            const tasks = data?.tasks ?? [];
            const checks = data?.checks ?? [];
            const weekChecks = checks.filter((c) => c.date >= weekDates[0] && c.date <= weekDates[6]);
            const todayShots = data?.todayShots ?? [];
            const todayAuto = data?.todayAuto ?? []; // 내용 필터는 AutoResultSection이 담당
            const streak = calcStreak(checks.filter((c) => c.status === "done").map((c) => ({ date: c.date })));

            const todayTasks = tasks.filter((t) => t.scheduleDays.includes(todayDow));
            const isDoneToday = (taskId: string) =>
              weekChecks.some((c) => c.taskId === taskId && c.date === today && c.status === "done");
            const todayTotal = todayTasks.length;
            const todayDoneCount = todayTasks.filter((t) => isDoneToday(t.id)).length;
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
                        backgroundColor: allComplete ? "#1f7a33" : "rgba(0,0,0,0.1)",
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
                      style={{ color: allComplete ? "#1f7a33" : "#615d59" }}
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
                      const hasDone = weekChecks.some((c) => c.date === date && c.status === "done");
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
                              backgroundColor: hasDone ? "#1f7a33" : "transparent",
                              border: isToday ? "2px solid rgba(0,0,0,0.95)" : `1.5px solid ${hasDone ? "#1f7a33" : "rgba(0,0,0,0.1)"}`,
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

                {/* 오늘 과제별 현황 */}
                {todayTasks.length === 0 ? (
                  <div className="px-[18px] py-5 text-[13px] text-p-muted text-center">
                    오늘 예정된 과제가 없습니다
                  </div>
                ) : (
                  <div className="py-2">
                    {todayTasks.map((task, idx) => {
                      const svc = allServices.find((s) => s.slug === task.serviceSlug);
                      const label = taskLabel(task, allServices);
                      const check = weekChecks.find((c) => c.taskId === task.id && c.date === today);
                      const done = check?.status === "done";
                      const reasonInfo = check?.status === "not_done" && check.reason
                        ? REASONS_6HDL.find((r) => r.slug === check.reason)
                        : null;
                      const shot = todayShots.find((l) => l.serviceSlug === task.serviceSlug && l.screenshotUrl);

                      return (
                        <div
                          key={task.id}
                          className="flex items-center gap-3 px-[18px] py-2.5"
                          style={{ borderBottom: idx < todayTasks.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none" }}
                        >
                          {/* 완료 뱃지 */}
                          <div
                            className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center"
                            style={{ backgroundColor: done ? "#1f7a33" : "rgba(0,0,0,0.06)" }}
                          >
                            {done && <span className="text-white text-xs font-bold">✓</span>}
                          </div>

                          {/* 과제명 */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {svc && <ServiceIcon service={svc} size={14} />}
                              <span
                                className="text-[13px] font-semibold truncate"
                                style={{ color: done ? "rgba(0,0,0,0.95)" : "#a39e98" }}
                              >
                                {label}
                              </span>
                            </div>
                            {reasonInfo && (
                              <div className="text-[11px] text-[#c00000] font-medium mt-0.5">
                                {reasonInfo.icon} {reasonInfo.name}{check?.reasonNote ? ` · ${check.reasonNote}` : ""}
                              </div>
                            )}
                          </div>

                          {/* 인증샷 썸네일 */}
                          {shot?.screenshotUrl && (
                            <button
                              onClick={() => setExpandedScreenshot(
                                expandedScreenshot === shot.id ? null : shot.id
                              )}
                              className="border-none bg-transparent cursor-pointer p-0 shrink-0"
                              title="인증샷 보기"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={shot.screenshotUrl}
                                alt="인증샷"
                                className="w-10 h-10 object-cover rounded-md block"
                                style={{ border: "2px solid #1f7a33" }}
                              />
                            </button>
                          )}

                          {/* 상태 라벨 */}
                          {!done && !reasonInfo && (
                            <span className="text-[11px] text-p-muted shrink-0">미완료</span>
                          )}
                          {done && !shot && check?.checkedBy === "admin" && (
                            <span className="text-[11px] text-p-muted shrink-0">선생님 확인</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 자동인증 학습결과 — 과제 등록과 무관하게 표시 (3개 화면 공용 섹션) */}
                <AutoResultSection
                  className="px-[18px] pt-2.5 pb-3"
                  childId={child.id}
                  today={today}
                  logsByDate={[{ date: today, logs: todayAuto }]}
                />

                {/* 편지 — 학습 현황을 보고 난 자리에서 바로 한마디 건넨다.
                    이 화면에서 부모가 할 수 있는 유일한 '주는' 행동이라 카드 맨 아래에 둔다. */}
                {(() => {
                  const childMail = mail.filter((m) => m.childId === child.id);
                  const replies = childMail.filter((m) => m.dir === "toParent" && !m.read).length;
                  return (
                    <div className="px-[18px] pb-3.5">
                      <button
                        onClick={() => setMailChild(child)}
                        className="w-full rounded-xl py-2.5 text-[13px] font-bold border-none cursor-pointer flex items-center justify-center gap-1.5"
                        style={{ background: "rgba(0,0,0,0.04)", color: "#3d3a37" }}
                      >
                        💌 편지 쓰기
                        {replies > 0 && (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[11px] font-bold text-white"
                            style={{ background: "#1f7a33" }}
                          >
                            답장 {replies}
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })()}

                {/* 인증샷 확대 */}
                {(() => {
                  const expandedShot = todayShots.find((l) => l.id === expandedScreenshot && l.screenshotUrl);
                  if (!expandedShot?.screenshotUrl) return null;
                  const svc = allServices.find((s) => s.slug === expandedShot.serviceSlug);
                  return (
                    <div className="px-[18px] pb-4">
                      <div className="text-[11px] font-semibold text-p-muted mb-2">
                        📸 {svc?.name ?? expandedShot.serviceSlug} 인증샷
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={expandedShot.screenshotUrl}
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
          인증샷은 제출일로부터 90일간 보관됩니다. 학습 완료 시 카톡으로 알림이 발송됩니다.
        </div>
      </div>

      {mailChild && (
        <FamilyMailModal
          childId={mailChild.id}
          childName={mailChild.name}
          mail={mail.filter((m) => m.childId === mailChild.id)}
          onClose={() => setMailChild(null)}
        />
      )}

      {/* 인증샷 전체화면 오버레이 */}
      {expandedScreenshot && (() => {
        const allShots = Object.values(childDataMap).flatMap((d) => d?.todayShots ?? []);
        const shot = allShots.find((l) => l.id === expandedScreenshot);
        if (!shot?.screenshotUrl) return null;
        return (
          <div
            onClick={() => setExpandedScreenshot(null)}
            className="fixed inset-0 z-[1000] bg-[rgba(0,0,0,0.85)] flex items-center justify-center p-6"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shot.screenshotUrl}
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
