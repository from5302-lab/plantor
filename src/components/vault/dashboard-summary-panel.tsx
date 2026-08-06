"use client";

import { useMemo } from "react";
import { formatAmount } from "@/lib/vault-utils";
import { useAdminBilling } from "@/lib/vault/use-admin-billing";
import type { VaultEntry, RecurringItem } from "./vault-shell";

type Props = {
  entries: VaultEntry[];
  recurringItems: RecurringItem[];
  month: string; // "YYYY-MM" (선택 월)
  balance: number; // 현재 잔액 (오늘까지 누적, 상단 칩과 동일)
};

const GREEN = "#1f7a33";
const ORANGE = "#dd5b00";

export function DashboardSummaryPanel({ entries, recurringItems, month, balance }: Props) {
  const { monthlyTotal, agencyFeeTotal, items, agencyByService } = useAdminBilling(month);

  const m = useMemo(() => {
    // 이번달 고정지출 항목 (vault recurring expense)
    const fixedExpenseItems = recurringItems.filter(
      (r) => r.type === "expense" && r.active && (!r.startMonth || r.startMonth <= month)
    );
    const fixedVaultTotal = fixedExpenseItems.reduce((s, r) => s + r.amount, 0);

    // 이번달 고정지출 미납 잔액 (분납 반영 — 남은 금액만)
    const paidFor = (id: string) =>
      entries.filter((e) => e.recurringId === id && e.date.startsWith(month)).reduce((s, e) => s + e.amount, 0);
    const unpaidFixedVault = fixedExpenseItems
      .reduce((s, r) => s + Math.max(0, r.amount - paidFor(r.id)), 0);

    // 예상매출 중 미입금분
    const paidExpect = new Set(
      entries.filter((e) => e.sourceKey?.startsWith("expect_")).map((e) => e.sourceKey!)
    );
    const pendingIncoming = items
      .filter((i) => !paidExpect.has(`expect_${i.key}_${month}`))
      .reduce((s, i) => s + i.amount, 0);

    // 가맹비 중 미납분 (완료한 가맹비는 제외)
    const paidAgency = new Set(
      entries.filter((e) => e.sourceKey?.startsWith("agency_")).map((e) => e.sourceKey!)
    );
    const unpaidAgency = agencyByService
      .filter((a) => !paidAgency.has(`agency_${a.key}_${month}`))
      .reduce((s, a) => s + a.amount, 0);

    return {
      fixedExpense: agencyFeeTotal + fixedVaultTotal, // 1 (이번달 고정지출 총액)
      totalRevenue: monthlyTotal,                     // 2 (이번달 만료 대상 전체 매출, 안정)
      incoming: pendingIncoming,                              // 3
      outgoing: unpaidAgency + unpaidFixedVault, // 4 (미납 가맹비 + 미납 고정지출)
    };
  }, [entries, recurringItems, items, monthlyTotal, agencyFeeTotal, agencyByService, month]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={cardStyle}>
        <Group title="이번 달">
          <Row label="총수입" value={m.totalRevenue} color={GREEN} sign="+" />
          <Row label="고정 지출" value={m.fixedExpense} color={ORANGE} sign="-" />
          <SumLine value={m.totalRevenue - m.fixedExpense} />
        </Group>
      </div>

      <div style={cardStyle}>
        <Group title="앞으로">
          <Row label="현재 잔액" value={balance} color={balance >= 0 ? GREEN : ORANGE} sign={balance >= 0 ? "+" : "-"} />
          <Row label="들어올 돈" value={m.incoming} color={GREEN} sign="+" />
          <Row label="내야 할 돈" value={m.outgoing} color={ORANGE} sign="-" />
          <SumLine value={balance + m.incoming - m.outgoing} />
        </Group>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid rgba(0,0,0,0.1)",
  borderRadius: "12px",
  padding: "14px 16px",
};

function SumLine({ value }: { value: number }) {
  const color = value > 0 ? GREEN : value < 0 ? ORANGE : "rgba(0,0,0,0.95)";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: "6px",
        paddingTop: "8px",
        borderTop: "1.5px solid rgba(0,0,0,0.18)",
      }}
    >
      <span style={{ fontSize: "12px", fontWeight: 600, color: "#a39e98" }}>합계</span>
      <span style={{ fontSize: "16px", fontWeight: 700, color, whiteSpace: "nowrap" }}>
        {sign}₩{formatAmount(Math.abs(value))}
      </span>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: "11px", fontWeight: 600, color: "#a39e98", marginBottom: "8px" }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>{children}</div>
    </div>
  );
}

function Row({ label, value, color, sign, bold }: { label: string; value: number; color: string; sign?: "+" | "-"; bold?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: "13px", color: "#615d59" }}>{label}</span>
      <span style={{ fontSize: bold ? "16px" : "14px", fontWeight: bold ? 700 : 600, color, whiteSpace: "nowrap" }}>
        {sign && value !== 0 ? sign : ""}₩{formatAmount(Math.abs(value))}
      </span>
    </div>
  );
}
