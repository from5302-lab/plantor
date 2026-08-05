"use client";

import { useState, useEffect } from "react";
import { addDoc, collection, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { SITE, SERVICES } from "@/data/site";
import type { Service } from "@/data/site";
import { validateId } from "@/lib/auth-context";
import { useServices } from "@/lib/services-context";
import { formatWon } from "@/lib/format";
import { ServiceIcon } from "@/components/ui/service-icon";
import { MonthsPicker } from "@/components/ui/months-picker";
import { isApplicationClosed } from "@/lib/application-window";
import type { Subscription, WalletCoupon } from "@/lib/types";

const GRADES = ["미취학","초1","초2","초3","초4","초5","초6","중1","중2","중3"];

type NewChildEntry = { name: string; grade: string; loginId: string; selectedServices: string[] };
const emptyNewChild = (): NewChildEntry => ({ name: "", grade: "", loginId: "", selectedServices: [] });

function calcSubRenewalPrice(sub: Subscription, months: number): { base: number; orig: number } {
  const full = sub.monthlyPrice;
  const disc = sub.discount ?? 0;
  return { base: (full - disc) * months, orig: full * months };
}

export type ChildInfo = { id: string; name: string; grade: string; loginId: string };
export type RenewalTarget = { familyId: string; children: ChildInfo[]; allSubs: Subscription[] };

export function RenewalModal({
  target,
  walletCoupons,
  onClose,
}: {
  target: RenewalTarget;
  walletCoupons: WalletCoupon[];
  onClose: () => void;
}) {
  const [checkedMap, setCheckedMap] = useState<Map<string, Set<string>>>(() => {
    const m = new Map<string, Set<string>>();
    target.children.forEach((c) => {
      m.set(c.id, new Set(target.allSubs.filter((s) => s.childId === c.id).map((s) => s.serviceSlug)));
    });
    return m;
  });
  const [expandedSet, setExpandedSet] = useState<Set<string>>(() => new Set(target.children.map((c) => c.id)));
  // 서비스별 기간: 키 = "child:{childId}:{slug}" | "parent:{slug}" | "new:{idx}:{slug}"
  const [monthsMap, setMonthsMap] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [newChildren, setNewChildren] = useState<NewChildEntry[]>([]);
  const [showNewChildForm, setShowNewChildForm] = useState(false);
  const [newChildError, setNewChildError] = useState("");
  const { signupServices: activeServices } = useServices();

  const parentServices = activeServices.filter(
    (s) => s.targetGrades?.includes("학부모")
  );
  const childOnlyServices = activeServices.filter(
    (s) => !s.targetGrades?.includes("학부모")
  );
  const [checkedParent, setCheckedParent] = useState<Set<string>>(
    () => new Set(target.allSubs.filter((s) => !s.childId).map((s) => s.serviceSlug))
  );
  // 라인업에 없는 학부모 구독 — 행을 안 그리면 초기 체크만 남아 제출이 막힌다
  const extraParentSubs = target.allSubs.filter(
    (s) => !s.childId && !parentServices.some((svc) => svc.slug === s.serviceSlug)
  );

  function toggleParent(slug: string) {
    setCheckedParent((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  }

  const bankLine = `${SITE.bank.name} ${SITE.bank.account} (예금주: ${SITE.bank.holder})`;

  function toggleCheck(childId: string, slug: string) {
    setCheckedMap((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(childId) ?? []);
      if (set.has(slug)) set.delete(slug); else set.add(slug);
      next.set(childId, set);
      return next;
    });
  }

  function toggleExpand(childId: string) {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(childId)) next.delete(childId); else next.add(childId);
      return next;
    });
  }

  function getSubForSlug(childId: string, slug: string): Subscription | undefined {
    return target.allSubs.find((s) => s.childId === childId && s.serviceSlug === slug);
  }

  function getMonths(key: string): number | null {
    return monthsMap[key] ?? null;
  }
  function setMonths(key: string, months: number) {
    setMonthsMap((prev) => ({ ...prev, [key]: months }));
  }

  function calcTotal(): { base: number; orig: number } {
    let base = 0, orig = 0;
    target.children.forEach((child) => {
      const checked = checkedMap.get(child.id) ?? new Set<string>();
      checked.forEach((slug) => {
        const months = getMonths(`child:${child.id}:${slug}`);
        if (!months) return;
        const sub = getSubForSlug(child.id, slug);
        if (sub) {
          const r = calcSubRenewalPrice(sub, months);
          base += r.base; orig += r.orig;
        } else {
          const svc = activeServices.find((s) => s.slug === slug);
          const monthly = svc?.pricePerMonth ?? 0;
          base += monthly * months; orig += monthly * months;
        }
      });
    });
    newChildren.forEach((nc, idx) => {
      nc.selectedServices.forEach((slug) => {
        const months = getMonths(`new:${idx}:${slug}`);
        if (!months) return;
        const svc = activeServices.find((s) => s.slug === slug);
        const monthly = svc?.pricePerMonth ?? 0;
        base += monthly * months; orig += monthly * months;
      });
    });
    checkedParent.forEach((slug) => {
      const months = getMonths(`parent:${slug}`);
      if (!months) return;
      const svc = activeServices.find((s) => s.slug === slug);
      const monthly = svc?.pricePerMonth ?? 0;
      base += monthly * months; orig += monthly * months;
    });
    return { base, orig };
  }

  const { base: baseAmount, orig: origAmount } = calcTotal();
  const finalAmount = baseAmount;
  const newChildChecked = newChildren.reduce((s, nc) => s + nc.selectedServices.length, 0);
  const totalChecked = Array.from(checkedMap.values()).reduce((s, set) => s + set.size, 0) + checkedParent.size + newChildChecked;

  // 모든 체크된 서비스에 기간이 선택되었는지
  const allMonthsSelected = (() => {
    for (const [childId, slugs] of checkedMap) {
      for (const slug of slugs) {
        if (!getMonths(`child:${childId}:${slug}`)) return false;
      }
    }
    for (let idx = 0; idx < newChildren.length; idx++) {
      for (const slug of newChildren[idx].selectedServices) {
        if (!getMonths(`new:${idx}:${slug}`)) return false;
      }
    }
    for (const slug of checkedParent) {
      if (!getMonths(`parent:${slug}`)) return false;
    }
    return totalChecked > 0;
  })();

  async function handleSubmit() {
    if (closed || !allMonthsSelected || submitting) return;
    for (let i = 0; i < newChildren.length; i++) {
      const nc = newChildren[i];
      const label = `신규 자녀 ${i + 1}`;
      if (!nc.name.trim()) { setNewChildError(`${label} 이름을 입력해 주세요.`); return; }
      if (!nc.grade) { setNewChildError(`${label} 학년을 선택해 주세요.`); return; }
      const idErr = validateId(nc.loginId.trim());
      if (idErr) { setNewChildError(`${label} 아이디: ${idErr}`); return; }
      if (nc.selectedServices.length === 0) { setNewChildError(`${label} 서비스를 선택해 주세요.`); return; }
    }
    setSubmitting(true);
    try {
      function makeRequest(base: number, overrides: Record<string, unknown>) {
        return addDoc(collection(db, "renewalRequests"), {
          familyId: target.familyId, amount: base,
          finalAmount: base,
          status: "pending", createdAt: serverTimestamp(),
          ...overrides,
        });
      }

      const requests: Promise<unknown>[] = [];
      target.children.forEach((child) => {
        (checkedMap.get(child.id) ?? new Set<string>()).forEach((slug) => {
          const months = getMonths(`child:${child.id}:${slug}`)!;
          const sub = getSubForSlug(child.id, slug);
          const svc = activeServices.find((s) => s.slug === slug);
          const base = sub ? calcSubRenewalPrice(sub, months).base : (svc?.pricePerMonth ?? 0) * months;
          requests.push(makeRequest(base, {
            childId: child.id, subscriptionId: sub?.id ?? null,
            childName: child.name, serviceName: svc?.name ?? sub?.customName ?? slug, serviceSlug: slug, months,
            currentEndDate: sub?.endDate ? Timestamp.fromDate(sub.endDate) : null, isNew: !sub,
          }));
        });
      });
      checkedParent.forEach((slug) => {
        const months = getMonths(`parent:${slug}`)!;
        const svc = activeServices.find((s) => s.slug === slug);
        // 기존 학부모 sub 조회 (childId가 null/없음 + 같은 slug). 있으면 연장으로, 없으면 신규로.
        const parentSub = target.allSubs.find((s) => !s.childId && s.serviceSlug === slug);
        const base = parentSub ? calcSubRenewalPrice(parentSub, months).base : (svc?.pricePerMonth ?? 0) * months;
        requests.push(makeRequest(base, {
          childId: null, subscriptionId: parentSub?.id ?? null, childName: null,
          serviceName: svc?.name ?? parentSub?.customName ?? slug, serviceSlug: slug, months,
          currentEndDate: parentSub?.endDate ? Timestamp.fromDate(parentSub.endDate) : null,
          isNew: !parentSub, isParentService: true,
        }));
      });
      newChildren.forEach((nc, idx) => {
        nc.selectedServices.forEach((slug) => {
          const months = getMonths(`new:${idx}:${slug}`)!;
          const svc = activeServices.find((s) => s.slug === slug);
          const base = (svc?.pricePerMonth ?? 0) * months;
          requests.push(makeRequest(base, {
            childId: null, subscriptionId: null, childName: nc.name,
            serviceName: svc?.name ?? slug, serviceSlug: slug, months,
            currentEndDate: null, isNew: true, isNewChild: true, newChildGrade: nc.grade, newChildLoginId: nc.loginId,
          }));
        });
      });
      await Promise.all(requests);

      setDone(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "신청 중 오류가 발생했습니다.");
      setSubmitting(false);
    }
  }

  const closed = isApplicationClosed();
  const canSubmit = allMonthsSelected && !submitting && !closed;

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 bg-[rgba(0,0,0,0.4)] z-[200]" />
      <div className="fixed inset-0 flex items-center justify-center z-[201] px-5">
        <div className="bg-white rounded-2xl w-full max-w-[420px] max-h-[90vh] overflow-y-auto" style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.15)" }}>
          {done ? (
            <div className="text-center px-6 py-10">
              <div className="text-4xl mb-3">✅</div>
              <div className="text-base font-bold text-black/95 mb-2">신청 완료</div>
              <p className="text-[13px] text-p-secondary leading-relaxed">입금 확인 후 1~2영업일 내에 구독이 연장됩니다.</p>
              <button onClick={onClose} className="mt-5 w-full h-11 rounded-lg bg-p-green text-white text-sm font-semibold border-0 cursor-pointer">확인</button>
            </div>
          ) : closed ? (
            <div className="text-center px-6 py-10">
              <div className="text-4xl mb-3">🗓️</div>
              <div className="text-base font-bold text-black/95 mb-2">이번 달 연장신청이 마감되었어요</div>
              <p className="text-[13px] text-p-secondary leading-relaxed">신청은 매달 25일까지 받으며,<br />다음 달 1일에 다시 열립니다.</p>
              <button onClick={onClose} className="mt-5 w-full h-11 rounded-lg bg-p-green text-white text-sm font-semibold border-0 cursor-pointer">확인</button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-5 pt-5">
                <div className="text-[15px] font-bold text-black/95">구독 연장 신청</div>
                <button onClick={onClose} className="bg-transparent border-0 cursor-pointer text-xl text-p-muted px-2 py-1 leading-none">×</button>
              </div>

              <div className="px-5 py-4 flex flex-col gap-3">

                {/* 자녀별 accordion */}
                {target.children.map((child) => {
                  const childSubs = target.allSubs.filter((s) => s.childId === child.id);
                  const checked = checkedMap.get(child.id) ?? new Set<string>();
                  const isExpanded = expandedSet.has(child.id);
                  return (
                    <div key={child.id} className="border border-black/10 rounded-[10px] overflow-hidden">
                      <button
                        onClick={() => toggleExpand(child.id)}
                        className="w-full flex items-center justify-between px-[14px] py-[10px] bg-p-bg border-0 cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-1.5">
                          <img src="/favicon.svg" alt="" width={14} height={14} />
                          <span className="text-[13px] font-bold text-black/95">{child.name}</span>
                          {child.grade && <span className="text-[12px] text-p-muted">{child.grade}</span>}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-p-muted">{checked.size}개 선택</span>
                          <svg width="10" height="9" viewBox="0 0 10 9" style={{ color: "#a39e98", flexShrink: 0, transform: isExpanded ? "none" : "rotate(180deg)", transition: "transform 0.15s" }}>
                            <polygon points="5,0 10,9 0,9" fill="currentColor" />
                          </svg>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="px-[14px] pt-1.5 pb-2.5">
                          {childOnlyServices.map((svc, i, arr) => {
                            const sub = childSubs.find((s) => s.serviceSlug === svc.slug);
                            const origPrice = sub ? sub.monthlyPrice : (svc.pricePerMonth ?? 0);
                            const discAmt = sub?.discount ?? 0;
                            const netPrice = origPrice - discAmt;
                            const isChecked = checked.has(svc.slug);
                            const isLast = i === arr.length - 1;
                            const monthsKey = `child:${child.id}:${svc.slug}`;
                            return (
                              <div key={svc.slug} style={{ borderBottom: isLast ? "none" : "1px solid rgba(0,0,0,0.04)" }}>
                                <div
                                  onClick={() => toggleCheck(child.id, svc.slug)}
                                  className="flex items-center gap-2 py-2 cursor-pointer"
                                >
                                  <span className="flex items-center gap-1.5 flex-1 text-[13px] text-black/95">
                                    <ServiceIcon service={svc} size={14} />{svc.name}
                                  </span>
                                  <span className="text-[12px] text-p-secondary text-right">
                                    {discAmt > 0 ? (
                                      <span className="flex flex-col items-end gap-px">
                                        <span className="line-through text-p-muted text-[11px]">{formatWon(origPrice)}/월</span>
                                        <span style={{ color: "#1a7f4b", fontWeight: 700 }}>{formatWon(netPrice)}/월</span>
                                      </span>
                                    ) : `${formatWon(origPrice)}/월`}
                                  </span>
                                  <div
                                    className="flex items-center justify-center shrink-0"
                                    style={{ width: 18, height: 18, borderRadius: 4, border: isChecked ? "none" : "2px solid #a39e98", backgroundColor: isChecked ? "#38a848" : "transparent" }}
                                  >
                                    {isChecked && <span className="text-white text-[10px] font-extrabold">✓</span>}
                                  </div>
                                </div>
                                {isChecked && <MonthsPicker value={getMonths(monthsKey)} onChange={(m) => setMonths(monthsKey, m)} />}
                              </div>
                            );
                          })}
                          {/* 라인업에 없는 구독 (1:1 학습 등) — 행을 안 그리면 초기 체크만 남아 기간 선택이 불가능해 제출이 막힌다 */}
                          {childSubs.filter((s) => !childOnlyServices.some((svc) => svc.slug === s.serviceSlug)).map((sub) => {
                            const netPrice = sub.monthlyPrice - (sub.discount ?? 0);
                            const isChecked = checked.has(sub.serviceSlug);
                            const monthsKey = `child:${child.id}:${sub.serviceSlug}`;
                            return (
                              <div key={sub.serviceSlug} style={{ borderTop: "1px solid rgba(0,0,0,0.04)" }}>
                                <div
                                  onClick={() => toggleCheck(child.id, sub.serviceSlug)}
                                  className="flex items-center gap-2 py-2 cursor-pointer"
                                >
                                  <span className="flex items-center gap-1.5 flex-1 text-[13px] text-black/95">
                                    <span className="text-[14px]">🎓</span>{sub.customName ?? sub.serviceSlug}
                                  </span>
                                  <span className="text-[12px] text-p-secondary text-right">{formatWon(netPrice)}/월</span>
                                  <div
                                    className="flex items-center justify-center shrink-0"
                                    style={{ width: 18, height: 18, borderRadius: 4, border: isChecked ? "none" : "2px solid #a39e98", backgroundColor: isChecked ? "#38a848" : "transparent" }}
                                  >
                                    {isChecked && <span className="text-white text-[10px] font-extrabold">✓</span>}
                                  </div>
                                </div>
                                {isChecked && <MonthsPicker value={getMonths(monthsKey)} onChange={(m) => setMonths(monthsKey, m)} />}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* 신규 자녀 카드 */}
                {newChildren.map((nc, idx) => (
                  <div key={idx} className="border border-p-green rounded-[10px] overflow-hidden">
                    <div className="flex items-center justify-between px-[14px] py-[10px] bg-[#f0faf1]">
                      <span className="text-[13px] font-bold text-p-green">
                        신규 자녀 {idx + 1} {nc.name && `— ${nc.name}`}
                      </span>
                      <button
                        onClick={() => setNewChildren((prev) => prev.filter((_, i) => i !== idx))}
                        className="bg-transparent border-0 cursor-pointer text-sm text-p-muted px-1"
                      >✕</button>
                    </div>
                    <div className="px-[14px] py-3 flex flex-col gap-2.5">
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <div className="text-[11px] font-semibold text-p-secondary mb-1">이름 <span className="text-p-green">*</span></div>
                          <input
                            value={nc.name}
                            onChange={(e) => setNewChildren((prev) => prev.map((c, i) => i === idx ? { ...c, name: e.target.value } : c))}
                            className="w-full h-9 rounded-lg border border-black/10 px-2.5 text-[13px] text-black/95 bg-white outline-none box-border"
                          />
                        </div>
                        <div className="w-[90px]">
                          <div className="text-[11px] font-semibold text-p-secondary mb-1">학년 <span className="text-p-green">*</span></div>
                          <select
                            value={nc.grade}
                            onChange={(e) => setNewChildren((prev) => prev.map((c, i) => i === idx ? { ...c, grade: e.target.value } : c))}
                            className="w-full h-9 rounded-lg border border-black/10 pr-7 pl-2 text-[13px] text-black/95 bg-white outline-none cursor-pointer"
                            style={{ appearance: "none", WebkitAppearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23615d59'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center", backgroundSize: "10px 6px" }}
                          >
                            <option value="">선택</option>
                            {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold text-p-secondary mb-1">아이디 (영문 소문자+숫자, 6~15자) <span className="text-p-green">*</span></div>
                        <input
                          value={nc.loginId}
                          onChange={(e) => setNewChildren((prev) => prev.map((c, i) => i === idx ? { ...c, loginId: e.target.value.toLowerCase() } : c))}
                          className="w-full h-9 rounded-lg border border-black/10 px-2.5 text-[13px] font-mono bg-white outline-none box-border"
                        />
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold text-p-secondary mb-1.5">신청 서비스 <span className="text-p-green">*</span></div>
                        <div className="flex flex-col gap-1.5">
                          {childOnlyServices.map((svc) => {
                            const isChecked = nc.selectedServices.includes(svc.slug);
                            const monthsKey = `new:${idx}:${svc.slug}`;
                            return (
                              <div key={svc.slug}>
                                <div
                                  onClick={() => setNewChildren((prev) => prev.map((c, i) => {
                                    if (i !== idx) return c;
                                    const next = isChecked
                                      ? c.selectedServices.filter((s) => s !== svc.slug)
                                      : [...c.selectedServices, svc.slug];
                                    return { ...c, selectedServices: next };
                                  }))}
                                  className="flex items-center gap-2 py-1.5 cursor-pointer"
                                >
                                  <div
                                    className="flex items-center justify-center shrink-0"
                                    style={{ width: 16, height: 16, borderRadius: 4, border: isChecked ? "none" : "2px solid #a39e98", backgroundColor: isChecked ? "#38a848" : "transparent" }}
                                  >
                                    {isChecked && <span className="text-white text-[9px] font-extrabold">✓</span>}
                                  </div>
                                  <ServiceIcon service={svc} size={14} />
                                  <span className="flex-1 text-[13px] text-black/95">{svc.name}</span>
                                  <span className="text-[12px] text-p-secondary">{svc.priceLabel}</span>
                                </div>
                                {isChecked && <MonthsPicker value={getMonths(monthsKey)} onChange={(m) => setMonths(monthsKey, m)} />}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* 자녀 추가 버튼 */}
                {newChildError && <div className="text-[12px] text-[#c00000]">{newChildError}</div>}
                <button
                  onClick={() => {
                    // 직전 신규 자녀 유효성 검사
                    if (newChildren.length > 0) {
                      const last = newChildren[newChildren.length - 1];
                      if (!last.name.trim()) { setNewChildError("자녀 이름을 입력해 주세요."); return; }
                      if (!last.grade) { setNewChildError("학년을 선택해 주세요."); return; }
                      const idErr = validateId(last.loginId.trim());
                      if (idErr) { setNewChildError(`아이디: ${idErr}`); return; }
                      if (last.selectedServices.length === 0) { setNewChildError("서비스를 1개 이상 선택해 주세요."); return; }
                    }
                    setNewChildError("");
                    setNewChildren((prev) => [...prev, emptyNewChild()]);
                  }}
                  className="w-full py-2.5 rounded-[10px] border-[1.5px] border-dashed border-black/[0.18] bg-transparent text-[13px] font-semibold text-p-muted cursor-pointer"
                >
                  + 자녀 추가
                </button>

                {/* 학부모 서비스 */}
                {(parentServices.length > 0 || extraParentSubs.length > 0) && (
                  <div className="border border-black/10 rounded-[10px] overflow-hidden">
                    <div className="flex items-center gap-1.5 px-[14px] py-[10px] bg-p-bg border-b border-black/10">
                      <span className="text-[13px] font-bold text-black/95">학부모 서비스</span>
                      <span className="text-[11px] text-p-muted">{checkedParent.size}개 선택</span>
                    </div>
                    <div className="px-[14px] pt-1.5 pb-2.5">
                      {parentServices.map((svc, i, arr) => {
                        const isChecked = checkedParent.has(svc.slug);
                        const isLast = i === arr.length - 1;
                        const monthsKey = `parent:${svc.slug}`;
                        return (
                          <div key={svc.slug} style={{ borderBottom: isLast ? "none" : "1px solid rgba(0,0,0,0.04)" }}>
                            <div
                              onClick={() => toggleParent(svc.slug)}
                              className="flex items-center gap-2 py-2 cursor-pointer"
                            >
                              <span className="flex items-center gap-1.5 flex-1 text-[13px] text-black/95">
                                <ServiceIcon service={svc} size={14} />{svc.name}
                              </span>
                              <span className="text-[12px] text-p-secondary">{formatWon(svc.pricePerMonth ?? 0)}/월</span>
                              <div
                                className="flex items-center justify-center shrink-0"
                                style={{ width: 18, height: 18, borderRadius: 4, border: isChecked ? "none" : "2px solid #a39e98", backgroundColor: isChecked ? "#38a848" : "transparent" }}
                              >
                                {isChecked && <span className="text-white text-[10px] font-extrabold">✓</span>}
                              </div>
                            </div>
                            {isChecked && <MonthsPicker value={getMonths(monthsKey)} onChange={(m) => setMonths(monthsKey, m)} />}
                          </div>
                        );
                      })}
                      {extraParentSubs.map((sub) => {
                        const netPrice = sub.monthlyPrice - (sub.discount ?? 0);
                        const isChecked = checkedParent.has(sub.serviceSlug);
                        const monthsKey = `parent:${sub.serviceSlug}`;
                        return (
                          <div key={sub.serviceSlug} style={{ borderTop: "1px solid rgba(0,0,0,0.04)" }}>
                            <div
                              onClick={() => toggleParent(sub.serviceSlug)}
                              className="flex items-center gap-2 py-2 cursor-pointer"
                            >
                              <span className="flex items-center gap-1.5 flex-1 text-[13px] text-black/95">
                                <span className="text-[14px]">🎓</span>{sub.customName ?? sub.serviceSlug}
                              </span>
                              <span className="text-[12px] text-p-secondary">{formatWon(netPrice)}/월</span>
                              <div
                                className="flex items-center justify-center shrink-0"
                                style={{ width: 18, height: 18, borderRadius: 4, border: isChecked ? "none" : "2px solid #a39e98", backgroundColor: isChecked ? "#38a848" : "transparent" }}
                              >
                                {isChecked && <span className="text-white text-[10px] font-extrabold">✓</span>}
                              </div>
                            </div>
                            {isChecked && <MonthsPicker value={getMonths(monthsKey)} onChange={(m) => setMonths(monthsKey, m)} />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 입금 안내 + 총액 */}
                <div className="bg-p-bg rounded-lg px-[14px] py-3">
                  <div className="text-[11px] font-semibold text-p-muted mb-1 tracking-[0.06em]">입금 계좌</div>
                  <div className="text-[13px] font-semibold text-black/95">{bankLine}</div>
                  {allMonthsSelected && (
                    <div className="mt-2.5 pt-2.5 border-t border-black/[0.06] flex flex-col gap-1">
                      {origAmount > baseAmount && (
                        <div className="flex justify-between text-[12px] text-p-muted">
                          <span>정가 합계</span><span className="line-through">{formatWon(origAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-base font-extrabold text-p-green mt-0.5">
                        <span>총 입금액</span><span>{formatWon(finalAmount)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <p className="text-[12px] text-p-muted text-center mb-1 leading-relaxed">
                입금 확인 후 1~2영업일 내에 구독이 연장됩니다.
                <br />
                신청 후 24시간 이내에 입금이 확인되지 않으면 신청이 취소될 수 있어요.
              </p>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full h-12 rounded-lg text-[15px] font-bold border-0"
                style={{ backgroundColor: canSubmit ? "#38a848" : "rgba(0,0,0,0.08)", color: canSubmit ? "#ffffff" : "#a39e98", cursor: canSubmit ? "pointer" : "default" }}
              >
                {submitting ? "신청 중…"
                  : allMonthsSelected ? `연장 신청 · ${formatWon(finalAmount)}`
                  : totalChecked === 0 ? "과목을 선택해 주세요"
                  : "기간을 선택해 주세요"}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
