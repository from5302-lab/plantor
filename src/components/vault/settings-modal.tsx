"use client";

import { useState, useEffect } from "react";
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { VaultCategory } from "./vault-shell";

type Props = {
  categories: VaultCategory[];
  onClose: () => void;
};

export function SettingsModal({ categories, onClose }: Props) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "16px 16px 0 0",
          width: "100%",
          maxWidth: "500px",
          maxHeight: "85dvh",
          overflow: "auto",
          padding: "24px 20px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <h2 style={{ fontSize: "18px", fontWeight: 700, color: "rgba(0,0,0,0.95)" }}>
            설정
          </h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#a39e98", padding: "4px" }}
          >
            ✕
          </button>
        </div>

        <AgencyCountManager />
        <div style={{ height: "1px", background: "rgba(0,0,0,0.08)", margin: "20px 0" }} />
        <CategoryManager categories={categories} />
      </div>
    </div>
  );
}

// 벤더 가맹비 인원 (Class5·클래스카드) 수동 입력
const AGENCY_VENDORS = [
  { slug: "class5", label: "클래스5 (Class5 Max)" },
  { slug: "classcard-middle", label: "클래스카드 (Max)" },
];

function AgencyCountManager() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return onSnapshot(doc(db, "vault", "agencyConfig"), (snap) => {
      const c = snap.exists() ? ((snap.data().counts as Record<string, number>) ?? {}) : {};
      setCounts(c);
    });
  }, []);

  const save = async (slug: string, value: string) => {
    const n = parseInt(value, 10);
    const next = { ...counts };
    if (Number.isFinite(n) && n > 0) next[slug] = n;
    else delete next[slug];
    setSaving(true);
    try {
      await setDoc(doc(db, "vault", "agencyConfig"), { counts: next });
    } finally {
      setSaving(false);
      setDraft((d) => { const x = { ...d }; delete x[slug]; return x; });
    }
  };

  return (
    <div>
      <h4 style={{ fontSize: "13px", fontWeight: 600, color: "#615d59", marginBottom: "4px" }}>가맹비 인원 (벤더 직접 입력)</h4>
      <p style={{ fontSize: "11px", color: "#a39e98", marginBottom: "10px" }}>
        벤더 계정의 현재 학생 수를 입력하면 구간 요금으로 가맹비가 계산됩니다. 비우면 자동집계.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {AGENCY_VENDORS.map((v) => (
          <div key={v.slug} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ flex: 1, fontSize: "14px", color: "rgba(0,0,0,0.95)" }}>{v.label}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={draft[v.slug] ?? (counts[v.slug] != null ? String(counts[v.slug]) : "")}
              placeholder="자동"
              onChange={(e) => setDraft((d) => ({ ...d, [v.slug]: e.target.value }))}
              onBlur={(e) => save(v.slug, e.target.value)}
              disabled={saving}
              style={{ width: "72px", padding: "8px 10px", fontSize: "15px", border: "1px solid #dddddd", borderRadius: "4px", outline: "none", textAlign: "right", boxSizing: "border-box" }}
            />
            <span style={{ fontSize: "13px", color: "#a39e98", width: "20px" }}>명</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryManager({ categories }: { categories: VaultCategory[] }) {
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"income" | "expense">("expense");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  const saveCategories = async (updated: VaultCategory[]) => {
    setSaving(true);
    try {
      await setDoc(doc(db, "vault", "categories"), { items: updated });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const id = `cat_${Date.now()}`;
    const updated = [...categories, { id, name: newName.trim(), type: newType }];
    await saveCategories(updated);
    setNewName("");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 카테고리를 삭제할까요?")) return;
    const updated = categories.filter((c) => c.id !== id);
    await saveCategories(updated);
  };

  const handleEdit = async (id: string) => {
    if (!editName.trim()) return;
    const updated = categories.map((c) =>
      c.id === id ? { ...c, name: editName.trim() } : c
    );
    await saveCategories(updated);
    setEditingId(null);
  };

  const handleToggleSavings = async (id: string) => {
    const updated = categories.map((c) =>
      c.id === id ? { ...c, isSavings: !c.isSavings } : c
    );
    await saveCategories(updated);
  };

  const expenseCategories = categories.filter((c) => c.type === "expense");
  const incomeCategories = categories.filter((c) => c.type === "income");

  return (
    <div>
      {/* 추가 폼 */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as "income" | "expense")}
            style={{
              padding: "8px 32px 8px 10px",
              fontSize: "14px",
              border: "1px solid #dddddd",
              borderRadius: "4px",
              outline: "none",
              appearance: "none",
              background: `#ffffff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23615d59' stroke-width='1.5' fill='none'/%3E%3C/svg%3E") no-repeat right 10px center`,
            }}
          >
            <option value="expense">지출</option>
            <option value="income">수입</option>
          </select>
        </div>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          style={{
            flex: 1,
            padding: "8px 12px",
            fontSize: "14px",
            border: "1px solid #dddddd",
            borderRadius: "4px",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        <button
          onClick={handleAdd}
          disabled={!newName.trim() || saving}
          style={{
            padding: "8px 16px",
            fontSize: "14px",
            fontWeight: 600,
            color: "#ffffff",
            background: newName.trim() ? "#38a848" : "#a39e98",
            border: "none",
            borderRadius: "4px",
            cursor: newName.trim() ? "pointer" : "default",
            flexShrink: 0,
          }}
        >
          추가
        </button>
      </div>

      {/* 지출 카테고리 */}
      <CategorySection
        title="지출"
        items={expenseCategories}
        editingId={editingId}
        editName={editName}
        onStartEdit={(id, name) => { setEditingId(id); setEditName(name); }}
        onEditNameChange={setEditName}
        onSaveEdit={handleEdit}
        onCancelEdit={() => setEditingId(null)}
        onDelete={handleDelete}
        onToggleSavings={handleToggleSavings}
      />

      {/* 수입 카테고리 */}
      <CategorySection
        title="수입"
        items={incomeCategories}
        editingId={editingId}
        editName={editName}
        onStartEdit={(id, name) => { setEditingId(id); setEditName(name); }}
        onEditNameChange={setEditName}
        onSaveEdit={handleEdit}
        onCancelEdit={() => setEditingId(null)}
        onDelete={handleDelete}
      />
    </div>
  );
}

function CategorySection({
  title,
  items,
  editingId,
  editName,
  onStartEdit,
  onEditNameChange,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onToggleSavings,
}: {
  title: string;
  items: VaultCategory[];
  editingId: string | null;
  editName: string;
  onStartEdit: (id: string, name: string) => void;
  onEditNameChange: (name: string) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  onToggleSavings?: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div style={{ marginBottom: "20px" }}>
      <h4 style={{ fontSize: "13px", fontWeight: 600, color: "#615d59", marginBottom: "8px" }}>
        {title}
      </h4>
      {onToggleSavings && (
        <p style={{ fontSize: "11px", color: "#a39e98", marginBottom: "8px" }}>
          별 아이콘을 켜면 위시리스트 ‘사용 가능 저축’에 합산됩니다.
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {items.map((cat) => (
          <div
            key={cat.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 12px",
              background: "#fafaf9",
              borderRadius: "6px",
            }}
          >
            {editingId === cat.id ? (
              <>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => onEditNameChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSaveEdit(cat.id);
                    if (e.key === "Escape") onCancelEdit();
                  }}
                  autoFocus
                  style={{
                    flex: 1,
                    padding: "4px 8px",
                    fontSize: "14px",
                    border: "1px solid #38a848",
                    borderRadius: "4px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <button onClick={() => onSaveEdit(cat.id)} style={iconBtnStyle}>✓</button>
                <button onClick={onCancelEdit} style={iconBtnStyle}>✕</button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: "14px", color: "rgba(0,0,0,0.95)" }}>
                  {cat.name}
                  {cat.isSavings && (
                    <span style={{ fontSize: "10px", color: "#2980b9", background: "#f0f6ff", border: "1px solid rgba(52,152,219,0.3)", borderRadius: "4px", padding: "1px 5px", marginLeft: "6px", fontWeight: 600 }}>
                      저축
                    </span>
                  )}
                </span>
                {onToggleSavings && (
                  <button
                    onClick={() => onToggleSavings(cat.id)}
                    title="저축 카테고리로 지정"
                    style={{ ...iconBtnStyle, color: cat.isSavings ? "#2980b9" : "#cccccc" }}
                  >
                    {cat.isSavings ? "★" : "☆"}
                  </button>
                )}
                <button onClick={() => onStartEdit(cat.id, cat.name)} style={iconBtnStyle}>✎</button>
                <button onClick={() => onDelete(cat.id)} style={{ ...iconBtnStyle, color: "#dd5b00" }}>✕</button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  fontSize: "14px",
  cursor: "pointer",
  color: "#615d59",
  padding: "2px 4px",
};
