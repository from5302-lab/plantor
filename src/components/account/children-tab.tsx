"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { T } from "@/lib/design-tokens";
import { SERVICES } from "@/data/site";
import { formatDate } from "@/lib/format";
import { ServiceIcon } from "@/components/ui/service-icon";
import { REASONS_6HDL } from "@/lib/types";
import type { Child, Subscription, WalletCoupon, TaskCheck } from "@/lib/types";
import type { RenewalTarget } from "./renewal-modal";
import { StudentWeekJournal, type JournalStudent } from "./direct-journal-panel";
import { StudentLearningGrid } from "@/components/shared/student-learning-grid";

function tsToDate(ts: unknown): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts === "object" && "toDate" in (ts as object))
    return (ts as { toDate: () => Date }).toDate();
  return null;
}

// ── 학생 연락처 입력 (학부모가 직접 입력 → 미완료 알림 발송용) ─────────────────
function EditableChildPhone({ childId, phone }: { childId: string; phone: string }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(phone);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await httpsCallable(functions, "updateStudentPhone")({ childId, phone: val });
      setEditing(false);
    } catch (e) { alert(e instanceof Error ? e.message : "연락처 저장에 실패했어요."); }
    finally { setSaving(false); }
  }

  if (editing) {
    return (
      <span className="flex items-center gap-1">
        <input
          value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          autoFocus disabled={saving} placeholder="010-0000-0000" inputMode="numeric"
          className="w-[128px] rounded-md border px-2 py-1 text-[12px] outline-none"
          style={{ borderColor: "#097fe8", color: "rgba(0,0,0,0.9)" }}
        />
        <button onClick={save} disabled={saving} className="text-[11px] font-bold" style={{ color: "#097fe8" }}>저장</button>
      </span>
    );
  }
  return (
    <button
      onClick={() => { setVal(phone); setEditing(true); }}
      title="학생 연락처 (미완료 알림 문자 발송용)"
      className="rounded-full px-2.5 py-[3px] text-[11px] font-semibold whitespace-nowrap cursor-pointer border-none"
      style={{ backgroundColor: phone ? "#f0faf1" : "#fff6e5", color: phone ? "#2a8438" : "#92660a" }}
    >
      {phone ? `📱 ${phone}` : "📱 학생 연락처 입력"}
    </button>
  );
}

// ── 자녀 카드 목록 ─────────────────────────────────────────────────────────────

interface ChildrenSectionProps {
  children: Child[];
  subscriptions: Subscription[];
  now: Date;
  setRenewalTarget: (target: RenewalTarget | null) => void;
  familyId: string;
  userId: string;
  userName: string | null;
  walletCoupons: WalletCoupon[];
  journalStudents: JournalStudent[];
}

