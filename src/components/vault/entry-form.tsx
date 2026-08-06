"use client";

import { useState, useEffect } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import {
  formatInputAmount,
  parseAmount,
  toDateString,
} from "@/lib/vault-utils";
import { ReceiptCapture } from "./receipt-capture";
import type { VaultEntry, VaultCategory, RecurringItem } from "./vault-shell";

type Props = {
  entry?: VaultEntry | null;
  categories: VaultCategory[];
  onClose: () => void;
};

export function EntryForm({ entry, categories, onClose }: Props) {
  const isEdit = !!entry;
  const [type, setType] = useState<"income" | "expense">(entry?.type || "expense");
  const [date, setDate] = useState(entry?.date || toDateString(new Date()));
  const [amountStr, setAmountStr] = useState(entry ? formatInputAmount(String(entry.amount)) : "");
  const [category, setCategory] = useState(entry?.category || "");
  const [memo, setMemo] = useState(entry?.memo || "");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [existingReceiptUrl, setExistingReceiptUrl] = useState(entry?.receiptUrl || null);
  const [removeReceipt, setRemoveReceipt] = useState(false);
  const [isRecurring, setIsRecurring] = useState(!!entry?.recurringId);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const filteredCategories = categories.filter((c) => c.type === type);

  // type 변경 시 카테고리 리셋
  useEffect(() => {
    if (!isEdit) {
      setCategory("");
    }
  }, [type, isEdit]);

  const handleSave = async () => {
    const amount = parseAmount(amountStr);
    if (!amount || !date) return;

    setSaving(true);
    try {
      let receiptUrl = existingReceiptUrl;

      // 기존 영수증 삭제
      if (removeReceipt && existingReceiptUrl && entry) {
        try {
          const oldRef = ref(storage, `vault-receipts/${entry.id}/receipt.jpg`);
          await deleteObject(oldRef);
        } catch { /* ignore */ }
        receiptUrl = null;
      }

      // recurring 처리
      let recurringId: string | null = entry?.recurringId ?? null;
      if (isRecurring && !recurringId) {
        // 새 고정 항목 추가
        const dayOfMonth = parseInt(date.split("-")[2], 10);
        const newRecId = `rec_${Date.now()}`;
        const recRef = doc(db, "vault", "recurring");
        const recSnap = await getDoc(recRef);
        const existing: RecurringItem[] = recSnap.exists() ? recSnap.data().items || [] : [];
        const startMonth = date.slice(0, 7); // "YYYY-MM"
        existing.push({
          id: newRecId,
          type,
          amount,
          category,
          memo,
          dayOfMonth,
          active: true,
          startMonth,
        });
        await setDoc(recRef, { items: existing }, { merge: true });
        recurringId = newRecId;
      } else if (!isRecurring && entry?.recurringId) {
        // 고정 해제 — recurring에서 삭제
        const recRef = doc(db, "vault", "recurring");
        const recSnap = await getDoc(recRef);
        if (recSnap.exists()) {
          const items: RecurringItem[] = (recSnap.data().items || []).filter(
            (r: RecurringItem) => r.id !== entry.recurringId
          );
          await setDoc(recRef, { items }, { merge: true });
        }
        recurringId = null;
      } else if (isRecurring && recurringId) {
        // 고정 항목 수정
        const dayOfMonth = parseInt(date.split("-")[2], 10);
        const recRef = doc(db, "vault", "recurring");
        const recSnap = await getDoc(recRef);
        if (recSnap.exists()) {
          const items: RecurringItem[] = (recSnap.data().items || []).map(
            (r: RecurringItem) => r.id === recurringId ? { ...r, type, amount, category, memo, dayOfMonth } : r
          );
          await setDoc(recRef, { items }, { merge: true });
        }
      }

      if (isEdit && entry) {
        // 새 영수증 업로드
        if (receiptFile) {
          const storageRef = ref(storage, `vault-receipts/${entry.id}/receipt.jpg`);
          await uploadBytes(storageRef, receiptFile);
          receiptUrl = await getDownloadURL(storageRef);
        }

        await updateDoc(doc(db, "vaultEntries", entry.id), {
          date,
          type,
          amount,
          category,
          memo,
          receiptUrl,
          recurringId,
          updatedAt: serverTimestamp(),
        });
      } else {
        // 새 거래 추가
        const docRef = await addDoc(collection(db, "vaultEntries"), {
          date,
          type,
          amount,
          category,
          memo,
          receiptUrl: null,
          recurringId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        if (receiptFile) {
          const storageRef = ref(storage, `vault-receipts/${docRef.id}/receipt.jpg`);
          await uploadBytes(storageRef, receiptFile);
          receiptUrl = await getDownloadURL(storageRef);
          await updateDoc(doc(db, "vaultEntries", docRef.id), { receiptUrl });
        }
      }

      onClose();
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!entry || !confirm("이 거래를 삭제할까요?")) return;
    setDeleting(true);
    try {
      // 고정 거래면 recurring에서도 삭제
      if (entry.recurringId) {
        try {
          const recRef = doc(db, "vault", "recurring");
          const recSnap = await getDoc(recRef);
          if (recSnap.exists()) {
            const items = (recSnap.data().items || []).filter(
              (r: RecurringItem) => r.id !== entry.recurringId
            );
            await setDoc(recRef, { items }, { merge: true });
          }
        } catch { /* ignore */ }
      }
      if (entry.receiptUrl) {
        try {
          const oldRef = ref(storage, `vault-receipts/${entry.id}/receipt.jpg`);
          await deleteObject(oldRef);
        } catch { /* ignore */ }
      }
      await deleteDoc(doc(db, "vaultEntries", entry.id));
      onClose();
    } catch (err) {
      console.error("Delete error:", err);
    } finally {
      setDeleting(false);
    }
  };

  const amount = parseAmount(amountStr);
  const canSave = amount > 0 && date && !saving;

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
          borderRadius: "0",
          width: "100%",
          maxWidth: "500px",
          height: "100dvh",
          overflowX: "hidden",
          display: "flex",
          flexDirection: "column",
          boxSizing: "border-box",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 20px",
            borderBottom: "1px solid rgba(0,0,0,0.1)",
            flexShrink: 0,
          }}
        >
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: "rgba(0,0,0,0.95)",
            }}
          >
            {isEdit ? "거래 수정" : "거래 추가"}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "18px",
              cursor: "pointer",
              color: "#a39e98",
              padding: "4px",
            }}
          >
            ✕
          </button>
        </div>

        {/* 스크롤 영역 */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
        {/* 수입/지출 토글 */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "16px",
          }}
        >
          {(["expense", "income"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: "4px",
                border: "1px solid",
                borderColor: type === t ? (t === "income" ? "#1f7a33" : "#dd5b00") : "rgba(0,0,0,0.1)",
                background: type === t ? (t === "income" ? "#f0faf1" : "#fff5f0") : "#ffffff",
                color: type === t ? (t === "income" ? "#1f7a33" : "#dd5b00") : "#a39e98",
                fontWeight: type === t ? 600 : 400,
                fontSize: "15px",
                cursor: "pointer",
              }}
            >
              {t === "income" ? "수입" : "지출"}
            </button>
          ))}
        </div>

        {/* 날짜 */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ fontSize: "14px", fontWeight: 500, color: "rgba(0,0,0,0.95)", display: "block", marginBottom: "6px" }}>
            날짜
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: "16px",
              border: "1px solid #dddddd",
              borderRadius: "4px",
              outline: "none",
              boxSizing: "border-box",
              appearance: "none",
              WebkitAppearance: "none",
              maxWidth: "100%",
            }}
          />
        </div>

        {/* 금액 */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ fontSize: "14px", fontWeight: 500, color: "rgba(0,0,0,0.95)", display: "block", marginBottom: "6px" }}>
            금액
          </label>
          <div style={{ position: "relative" }}>
            <span
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "#615d59",
                fontSize: "16px",
                fontWeight: 500,
              }}
            >
              ₩
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={amountStr}
              onChange={(e) => setAmountStr(formatInputAmount(e.target.value))}
              style={{
                width: "100%",
                padding: "10px 12px 10px 28px",
                fontSize: "16px",
                border: "1px solid #dddddd",
                borderRadius: "4px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        {/* 카테고리 */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ fontSize: "14px", fontWeight: 500, color: "rgba(0,0,0,0.95)", display: "block", marginBottom: "6px" }}>
            카테고리
          </label>
          {filteredCategories.length === 0 ? (
            <p style={{ fontSize: "13px", color: "#a39e98" }}>
              설정에서 카테고리를 먼저 추가하세요
            </p>
          ) : (
            <div style={{ position: "relative" }}>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 36px 10px 12px",
                  fontSize: "16px",
                  border: "1px solid #dddddd",
                  borderRadius: "4px",
                  outline: "none",
                  appearance: "none",
                  background: `#ffffff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23615d59' stroke-width='1.5' fill='none'/%3E%3C/svg%3E") no-repeat right 12px center`,
                  boxSizing: "border-box",
                }}
              >
                <option value="">선택</option>
                {filteredCategories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* 메모 */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ fontSize: "14px", fontWeight: 500, color: "rgba(0,0,0,0.95)", display: "block", marginBottom: "6px" }}>
            메모
          </label>
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: "16px",
              border: "1px solid #dddddd",
              borderRadius: "4px",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* 매월 고정 토글 */}
        <div
          style={{
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px",
            background: isRecurring ? "#f0faf1" : "#fafafa",
            border: `1px solid ${isRecurring ? "rgba(56,168,72,0.3)" : "rgba(0,0,0,0.1)"}`,
            borderRadius: "4px",
          }}
        >
          <span style={{ fontSize: "14px", fontWeight: 500, color: "rgba(0,0,0,0.95)" }}>
            매월 고정
          </span>
          <button
            type="button"
            onClick={() => setIsRecurring(!isRecurring)}
            style={{
              width: "44px",
              height: "24px",
              borderRadius: "12px",
              border: "none",
              background: isRecurring ? "#1f7a33" : "#ccc",
              position: "relative",
              cursor: "pointer",
              transition: "background 0.2s",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: "2px",
                left: isRecurring ? "22px" : "2px",
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                background: "#fff",
                transition: "left 0.2s",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }}
            />
          </button>
        </div>

        {/* 영수증 */}
        <div style={{ marginBottom: "16px" }}>
          <ReceiptCapture
            imageUrl={existingReceiptUrl}
            onCapture={(file) => {
              setReceiptFile(file);
              setRemoveReceipt(false);
            }}
            onRemove={() => {
              setReceiptFile(null);
              setRemoveReceipt(true);
              setExistingReceiptUrl(null);
            }}
          />
        </div>
        </div>

        {/* 하단 고정 버튼 */}
        <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(0,0,0,0.1)", display: "flex", gap: "8px", flexShrink: 0 }}>
          {isEdit && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              style={{
                padding: "12px 16px",
                fontSize: "15px",
                fontWeight: 600,
                color: "#dd5b00",
                background: "#fff5f0",
                border: "1px solid rgba(221,91,0,0.2)",
                borderRadius: "4px",
                cursor: deleting ? "default" : "pointer",
                flexShrink: 0,
              }}
            >
              {deleting ? "삭제 중..." : "삭제"}
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            style={{
              flex: 1,
              padding: "12px 16px",
              fontSize: "15px",
              fontWeight: 600,
              color: "#ffffff",
              background: canSave ? "#1f7a33" : "#a39e98",
              border: "1px solid transparent",
              borderRadius: "4px",
              cursor: canSave ? "pointer" : "default",
            }}
          >
            {saving ? "저장 중..." : isEdit ? "수정" : "추가"}
          </button>
        </div>
      </div>
    </div>
  );
}
