"use client";

import { useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";
import { formatAmount, toDateString, daysBetween } from "@/lib/vault-utils";
import { DashboardSummaryPanel } from "./dashboard-summary-panel";
import { MonthCalendar } from "./month-calendar";
import { TransactionList } from "./transaction-list";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { VaultEntry, VaultCategory, RecurringItem } from "./vault-shell";

type Props = {
  entries: VaultEntry[];
  categories: VaultCategory[];
  recurringItems: RecurringItem[];
};

const PIE_COLORS = [
  "#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF",
  "#FF9F40", "#E7517A", "#2ECC71", "#3498DB", "#F39C12",
];

export function DashboardTab({ entries, categories, recurringItems }: Props) {
  const [selectedDate, setSelectedDate] = useState(() => toDateString(new Date()));
  const [showCal, setShowCal] = useState(false);
  const [showTx, setShowTx] = useState(false); // 거래 내역 토글 (기본 닫힘)
  const [calMonth, setCalMonth] = useState(() => toDateString(new Date()).slice(0, 7)); // 팝업 표시 월
  const currentMonth = selectedDate.slice(0, 7);

  const monthEntries = useMemo(
    () => entries.filter((e) => e.date.startsWith(currentMonth)),
    [entries, currentMonth]
  );

  const today = toDateString(new Date());

  // 선택 날짜 기준: 그날 수입/지출 + 그날까지 누적 잔액
  // 실제 결제·입금된 모든 기록 반영 (고정지출 완료·분납 포함)
  const { dayIncome, dayExpense, balance } = useMemo(() => {
    let dInc = 0, dExp = 0, inc = 0, exp = 0;
    entries.forEach((e) => {
      if (e.date <= selectedDate) {
        if (e.type === "income") inc += e.amount; else exp += e.amount;
      }
      if (e.date === selectedDate) {
        if (e.type === "income") dInc += e.amount; else dExp += e.amount;
      }
    });
    return { dayIncome: dInc, dayExpense: dExp, balance: inc - exp };
  }, [entries, selectedDate]);

  // 달력용 날짜별 합계 (실제 결제·입금된 모든 기록)
  const dailyTotals = useMemo(() => {
    const map: Record<string, { income: number; expense: number }> = {};
    entries.forEach((e) => {
      if (!map[e.date]) map[e.date] = { income: 0, expense: 0 };
      map[e.date][e.type] += e.amount;
    });
    return map;
  }, [entries]);

  // 다음 수입까지 하루 쓸 수 있는 금액
  const dailyUntilIncome = useMemo(() => {
    // 선택일 이후 가장 가까운 미래 수입 찾기 (전체 entries에서)
    const futureIncomes = entries
      .filter((e) => e.type === "income" && e.date > selectedDate)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (futureIncomes.length === 0) return null;

    const nextIncomeDate = futureIncomes[0].date;
    const nextIncomeAmount = futureIncomes
      .filter((e) => e.date === nextIncomeDate)
      .reduce((s, e) => s + e.amount, 0);
    const daysLeft = daysBetween(selectedDate, nextIncomeDate) - 1;
    if (daysLeft <= 0) return null;

    const dailyAmount = Math.round(balance / daysLeft);

    return {
      nextDate: nextIncomeDate,
      nextDateLabel: nextIncomeDate.slice(5).replace("-", "/"),
      nextAmount: nextIncomeAmount,
      daysLeft,
      dailyAmount,
    };
  }, [entries, selectedDate, balance]);

  // 카테고리별 지출 (도넛)
  const pieData = useMemo(() => {
    const map: Record<string, number> = {};
    monthEntries
      .filter((e) => e.type === "expense")
      .forEach((e) => {
        map[e.category] = (map[e.category] || 0) + e.amount;
      });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [monthEntries]);

  // 이번 달 거래 내역 (고정거래 제외 — 패널에서 관리)
  const monthTx = useMemo(
    () =>
      entries
        .filter((e) => !e.recurringId && !e.sourceKey?.startsWith("agency_") && e.date.startsWith(currentMonth))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [entries, currentMonth]
  );

  const moveDay = (delta: number) => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const date = new Date(y, m - 1, d + delta);
    setSelectedDate(toDateString(date));
  };

  const moveCalMonth = (delta: number) => {
    const [y, m] = calMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const [calYear, calMonthIdx] = calMonth.split("-").map(Number);
  const calMonthLabel = `${calYear}년 ${calMonthIdx}월`;

  const dateLabel = (() => {
    const [y, m, d] = selectedDate.split("-");
    return `${y}년 ${Number(m)}월 ${Number(d)}일`;
  })();

  const isToday = selectedDate === today;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* 날짜 선택 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
        }}
      >
        <button onClick={() => moveDay(-1)} style={navBtnStyle}>◀</button>
        <button
          onClick={() => { setCalMonth(currentMonth); setShowCal(true); }}
          style={{
            fontSize: "16px",
            fontWeight: 600,
            color: isToday ? "rgba(0,0,0,0.95)" : "#1f7a33",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          {dateLabel}
        </button>
        <button onClick={() => moveDay(1)} style={navBtnStyle}>▶</button>
      </div>

      {/* 일자 요약 */}
      <div style={{ display: "flex", gap: "8px" }}>
        <SummaryChip label="수입" amount={dayIncome} color="#1f7a33" />
        <SummaryChip label="지출" amount={dayExpense} color="#dd5b00" />
        <SummaryChip label="잔액" amount={balance} color={balance < 0 ? "#dd5b00" : "rgba(0,0,0,0.95)"} />
      </div>

      {/* 요약 지표 패널 */}
      <DashboardSummaryPanel entries={entries} recurringItems={recurringItems} month={currentMonth} balance={balance} />

      {/* 다음 수입까지 하루 쓸 수 있는 금액 */}
      {dailyUntilIncome && (
        <div
          style={{
            background: dailyUntilIncome.dailyAmount >= 0 ? "#f0faf1" : "#fff5f0",
            border: `1px solid ${dailyUntilIncome.dailyAmount >= 0 ? "rgba(56,168,72,0.3)" : "rgba(221,91,0,0.3)"}`,
            borderRadius: "12px",
            padding: "16px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <span style={{ fontSize: "13px", fontWeight: 500, color: "rgba(0,0,0,0.95)" }}>
              다음 수입까지 하루 예산
            </span>
            <span style={{ fontSize: "12px", color: "#a39e98" }}>
              {dailyUntilIncome.nextDateLabel} · {dailyUntilIncome.daysLeft}일 남음
            </span>
          </div>
          <div
            style={{
              fontSize: "26px",
              fontWeight: 700,
              color: dailyUntilIncome.dailyAmount >= 0 ? "#1f7a33" : "#dd5b00",
              letterSpacing: "-0.5px",
              textAlign: "center",
              marginBottom: "8px",
            }}
          >
            {dailyUntilIncome.dailyAmount < 0 && "-"}₩{formatAmount(Math.abs(dailyUntilIncome.dailyAmount))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#615d59" }}>
            <span>현재 잔액 ₩{formatAmount(Math.abs(balance))}</span>
            <span>다음 수입 ₩{formatAmount(dailyUntilIncome.nextAmount)}</span>
          </div>
        </div>
      )}

      {/* 카테고리별 지출 */}
      {pieData.length > 0 && (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid rgba(0,0,0,0.1)",
            borderRadius: "12px",
            padding: "16px",
          }}
        >
          <h3 style={{ fontSize: "14px", fontWeight: 600, color: "rgba(0,0,0,0.95)", marginBottom: "12px" }}>
            카테고리별 지출
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ width: "120px", height: "120px", flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={55}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
              {pieData.map((d, i) => (
                <div key={d.name} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div
                    style={{
                      width: "10px",
                      height: "10px",
                      borderRadius: "2px",
                      background: PIE_COLORS[i % PIE_COLORS.length],
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: "12px", color: "#615d59", flex: 1 }}>{d.name}</span>
                  <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(0,0,0,0.95)" }}>
                    ₩{formatAmount(d.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 거래 내역 (토글) */}
      {entries.length > 0 && (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid rgba(0,0,0,0.1)",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          <button
            onClick={() => setShowTx(!showTx)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 16px",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: "14px", fontWeight: 600, color: "rgba(0,0,0,0.95)" }}>
              거래 내역
              <span style={{ fontSize: "12px", color: "#a39e98", fontWeight: 400, marginLeft: "8px" }}>
                {monthTx.length}건
              </span>
            </span>
            {showTx ? <ChevronUp size={16} color="#a39e98" /> : <ChevronDown size={16} color="#a39e98" />}
          </button>
          {showTx && (
            <div style={{ padding: "0 16px 16px" }}>
              <TransactionList entries={monthTx} categories={categories} />
            </div>
          )}
        </div>
      )}

      {/* 데이터 없을 때 */}
      {entries.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#a39e98" }}>
          <p style={{ fontSize: "32px", marginBottom: "8px" }}>📝</p>
          <p style={{ fontSize: "14px" }}>아직 거래 내역이 없습니다</p>
          <p style={{ fontSize: "13px", marginTop: "4px" }}>내역 탭에서 첫 거래를 추가해보세요</p>
        </div>
      )}

      {/* 날짜 선택 달력 팝업 */}
      {showCal && (
        <div
          onClick={(e) => e.target === e.currentTarget && setShowCal(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div style={{ width: "100%", maxWidth: "420px", background: "#ffffff", borderRadius: "16px", padding: "16px", boxSizing: "border-box" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "16px", marginBottom: "12px" }}>
              <button onClick={() => moveCalMonth(-1)} style={navBtnStyle}>◀</button>
              <span style={{ fontSize: "16px", fontWeight: 600, color: "rgba(0,0,0,0.95)" }}>{calMonthLabel}</span>
              <button onClick={() => moveCalMonth(1)} style={navBtnStyle}>▶</button>
            </div>
            <MonthCalendar
              year={calYear}
              month={calMonthIdx - 1}
              selectedDate={selectedDate}
              today={today}
              dailyTotals={dailyTotals}
              onSelect={(d) => { setSelectedDate(d); setShowCal(false); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryChip({ label, amount, color }: { label: string; amount: number; color: string }) {
  return (
    <div
      style={{
        flex: 1,
        background: "#ffffff",
        border: "1px solid rgba(0,0,0,0.1)",
        borderRadius: "8px",
        padding: "10px 12px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "11px", color: "#a39e98", marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "14px", fontWeight: 600, color }}>
        {amount < 0 ? "-" : ""}₩{formatAmount(Math.abs(amount))}
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
