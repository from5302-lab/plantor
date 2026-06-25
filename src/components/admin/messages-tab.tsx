"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, onSnapshot, query } from "firebase/firestore";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { db, functions } from "@/lib/firebase";
import { T } from "@/lib/design-tokens";
import type { MemberFamily, MemberChild, DirectClass, DirectClassStudent } from "@/lib/types";

type SolapiMessage = {
  messageId: string;
  type?: string;
  to?: string;
  from?: string;
  text?: string;
  statusCode?: string;
  statusMessage?: string;
  dateCreated?: string;
  dateProcessed?: string;
  dateReceived?: string;
  kakaoOptions?: {
    pfId?: string;
    templateId?: string;
  };
};

type FetchMessagesResult = {
  messages: SolapiMessage[];
};

type SolapiBalance = {
  balance?: number;
  point?: number;
};

const TYPE_LABEL: Record<string, string> = {
  ATA: "알림톡",
  CTA: "친구톡",
  SMS: "SMS",
  LMS: "LMS",
  MMS: "MMS",
  BMS: "BMS",
  BMS_FREE: "BMS",
  RCS_SMS: "RCS",
  RCS_LMS: "RCS",
  RCS_MMS: "RCS",
  RCS_TPL: "RCS",
};

const TYPE_COLOR: Record<string, string> = {
  ATA: "#fae100",
  CTA: "#a78bfa",
  SMS: "#38a848",
  LMS: "#3b82f6",
  MMS: "#f97316",
  BMS: "#06b6d4",
  BMS_FREE: "#06b6d4",
  RCS_SMS: "#ec4899",
  RCS_LMS: "#ec4899",
  RCS_MMS: "#ec4899",
  RCS_TPL: "#ec4899",
};

function fmtMoney(n: number | undefined): string {
  if (n === undefined || n === null) return "—";
  return `₩${n.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}`;
}

// Solapi statusCode 첫 글자 기준: "2"(접수) / "4"(발송완료) = 성공.
// "1"(처리중), "3"(부분실패), "5+"(실패) = 실패 또는 진행중.
function isSuccess(code: string | undefined): boolean {
  if (!code) return false;
  const first = code.charAt(0);
  return first === "2" || first === "4";
}

