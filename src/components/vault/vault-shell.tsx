"use client";

import { useState, useEffect, useRef } from "react";
import {
  collection,
  query,
  onSnapshot,
  doc,
  orderBy,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Settings } from "lucide-react";
import { EntriesTab } from "./entries-tab";
import { SettingsModal } from "./settings-modal";

export type VaultEntry = {
  id: string;
  date: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  memo: string;
  receiptUrl: string | null;
  recurringId?: string | null;
  sourceKey?: string | null;
  paymentKey?: string | null;
  createdAt: unknown;
  updatedAt: unknown;
};

export type VaultCategory = {
  id: string;
  name: string;
  type: "income" | "expense";
  isSavings?: boolean;
};

export type RecurringItem = {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  memo: string;
  dayOfMonth: number;
  active: boolean;
  startMonth?: string; // "YYYY-MM" — 생성 월 (이 달 이전엔 노출 안 함)
};

export type DebtItem = {
  id: string;
  name: string;   // 채권자/항목명
  amount: number; // 현재 잔액
};

export type WishlistItem = {
  id: string;
  title: string;
  tag: "투자" | "소비" | "부채상환";
  amount: number;
  link: string | null;
  targetDate: string | null;
  order: number;
  completed: boolean;
  completedAt: string | null;
};

export function VaultShell() {
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [categories, setCategories] = useState<VaultCategory[]>([]);
  const [recurringItems, setRecurringItems] = useState<RecurringItem[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);

  // Firestore 실시간 구독: entries
  useEffect(() => {
    const q = query(collection(db, "vaultEntries"), orderBy("date", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as VaultEntry));
      setEntries(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Firestore 실시간 구독: categories
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "vault", "categories"), (snap) => {
      if (snap.exists()) {
        setCategories(snap.data().items || []);
      } else {
        setCategories([]);
      }
    });
    return unsub;
  }, []);

  // Firestore 실시간 구독: recurring
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "vault", "recurring"), (snap) => {
      if (snap.exists()) {
        setRecurringItems(snap.data().items || []);
      } else {
        setRecurringItems([]);
      }
    });
    return unsub;
  }, []);

  // 기존 "저축" 카테고리에 isSavings 플래그 자동 부여 (1회만 실행)
  const savingsMigrationDone = useRef(false);
  useEffect(() => {
    if (categories.length === 0 || savingsMigrationDone.current) return;
    const needsMigration = categories.some(
      (c) => c.name === "저축" && c.isSavings === undefined
    );
    if (!needsMigration) return;
    savingsMigrationDone.current = true;
    const updated = categories.map((c) =>
      c.name === "저축" && c.isSavings === undefined ? { ...c, isSavings: true } : c
    );
    setDoc(doc(db, "vault", "categories"), { items: updated }).catch(() => {});
  }, [categories]);

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", overflowX: "hidden", maxWidth: "100vw" }}>
      {/* Header */}
      <header
        style={{
          background: "#ffffff",
          borderBottom: "1px solid rgba(0,0,0,0.1)",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <h1
          style={{
            fontSize: "18px",
            fontWeight: 700,
            color: "rgba(0,0,0,0.95)",
            letterSpacing: "-0.25px",
          }}
        >
          💰 1조부자
        </h1>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => setShowSettings(true)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              color: "#615d59",
              display: "flex",
            }}
            title="설정"
          >
            <Settings size={20} strokeWidth={1.8} />
          </button>
        </div>
      </header>

      {/* Content — 정산/고정지출/채무 화면 단일 고정 (하단 탭바 없음) */}
      <main style={{ flex: 1, padding: "16px 16px 40px", maxWidth: "800px", width: "100%", margin: "0 auto", overflowX: "hidden", boxSizing: "border-box" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "64px 0", color: "#a39e98" }}>
            불러오는 중...
          </div>
        ) : (
          <EntriesTab entries={entries} categories={categories} recurringItems={recurringItems} />
        )}
      </main>

      {showSettings && (
        <SettingsModal
          categories={categories}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
