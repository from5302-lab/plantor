"use client";

import { useEffect, useState } from "react";
import { ChevronDown, X, Check } from "lucide-react";
import {
  collection, deleteDoc, doc, getDocs, getDoc, onSnapshot,
  orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { T } from "@/lib/design-tokens";
import { formatWon, formatDateTime } from "@/lib/format";

type UsageRecord = {
  type: "signup" | "renewal";
  parentName: string;
  date: Date;
  services: string[];
  couponDiscount: number;
};

export type CouponDoc = {
  code: string;
  discountType: "fixed" | "percent";
  discountAmount: number;
  usedBy: { familyId: string; childId: string; usedAt: Date } | null;
  createdAt: Date | null;
  expiresAt: Date | null;
  note: string;
  useCount: number;
  maxUses: number | null;
};

function CopyBtn({ text, copied, onCopy }: { text: string; copied: boolean; onCopy: () => void }) {
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).then(onCopy); }} title="복사" className="bg-transparent border-none cursor-pointer p-0 leading-none inline-flex items-center align-middle px-0.5">
      {copied
        ? <Check size={10} className="text-[#1a7f4b]" strokeWidth={3} />
        : <img src="/icons/copy.svg" width={13} height={13} alt="copy" className="block" />}
    </button>
  );
}

