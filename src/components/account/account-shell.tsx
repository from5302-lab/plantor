"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
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
import type { RenewalTarget } from "./renewal-modal";
import type { WalletCoupon } from "@/lib/types";

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

function AccountDashboard({ userId, fallbackName }: { userId: string; fallbackName: string | null }) {
  const { aiPackageEndDate } = useAuth();
  const { familyId, parentName, loaded: familyLoaded } = useFamily(userId);
  const userName = parentName ?? fallbackName;
  const [weekOffset, setWeekOffset] = useState(0);
  const { children, subscriptions, weeklyLogs } = useFamilyData(familyId, weekOffset);
  const [renewalTarget, setRenewalTarget] = useState<RenewalTarget | null>(null);
  const [walletCoupons, setWalletCoupons] = useState<WalletCoupon[]>([]);

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
    return (
      <PageWrap>
        <div className="max-w-[440px] mx-auto bg-white border border-black/10 rounded-[16px] px-8 py-10 max-[600px]:px-5 max-[600px]:py-7 text-center" style={{ boxShadow: T.shadow }}>
          <div className="mb-4"><img src="/favicon.svg" alt="" width={56} height={56} /></div>
          <h2 className="m-0 text-[20px] font-bold text-black/95 tracking-[-0.25px]">아직 등록된 가족 정보가 없습니다</h2>
          <p className="mt-2.5 text-sm text-p-secondary leading-relaxed">서비스를 신청하시면 입금 확인 후 대시보드가 활성화됩니다.</p>
          <Link href="/signup" className="inline-flex items-center justify-center h-11 px-6 rounded bg-p-green text-white text-sm font-bold no-underline mt-5">
            서비스 신청하기
          </Link>
        </div>
      </PageWrap>
    );
  }

  const now = new Date();
  const allExpired = subscriptions.length > 0 && subscriptions.every((s) => s.status !== "active" || !s.endDate || s.endDate <= now);
  const nearestEnd = subscriptions.filter((s) => s.status === "active" && s.endDate).sort((a, b) => a.endDate!.getTime() - b.endDate!.getTime()).at(0)?.endDate;
  const daysLeft = nearestEnd ? Math.ceil((nearestEnd.getTime() - Date.now()) / 86400000) : null;
  const weekDates = getWeekDates(weekOffset);
  const today = todayStr();
  const weekLabel = weekOffset === 0 ? "이번 주" : weekOffset === -1 ? "지난 주" : `${Math.abs(weekOffset)}주 전`;

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
            <button onClick={() => setRenewalTarget({ familyId: familyId!, children, allSubs: subscriptions })}
              className="h-[38px] px-5 rounded-lg border-none bg-[#c00000] text-white text-[13px] font-bold cursor-pointer">
              재신청하기
            </button>
          </div>
        )}

        {!allExpired && daysLeft !== null && daysLeft <= 7 && daysLeft > 0 && (
          <div className="mb-5 rounded-lg px-4 py-3 text-[13px] font-medium bg-[#fffbeb] border border-[rgba(180,130,0,0.2)] text-[#92660a]">
            구독 종료 {daysLeft}일 전입니다. 미리 연장 신청을 해두세요.
          </div>
        )}

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
          weeklyLogs={weeklyLogs}
          weekOffset={weekOffset}
          setWeekOffset={setWeekOffset}
          weekDates={weekDates}
          today={today}
          weekLabel={weekLabel}
          now={now}
          setRenewalTarget={setRenewalTarget}
          familyId={familyId!}
          userId={userId}
          userName={userName}
          walletCoupons={walletCoupons}
        />

        {/* 하단 CTA */}
        {!allExpired && (
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
