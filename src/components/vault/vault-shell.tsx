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
import { LayoutDashboard, List, Target, Plus, Settings } from "lucide-react";
import { DashboardTab } from "./dashboard-tab";
import { EntriesTab } from "./entries-tab";
import { EntryForm } from "./entry-form";
import { WishlistTab } from "./wishlist-tab";
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

type Tab = "dashboard" | "entries" | "wishlist";

const TAB_ICONS: Record<Tab, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  dashboard: LayoutDashboard,
  entries: List,
  wishlist: Target,
};

const TABS: Tab[] = ["dashboard", "entries", "wishlist"];

export function VaultShell() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [categories, setCategories] = useState<VaultCategory[]>([]);
  const [recurringItems, setRecurringItems] = useState<RecurringItem[]>([]);
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showForm, setShowForm] = useState(false);
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

  // Firestore 실시간 구독: wishlist
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "vault", "wishlist"), (snap) => {
      if (snap.exists()) {
        setWishlistItems(snap.data().items || []);
      } else {
        setWishlistItems([]);
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

  // 고정거래는 자동 생성하지 않음 — 대시보드 상단 패널에서 원터치로 기록

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

      {/* Content */}
      <main style={{ flex: 1, padding: "16px 16px 100px", maxWidth: "800px", width: "100%", margin: "0 auto", overflowX: "hidden", boxSizing: "border-box" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "64px 0", color: "#a39e98" }}>
            불러오는 중...
          </div>
        ) : (
          <>
            {tab === "dashboard" && <DashboardTab entries={entries} categories={categories} recurringItems={recurringItems} />}
            {tab === "entries" && <EntriesTab entries={entries} categories={categories} recurringItems={recurringItems} />}
            {tab === "wishlist" && <WishlistTab entries={entries} wishlistItems={wishlistItems} categories={categories} />}
          </>
        )}
      </main>

      {/* Bottom Tab Bar */}
      <nav
        style={{
          background: "#ffffff",
          borderTop: "1px solid rgba(0,0,0,0.1)",
          display: "flex",
          alignItems: "flex-start",
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          paddingTop: "10px",
          paddingBottom: "calc(8px + env(safe-area-inset-bottom))",
        }}
      >
        {TABS.slice(0, 2).map((t) => {
          const Icon = TAB_ICONS[t];
          return (
            <button key={t} onClick={() => setTab(t)} style={tabBtnStyle(tab === t)}>
              <Icon size={26} strokeWidth={1.8} />
            </button>
          );
        })}

        {/* 중앙 + 버튼 */}
        <button onClick={() => setShowForm(true)} style={tabBtnStyle(false)}>
          <Plus size={28} strokeWidth={2.5} color="#38a848" />
        </button>

        {TABS.slice(2).map((t) => {
          const Icon = TAB_ICONS[t];
          return (
            <button key={t} onClick={() => setTab(t)} style={tabBtnStyle(tab === t)}>
              <Icon size={26} strokeWidth={1.8} />
            </button>
          );
        })}
      </nav>

      {showForm && (
        <EntryForm
          entry={null}
          categories={categories}
          onClose={() => setShowForm(false)}
        />
      )}

      {showSettings && (
        <SettingsModal
          categories={categories}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

function tabBtnStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "none",
    cursor: "pointer",
    color: active ? "#38a848" : "#a39e98",
    padding: 0,
  };
}
