"use client";

import { useState } from "react";
import { RecurringPanel } from "./recurring-panel";
import { ExpectedIncomePanel } from "./expected-income-panel";
import { DebtPanel } from "./debt-panel";
import { MonthNetPanel } from "./month-net-panel";
import type { VaultEntry, VaultCategory, RecurringItem } from "./vault-shell";

type Props = {
  entries: VaultEntry[];
  categories: VaultCategory[];
  recurringItems: RecurringItem[];
};

export function EntriesTab({ entries, categories, recurringItems }: Props) {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const moveMonth = (delta: number) => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const monthLabel = (() => {
    const [y, m] = selectedMonth.split("-");
    return `${y}년 ${Number(m)}월`;
  })();

  return (
    <div>
      {/* 월 선택 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          marginBottom: "16px",
        }}
      >
        <button onClick={() => moveMonth(-1)} style={navBtnStyle}>◀</button>
        <span style={{ fontSize: "16px", fontWeight: 600, color: "rgba(0,0,0,0.95)" }}>
          {monthLabel}
        </span>
        <button onClick={() => moveMonth(1)} style={navBtnStyle}>▶</button>
      </div>

      {/* 상단 요약: 들어올 예정 − 고정지출 */}
      <div style={{ marginBottom: "16px" }}>
        <MonthNetPanel month={selectedMonth} entries={entries} recurringItems={recurringItems} />
      </div>

      {/* 이번 달 들어올 예정 매출 */}
      <div style={{ marginBottom: "16px" }}>
        <ExpectedIncomePanel month={selectedMonth} entries={entries} />
      </div>

      {/* 매달 고정거래 패널 */}
      <div style={{ marginBottom: "16px" }}>
        <RecurringPanel recurringItems={recurringItems} entries={entries} categories={categories} month={selectedMonth} />
      </div>

      {/* 채무 패널 (월 무관 누적) */}
      <div style={{ marginBottom: "16px" }}>
        <DebtPanel />
      </div>
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid rgba(0,0,0,0.1)",
  borderRadius: "4px",
  padding: "6px 10px",
  cursor: "pointer",
  fontSize: "12px",
  color: "#615d59",
};
