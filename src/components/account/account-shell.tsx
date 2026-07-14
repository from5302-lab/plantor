"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, Timestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { T } from "@/lib/design-tokens";
import { formatDate } from "@/lib/format";
import { getWeekDates, todayStr } from "@/lib/learn-utils";
import { useFamily } from "@/lib/hooks/useFamily";
import { useFamilyData } from "@/lib/hooks/useFamilyData";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CenterMsg } from "@/components/ui/center-msg";
import { LoginPrompt } from "@/components/ui/login-prompt";
import { PageWrap } from "@/components/ui/page-wrap";
import { RenewalModal } from "./renewal-modal";
import { ChildrenSection } from "./children-tab";
import { DirectJournalPanel, type JournalStudent } from "./direct-journal-panel";
import type { RenewalTarget } from "./renewal-modal";
import type { WalletCoupon } from "@/lib/types";
import { useServices } from "@/lib/services-context";
import { ServiceIcon } from "@/components/ui/service-icon";

// ── 인증 쉘 ───────────────────────────────────────────────────────────────────

export function AccountShell() {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user || !role) return;
    if (role === "admin") router.replace("/admin");
    else if (role === "student") router.replace("/learn");
  }, [loading, user, role, router]);

  if (loading) return <CenterMsg>로딩 중…</CenterMsg>;
  if (!user) return <LoginPrompt message="대시보드를 보려면 먼저 로그인해 주세요." />;
  if (role && role !== "parent") return <CenterMsg>로딩 중…</CenterMsg>;
  return <AccountDashboard userId={user.uid} fallbackName={user.displayName} />;
}

// ── 학부모 대시보드 ────────────────────────────────────────────────────────────

