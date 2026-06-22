"use client";

import { useState, useMemo } from "react";
import { formatAmount } from "@/lib/vault-utils";
import { useAdminBilling } from "@/lib/vault/use-admin-billing";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { VaultEntry } from "./vault-shell";

type Props = {
  month: string; // "YYYY-MM"
  entries: VaultEntry[];
};

export function ExpectedIncomePanel({ month, entries }: Props) {
  const [open, setOpen] = useState(false);
  const { items } = useAdminBilling(month);

  // 받은 돈(입금완료): 이번 달 + 회원탭 "입금확인"이 자동 기록한 수입(paymentKey renewal_/direct_)
  const paidEntries = useMemo(
    () =>
      entries
        .filter(
          (e) =>
            e.type === "income" &&
            e.date?.startsWith(month) &&
            (e.paymentKey?.startsWith("renewal_") || e.paymentKey?.startsWith("direct_"))
        )
        .sort((a, b) => b.date.localeCompare(a.date)),
    [entries, month]
  );

  // 받을 돈(미입금): 이번 달 만료 구독/수업/AI 중 아직 입금확인 안 된 건
  const pendingTotal = items.reduce((s, i) => s + i.amount, 0);
  const paidTotal = paidEntries.reduce((s, e) => s + e.amount, 0);

  if (items.length === 0 && paidEntries.length === 0) return null;

  return (
    <div
      style={{
        background: "#f0f6ff",
        border: "1px solid rgba(52,152,219,0.3)",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen(!open)}
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
        <span style={{ fontSize: "14px", fontWeight: 600, color: "#2980b9" }}>
          이번 달 정산
          <span style={{ fontSize: "12px", color: "#5a9bd4", fontWeight: 400, marginLeft: "8px" }}>
            받을 {items.length} · 받은 {paidEntries.length}
          </span>
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "13px", color: "#a39e98", fontWeight: 500 }}>미입금</span>
          <span style={{ fontSize: "14px", color: "#2980b9", fontWeight: 700 }}>
            ₩{formatAmount(pendingTotal)}
          </span>
          {open ? <ChevronUp size={16} color="#5a9bd4" /> : <ChevronDown size={16} color="#5a9bd4" />}
        </div>
      </button>

      {open && (
        <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid rgba(52,152,219,0.15)" }}>
          {/* ── 받을 돈 (미입금) ── */}
          <SectionLabel
            text="받을 돈 (미입금)"
            count={items.length}
            total={pendingTotal}
            color="#c0392b"
          />
          {items.length === 0 ? (
            <EmptyRow text="이번 달 받을 돈이 모두 입금됐어요 🎉" />
          ) : (
            items.map((item) => (
              <div
                key={item.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "12px 16px",
                  borderTop: "1px solid rgba(52,152,219,0.08)",
                }}
              >
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 600,
                    color: "#2980b9",
                    background: "#ffffff",
                    border: "1px solid rgba(52,152,219,0.3)",
                    borderRadius: "4px",
                    padding: "1px 6px",
                    flexShrink: 0,
                  }}
                >
                  {item.kind}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "rgba(0,0,0,0.95)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.label}
                    {item.count > 1 && (
                      <span style={{ fontSize: "11px", fontWeight: 500, color: "#5a9bd4", marginLeft: "5px" }}>
                        {item.count}건
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#a39e98",
                      marginTop: "2px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.sub} · {item.due.slice(5).replace("-", "/")} 만료
                  </div>
                </div>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "#2980b9", whiteSpace: "nowrap", flexShrink: 0 }}>
                  +₩{formatAmount(item.amount)}
                </span>
              </div>
            ))
          )}

          {/* ── 받은 돈 (입금완료) ── */}
          <SectionLabel
            text="받은 돈 (입금완료)"
            count={paidEntries.length}
            total={paidTotal}
            color="#1a7f4b"
          />
          {paidEntries.length === 0 ? (
            <EmptyRow text="이번 달 입금확인한 내역이 아직 없어요" />
          ) : (
            paidEntries.map((e) => (
              <div
                key={e.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "12px 16px",
                  borderTop: "1px solid rgba(52,152,219,0.08)",
                  background: "rgba(26,127,75,0.04)",
                }}
              >
                <span style={{ fontSize: "13px", flexShrink: 0 }}>✅</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "rgba(0,0,0,0.9)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {e.memo || "입금"}
                  </div>
                  <div style={{ fontSize: "12px", color: "#a39e98", marginTop: "2px" }}>
                    {e.date.slice(5).replace("-", "/")} 입금확인
                  </div>
                </div>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "#1a7f4b", whiteSpace: "nowrap", flexShrink: 0 }}>
                  +₩{formatAmount(e.amount)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ text, count, total, color }: { text: string; count: number; total: number; color: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "9px 16px",
        borderTop: "1px solid rgba(52,152,219,0.15)",
        background: "rgba(255,255,255,0.5)",
      }}
    >
      <span style={{ fontSize: "12px", fontWeight: 700, color }}>
        {text} <span style={{ fontWeight: 500, color: "#a39e98" }}>{count}건</span>
      </span>
      <span style={{ fontSize: "12px", fontWeight: 600, color }}>₩{formatAmount(total)}</span>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "14px 16px",
        borderTop: "1px solid rgba(52,152,219,0.08)",
        fontSize: "13px",
        color: "#a39e98",
        textAlign: "center",
      }}
    >
      {text}
    </div>
  );
}
