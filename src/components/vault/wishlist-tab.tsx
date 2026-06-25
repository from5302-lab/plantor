"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatAmount, formatInputAmount, parseAmount, toDateString } from "@/lib/vault-utils";
import { ExternalLink, Check, ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import type { VaultEntry, WishlistItem, VaultCategory } from "./vault-shell";

type Props = {
  entries: VaultEntry[];
  wishlistItems: WishlistItem[];
  categories: VaultCategory[];
};

const TAG_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "투자": { bg: "#f0f6ff", text: "#2980b9", border: "rgba(52,152,219,0.3)" },
  "소비": { bg: "#fff8f0", text: "#dd5b00", border: "rgba(221,91,0,0.3)" },
  "부채상환": { bg: "#f5f0ff", text: "#7c3aed", border: "rgba(124,58,237,0.3)" },
};

export function WishlistTab({ entries, wishlistItems, categories }: Props) {
  const [showCompleted, setShowCompleted] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<WishlistItem | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const touchStartY = useRef(0);
  const touchItemIdx = useRef<number | null>(null);

  // 누적 저축 금액 = '저축' 플래그가 켜진 카테고리들의 expense 합산
  const totalSaved = useMemo(() => {
    const savingsNames = new Set(
      categories.filter((c) => c.isSavings).map((c) => c.name)
    );
    return entries
      .filter((e) => e.type === "expense" && savingsNames.has(e.category))
      .reduce((s, e) => s + e.amount, 0);
  }, [entries, categories]);

  // 완료 항목 합계
  const completedTotal = useMemo(
    () => wishlistItems.filter((i) => i.completed).reduce((s, i) => s + i.amount, 0),
    [wishlistItems]
  );

  // 사용 가능 저축
  const availableSaved = totalSaved - completedTotal;

  const activeItems = useMemo(
    () => wishlistItems.filter((i) => !i.completed).sort((a, b) => a.order - b.order),
    [wishlistItems]
  );

  const completedItems = useMemo(
    () => wishlistItems.filter((i) => i.completed).sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || "")),
    [wishlistItems]
  );

  const saveItems = useCallback(async (items: WishlistItem[]) => {
    await setDoc(doc(db, "vault", "wishlist"), { items }).catch(() => {});
  }, []);

  const handleComplete = useCallback((id: string) => {
    const updated = wishlistItems.map((i) =>
      i.id === id ? { ...i, completed: true, completedAt: toDateString(new Date()) } : i
    );
    saveItems(updated);
  }, [wishlistItems, saveItems]);

  const handleUncomplete = useCallback((id: string) => {
    const updated = wishlistItems.map((i) =>
      i.id === id ? { ...i, completed: false, completedAt: null } : i
    );
    saveItems(updated);
  }, [wishlistItems, saveItems]);

  const handleDelete = useCallback((id: string) => {
    saveItems(wishlistItems.filter((i) => i.id !== id));
  }, [wishlistItems, saveItems]);

  // 드래그앤드롭 (데스크톱)
  const handleDragEnd = useCallback(() => {
    if (dragIdx === null || dragOverIdx === null || dragIdx === dragOverIdx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    const reordered = [...activeItems];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(dragOverIdx, 0, moved);
    const updated = wishlistItems.map((item) => {
      const idx = reordered.findIndex((r) => r.id === item.id);
      return idx >= 0 ? { ...item, order: idx } : item;
    });
    saveItems(updated);
    setDragIdx(null);
    setDragOverIdx(null);
  }, [dragIdx, dragOverIdx, activeItems, wishlistItems, saveItems]);

  // 터치 드래그 (모바일)
  const handleTouchStart = useCallback((idx: number, e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchItemIdx.current = idx;
    setDragIdx(idx);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchItemIdx.current === null) return;
    const touch = e.touches[0];
    const elements = document.elementsFromPoint(touch.clientX, touch.clientY);
    const itemEl = elements.find((el) => el.getAttribute("data-wish-idx"));
    if (itemEl) {
      const overIdx = Number(itemEl.getAttribute("data-wish-idx"));
      setDragOverIdx(overIdx);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    handleDragEnd();
    touchItemIdx.current = null;
  }, [handleDragEnd]);

  const handleSave = useCallback((item: WishlistItem) => {
    const exists = wishlistItems.find((i) => i.id === item.id);
    let updated: WishlistItem[];
    if (exists) {
      updated = wishlistItems.map((i) => (i.id === item.id ? item : i));
    } else {
      updated = [...wishlistItems, { ...item, order: activeItems.length }];
    }
    saveItems(updated);
    setShowForm(false);
    setEditItem(null);
  }, [wishlistItems, activeItems, saveItems]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <h2 style={{ fontSize: "16px", fontWeight: 600, color: "rgba(0,0,0,0.95)" }}>
        위시리스트
      </h2>

      {/* 누적 저축 */}
      <div
        style={{
          background: "#f0f6ff",
          border: "1px solid rgba(52,152,219,0.3)",
          borderRadius: "12px",
          padding: "16px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "12px", color: "#2980b9", marginBottom: "6px", fontWeight: 500 }}>
          사용 가능 저축
        </div>
        <div style={{ fontSize: "26px", fontWeight: 700, color: "#3498DB", letterSpacing: "-0.5px" }}>
          ₩{formatAmount(availableSaved)}
        </div>
        <div style={{ fontSize: "11px", color: "#a39e98", marginTop: "4px" }}>
          누적 저축 ₩{formatAmount(totalSaved)} · 사용 ₩{formatAmount(completedTotal)}
        </div>
      </div>

      {/* 추가 버튼 */}
      <button
        onClick={() => { setEditItem(null); setShowForm(true); }}
        style={{
          padding: "10px 16px",
          fontSize: "14px",
          fontWeight: 600,
          color: "#ffffff",
          background: "#38a848",
          border: "1px solid transparent",
          borderRadius: "4px",
          cursor: "pointer",
          width: "100%",
        }}
      >
        + 항목 추가
      </button>

      {/* 미완료 항목 */}
      {activeItems.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#a39e98", fontSize: "14px" }}>
          위시리스트가 비어있습니다
        </div>
      )}
      <div
        style={{ display: "flex", flexDirection: "column", gap: "8px" }}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {activeItems.map((item, idx) => {
          const canBuy = availableSaved >= item.amount;
          const tagColor = TAG_COLORS[item.tag] || TAG_COLORS["소비"];
          const isDragging = dragIdx === idx;
          const isDragOver = dragOverIdx === idx;

          return (
            <div
              key={item.id}
              data-wish-idx={idx}
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
              onDragEnd={handleDragEnd}
              style={{
                display: "flex",
                alignItems: "stretch",
                background: "#ffffff",
                border: isDragOver ? "2px solid #38a848" : "1px solid rgba(0,0,0,0.1)",
                borderRadius: "12px",
                overflow: "hidden",
                transform: isDragging ? "scale(1.02)" : undefined,
                transition: "transform 0.15s",
              }}
            >
              {/* 드래그 핸들 */}
              <div
                onTouchStart={(e) => handleTouchStart(idx, e)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "0 6px",
                  color: "#a39e98",
                  cursor: "grab",
                  touchAction: "none",
                }}
              >
                <GripVertical size={16} />
              </div>

              {/* 내용 */}
              <button
                onClick={() => { setEditItem(item); setShowForm(true); }}
                style={{
                  flex: 1,
                  padding: "12px 12px 12px 0",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  minWidth: 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px", flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 600,
                      color: tagColor.text,
                      background: tagColor.bg,
                      border: `1px solid ${tagColor.border}`,
                      borderRadius: "4px",
                      padding: "1px 6px",
                    }}
                  >
                    {item.tag}
                  </span>
                  {canBuy && (
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        color: "#2a8438",
                        background: "#f0faf1",
                        border: "1px solid rgba(56,168,72,0.2)",
                        borderRadius: "4px",
                        padding: "1px 6px",
                      }}
                    >
                      구매 가능
                    </span>
                  )}
                  <span style={{ fontSize: "14px", fontWeight: 600, color: "rgba(0,0,0,0.95)" }}>
                    {item.title}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
                  <span style={{ fontWeight: 600, color: "#dd5b00" }}>
                    ₩{formatAmount(item.amount)}
                  </span>
                  {item.targetDate && (
                    <span style={{ color: "#a39e98", fontSize: "11px" }}>
                      {item.targetDate.slice(5).replace("-", "/")}까지
                    </span>
                  )}
                  {item.link && (
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ display: "flex", color: "#3498DB" }}
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </button>

              {/* 완료 버튼 */}
              <button
                onClick={() => handleComplete(item.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "0 12px",
                  background: "none",
                  border: "none",
                  borderLeft: "1px solid rgba(0,0,0,0.05)",
                  cursor: "pointer",
                  color: "#a39e98",
                }}
              >
                <Check size={18} />
              </button>
            </div>
          );
        })}
      </div>

      {/* 완료 항목 */}
      {completedItems.length > 0 && (
        <div>
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#a39e98",
              fontSize: "13px",
              fontWeight: 500,
              padding: "4px 0",
            }}
          >
            완료 ({completedItems.length})
            {showCompleted ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showCompleted && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
              {completedItems.map((item) => {
                const tagColor = TAG_COLORS[item.tag] || TAG_COLORS["소비"];
                return (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "10px 14px",
                      background: "#f6f5f4",
                      border: "1px solid rgba(0,0,0,0.05)",
                      borderRadius: "8px",
                      gap: "8px",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: 600,
                            color: tagColor.text,
                            background: tagColor.bg,
                            borderRadius: "4px",
                            padding: "1px 6px",
                          }}
                        >
                          {item.tag}
                        </span>
                        <span style={{ fontSize: "13px", fontWeight: 500, color: "#615d59", textDecoration: "line-through" }}>
                          {item.title}
                        </span>
                      </div>
                      <div style={{ fontSize: "11px", color: "#a39e98", marginTop: "2px" }}>
                        ₩{formatAmount(item.amount)}
                        {item.completedAt && ` · ${item.completedAt.slice(5).replace("-", "/")} 완료`}
                      </div>
                    </div>
                    <button
                      onClick={() => handleUncomplete(item.id)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#a39e98",
                        fontSize: "11px",
                        padding: "4px",
                      }}
                    >
                      되돌리기
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 추가/수정 폼 모달 */}
      {showForm && (
        <WishlistForm
          item={editItem}
          onSave={handleSave}
          onDelete={editItem ? () => { handleDelete(editItem.id); setShowForm(false); setEditItem(null); } : undefined}
          onClose={() => { setShowForm(false); setEditItem(null); }}
        />
      )}
    </div>
  );
}