export function ChildrenSection({
  children,
  subscriptions,
  now,
  setRenewalTarget,
  familyId,
  userId,
  userName,
  walletCoupons,
  journalStudents,
}: ChildrenSectionProps) {
  // 체크 실시간 구독 (6Hdl 사유 통계용 — 주간 그리드는 공용 StudentLearningGrid가 자체 구독)
  const [taskChecks, setTaskChecks] = useState<TaskCheck[]>([]);

  useEffect(() => {
    if (children.length === 0) return;
    const ids = children.map(c => c.id);
    // 복합 인덱스(childId in + date범위) 회피: childId in 만으로 구독하고 주간은 렌더에서 필터.
    // (범위 쿼리는 인덱스 미존재 시 조용히 실패해 과거 완료가 안 뜨는 버그)
    const unsub = onSnapshot(
      query(collection(db, "taskChecks"), where("childId", "in", ids)),
      (snap) => setTaskChecks(snap.docs.map(d => ({
        id: d.id,
        taskId: d.data().taskId ?? "",
        childId: d.data().childId ?? "",
        date: d.data().date ?? "",
        status: d.data().status ?? "error",
        detail: d.data().detail ?? null,
        reason: d.data().reason ?? null,
        reasonNote: d.data().reasonNote ?? null,
        checkedBy: d.data().checkedBy ?? "student",
        checkedAt: tsToDate(d.data().checkedAt),
      })))
    );
    return unsub;
  }, [children]);

  return (
    <>
      {children.some((c) => !c.studentPhone) && (
        <div className="mb-3 rounded-xl px-4 py-3 text-[13px] leading-relaxed" style={{ backgroundColor: "#fff6e5", color: "#92660a", border: "1px solid #f2d59a" }}>
          📱 <b>자녀 연락처를 입력해 주세요.</b> 과제를 다 못 끝낸 날 저녁, 자녀에게 안내 문자를 보내드려요. 각 자녀 카드의 <b>“학생 연락처 입력”</b>을 눌러 번호를 넣어주세요.
        </div>
      )}
      <div className="flex flex-col gap-3">
        {children.map((child) => {
          const childSubs = subscriptions.filter((s) => s.childId === child.id);
          const childJournal = journalStudents.find((s) => s.studentName === child.name);
          const childChecks = taskChecks.filter(c => c.childId === child.id);

          // 6Hdl 사유 통계
          const weekReasons = childChecks.filter(c => c.status === "not_done" && c.reason);
          const reasonCounts: Record<string, number> = {};
          weekReasons.forEach(c => { reasonCounts[c.reason!] = (reasonCounts[c.reason!] ?? 0) + 1; });
          const topReason = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0];

          return (
            <div key={child.id} className="bg-white border border-black/10 rounded-xl p-5" style={{ boxShadow: T.shadow }}>
              <div className="flex items-center justify-between gap-2.5 mb-3">
                <div className="flex items-center gap-2">
                  <img src="/favicon.svg" alt="" width={16} height={16} />
                  <span className="text-[15px] font-bold text-black/95">{child.name}</span>
                  {child.grade && <span className="text-[13px] text-p-muted">{child.grade}</span>}
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <EditableChildPhone childId={child.id} phone={child.studentPhone ?? ""} />
                  {child.loginId && <span className="rounded-full bg-p-bg px-2.5 py-[3px] font-mono text-[11px] text-p-secondary whitespace-nowrap">ID: {child.loginId}</span>}
                </div>
              </div>

              {/* 주간 학습 현황 — 어드민과 동일한 공용 그리드(읽기전용).
                  주 이동·완료율·날짜 클릭 시 그날 자동인증 결과까지 그리드에 내장 */}
              <div className="-mx-5 mb-3.5">
                <StudentLearningGrid
                  childId={child.id}
                  subscribedSlugs={childSubs.map((s) => s.serviceSlug)}
                  showWeekNav
                  readOnly
                />
              </div>

              {/* 수업일지 (직강 자녀만 — 일지가 있을 때) */}
              {childJournal && childJournal.logs.length > 0 && (
                <div className="mb-3.5">
                  <StudentWeekJournal logs={childJournal.logs} />
                </div>
              )}

              {/* 6Hdl 사유 분석 */}
              {weekReasons.length > 0 && (
                <div className="mb-3 bg-[#fff5f5] rounded-lg px-3.5 py-2.5">
                  <div className="text-[10px] font-bold text-[#c00000] tracking-[0.06em] mb-1.5">미완료 사유 ({weekReasons.length}건)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {REASONS_6HDL.map(r => {
                      const cnt = reasonCounts[r.slug] ?? 0;
                      if (cnt === 0) return null;
                      return (
                        <span key={r.slug} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white"
                          style={{ color: "#c00000", border: "1px solid rgba(200,0,0,0.15)" }}>
                          {r.icon} {r.name} {cnt}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 구독 서비스 목록 */}
              {childSubs.length === 0 ? (
                <p className="text-[13px] text-p-muted">구독 중인 서비스가 없습니다.</p>
              ) : (
                <ul className="m-0 p-0 list-none flex flex-col gap-2">
                  {childSubs.map((sub) => {
                    const svc = SERVICES.find((s) => s.slug === sub.serviceSlug);
                    const valid = !!sub.endDate && sub.endDate > now;
                    const isActive = sub.status === "active" && valid;
                    const isDirect = sub.status === "transferred" && valid;
                    const badgeLabel = (isActive || isDirect) ? "구독 중" : "정지중";
                    const badgeActive = isActive || isDirect;
                    return (
                      <li key={sub.id} className="flex items-center gap-2 bg-p-bg rounded-lg px-3.5 py-2.5">
                        <span className="flex items-center gap-1.5 text-sm font-medium text-black/95 flex-1 min-w-0">
                          {svc && <ServiceIcon service={svc} size={16} />}{svc?.name ?? sub.serviceSlug}
                        </span>
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold shrink-0 whitespace-nowrap" style={{ backgroundColor: badgeActive ? "#f0faf1" : "#fff5f5", color: badgeActive ? "#2da040" : "#c00000" }}>
                          {badgeLabel}
                        </span>
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

    </>
  );
}