export function AccountDashboard({ userId, fallbackName, readOnly = false, previewUid, previewLoginId }: { userId: string; fallbackName: string | null; readOnly?: boolean; previewUid?: string; previewLoginId?: string }) {
  const { aiPackageEndDate } = useAuth();
  const { familyId, parentName, loaded: familyLoaded } = useFamily(userId);
  const userName = parentName ?? fallbackName;
  // 상단 요약은 이번 주 고정 — 주 이동은 자녀별 학습 그리드(StudentLearningGrid)에 내장
  const { children, subscriptions, weeklyLogs } = useFamilyData(familyId);
  const [renewalTarget, setRenewalTarget] = useState<RenewalTarget | null>(null);
  const [walletCoupons, setWalletCoupons] = useState<WalletCoupon[]>([]);
  const [journalStudents, setJournalStudents] = useState<JournalStudent[]>([]);

  // 직강 수업일지 — 본인(또는 미리보기 대상)의 직강 자녀 일지 (콜러블, lessonLogs는 어드민 전용)
  useEffect(() => {
    let cancelled = false;
    const fn = httpsCallable<{ targetUid?: string; targetPlantorId?: string }, { students: JournalStudent[] }>(functions, "getParentLessonLogs");
    fn(previewLoginId ? { targetPlantorId: previewLoginId } : previewUid ? { targetUid: previewUid } : {})
      .then((r) => { if (!cancelled) setJournalStudents(r.data.students); })
      .catch(() => { if (!cancelled) setJournalStudents([]); });
    return () => { cancelled = true; };
  }, [previewUid, previewLoginId]);

  useEffect(() => {
    if (!familyId) return;
    getDocs(collection(db, "families", familyId, "couponWallet")).then((snap) => {
      setWalletCoupons(snap.docs.map((d) => ({
        id: d.id,
        discountPercent: d.data().discountPercent ?? 10,
        note: d.data().note ?? "",
        used: d.data().used ?? false,
        createdAt: d.data().createdAt ? (d.data().createdAt as Timestamp).toDate() : null,
      })));
    });
  }, [familyId]);

  if (!familyLoaded) return <CenterMsg>불러오는 중…</CenterMsg>;

  if (!familyId) {
    // 직강 전용 학부모(구독 가족 없음): 직강 수업일지만 표시. 직강도 없으면 신청 안내.
    return (
      <PageWrap>
        <div className="max-w-[640px] mx-auto">
          <DirectJournalPanel students={journalStudents} />
          {journalStudents.length === 0 && (
            <div className="max-w-[440px] mx-auto bg-white border border-black/10 rounded-[16px] px-8 py-10 max-[600px]:px-5 max-[600px]:py-7 text-center" style={{ boxShadow: T.shadow }}>
              <div className="mb-4"><img src="/favicon.svg" alt="" width={56} height={56} /></div>
              <h2 className="m-0 text-[20px] font-bold text-black/95 tracking-[-0.25px]">아직 등록된 가족 정보가 없습니다</h2>
              <p className="mt-2.5 text-sm text-p-secondary leading-relaxed">서비스를 신청하시면 입금 확인 후 대시보드가 활성화됩니다.</p>
              <Link href="/signup" className="inline-flex items-center justify-center h-11 px-6 rounded bg-p-green text-white text-sm font-bold no-underline mt-5">
                서비스 신청하기
              </Link>
            </div>
          )}
        </div>
      </PageWrap>
    );
  }

  const now = new Date();
  // active(구독) 또는 transferred(1:1 직강) 이면서 기간이 유효하면 "정상"
  const isLive = (s: typeof subscriptions[number]) => (s.status === "active" || s.status === "transferred") && !!s.endDate && s.endDate > now;
  const allExpired = subscriptions.length > 0 && !subscriptions.some(isLive);
  const nearestEnd = subscriptions.filter((s) => s.status === "active" && s.endDate).sort((a, b) => a.endDate!.getTime() - b.endDate!.getTime()).at(0)?.endDate;
  const daysLeft = nearestEnd ? Math.ceil((nearestEnd.getTime() - Date.now()) / 86400000) : null;
  const weekDates = getWeekDates();
  const today = todayStr();
  const weekLabel = "이번 주";

  const totalPastDays = children.length * weekDates.filter((d) => d <= today).length;
  const totalDoneDays = children.reduce((sum, child) => {
    const childLogDates = new Set(weeklyLogs.filter((l) => l.childId === child.id).map((l) => l.date));
    return sum + weekDates.filter((d) => d <= today && childLogDates.has(d)).length;
  }, 0);
  const weeklyPct = totalPastDays > 0 ? Math.round((totalDoneDays / totalPastDays) * 100) : 0;
  const todayDoneCount = children.filter((child) => {
    const childLogDates = new Set(weeklyLogs.filter((l) => l.childId === child.id).map((l) => l.date));
    return childLogDates.has(today);
  }).length;
  const allStudiedToday = children.length > 0 && todayDoneCount === children.length;

  return (
    <PageWrap>
      {renewalTarget && <RenewalModal target={renewalTarget} walletCoupons={walletCoupons} onClose={() => setRenewalTarget(null)} />}

      <div className="max-w-[640px] mx-auto">
        <div className="mb-7">
          <h1 className="m-0 text-[26px] font-bold tracking-[-0.5px] text-black/95">안녕하세요, {userName ?? "학부모"}님</h1>
          <p className="mt-1.5 text-sm text-p-muted">학습 현황을 확인하세요.</p>
        </div>

        {/* 요약 카드 */}
        <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
          <div
            className="rounded-xl px-4 py-3.5 text-center"
            style={{
              backgroundColor: allStudiedToday ? "#f0fff4" : "#ffffff",
              border: allStudiedToday ? "1.5px solid rgba(26,127,75,0.25)" : "1px solid rgba(0,0,0,0.1)",
              boxShadow: T.shadow,
            }}
          >
            <div className="text-[11px] text-p-muted font-medium mb-1">오늘 학습</div>
            <div className="text-[22px] mb-0.5">{allStudiedToday ? "✅" : todayDoneCount > 0 ? "⚡" : "💤"}</div>
            <div className="text-[13px] font-bold" style={{ color: allStudiedToday ? "#1a7f4b" : "#615d59" }}>
              {children.length === 0 ? "-" : `${todayDoneCount}/${children.length}명 완료`}
            </div>
          </div>
          <div className="bg-white border border-black/10 rounded-xl px-4 py-3.5 text-center" style={{ boxShadow: T.shadow }}>
            <div className="text-[11px] text-p-muted font-medium mb-1">{weekLabel} 완료율</div>
            <div className="text-[22px] font-extrabold tracking-[-0.5px]" style={{ color: weeklyPct >= 80 ? "#1a7f4b" : weeklyPct >= 50 ? "#92660a" : "#615d59" }}>
              {weeklyPct}<span className="text-[13px] font-medium">%</span>
            </div>
            <div className="text-[11px] text-p-muted mt-0.5">{totalDoneDays}/{totalPastDays}일</div>
          </div>
        </div>

        {/* 구독 만료 배너 */}
        {allExpired && (
          <div className="mb-5 rounded-[10px] px-[18px] py-4 bg-[#fff5f5] border-[1.5px] border-[rgba(200,0,0,0.2)]">
            <div className="text-sm font-bold text-[#c00000] mb-1">구독이 만료되어 정지 중입니다.</div>
            <div className="text-[13px] text-[#c00000] opacity-80 mb-3 leading-relaxed">재신청 후 입금 확인이 완료되면 자동으로 복원됩니다.</div>
            {!readOnly && (
              <button onClick={() => setRenewalTarget({ familyId: familyId!, children, allSubs: subscriptions })}
                className="h-[38px] px-5 rounded-lg border-none bg-[#c00000] text-white text-[13px] font-bold cursor-pointer">
                재신청하기
              </button>
            )}
          </div>
        )}

        {!allExpired && daysLeft !== null && daysLeft <= 7 && daysLeft > 0 && (
          <div className="mb-5 rounded-lg px-4 py-3 text-[13px] font-medium bg-[#fffbeb] border border-[rgba(180,130,0,0.2)] text-[#92660a]">
            구독 종료 {daysLeft}일 전입니다. 미리 연장 신청을 해두세요.
          </div>
        )}

        {/* 학부모 본인 서비스 구독 (childId=null) — momsaipack은 별도 처리되므로 제외 */}
        <ParentSubscriptionsSection subscriptions={subscriptions} now={now} />

        {/* AI 패키지 — 학생 구독 행과 동일 스타일 */}
        {aiPackageEndDate && (() => {
          const today2 = new Date().toLocaleDateString("sv-SE");
          const active = aiPackageEndDate >= today2;
          const displayDate = new Date(aiPackageEndDate + "T00:00:00+09:00");
          return (
            <div className="mb-4 bg-white border border-black/10 rounded-xl p-5" style={{ boxShadow: T.shadow }}>
              <div className="flex items-center gap-2 bg-p-bg rounded-lg px-3.5 py-2.5">
                <span className="flex items-center gap-1.5 text-sm font-medium text-black/95 flex-1 min-w-0">
                  <span className="text-base">🤖</span>Mom&amp; AI 패키지
                </span>
                <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold shrink-0 whitespace-nowrap" style={{ backgroundColor: active ? "#f0faf1" : "#fff5f5", color: active ? "#2da040" : "#c00000" }}>
                  {active ? "구독 중" : "정지중"}
                </span>
                <div className="w-20 shrink-0 text-right">
                  <div className="text-[11px] text-p-muted">~ {formatDate(displayDate)}</div>
                </div>
              </div>
            </div>
          );
        })()}

        <ChildrenSection
          children={children}
          subscriptions={subscriptions}
          now={now}
          setRenewalTarget={setRenewalTarget}
          familyId={familyId!}
          userId={userId}
          userName={userName}
          walletCoupons={walletCoupons}
          journalStudents={journalStudents}
        />

        {/* 직강 전용 학생(구독 카드 없음) 수업일지 패널 */}
        <DirectJournalPanel students={journalStudents.filter((s) => !children.some((c) => c.name === s.studentName))} />

        {/* 하단 CTA */}
        {!allExpired && !readOnly && (
          <div className="mt-6 flex justify-end">
            <button
              onClick={() => setRenewalTarget({ familyId: familyId!, children, allSubs: subscriptions })}
              className="inline-flex items-center justify-center h-11 px-6 rounded border-none bg-p-green text-white text-sm font-semibold cursor-pointer"
            >
              연장하기
            </button>
          </div>
        )}
      </div>
    </PageWrap>
  );
}

