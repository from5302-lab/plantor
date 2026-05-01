"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { T } from "@/lib/design-tokens";
import { SERVICES } from "@/data/site";
import { formatDate } from "@/lib/format";
import { ServiceIcon } from "@/components/ui/service-icon";
import type { Child, Subscription, WeeklyLog, WalletCoupon } from "@/lib/types";
import type { RenewalTarget } from "./renewal-modal";

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

// ── 자녀 카드 목록 ─────────────────────────────────────────────────────────────

interface ChildrenSectionProps {
  children: Child[];
  subscriptions: Subscription[];
  weeklyLogs: WeeklyLog[];
  weekOffset: number;
  setWeekOffset: React.Dispatch<React.SetStateAction<number>>;
  weekDates: string[];
  today: string;
  weekLabel: string;
  now: Date;
  setRenewalTarget: (target: RenewalTarget | null) => void;
  familyId: string;
  userId: string;
  userName: string | null;
  walletCoupons: WalletCoupon[];
}

export function ChildrenSection({
  children,
  subscriptions,
  weeklyLogs,
  weekOffset,
  setWeekOffset,
  weekDates,
  today,
  weekLabel,
  now,
  setRenewalTarget,
  familyId,
  userId,
  userName,
  walletCoupons,
}: ChildrenSectionProps) {
  return (
    <>
      <div className="flex flex-col gap-3">
        {children.map((child) => {
          const childSubs = subscriptions.filter((s) => s.childId === child.id);
          const childLogDates = new Set(weeklyLogs.filter((l) => l.childId === child.id).map((l) => l.date));
          const doneCount = weekDates.filter((d) => childLogDates.has(d) && d <= today).length;
          const pastCount = weekDates.filter((d) => d <= today).length;
          const completionPct = pastCount > 0 ? Math.round((doneCount / pastCount) * 100) : 0;
          return (
            <div key={child.id} className="bg-white border border-black/10 rounded-xl p-5" style={{ boxShadow: T.shadow }}>
              <div className="flex items-center justify-between gap-2.5 mb-3">
                <div className="flex items-center gap-2">
                  <img src="/favicon.svg" alt="" width={16} height={16} />
                  <span className="text-[15px] font-bold text-black/95">{child.name}</span>
                  {child.grade && <span className="text-[13px] text-p-muted">{child.grade}</span>}
                </div>
                {child.loginId && <span className="rounded-full bg-p-bg px-2.5 py-[3px] font-mono text-[11px] text-p-secondary whitespace-nowrap">ID: {child.loginId}</span>}
              </div>

              {/* 주간 학습 현황 */}
              <div className="mb-3.5 bg-p-bg rounded-lg px-3.5 py-2.5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setWeekOffset(w => w - 1)} className="bg-transparent border-none cursor-pointer text-sm text-p-muted px-0.5 leading-none">‹</button>
                    <span className="text-[11px] font-semibold tracking-[0.08em] text-p-muted">{weekLabel} 학습</span>
                    <button onClick={() => setWeekOffset(w => Math.min(0, w + 1))} disabled={weekOffset === 0} className="bg-transparent border-none text-sm px-0.5 leading-none" style={{ cursor: weekOffset === 0 ? "default" : "pointer", color: weekOffset === 0 ? "rgba(0,0,0,0.15)" : "#a39e98" }}>›</button>
                  </div>
                  <span className="text-xs font-bold" style={{ color: completionPct >= 80 ? "#38a848" : completionPct >= 50 ? "#92660a" : "#a39e98" }}>
                    {doneCount}/{pastCount}일 완료 ({completionPct}%)
                  </span>
                </div>
                <div className="flex gap-1">
                  {weekDates.map((date, i) => {
                    const isFuture = date > today;
                    const isDone = childLogDates.has(date);
                    const isToday = date === today;
                    return (
                      <div key={date} className="flex-1 flex flex-col items-center gap-[3px]">
                        <span className="text-[9px] font-semibold" style={{ color: isToday ? "rgba(0,0,0,0.95)" : "#a39e98" }}>{DAY_LABELS[i]}</span>
                        <div
                          className="w-full rounded flex items-center justify-center"
                          style={{
                            aspectRatio: "1",
                            minWidth: 0,
                            backgroundColor: isDone ? "#38a848" : isFuture ? "rgba(0,0,0,0.04)" : "rgba(0,0,0,0.08)",
                            border: isToday ? "2px solid rgba(0,0,0,0.95)" : "none",
                          }}
                        >
                          {isDone && <span className="text-white text-[9px] font-bold">✓</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {childSubs.length === 0 ? (
                <p className="text-[13px] text-p-muted">구독 중인 서비스가 없습니다.</p>
              ) : (
                <ul className="m-0 p-0 list-none flex flex-col gap-2">
                  {childSubs.map((sub) => {
                    const svc = SERVICES.find((s) => s.slug === sub.serviceSlug);
                    const isActive = sub.status === "active" && !!sub.endDate && sub.endDate > now;
                    return (
                      <li key={sub.id} className="flex items-center gap-2 bg-p-bg rounded-lg px-3.5 py-2.5">
                        {/* 서비스명 */}
                        <span className="flex items-center gap-1.5 text-sm font-medium text-black/95 flex-1 min-w-0">
                          {svc && <ServiceIcon service={svc} size={16} />}{svc?.name ?? sub.serviceSlug}
                        </span>
                        {/* 구독 상태 배지 */}
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold shrink-0 whitespace-nowrap" style={{ backgroundColor: isActive ? "#f0faf1" : "#fff5f5", color: isActive ? "#2da040" : "#c00000" }}>
                          {isActive ? "구독 중" : "정지중"}
                        </span>
                        {/* 종료일 */}
                        <div className="w-20 shrink-0 text-right">
                          {sub.endDate && <div className="text-[11px] text-p-muted">~ {formatDate(sub.endDate)}</div>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <ReferralSection familyId={familyId} userId={userId} userName={userName} walletCoupons={walletCoupons} />
    </>
  );
}

// ── 추천코드 + 쿠폰함 ──────────────────────────────────────────────────────────

function ReferralSection({ familyId, userId, userName, walletCoupons }: { familyId: string; userId: string; userName: string | null; walletCoupons: WalletCoupon[] }) {
  const [myReferralCode, setMyReferralCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    const code = userId.toLowerCase();
    getDoc(doc(db, "referralCodes", code)).then(async (snap) => {
      if (!snap.exists()) {
        await setDoc(doc(db, "referralCodes", code), {
          familyId, referrerName: userName ?? "", createdAt: serverTimestamp(),
        });
      }
      setMyReferralCode(code);
    });
  }, [familyId, userId, userName]);

  if (!myReferralCode) return null;

  const nowDate = new Date();
  const thisMonthCount = walletCoupons.filter((c) => {
    if (!c.createdAt) return false;
    return c.createdAt.getFullYear() === nowDate.getFullYear() && c.createdAt.getMonth() === nowDate.getMonth();
  }).length;

  return (
    <div className="mt-5 bg-white border border-black/10 rounded-xl px-5 py-4" style={{ boxShadow: T.shadow }}>
      <div className="text-[11px] font-semibold text-p-muted tracking-[0.06em] mb-2">내 추천코드</div>
      <div className="flex items-center gap-2">
        <span className="flex-1 font-mono text-[13px] font-bold text-black/95 bg-p-bg rounded-md px-2.5 py-[7px] overflow-hidden text-ellipsis whitespace-nowrap">{myReferralCode}</span>
        <button
          onClick={() => { navigator.clipboard.writeText(myReferralCode); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000); }}
          className="h-[34px] px-3.5 rounded-[7px] border border-black/10 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
          style={{ backgroundColor: codeCopied ? "#f0fff4" : "#ffffff", color: codeCopied ? "#1a7f4b" : "#615d59" }}
        >
          {codeCopied ? "복사됨 ✓" : "복사"}
        </button>
      </div>
      <div className="mt-2 text-[11px] text-p-secondary leading-[1.7]">
        친구가 내 코드로 가입하면 친구는 10% 할인, 나도 10% 할인 쿠폰 1장 자동 적립
        <span
          className="inline-flex items-center ml-1.5 rounded-full px-2 py-px text-[10px] font-semibold"
          style={{ backgroundColor: thisMonthCount >= 3 ? "#fff5f5" : "#f6f5f4", color: thisMonthCount >= 3 ? "#c00000" : "#a39e98" }}
        >
          이번 달 {thisMonthCount}/3건
        </span>
      </div>
      {walletCoupons.length > 0 && (
        <div className="mt-2.5 pt-2.5 border-t border-black/[0.06]">
          <div className="text-[11px] font-semibold text-p-muted mb-1.5">🎟 쿠폰함 ({walletCoupons.filter(c => !c.used).length}장 사용 가능)</div>
          <div className="flex flex-col gap-1">
            {walletCoupons.map((c) => (
              <div key={c.id} className="flex items-center gap-2" style={{ opacity: c.used ? 0.5 : 1 }}>
                <span className="text-xs flex-1 text-p-secondary">{c.note || "추천 보상 쿠폰"}</span>
                <span className="text-xs font-bold" style={{ color: c.used ? "#a39e98" : "#38a848", textDecoration: c.used ? "line-through" : "none" }}>{c.discountPercent}%</span>
                <span className="text-[11px] rounded-full px-2 py-0.5 font-semibold" style={{ backgroundColor: c.used ? "#f5f5f5" : "#f0fff4", color: c.used ? "#a39e98" : "#1a7f4b" }}>
                  {c.used ? "사용됨" : "미사용"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