/* ────── 폼 모달 ────── */

function WishlistForm({
  item,
  onSave,
  onDelete,
  onClose,
}: {
  item: WishlistItem | null;
  onSave: (item: WishlistItem) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(item?.title || "");
  const [tag, setTag] = useState<WishlistItem["tag"]>(item?.tag || "소비");
  const [amountStr, setAmountStr] = useState(item ? formatInputAmount(String(item.amount)) : "");
  const [link, setLink] = useState(item?.link || "");
  const [targetDate, setTargetDate] = useState(item?.targetDate || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !parseAmount(amountStr)) return;
    onSave({
      id: item?.id || `wish_${Date.now()}`,
      title: title.trim(),
      tag,
      amount: parseAmount(amountStr),
      link: link.trim() || null,
      targetDate: targetDate || null,
      order: item?.order ?? 0,
      completed: item?.completed ?? false,
      completedAt: item?.completedAt ?? null,
    });
  };

  const canSubmit = !!title.trim() && !!parseAmount(amountStr);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "#ffffff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid rgba(0,0,0,0.1)" }}>
        <h3 style={{ fontSize: "16px", fontWeight: 700, color: "rgba(0,0,0,0.95)" }}>
          {item ? "항목 수정" : "항목 추가"}
        </h3>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#a39e98", padding: "4px" }}
        >
          ✕
        </button>
      </div>

      {/* 스크롤 가능 폼 영역 */}
      <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={labelStyle}>제목</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={formInputStyle}
              autoFocus
            />
          </div>

          <div>
            <label style={labelStyle}>태그</label>
            <select
              value={tag}
              onChange={(e) => setTag(e.target.value as WishlistItem["tag"])}
              style={{ ...formInputStyle, WebkitAppearance: "none", appearance: "none" as const, backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23615d59' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", paddingRight: "32px" }}
            >
              <option value="소비">소비</option>
              <option value="투자">투자</option>
              <option value="부채상환">부채상환</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>금액</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#615d59", fontSize: "14px", fontWeight: 500 }}>₩</span>
              <input
                type="text"
                inputMode="numeric"
                value={amountStr}
                onChange={(e) => setAmountStr(formatInputAmount(e.target.value))}
                style={{ ...formInputStyle, paddingLeft: "28px" }}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>제품/서비스 링크</label>
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData("text");
                const urlMatch = pasted.match(/https?:\/\/[^\s]+/);
                if (urlMatch) {
                  e.preventDefault();
                  setLink(urlMatch[0]);
                }
              }}
              style={formInputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>희망 날짜</label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              style={{ ...formInputStyle, WebkitAppearance: "none", appearance: "none" as const }}
            />
          </div>
        </div>

        {/* 하단 고정 버튼 */}
        <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(0,0,0,0.1)", display: "flex", gap: "8px" }}>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              style={{
                padding: "12px 16px",
                fontSize: "14px",
                fontWeight: 500,
                color: "#dd5b00",
                background: "#fff5f0",
                border: "1px solid rgba(221,91,0,0.3)",
                borderRadius: "4px",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              삭제
            </button>
          )}
          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              flex: 1,
              padding: "12px 16px",
              fontSize: "15px",
              fontWeight: 600,
              color: "#ffffff",
              background: canSubmit ? "#38a848" : "#a39e98",
              border: "1px solid transparent",
              borderRadius: "4px",
              cursor: canSubmit ? "pointer" : "default",
            }}
          >
            {item ? "수정" : "추가"}
          </button>
        </div>
      </form>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#a39e98",
  display: "block",
  marginBottom: "4px",
};

const formInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  fontSize: "14px",
  border: "1px solid #dddddd",
  borderRadius: "4px",
  outline: "none",
  boxSizing: "border-box",
};
