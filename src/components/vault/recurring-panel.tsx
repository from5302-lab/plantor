"use client";

import { useState, useMemo } from "react";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatAmount, formatInputAmount, parseAmount, toDateString } from "@/lib/vault-utils";
import { ChevronDown, ChevronUp, Plus, ArrowDownToLine } from "lucide-react";
import { useAdminBilling } from "@/lib/vault/use-admin-billing";
import type { VaultEntry, RecurringItem, VaultCategory, DebtItem } from "./vault-shell";

type Status = "unpaid" | "paid";

type Props = {
  recurringItems: RecurringItem[];
  entries: VaultEntry[];
  categories: VaultCategory[];
  month: string; // "YYYY-MM"
};

export function RecurringPanel({ recurringItems, entries, categories, month }: Props) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<RecurringItem | null>(null);

  // (item, m)에 납부한 합계 (분납 포함)
  const paidFor = (itemId: string, m: string) =>
    entries.filter((e) => e.recurringId === itemId && e.date.startsWith(m)).reduce((s, e) => s + e.amount, 0);

  // 활성 고정거래 — 1순위: 미납 먼저(완료는 아래로), 2순위: 이름 가나다 오름차순
  const items = useMemo(() => {
    const paidOf = (r: RecurringItem) =>
      entries
        .filter((e) => e.recurringId === r.id && e.date.startsWith(month))
        .reduce((s, e) => s + e.amount, 0);
    const isPaid = (r: RecurringItem) => paidOf(r) >= r.amount;
    const nameOf = (r: RecurringItem) =>
      r.memo || r.category || (r.type === "income" ? "수입" : "지출");
    return recurringItems
      .filter((r) => r.active && (!r.startMonth || r.startMonth <= month))
      .sort((a, b) => {
        const pa = isPaid(a) ? 1 : 0;
        const pb = isPaid(b) ? 1 : 0;
        if (pa !== pb) return pa - pb; // 미납(0) → 완료(1)
        return nameOf(a).localeCompare(nameOf(b), "ko"); // 가나다 오름차순
      });
  }, [recurringItems, month, entries]);

  // 이번 달 상태 판정 (분납은 unpaid로 보되 진행률 표시)
  const statusOf = (item: RecurringItem): Status => {
    const paid = paidFor(item.id, month);
    if (paid >= item.amount) return "paid";
    return "unpaid";
  };

  // 서비스별 가맹비 (admin) — 미납/완료
  const { agencyByService } = useAdminBilling(month);
  const agencyKey = (key: string) => `agency_${key}_${month}`;
  const agencyPaid = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => { if (e.sourceKey?.startsWith("agency_")) set.add(e.sourceKey); });
    return set;
  }, [entries]);
  // 완료 카운트: 고정지출 + 서비스별 가맹비
  const paidCount =
    items.filter((i) => statusOf(i) === "paid").length +
    agencyByService.filter((a) => agencyPaid.has(agencyKey(a.key))).length;
  const totalCount = items.length + agencyByService.length;
  // 이번 달 미납분만 합산 (고정지출 + 서비스별 가맹비)
  const pendingTotal =
    items
      .filter((i) => i.type === "expense")
      .reduce((s, i) => {
        if (statusOf(i) === "paid") return s;
        return s + (i.amount - paidFor(i.id, month)); // 남은 금액
      }, 0) +
    agencyByService.reduce((s, a) => (agencyPaid.has(agencyKey(a.key)) ? s : s + a.amount), 0);

  const dayInMonth = (m: string, dayOfMonth: number) => {
    const [y, mm] = m.split("-").map(Number);
    const lastDay = new Date(y, mm, 0).getDate();
    return `${m}-${String(Math.min(dayOfMonth, lastDay)).padStart(2, "0")}`;
  };

  // (item, m)의 상태를 지정: 미납 / 완료
  const setStatus = async (item: RecurringItem, m: string, status: Status) => {
    setBusyId(`${item.id}_${m}`);
    try {
      const payments = entries.filter((e) => e.recurringId === item.id && e.date.startsWith(m));
      const paid = payments.reduce((s, e) => s + e.amount, 0);
      if (status === "paid") {
        // 남은 금액만 추가 기록 (분납 후 완료 시 잔액만)
        const remaining = item.amount - paid;
        if (remaining > 0) {
          const recordDate = m === month ? toDateString(new Date()) : dayInMonth(m, item.dayOfMonth);
          await addDoc(collection(db, "vaultEntries"), {
            date: recordDate, type: item.type, amount: remaining, category: item.category,
            memo: item.memo, receiptUrl: null, recurringId: item.id,
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          });
        }
      } else {
        // 미납: 그 달 납부 기록 전부 삭제
        for (const p of payments) await deleteDoc(doc(db, "vaultEntries", p.id));
      }
    } finally {
      setBusyId(null);
    }
  };

  // 분납: 입력한 금액을 그날 지출로 기록 (나머지는 미납 잔액으로 유지)
  const handlePartial = async (item: RecurringItem, m: string) => {
    const paid = paidFor(item.id, m);
    const remaining = item.amount - paid;
    const input = window.prompt(`${item.memo || item.category || "고정지출"} 분납 금액 입력\n(전체 ₩${item.amount.toLocaleString()}, 남은 ₩${remaining.toLocaleString()})`, "");
    if (input == null) return;
    const amt = Math.min(parseInt(input.replace(/[^0-9]/g, ""), 10) || 0, remaining);
    if (amt <= 0) return;
    setBusyId(`${item.id}_${m}`);
    try {
      const recordDate = m === month ? toDateString(new Date()) : dayInMonth(m, item.dayOfMonth);
      await addDoc(collection(db, "vaultEntries"), {
        date: recordDate, type: item.type, amount: amt, category: item.category,
        memo: `${item.memo || item.category || "고정지출"} 분납`, receiptUrl: null, recurringId: item.id,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
    } finally {
      setBusyId(null);
    }
  };

  // 가맹비 (서비스별) 미납/완료
  const setAgencyStatus = async (a: { key: string; name: string; amount: number }, status: Status) => {
    const sk = agencyKey(a.key);
    setBusyId(sk);
    try {
      const existing = entries.find((e) => e.sourceKey === sk);
      if (status === "paid") {
        if (!existing) {
          await addDoc(collection(db, "vaultEntries"), {
            date: toDateString(new Date()), type: "expense", amount: a.amount,
            category: "가맹비", memo: `${a.name} 가맹비`, receiptUrl: null, recurringId: null,
            sourceKey: sk, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          });
        }
      } else if (existing) {
        await deleteDoc(doc(db, "vaultEntries", existing.id));
      }
    } finally {
      setBusyId(null);
    }
  };

  const closeForm = () => { setShowForm(false); setEditItem(null); };

  // 고정거래 정의 추가/수정 — 이미 기록된 거래는 건드리지 않음
  const handleSaveEdit = async (updated: RecurringItem) => {
    const exists = recurringItems.some((r) => r.id === updated.id);
    // 새 항목은 생성 월을 startMonth로 기록 (그 이전 달엔 노출 안 함)
    const toSave = exists || updated.startMonth ? updated : { ...updated, startMonth: month };
    const items = exists
      ? recurringItems.map((r) => (r.id === updated.id ? toSave : r))
      : [...recurringItems, toSave];
    await setDoc(doc(db, "vault", "recurring"), { items });
    closeForm();
  };

  const handleDeleteDef = async (id: string) => {
    if (!confirm("이 고정거래를 삭제할까요? (이미 기록된 거래는 남습니다)")) return;
    const items = recurringItems.filter((r) => r.id !== id);
    await setDoc(doc(db, "vault", "recurring"), { items });
    closeForm();
  };

  // 고정지출 → 채무로 완전 전환: 정의 제거 + 채무에 합산(같은 이름은 잔액 누적)
  const handleMoveToDebt = async (item: RecurringItem) => {
    const name = item.memo || item.category || "채무";
    const remaining = item.amount - paidFor(item.id, month);
    const debtAmount = remaining > 0 ? remaining : item.amount;

    const snap = await getDoc(doc(db, "vault", "debts"));
    const debts: DebtItem[] = snap.exists() ? ((snap.data().items as DebtItem[]) ?? []) : [];
    const existing = debts.find((d) => d.name === name);
    const nextDebts = existing
      ? debts.map((d) => (d.id === existing.id ? { ...d, amount: d.amount + debtAmount } : d))
      : [...debts, { id: `debt_${Date.now()}`, name, amount: debtAmount }];
    await setDoc(doc(db, "vault", "debts"), { items: nextDebts });

    const nextRec = recurringItems.filter((r) => r.id !== item.id);
    await setDoc(doc(db, "vault", "recurring"), { items: nextRec });
    closeForm();
  };

  return (
    <div
      style={{
        background: "#fff5f0",
        border: "1px solid rgba(221,91,0,0.3)",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      {/* 헤더 — 빈 곳 클릭으로도 열고 닫힘 (+ 버튼 제외) */}
      <div
        onClick={() => setOpen(!open)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", cursor: "pointer" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          <span style={{ fontSize: "14px", fontWeight: 600, color: "#dd5b00" }}>
            고정 지출
            <span style={{ fontSize: "12px", color: "#e0986f", fontWeight: 400, marginLeft: "8px" }}>
              {paidCount}/{totalCount} 완료
            </span>
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); setEditItem(null); setShowForm(true); }}
            title="고정지출 추가"
            style={{ display: "flex", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0, color: "#dd5b00" }}
          >
            <Plus size={18} strokeWidth={2.2} />
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "14px", color: "#dd5b00", fontWeight: 700 }}>
            미납 ₩{formatAmount(pendingTotal)}
          </span>
          {open ? <ChevronUp size={16} color="#e0986f" /> : <ChevronDown size={16} color="#e0986f" />}
        </div>
      </div>

      {/* 목록 */}
      {open && (
        <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid rgba(221,91,0,0.15)" }}>
          {items.map((item) => {
            const status = statusOf(item);
            const busy = busyId === `${item.id}_${month}`;
            const paid = paidFor(item.id, month);
            const partial = paid > 0 && paid < item.amount;
            return (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "12px 16px",
                  borderTop: "1px solid rgba(221,91,0,0.08)",
                  opacity: status === "unpaid" ? 1 : 0.6,
                }}
              >
                <button
                  onClick={() => { setEditItem(item); setShowForm(true); }}
                  style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  <div style={{ fontSize: "14px", fontWeight: 500, color: "rgba(0,0,0,0.95)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.memo || item.category || (item.type === "income" ? "수입" : "지출")}
                    {partial && (
                      <span style={{ fontSize: "11px", fontWeight: 600, color: "#2980b9", marginLeft: "5px" }}>
                        분납 {formatAmount(paid)}/{formatAmount(item.amount)}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "12px", color: "#a39e98", marginTop: "2px" }}>
                    매월 {item.dayOfMonth}일
                    {item.category ? ` · ${item.category}` : ""}
                  </div>
                </button>
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: item.type === "income" ? "#1f7a33" : "#dd5b00",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.type === "income" ? "+" : "-"}₩{formatAmount(partial ? item.amount - paid : item.amount)}
                </span>
                {item.type === "expense" && status !== "paid" && (
                  <button
                    onClick={() => handlePartial(item, month)}
                    disabled={busy}
                    style={{ fontSize: "11px", fontWeight: 600, color: "#2980b9", background: "#f0f6ff", border: "1px solid rgba(41,128,185,0.3)", borderRadius: "6px", padding: "5px 8px", cursor: "pointer", flexShrink: 0 }}
                  >
                    분납
                  </button>
                )}
                {item.type === "expense" && status !== "paid" && (
                  <button
                    onClick={() => handleMoveToDebt(item)}
                    disabled={busy}
                    title="채무로 전환"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#1f7a33", background: "#f1faf3", border: "1px solid rgba(56,168,72,0.35)", borderRadius: "6px", padding: "5px 6px", cursor: "pointer", flexShrink: 0 }}
                  >
                    <ArrowDownToLine size={14} strokeWidth={2.2} />
                  </button>
                )}
                <StatusSegment value={status} disabled={busy} onChange={(s) => setStatus(item, month, s)} />
              </div>
            );
          })}

          {/* 서비스별 가맹비 (admin) */}
          {agencyByService.map((a) => {
            const sk = agencyKey(a.key);
            const paid = agencyPaid.has(sk);
            const busy = busyId === sk;
            return (
              <div
                key={sk}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "12px 16px",
                  borderTop: "1px solid rgba(221,91,0,0.08)",
                  opacity: paid ? 0.6 : 1,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "10px", fontWeight: 600, color: "#615d59", background: "#f6f5f4", border: "1px solid rgba(0,0,0,0.1)", borderRadius: "4px", padding: "1px 5px", flexShrink: 0 }}>
                      가맹비
                    </span>
                    <span style={{ fontSize: "14px", fontWeight: 500, color: "rgba(0,0,0,0.95)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.name}
                    </span>
                  </div>
                </div>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#dd5b00", whiteSpace: "nowrap" }}>
                  -₩{formatAmount(a.amount)}
                </span>
                <StatusSegment
                  value={paid ? "paid" : "unpaid"}
                  only={["unpaid", "paid"]}
                  disabled={busy}
                  onChange={(s) => setAgencyStatus(a, s)}
                />
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <RecurringEditForm
          item={editItem}
          categories={categories}
          onSave={handleSaveEdit}
          onDelete={editItem ? () => handleDeleteDef(editItem.id) : undefined}
          onMoveToDebt={editItem && editItem.type === "expense" ? () => handleMoveToDebt(editItem) : undefined}
          onClose={closeForm}
        />
      )}
    </div>
  );
}

/* ────── 고정거래 정의 수정 모달 ────── */

function RecurringEditForm({
  item,
  categories,
  onSave,
  onDelete,
  onMoveToDebt,
  onClose,
}: {
  item: RecurringItem | null;
  categories: VaultCategory[];
  onSave: (item: RecurringItem) => void;
  onDelete?: () => void;
  onMoveToDebt?: () => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<"income" | "expense">(item?.type ?? "expense");
  const [amountStr, setAmountStr] = useState(item ? formatInputAmount(String(item.amount)) : "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [memo, setMemo] = useState(item?.memo ?? "");
  const [dayOfMonth, setDayOfMonth] = useState(item ? String(item.dayOfMonth) : "1");
  const [saving, setSaving] = useState(false);

  const filteredCategories = categories.filter((c) => c.type === type);
  const amount = parseAmount(amountStr);
  const day = Math.min(Math.max(parseInt(dayOfMonth, 10) || 1, 1), 31);
  const canSave = amount > 0 && !saving;

  const handleSubmit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const next: RecurringItem = {
        id: item?.id ?? `rec_${Date.now()}`,
        active: item?.active ?? true,
        type, amount, category, memo, dayOfMonth: day,
      };
      // startMonth는 값이 있을 때만 포함 (undefined 저장 시 Firestore 오류)
      if (item?.startMonth) next.startMonth = item.startMonth;
      await onSave(next);
    } catch (err) {
      console.error("고정거래 저장 실패:", err);
      setSaving(false);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: "#ffffff", borderRadius: "16px 16px 0 0", width: "100%", maxWidth: "500px", maxHeight: "85dvh", overflow: "auto", padding: "24px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 700, color: "rgba(0,0,0,0.95)" }}>{item ? "고정거래 수정" : "고정지출 추가"}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#a39e98", padding: "4px" }}>✕</button>
        </div>

        {/* 수입/지출 */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          {(["expense", "income"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              style={{
                flex: 1, padding: "10px", borderRadius: "4px", border: "1px solid",
                borderColor: type === t ? (t === "income" ? "#1f7a33" : "#dd5b00") : "rgba(0,0,0,0.1)",
                background: type === t ? (t === "income" ? "#f0faf1" : "#fff5f0") : "#ffffff",
                color: type === t ? (t === "income" ? "#1f7a33" : "#dd5b00") : "#a39e98",
                fontWeight: type === t ? 600 : 400, fontSize: "15px", cursor: "pointer",
              }}
            >
              {t === "income" ? "수입" : "지출"}
            </button>
          ))}
        </div>

        {/* 금액 */}
        <div style={{ marginBottom: "16px" }}>
          <label style={fieldLabel}>금액</label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#615d59", fontSize: "16px", fontWeight: 500 }}>₩</span>
            <input
              type="text" inputMode="numeric" value={amountStr}
              onChange={(e) => setAmountStr(formatInputAmount(e.target.value))}
              style={{ ...fieldInput, paddingLeft: "28px" }}
            />
          </div>
        </div>

        {/* 지정일 */}
        <div style={{ marginBottom: "16px" }}>
          <label style={fieldLabel}>결제일</label>
          <input
            type="number" inputMode="numeric" min={1} max={31} value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value)}
            style={fieldInput}
          />
        </div>

        {/* 카테고리 */}
        <div style={{ marginBottom: "16px" }}>
          <label style={fieldLabel}>카테고리</label>
          {filteredCategories.length === 0 ? (
            <p style={{ fontSize: "13px", color: "#a39e98" }}>설정에서 카테고리를 먼저 추가하세요</p>
          ) : (
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ ...fieldInput, appearance: "none", WebkitAppearance: "none", background: `#ffffff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23615d59' stroke-width='1.5' fill='none'/%3E%3C/svg%3E") no-repeat right 12px center`, paddingRight: "36px" }}
            >
              <option value="">선택</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* 메모 */}
        <div style={{ marginBottom: "20px" }}>
          <label style={fieldLabel}>메모</label>
          <input type="text" value={memo} onChange={(e) => setMemo(e.target.value)} style={fieldInput} />
        </div>

        {onMoveToDebt && (
          <button
            type="button" onClick={onMoveToDebt}
            style={{ width: "100%", padding: "12px 16px", fontSize: "15px", fontWeight: 600, color: "#dd5b00", background: "#fff", border: "1px solid rgba(221,91,0,0.4)", borderRadius: "4px", cursor: "pointer", marginBottom: "8px" }}
          >
            채무로 전환
          </button>
        )}

        <div style={{ display: "flex", gap: "8px" }}>
          {onDelete && (
            <button
              type="button" onClick={onDelete}
              style={{ padding: "12px 16px", fontSize: "15px", fontWeight: 600, color: "#dd5b00", background: "#fff5f0", border: "1px solid rgba(221,91,0,0.2)", borderRadius: "4px", cursor: "pointer", flexShrink: 0 }}
            >
              삭제
            </button>
          )}
          <button
            type="button" onClick={handleSubmit} disabled={!canSave}
            style={{ flex: 1, padding: "12px 16px", fontSize: "15px", fontWeight: 600, color: "#ffffff", background: canSave ? "#1f7a33" : "#a39e98", border: "none", borderRadius: "4px", cursor: canSave ? "pointer" : "default" }}
          >
            {saving ? "저장 중..." : item ? "수정" : "추가"}
          </button>
        </div>
      </div>
    </div>
  );
}

