"use client";

import { useState } from "react";
import { formatAmount } from "@/lib/vault-utils";
import { EntryForm } from "./entry-form";
import type { VaultEntry, VaultCategory } from "./vault-shell";

type Props = {
  entries: VaultEntry[]; // 표시할 거래 (이미 필터·정렬됨)
  categories: VaultCategory[];
};

export function TransactionList({ entries, categories }: Props) {
  const [editEntry, setEditEntry] = useState<VaultEntry | null>(null);
  const [viewReceipt, setViewReceipt] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "32px 0", color: "#a39e98", fontSize: "14px" }}>
        거래 내역이 없습니다
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {entries.map((entry) => (
          <button
            key={entry.id}
            onClick={() => setEditEntry(entry)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "14px 16px",
              background: "#ffffff",
              border: "1px solid rgba(0,0,0,0.1)",
              borderRadius: "12px",
              cursor: "pointer",
              width: "100%",
              textAlign: "left",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "rgba(0,0,0,0.95)" }}>
                  {entry.memo || entry.category || (entry.type === "income" ? "수입" : "지출")}
                </span>
                {entry.receiptUrl && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewReceipt(entry.receiptUrl);
                    }}
                    style={{ fontSize: "14px", cursor: "pointer" }}
                  >
                    🧾
                  </span>
                )}
              </div>
              <div style={{ fontSize: "12px", color: "#a39e98", marginTop: "2px" }}>
                {entry.date.slice(5).replace("-", "/")}
                {entry.category && ` · ${entry.category}`}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
              <div
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  color: entry.type === "income" ? "#38a848" : "#dd5b00",
                  whiteSpace: "nowrap",
                }}
              >
                {entry.type === "income" ? "+" : "-"}₩{formatAmount(entry.amount)}
              </div>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(String(entry.amount));
                  const el = e.currentTarget;
                  el.style.color = "#38a848";
                  setTimeout(() => { el.style.color = "#a39e98"; }, 600);
                }}
                style={{ cursor: "pointer", color: "#a39e98", display: "flex", padding: "2px" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </span>
            </div>
          </button>
        ))}
      </div>

      {editEntry && (
        <EntryForm
          entry={editEntry}
          categories={categories}
          onClose={() => setEditEntry(null)}
        />
      )}

      {viewReceipt && (
        <div
          onClick={() => setViewReceipt(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 110,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={viewReceipt}
            alt="영수증"
            style={{ maxWidth: "100%", maxHeight: "80dvh", borderRadius: "8px" }}
          />
        </div>
      )}
    </>
  );
}
