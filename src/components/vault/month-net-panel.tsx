"use client";

import { useMemo } from "react";
import { formatAmount } from "@/lib/vault-utils";
import { useAdminBilling } from "@/lib/vault/use-admin-billing";
import type { VaultEntry, RecurringItem } from "./vault-shell";

type Props = {
  month: string; // "YYYY-MM"
  entries: VaultEntry[];
  recurringItems: RecurringItem[];
};

// 상단 요약: 들어올 예정(미입금) − 고정지출(미납)을 일/주/달 생활비로 환산
export function MonthNetPanel({ month, entries, recurringItems }: Props) {
  const { items, agencyByService } = useAdminBilling(month);

  const net = useMemo(() => {
    // 미입금 예상 수입
    const paidExpect = new Set(
      entries.filter((e) => e.sourceKey?.startsWith("expect_")).map((e) => e.sourceKey!)
    );
    const incomePending = items
      .filter((i) => !paidExpect.has(`expect_${i.key}_${month}`))
      .reduce((s, i) => s + i.amount, 0);

    // 미납 고정지출 (이번 달 남은 금액)
    const paidFor = (id: string) =>
      entries.filter((e) => e.recurringId === id && e.date.startsWith(month)).reduce((s, e) => s + e.amount, 0);
    const fixedPending = recurringItems
      .filter((r) => r.type === "expense" && r.active && (!r.startMonth || r.startMonth <= month))
      .reduce((s, r) => s + Math.max(0, r.amount - paidFor(r.id)), 0);

    // 미납 가맹비 (서비스별) — 고정지출 패널 미납과 동일 기준으로 함께 차감
    const agencyPaid = new Set(
      entries.filter((e) => e.sourceKey?.startsWith("agency_")).map((e) => e.sourceKey!)
    );
    const agencyPending = agencyByService.reduce(
      (s, a) => (agencyPaid.has(`agency_${a.key}_${month}`) ? s : s + a.amount),
      0
    );

    return incomePending - fixedPending - agencyPending;
  }, [items, agencyByService, entries, recurringItems, month]);

  const [y, mm] = month.split("-").map(Number);
  const daysInMonth = new Date(y, mm, 0).getDate();
  const daily = Math.round(net / daysInMonth);

  const cols = [
    { label: "1일 생활비", value: daily, color: "#1f7a33" },
    { label: "1주 생활비", value: daily * 7, color: "#2980b9" },
    { label: "1달 생활비", value: net, color: "#8b5cf6" },
  ];

  const fmt = (v: number) => `${v < 0 ? "-" : ""}₩${formatAmount(Math.abs(v))}`;

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid rgba(0,0,0,0.1)",
        borderRadius: "12px",
        padding: "16px",
        display: "flex",
        alignItems: "stretch",
      }}
    >
      {cols.map((c, i) => (
        <div
          key={c.label}
          style={{
            flex: 1,
            textAlign: "center",
            borderLeft: i === 0 ? "none" : "1px solid rgba(0,0,0,0.08)",
            padding: "0 8px",
          }}
        >
          <div style={{ fontSize: "12px", fontWeight: 500, color: "#a39e98", marginBottom: "6px" }}>
            {c.label}
          </div>
          <div style={{ fontSize: "16px", fontWeight: 700, color: c.color, whiteSpace: "nowrap" }}>
            {fmt(c.value)}
          </div>
        </div>
      ))}
    </div>
  );
}