export function CouponTab() {
  const [coupons, setCoupons] = useState<CouponDoc[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [discountType, setDiscountType] = useState<"fixed" | "percent">("fixed");
  const [discountAmount, setDiscountAmount] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [note, setNote] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [usageMap, setUsageMap] = useState<Record<string, UsageRecord[]>>({});
  const [usageLoading, setUsageLoading] = useState(false);
  const [editingExpiry, setEditingExpiry] = useState<string | null>(null);

  async function handleUpdateExpiry(code: string, newDate: string) {
    try {
      await updateDoc(doc(db, "coupons", code), {
        expiresAt: newDate ? Timestamp.fromDate(new Date(newDate + "T23:59:59+09:00")) : null,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "만료일 수정 오류");
    }
    setEditingExpiry(null);
  }

  useEffect(() => {
    return onSnapshot(
      query(collection(db, "coupons"), orderBy("createdAt", "desc")),
      (snap) => setCoupons(snap.docs.map((d) => {
        const data = d.data();
        return {
          code: d.id,
          discountType: data.discountType ?? "fixed",
          discountAmount: data.discountAmount ?? 0,
          usedBy: data.usedBy ? {
            familyId: data.usedBy.familyId ?? "",
            childId: data.usedBy.childId ?? "",
            usedAt: data.usedBy.usedAt instanceof Timestamp
              ? data.usedBy.usedAt.toDate()
              : data.usedBy.usedAt
                ? new Date(data.usedBy.usedAt as string)
                : new Date(),
          } : null,
          createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate() : null,
          expiresAt: data.expiresAt ? (data.expiresAt as Timestamp).toDate() : null,
          note: data.note ?? "",
          useCount: data.useCount ?? 0,
          maxUses: data.maxUses ?? null,
        };
      }))
    );
  }, []);

  function generateCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  }

  async function handleCreate() {
    const trimCode = generateCode();
    const amt = Number(discountAmount);
    if (!discountAmount || isNaN(amt) || amt <= 0) { setFormError("할인 금액/비율을 입력해 주세요."); return; }
    if (discountType === "percent" && amt > 100) { setFormError("비율은 100 이하여야 합니다."); return; }
    setFormError(""); setCreating(true);
    try {
      const maxUsesNum = maxUses ? Number(maxUses) : null;
      await setDoc(doc(db, "coupons", trimCode), {
        code: trimCode, discountType, discountAmount: amt,
        usedBy: null, useCount: 0, maxUses: maxUsesNum || null,
        createdAt: serverTimestamp(),
        expiresAt: expiresAt ? Timestamp.fromDate(new Date(expiresAt + "T23:59:59+09:00")) : null,
        note: note.trim(),
      });
      setDiscountAmount(""); setExpiresAt(""); setNote(""); setMaxUses("");
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "발급 오류");
    } finally { setCreating(false); }
  }

  async function handleDelete(code: string) {
    if (!confirm(`쿠폰 "${code}"을 삭제하시겠습니까?`)) return;
    try { await deleteDoc(doc(db, "coupons", code)); }
    catch (err) { alert(err instanceof Error ? err.message : "삭제 오류"); }
  }

  async function fetchUsage(code: string) {
    if (usageMap[code]) return;
    setUsageLoading(true);
    try {
      const records: UsageRecord[] = [];

      // signups에서 검색
      const signupSnap = await getDocs(
        query(collection(db, "signups"), where("couponCode", "==", code))
      );
      for (const d of signupSnap.docs) {
        const data = d.data();
        const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
        const children = (data.children ?? []) as Array<{ name: string; selectedServices: string[] }>;
        const services = children.flatMap((c) => c.selectedServices ?? []);
        if (data.parentServices) services.push(...(data.parentServices as string[]));
        records.push({
          type: "signup",
          parentName: data.parentName ?? "",
          date: createdAt,
          services: [...new Set(services)],
          couponDiscount: (data.couponDiscount as number) ?? 0,
        });
      }

      // renewalRequests에서 검색
      const renewalSnap = await getDocs(
        query(collection(db, "renewalRequests"), where("couponCode", "==", code))
      );
      const familyCache = new Map<string, string>();
      // 동일 배치(familyId + 2분 윈도우) 그룹핑
      const batchMap = new Map<string, { familyId: string; services: Set<string>; discount: number; date: Date }>();
      for (const d of renewalSnap.docs) {
        const data = d.data();
        const familyId = data.familyId as string;
        const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
        const key = `${familyId}_${Math.floor(createdAt.getTime() / 120000)}`;
        if (!batchMap.has(key)) {
          batchMap.set(key, { familyId, services: new Set(), discount: 0, date: createdAt });
        }
        const batch = batchMap.get(key)!;
        if (data.serviceName) batch.services.add(data.serviceName as string);
        batch.discount += (data.couponDiscount as number) ?? 0;
      }
      for (const batch of batchMap.values()) {
        if (!familyCache.has(batch.familyId)) {
          try {
            const famSnap = await getDoc(doc(db, "families", batch.familyId));
            familyCache.set(batch.familyId, famSnap.data()?.parentName ?? batch.familyId);
          } catch {
            familyCache.set(batch.familyId, batch.familyId);
          }
        }
        records.push({
          type: "renewal",
          parentName: familyCache.get(batch.familyId)!,
          date: batch.date,
          services: [...batch.services],
          couponDiscount: batch.discount,
        });
      }

      records.sort((a, b) => b.date.getTime() - a.date.getTime());
      setUsageMap((prev) => ({ ...prev, [code]: records }));
    } catch (e) {
      setUsageMap((prev) => ({ ...prev, [code]: [] }));
    } finally {
      setUsageLoading(false);
    }
  }

  function toggleExpand(code: string) {
    if (expandedCode === code) {
      setExpandedCode(null);
    } else {
      setExpandedCode(code);
      fetchUsage(code);
    }
  }

  const unusedCount = coupons.filter((c) => c.useCount === 0).length;
  const usedCount = coupons.filter((c) => c.useCount > 0).length;

  const inputCls = "w-full px-2.5 py-2 rounded-[7px] border border-black/10 text-[13px] box-border outline-none bg-white";
  const selectCls = `${inputCls} appearance-none pr-8`;

  return (
    <>
      <style>{`
        @media (max-width: 600px) {
          .ct-coupon-row {
            display: flex !important;
            flex-wrap: wrap;
            align-items: center;
            gap: 6px 10px !important;
          }
          .ct-coupon-row > *:nth-child(1) { flex: 1 1 100%; }
          .ct-coupon-row > *:nth-child(7) { margin-left: auto; position: absolute; top: 10px; right: 10px; }
          .ct-coupon-card { position: relative; }
        }
      `}</style>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-4">
          <span className="text-[13px] text-p-muted">미사용 <strong className="text-black/95">{unusedCount}</strong></span>
          <span className="text-[13px] text-p-muted">사용됨 <strong className="text-black/95">{usedCount}</strong></span>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded border-none cursor-pointer px-[18px] py-[7px] text-[13px] font-semibold bg-p-green text-white"
        >
          + 쿠폰 발급
        </button>
      </div>

      {/* 발급 폼 */}
      {showForm && (
        <div className="bg-white border border-black/10 rounded-xl p-5 mb-4" style={{ boxShadow: T.shadow }}>
          <div className="grid gap-3 mb-3 grid-cols-2 max-[600px]:grid-cols-1">
            <div>
              <label className="text-[11px] font-semibold text-p-muted tracking-[0.06em]">할인 유형</label>
              <div className="relative mt-1">
                <select value={discountType} onChange={(e) => setDiscountType(e.target.value as "fixed" | "percent")} className={selectCls}
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23615d59'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center", backgroundSize: "10px 6px" }}>
                  <option value="fixed">금액 할인 (원)</option>
                  <option value="percent">비율 할인 (%)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-p-muted tracking-[0.06em]">
                할인 {discountType === "fixed" ? "금액 (원)" : "비율 (%)"}
              </label>
              <input type="number" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} className={`${inputCls} mt-1`} />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-p-muted tracking-[0.06em]">만료일 (선택)</label>
              <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={`${inputCls} mt-1`} />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-p-muted tracking-[0.06em]">최대 사용 횟수 (선택)</label>
              <input type="number" min="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className={`${inputCls} mt-1`} />
            </div>
          </div>
          <div className="mb-3">
            <label className="text-[11px] font-semibold text-p-muted tracking-[0.06em]">쿠폰이름 (선택)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={`${inputCls} mt-1`} />
          </div>
          {formError && <div className="text-xs text-[#c00000] mb-2.5">{formError}</div>}
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={creating} className="flex-1 h-[38px] rounded-[7px] border-none bg-p-green text-white text-[13px] font-semibold cursor-pointer">
              {creating ? "발급 중…" : "발급"}
            </button>
            <button onClick={() => setShowForm(false)} className="h-[38px] px-4 rounded-[7px] border border-black/10 bg-white text-[13px] text-p-secondary cursor-pointer">
              취소
            </button>
          </div>
        </div>
      )}

      {/* 목록 */}
      {coupons.length === 0 ? (
        <div className="rounded-xl border-[1.5px] border-dashed border-black/[0.12] bg-white py-12 px-6 text-center text-sm text-p-muted">
          발급된 쿠폰이 없습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {coupons.map((coupon) => {
            const hasUsage = coupon.useCount > 0;
            const isExpired = !!coupon.expiresAt && coupon.expiresAt < new Date();
            const status = isExpired ? "기간만료" : hasUsage ? "사용됨" : "미사용";
            const statusColor = isExpired ? "#c00000" : hasUsage ? "#a39e98" : "#1a7f4b";
            const statusBg = isExpired ? "#fff5f5" : hasUsage ? "#f5f5f5" : "#f0fff4";
            const isExpanded = expandedCode === coupon.code;
            const usage = usageMap[coupon.code];
            const isEditingExpiry = editingExpiry === coupon.code;
            const expiryStr = coupon.expiresAt
              ? `${coupon.expiresAt.getFullYear()}-${String(coupon.expiresAt.getMonth() + 1).padStart(2, "0")}-${String(coupon.expiresAt.getDate()).padStart(2, "0")}`
              : "";

            return (
              <div key={coupon.code} className="ct-coupon-card bg-white border border-black/10 rounded-xl overflow-hidden" style={{ boxShadow: T.shadow }}>
                <div
                  onClick={() => toggleExpand(coupon.code)}
                  className="ct-coupon-row px-[18px] py-[13px] cursor-pointer items-center gap-y-1.5"
                  style={{ display: "grid", gridTemplateColumns: "minmax(130px,auto) minmax(85px,auto) minmax(65px,auto) minmax(70px,auto) minmax(100px,auto) 1fr auto", gap: "0 12px" }}
                >
                  {/* 코드 + 복사 */}
                  <span className="flex items-center gap-1">
                    <span className="font-mono text-[15px] font-bold text-black/95">{coupon.code}</span>
                    <CopyBtn
                      text={`할인코드 입력란에 [${coupon.code}]을 입력하시면 ${coupon.discountType === "fixed" ? formatWon(coupon.discountAmount) : `${coupon.discountAmount}%`} 할인 받으실 수 있습니다. 👉 https://plantor.web.app/signup`}
                      copied={copiedCode === coupon.code}
                      onCopy={() => { setCopiedCode(coupon.code); setTimeout(() => setCopiedCode(null), 1500); }}
                    />
                  </span>
                  {/* 할인 */}
                  <span className="text-sm font-bold text-p-green whitespace-nowrap">
                    {coupon.discountType === "fixed" ? formatWon(coupon.discountAmount) : `${coupon.discountAmount}%`} 할인
                  </span>
                  {/* 상태 */}
                  <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-center whitespace-nowrap w-fit" style={{ backgroundColor: statusBg, color: statusColor }}>{status}</span>
                  {/* 사용횟수 */}
                  <span className="text-[11px] text-p-muted whitespace-nowrap">{coupon.useCount}{coupon.maxUses ? `/${coupon.maxUses}` : ""}회 사용</span>
                  {/* 만료일 */}
                  {isEditingExpiry ? (
                    <input
                      type="date"
                      defaultValue={expiryStr}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => handleUpdateExpiry(coupon.code, e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { handleUpdateExpiry(coupon.code, (e.target as HTMLInputElement).value); } if (e.key === "Escape") setEditingExpiry(null); }}
                      autoFocus
                      className="text-[11px] border border-black/20 rounded px-1.5 py-0.5 outline-none w-[120px]"
                    />
                  ) : (
                    <span
                      className="text-[11px] text-p-muted whitespace-nowrap cursor-pointer hover:underline"
                      onClick={(e) => { e.stopPropagation(); setEditingExpiry(coupon.code); }}
                      title="클릭하여 만료일 수정"
                    >
                      {coupon.expiresAt ? `~${coupon.expiresAt.toLocaleDateString("ko-KR")}` : "기한없음"}
                    </span>
                  )}
                  {/* 메모 */}
                  <span className="text-xs text-p-muted overflow-hidden text-ellipsis whitespace-nowrap">{coupon.note || ""}</span>
                  {/* 토글 + 삭제 */}
                  <div className="flex items-center gap-1">
                    <ChevronDown size={12} className="text-p-muted" style={{ transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(coupon.code); }} className="bg-transparent border-none cursor-pointer text-sm text-[rgba(200,0,0,0.4)] px-1.5 py-0.5"><X size={12} /></button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-black/[0.06] px-[18px] py-3 bg-[#fafaf9]">
                    {usageLoading && !usage ? (
                      <div className="text-[12px] text-p-muted py-1">조회 중…</div>
                    ) : !usage || usage.length === 0 ? (
                      <div className="text-[12px] text-p-muted py-1">사용 내역이 없습니다.</div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {usage.map((u, i) => (
                          <div key={i} className="flex items-center gap-2.5 text-[12px]">
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold shrink-0" style={{
                              backgroundColor: u.type === "signup" ? "#e8f5e9" : "#e3f2fd",
                              color: u.type === "signup" ? "#2e7d32" : "#1565c0",
                            }}>
                              {u.type === "signup" ? "신규" : "연장"}
                            </span>
                            <span className="font-semibold text-black/90 shrink-0">{u.parentName}</span>
                            {u.services.length > 0 && (
                              <span className="text-p-secondary">{u.services.join(", ")}</span>
                            )}
                            {u.couponDiscount > 0 && (
                              <span className="font-semibold shrink-0" style={{ color: "#1a7f4b" }}>−{formatWon(u.couponDiscount)}</span>
                            )}
                            <span className="text-p-muted ml-auto shrink-0">
                              {u.date.toLocaleDateString("ko-KR")} {u.date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