function toKSTDateStr(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

function toKSTDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${kst.toISOString().slice(5, 10)} ${kst.toISOString().slice(11, 16)}`;
}

function maskPhone(p: string | undefined): string {
  if (!p) return "—";
  const clean = p.replace(/\D/g, "");
  if (clean.length < 8) return p;
  return `${clean.slice(0, 3)}-****-${clean.slice(-4)}`;
}

function normalizePhone(p: string | undefined): string {
  return (p ?? "").replace(/\D/g, "");
}

export function MessagesTab({ families, allChildren }: { families: MemberFamily[]; allChildren: MemberChild[] }) {
  const [messages, setMessages] = useState<SolapiMessage[]>([]);
  const [balance, setBalance] = useState<SolapiBalance | null>(null);
  const [directClasses, setDirectClasses] = useState<DirectClass[]>([]);

  // 1:1 수업 학생 이름 매칭용
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "directClasses")), (snap) => {
      setDirectClasses(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name ?? "",
            parentName: data.parentName,
            students: (data.students ?? []) as DirectClassStudent[],
          } as DirectClass;
        })
      );
    });
    return unsub;
  }, []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | "ATA" | "CTA" | "SMS">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "failed">("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [msgRes, balRes] = await Promise.all([
        httpsCallable<{ limit: number }, FetchMessagesResult>(functions, "getSolapiMessages")({ limit: 500 }),
        httpsCallable<Record<string, never>, SolapiBalance>(functions, "getSolapiBalance")({}),
      ]);
      setMessages(msgRes.data.messages ?? []);
      setBalance(balRes.data ?? null);
    } catch (e) {
      setError((e as Error).message ?? "조회 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 일자별 집계 (최근 30일)
  const chartData = useMemo(() => {
    const today = new Date();
    type Bucket = { date: string; ATA: number; CTA: number; SMS: number; LMS: number; MMS: number; BMS: number; RCS: number };
    const buckets: Bucket[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 24 * 3600 * 1000);
      const kst = new Date(d.getTime() + 9 * 3600 * 1000);
      buckets.push({ date: kst.toISOString().slice(5, 10), ATA: 0, CTA: 0, SMS: 0, LMS: 0, MMS: 0, BMS: 0, RCS: 0 });
    }
    const byDate = new Map(buckets.map((b) => [b.date, b]));
    for (const m of messages) {
      const dStr = toKSTDateStr(m.dateCreated);
      if (!dStr) continue;
      const key = dStr.slice(5);
      const bucket = byDate.get(key);
      if (!bucket) continue;
      const t = m.type ?? "SMS";
      if (t === "ATA" || t === "CTA" || t === "SMS" || t === "LMS" || t === "MMS") bucket[t] += 1;
      else if (t === "BMS" || t === "BMS_FREE") bucket.BMS += 1;
      else if (t.startsWith("RCS")) bucket.RCS += 1;
    }
    return buckets;
  }, [messages]);

  // 오늘/실패 카운트
  const { todayCount, failedCount, totalCount } = useMemo(() => {
    const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    let today = 0;
    let failed = 0;
    for (const m of messages) {
      if (toKSTDateStr(m.dateCreated) === todayKst) today++;
      if (!isSuccess(m.statusCode)) failed++;
    }
    return { todayCount: today, failedCount: failed, totalCount: messages.length };
  }, [messages]);

  // phone → { parentName, childNames } 인덱스
  const phoneIndex = useMemo(() => {
    const childrenByFamily = new Map<string, string[]>();
    for (const c of allChildren) {
      if (!c.familyId) continue;
      const arr = childrenByFamily.get(c.familyId) ?? [];
      if (c.name) arr.push(c.name);
      childrenByFamily.set(c.familyId, arr);
    }
    const idx = new Map<string, { parentName: string; childNames: string[] }>();
    // families 기반 (정기 구독 학부모)
    for (const f of families) {
      const key = normalizePhone(f.phone);
      if (!key) continue;
      idx.set(key, {
        parentName: f.parentName ?? "",
        childNames: childrenByFamily.get(f.id) ?? [],
      });
    }
    // directClasses 기반 (1:1 수업 학부모/학생)
    for (const cls of directClasses) {
      for (const s of cls.students ?? []) {
        const key = normalizePhone(s.parentPhone);
        if (!key) continue;
        const existing = idx.get(key) ?? { parentName: cls.parentName ?? "", childNames: [] };
        if (!existing.parentName && cls.parentName) existing.parentName = cls.parentName;
        if (s.name && !existing.childNames.includes(s.name)) existing.childNames.push(s.name);
        idx.set(key, existing);
      }
    }
    return idx;
  }, [families, allChildren, directClasses]);

  // 테이블 필터
  const filteredMessages = useMemo(() => {
    return messages.filter((m) => {
      if (typeFilter !== "all" && m.type !== typeFilter) return false;
      if (statusFilter === "success" && !isSuccess(m.statusCode)) return false;
      if (statusFilter === "failed" && isSuccess(m.statusCode)) return false;
      return true;
    });
  }, [messages, typeFilter, statusFilter]);

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 상단 헤더 + 새로고침 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.textPrimary }}>발송 현황</h2>
        <button
          onClick={load}
          disabled={loading}
          style={{
            padding: "6px 14px", fontSize: 13, borderRadius: 6,
            border: T.border, backgroundColor: T.white,
            color: T.textPrimary, cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "조회 중..." : "새로고침"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "10px 12px", backgroundColor: "#fef2f2", color: "#b91c1c", borderRadius: 6, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* 통계 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <StatCard
          label="잔액"
          value={fmtMoney(balance?.balance)}
          sub={
            balance?.balance !== undefined && balance.balance < 1000
              ? "⚠️ 충전 필요"
              : balance?.balance !== undefined && balance.balance < 5000
              ? "⚠️ 잔액 부족"
              : balance?.point
              ? `포인트 ${fmtMoney(balance.point)}`
              : undefined
          }
          accent={
            balance?.balance !== undefined && balance.balance < 1000
              ? "#c00000"
              : balance?.balance !== undefined && balance.balance < 5000
              ? "#b45309"
              : undefined
          }
        />
        <StatCard label="오늘 발송" value={`${todayCount}건`} />
        <StatCard label="조회 범위" value={`${totalCount}건`} sub="최근 500건" />
        <StatCard label="실패" value={`${failedCount}건`} accent={failedCount > 0 ? "#c00000" : undefined} />
      </div>

      {/* 차트 */}
      <div style={{ padding: 16, backgroundColor: T.white, borderRadius: T.radius.md, border: T.borderSubtle, boxShadow: T.shadow }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary, marginBottom: 12 }}>
          최근 30일 일자별 발송 (유형별)
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: T.textMuted }} />
            <YAxis tick={{ fontSize: 11, fill: T.textMuted }} allowDecimals={false} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="ATA" stackId="a" fill={TYPE_COLOR.ATA} name="알림톡" />
            <Bar dataKey="CTA" stackId="a" fill={TYPE_COLOR.CTA} name="친구톡" />
            <Bar dataKey="SMS" stackId="a" fill={TYPE_COLOR.SMS} name="SMS" />
            <Bar dataKey="LMS" stackId="a" fill={TYPE_COLOR.LMS} name="LMS" />
            <Bar dataKey="MMS" stackId="a" fill={TYPE_COLOR.MMS} name="MMS" />
            <Bar dataKey="BMS" stackId="a" fill={TYPE_COLOR.BMS} name="BMS" />
            <Bar dataKey="RCS" stackId="a" fill={TYPE_COLOR.RCS_SMS} name="RCS" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 필터 */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <FilterGroup
          label="상태"
          value={statusFilter}
          options={[{ key: "all", label: "전체" }, { key: "success", label: "성공" }, { key: "failed", label: "실패" }]}
          onChange={(v) => setStatusFilter(v as typeof statusFilter)}
        />
        <FilterGroup
          label="유형"
          value={typeFilter}
          options={[
            { key: "all", label: "전체" },
            { key: "ATA", label: "알림톡" },
            { key: "CTA", label: "친구톡" },
            { key: "SMS", label: "SMS" },
          ]}
          onChange={(v) => setTypeFilter(v as typeof typeFilter)}
        />
      </div>

      {/* 카드 리스트 (모바일 친화) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filteredMessages.length === 0 && (
          <div style={{
            padding: "32px 12px", textAlign: "center", color: T.textMuted,
            backgroundColor: T.white, borderRadius: T.radius.md, border: T.borderSubtle,
          }}>
            {loading ? "조회 중..." : "내역 없음"}
          </div>
        )}
        {filteredMessages.map((m) => {
          const ok = isSuccess(m.statusCode);
          const typeKey = m.type ?? "SMS";
          const isOpen = expanded.has(m.messageId);
          const bodyText = m.text ?? "—";
          const isLongBody = bodyText.length > 60;
          return (
            <div
              key={m.messageId}
              style={{
                backgroundColor: T.white,
                borderRadius: T.radius.md,
                border: T.borderSubtle,
                boxShadow: T.shadow,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {/* 1줄: 시각 · 유형 배지 · 상태 배지 */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: T.textMuted, fontWeight: 500 }}>
                  {toKSTDateTime(m.dateCreated)}
                </span>
                <span style={{
                  padding: "2px 8px", borderRadius: 4,
                  fontSize: 11, fontWeight: 600,
                  backgroundColor: (TYPE_COLOR[typeKey] ?? "#999") + "22",
                  color: TYPE_COLOR[typeKey] ?? "#555",
                }}>
                  {TYPE_LABEL[typeKey] ?? typeKey}
                </span>
                <span style={{
                  padding: "2px 8px", borderRadius: 4,
                  fontSize: 11, fontWeight: 600,
                  backgroundColor: ok ? "#f0faf1" : "#fff5f5",
                  color: ok ? "#1a7f4b" : "#c00000",
                }}>
                  {ok ? "성공" : `실패 (${m.statusCode ?? "?"})`}
                </span>
                {(() => {
                  const info = phoneIndex.get(normalizePhone(m.to));
                  const namePart = info
                    ? `${info.parentName}${info.childNames.length ? ` · ${info.childNames.join(", ")}` : ""}`
                    : "";
                  return (
                    <span style={{ marginLeft: "auto", fontSize: 12, textAlign: "right" }}>
                      {namePart ? (
                        <span style={{ color: T.textPrimary, fontWeight: 600 }}>{namePart}</span>
                      ) : (
                        <span style={{ color: T.textSecondary, fontWeight: 500 }}>{maskPhone(m.to)}</span>
                      )}
                    </span>
                  );
                })()}
              </div>

              {/* 템플릿 ID (있을 때만) */}
              {m.kakaoOptions?.templateId && (
                <div style={{ fontSize: 11, color: T.textMuted, wordBreak: "break-all" }}>
                  템플릿: {m.kakaoOptions.templateId}
                </div>
              )}

              {/* 본문 (펼침 토글) */}
              <div
                onClick={isLongBody ? () => toggleExpand(m.messageId) : undefined}
                style={{
                  fontSize: 13,
                  color: T.textPrimary,
                  lineHeight: 1.5,
                  cursor: isLongBody ? "pointer" : "default",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  ...(isOpen || !isLongBody
                    ? {}
                    : {
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }),
                }}
              >
                {bodyText}
              </div>

              {isLongBody && (
                <button
                  onClick={() => toggleExpand(m.messageId)}
                  style={{
                    alignSelf: "flex-start",
                    padding: "2px 8px",
                    fontSize: 11,
                    fontWeight: 600,
                    border: "none",
                    borderRadius: 4,
                    backgroundColor: "#f0efed",
                    color: T.textSecondary,
                    cursor: "pointer",
                  }}
                >
                  {isOpen ? "접기 ▲" : "전체 보기 ▼"}
                </button>
              )}

              {/* 실패 사유 */}
              {!ok && m.statusMessage && (
                <div style={{ fontSize: 11, color: "#c00000", fontStyle: "italic" }}>
                  {m.statusMessage}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{
      padding: 14, backgroundColor: T.white, borderRadius: T.radius.md,
      border: T.borderSubtle, boxShadow: T.shadow,
    }}>
      <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent ?? T.textPrimary }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function FilterGroup({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: { key: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 12, color: T.textMuted, fontWeight: 600 }}>{label}</span>
      <div style={{ display: "flex", gap: 4, padding: 3, backgroundColor: "#f0efed", borderRadius: 6 }}>
        {options.map((opt) => (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            style={{
              padding: "4px 10px", fontSize: 12, fontWeight: 600,
              border: "none", borderRadius: 4, cursor: "pointer",
              backgroundColor: value === opt.key ? T.white : "transparent",
              color: value === opt.key ? T.textPrimary : T.textMuted,
              boxShadow: value === opt.key ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