/** 학부모 본인 서비스 구독 섹션 (childId=null인 sub만). */
function ParentSubscriptionsSection({ subscriptions, now }: { subscriptions: import("@/lib/types").Subscription[]; now: Date }) {
  const { allServices } = useServices();
  const parentSubs = subscriptions.filter((s) => !s.childId && s.serviceSlug !== "momsaipack");
  if (parentSubs.length === 0) return null;

  return (
    <div className="mb-4 bg-white border border-black/10 rounded-xl p-5" style={{ boxShadow: T.shadow }}>
      <div className="text-[12px] font-bold text-p-muted mb-2.5 tracking-[-0.2px]">학부모 구독</div>
      <div className="flex flex-col gap-1.5">
        {parentSubs.map((sub) => {
          const svc = allServices.find((s) => s.slug === sub.serviceSlug);
          const active = sub.status === "active" && sub.endDate && sub.endDate > now;
          return (
            <div key={sub.id} className="flex items-center gap-2 bg-p-bg rounded-lg px-3.5 py-2.5">
              <span className="flex items-center gap-1.5 text-sm font-medium text-black/95 flex-1 min-w-0">
                {svc && <ServiceIcon service={svc} size={16} />}
                {svc?.name ?? sub.serviceSlug}
              </span>
              <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold shrink-0 whitespace-nowrap" style={{ backgroundColor: active ? "#f0faf1" : "#fff5f5", color: active ? "#2da040" : "#c00000" }}>
                {active ? "구독 중" : "정지중"}
              </span>
              <div className="w-20 shrink-0 text-right">
                <div className="text-[11px] text-p-muted">{sub.endDate ? `~ ${formatDate(sub.endDate)}` : "-"}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
