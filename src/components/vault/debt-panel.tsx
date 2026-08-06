"use client";

import { useState, useEffect } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatAmount, formatInputAmount, parseAmount } from "@/lib/vault-utils";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import type { DebtItem } from "./vault-shell";

const GREEN = "#1f7a33";

export function DebtPanel() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<DebtItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<DebtItem | null>(null);

  // 채무는 월에 종속되지 않는 누적 목록
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "vault", "debts"), (snap) => {
      setItems(snap.exists() ? ((snap.data().items as DebtItem[]) ?? []) : []);
    });
    return unsub;
  }, []);

  const total = items.reduce((s, d) => s + d.amount, 0);

  const save = async (next: DebtItem[]) => {
    await setDoc(doc(db, "vault", "debts"), { items: next });
  };

  const handleSave = async (debt: DebtItem) => {
    const exists = items.some((d) => d.id === debt.id);
    const next = exists ? items.map((d) => (d.id === debt.id ? debt : d)) : [...items, debt];
    await save(next);
    closeForm();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 채무를 삭제할까요?")) return;
    await save(items.filter((d) => d.id !== id));
    closeForm();
  };

  // 상환: 입력한 금액만큼 잔액 차감 (전액 상환 시 목록에서 제거)
  const handleRepay = async (debt: DebtItem) => {
    const input = window.prompt(`${debt.name} 상환 금액 입력\n(잔액 ₩${debt.amount.toLocaleString()})`, "");
    if (input == null) return;
    const amt = Math.min(parseInt(input.replace(/[^0-9]/g, ""), 10) || 0, debt.amount);
    if (amt <= 0) return;
    const remaining = debt.amount - amt;
    await save(
      remaining > 0
        ? items.map((d) => (d.id === debt.id ? { ...d, amount: remaining } : d))
        : items.filter((d) => d.id !== debt.id)
    );
  };

  const closeForm = () => { setShowForm(false); setEditItem(null); };

  return (
    <div style={{ border: "1px solid rgba(56,168,72,0.25)", borderRadius: "12px", background: "#f6fbf7", overflow: "hidden" }}>
      {/* 헤더 */}
      <div
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", cursor: "pointer" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "15px", fontWeight: 700, color: GREEN }}>채무</span>
          <button
            onClick={(e) => { e.stopPropagation(); setEditItem(null); setShowForm(true); }}
            title="채무 추가"
            style={{ display: "flex", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0, color: GREEN }}
          >
            <Plus size={18} strokeWidth={2.2} />
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "14px", color: GREEN, fontWeight: 700 }}>
            ₩{formatAmount(total)}
          </span>
          {open ? <ChevronUp size={16} color="#86c294" /> : <ChevronDown size={16} color="#86c294" />}
        </div>
      </div>

      {/* 목록 */}
      {open && (
        <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid rgba(56,168,72,0.18)" }}>
          {items.length === 0 && (
            <div style={{ padding: "16px", fontSize: "13px", color: "#a39e98", textAlign: "center" }}>
              등록된 채무가 없습니다.
            </div>
          )}
          {items.map((debt) => (
            <div
              key={debt.id}
              style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "12px 16px", borderTop: "1px solid rgba(56,168,72,0.1)",
              }}
            >
              <button
                onClick={() => { setEditItem(debt); setShowForm(true); }}
                style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                <span style={{ fontSize: "14px", fontWeight: 500, color: "rgba(0,0,0,0.95)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {debt.name || "채무"}
                </span>
              </button>
              <span style={{ fontSize: "13px", fontWeight: 600, color: GREEN, whiteSpace: "nowrap" }}>
                -₩{formatAmount(debt.amount)}
              </span>
              <button
                onClick={() => handleRepay(debt)}
                style={{ fontSize: "11px", fontWeight: 600, color: "#1f7a33", background: "#f1faf3", border: "1px solid rgba(56,168,72,0.35)", borderRadius: "6px", padding: "5px 9px", cursor: "pointer", flexShrink: 0 }}
              >
                상환
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <DebtEditForm
          item={editItem}
          onSave={handleSave}
          onDelete={editItem ? () => handleDelete(editItem.id) : undefined}
          onClose={closeForm}
        />
      )}
    </div>
  );
}

/* ────── 채무 추가/수정 모달 ────── */

function DebtEditForm({
  item,
  onSave,
  onDelete,
  onClose,
}: {
  item: DebtItem | null;
  onSave: (item: DebtItem) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [amountStr, setAmountStr] = useState(item ? formatInputAmount(String(item.amount)) : "");
  const [saving, setSaving] = useState(false);

  const amount = parseAmount(amountStr);
  const canSave = name.trim().length > 0 && amount > 0 && !saving;

  const handleSubmit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        id: item?.id ?? `debt_${Date.now()}`,
        name: name.trim(),
        amount,
      });
    } catch (err) {
      console.error("채무 저장 실패:", err);
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
          <h2 style={{ fontSize: "18px", fontWeight: 700, color: "rgba(0,0,0,0.95)" }}>{item ? "채무 수정" : "채무 추가"}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#a39e98", padding: "4px" }}>✕</button>
        </div>

        <label style={fieldLabel}>항목명</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 장신혜, 김지혜 2000"
          style={{ ...fieldInput, marginBottom: "16px" }}
        />

        <label style={fieldLabel}>잔액</label>
        <input
          value={amountStr}
          onChange={(e) => setAmountStr(formatInputAmount(e.target.value))}
          inputMode="numeric"
          placeholder="0"
          style={{ ...fieldInput, marginBottom: "24px" }}
        />

        <div style={{ display: "flex", gap: "8px" }}>
          {onDelete && (
            <button
              type="button" onClick={onDelete}
              style={{ padding: "12px 16px", fontSize: "15px", fontWeight: 600, color: "#1f7a33", background: "#fff", border: "1px solid rgba(56,168,72,0.35)", borderRadius: "4px", cursor: "pointer" }}
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

const fieldLabel: React.CSSProperties = {
  fontSize: "14px", fontWeight: 500, color: "rgba(0,0,0,0.95)", display: "block", marginBottom: "6px",
};

const fieldInput: React.CSSProperties = {
  width: "100%", padding: "10px 12px", fontSize: "16px", border: "1px solid #dddddd",
  borderRadius: "4px", outline: "none", boxSizing: "border-box",
};