const STATUS_OPTS: { key: Status; label: string; bg: string }[] = [
  { key: "unpaid", label: "미납", bg: "#dd5b00" },
  { key: "paid", label: "완료", bg: "#1f7a33" },
];

function StatusSegment({ value, disabled, onChange, only }: { value: Status; disabled?: boolean; onChange: (s: Status) => void; only?: Status[] }) {
  const opts = only ? STATUS_OPTS.filter((o) => only.includes(o.key)) : STATUS_OPTS;
  return (
    <div style={{ display: "flex", border: "1px solid rgba(0,0,0,0.12)", borderRadius: "8px", overflow: "hidden", flexShrink: 0, opacity: disabled ? 0.5 : 1 }}>
      {opts.map((opt, i) => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            onClick={() => !disabled && !active && onChange(opt.key)}
            disabled={disabled}
            style={{
              padding: "5px 9px",
              fontSize: "11px",
              fontWeight: 600,
              border: "none",
              borderLeft: i === 0 ? "none" : "1px solid rgba(0,0,0,0.08)",
              background: active ? opt.bg : "#ffffff",
              color: active ? "#ffffff" : "#a39e98",
              cursor: disabled || active ? "default" : "pointer",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const fieldLabel: React.CSSProperties = {
  fontSize: "14px", fontWeight: 500, color: "rgba(0,0,0,0.95)", display: "block", marginBottom: "6px",
};

const fieldInput: React.CSSProperties = {
  width: "100%", padding: "10px 12px", fontSize: "16px", border: "1px solid #dddddd",
  borderRadius: "4px", outline: "none", boxSizing: "border-box",
};
