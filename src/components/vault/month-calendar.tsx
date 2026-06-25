"use client";

import { getMonthDates, toDateString, formatAmount } from "@/lib/vault-utils";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

type Props = {
  year: number;
  month: number; // 0-based
  selectedDate: string | null;
  today: string;
  dailyTotals: Record<string, { income: number; expense: number }>;
  onSelect: (dateStr: string) => void;
};

export function MonthCalendar({ year, month, selectedDate, today, dailyTotals, onSelect }: Props) {
  const dates = getMonthDates(year, month);
  const firstDayOfWeek = dates[0]?.getDay() ?? 0;

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid rgba(0,0,0,0.1)",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {WEEKDAYS.map((d, i) => (
          <div
            key={d}
            style={{
              textAlign: "center",
              padding: "8px 0",
              fontSize: "12px",
              fontWeight: 600,
              color: i === 0 ? "#dd5b00" : i === 6 ? "#2a9d99" : "#615d59",
              borderBottom: "1px solid rgba(0,0,0,0.1)",
            }}
          >
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} style={{ minHeight: "60px" }} />
        ))}
        {dates.map((d) => {
          const dateStr = toDateString(d);
          const dt = dailyTotals[dateStr];
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDate;
          const dayOfWeek = d.getDay();
          return (
            <button
              key={dateStr}
              onClick={() => onSelect(dateStr)}
              style={{
                minHeight: "60px",
                padding: "4px 2px",
                border: "none",
                borderTop: "1px solid rgba(0,0,0,0.05)",
                background: isSelected ? "#f0faf1" : "transparent",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "2px",
              }}
            >
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: isToday ? 700 : 400,
                  color: isToday
                    ? "#ffffff"
                    : dayOfWeek === 0
                      ? "#dd5b00"
                      : dayOfWeek === 6
                        ? "#2a9d99"
                        : "rgba(0,0,0,0.95)",
                  background: isToday ? "#38a848" : "transparent",
                  borderRadius: "50%",
                  width: "24px",
                  height: "24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {d.getDate()}
              </span>
              {dt && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  {dt.income > 0 && (
                    <span style={{ fontSize: "9px", color: "#38a848", fontWeight: 500, lineHeight: 1.2 }}>
                      +{formatCompact(dt.income)}
                    </span>
                  )}
                  {dt.expense > 0 && (
                    <span style={{ fontSize: "9px", color: "#dd5b00", fontWeight: 500, lineHeight: 1.2 }}>
                      -{formatCompact(dt.expense)}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 금액을 간략하게 표시 (만 단위) */
function formatCompact(amount: number): string {
  if (amount >= 10000) {
    const man = Math.floor(amount / 10000);
    const remainder = amount % 10000;
    if (remainder === 0) return `${man}만`;
    return `${man}.${Math.floor(remainder / 1000)}만`;
  }
  return formatAmount(amount);
}
