"use client";
import { formatWon, formatDateTime } from "@/lib/format";
import type { Referral, MemberFamily } from "@/lib/types";
import { T } from "@/lib/design-tokens";

export function ReferralsTab({ referrals, families }: { referrals: Referral[]; families: MemberFamily[] }) {
  // ── 통계 계산 ─────────────────────────────────────────────
  const totalReferrals = referrals.length;
  const totalRefereeDiscount = referrals.reduce((s, r) => s + (r.referralDiscount ?? 0), 0);

  // 추천인별 집계
  const byReferrer = new Map<string, { name: string; count: number; totalDiscount: number; codes: string[] }>();
  referrals.forEach((r) => {
    const key = r.referrerId;
    if (!byReferrer.has(key)) byReferrer.set(key, { name: r.referrerName, count: 0, totalDiscount: 0, codes: [] });
    const entry = byReferrer.get(key)!;
    entry.count += 1;
    entry.totalDiscount += r.referralDiscount ?? 0;
    if (r.referralCode && !entry.codes.includes(r.referralCode)) entry.codes.push(r.referralCode);
  });

  // 남용 의심: 동일 IP가 아닌, 같은 추천인이 5건 이상 추천 (단순 기준)
  const suspiciousReferrers = Array.from(byReferrer.entries()).filter(([, v]) => v.count >= 5);

  const sortedReferrals = [...referrals].sort((a, b) =>
    (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)
  );

  return (
    <>
      {/* 요약 카드 */}
      <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <StatCard label="총 추천 건수" value={`${totalReferrals}건`} />
        <StatCard label="피추천인 총 할인액" value={formatWon(totalRefereeDiscount)} sub="신규 가입 시 10% 적용" color="#1a7f4b" />
        <StatCard label="추천인 보상 (쿠폰함)" value={`${referrals.length}장`} sub="10% 쿠폰 자동 적립" color="#38a848" />
      </div>

      {/* 남용 경고 */}
      {suspiciousReferrers.length > 0 && (
        <div className="mb-5 rounded-[10px] bg-[#fff5f5] border border-[rgba(200,0,0,0.2)] px-4 py-3">
          <div className="text-xs font-bold text-[#c00000] mb-1.5">⚠️ 추천 남용 의심 (5건 이상)</div>
          {suspiciousReferrers.map(([id, v]) => (
            <div key={id} className="text-xs text-[#c00000]">{v.name} — {v.count}건 · 코드: {v.codes.join(", ")}</div>
          ))}
        </div>
      )}

      {/* 추천인별 집계 */}
      <div className="mb-6">
        <div className="text-xs font-bold text-p-muted tracking-[0.06em] mb-2.5">추천인별 현황</div>
        {byReferrer.size === 0 ? (
          <div className="text-[13px] text-p-muted">추천 내역이 없습니다.</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {Array.from(byReferrer.entries()).sort((a, b) => b[1].count - a[1].count).map(([id, v]) => (
              <div key={id} className="bg-white border border-black/10 rounded-[10px] px-3.5 py-2.5 flex items-center gap-3" style={{ boxShadow: T.shadow }}>
                <div className="flex-1">
                  <span className="text-[13px] font-bold text-black/95">{v.name}</span>
                  <span className="text-[11px] text-p-muted ml-2">코드: {v.codes.join(", ")}</span>
                </div>
                <span className="text-xs text-p-secondary">{v.count}명 추천</span>
                <span className="text-xs font-semibold text-[#1a7f4b]">할인 {formatWon(v.totalDiscount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 전체 추천 내역 */}
      <div className="text-xs font-bold text-p-muted tracking-[0.06em] mb-2.5">전체 추천 내역 · {totalReferrals}건</div>
      {sortedReferrals.length === 0 ? (
        <div className="rounded-xl border-[1.5px] border-dashed border-black/[0.12] bg-white py-12 px-6 text-center text-sm text-p-muted">
          추천 내역이 없습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sortedReferrals.map((r) => {
            const refereeFamilyName = families.find((f) => f.id === r.refereeFamilyId)?.parentName;
            return (
              <div key={r.id} className="bg-white border border-black/10 rounded-xl px-4 py-[13px]" style={{ boxShadow: T.shadow }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {/* 추천인 → 피추천인 */}
                    <div className="text-[13px] font-bold text-black/95 mb-0.5">
                      {r.referrerName}
                      <span className="text-[11px] text-p-muted font-normal mx-1.5">추천</span>
                      {r.refereeName}
                    </div>
                    <div className="text-[11px] text-p-muted mb-1">
                      코드: <span className="font-mono text-p-secondary">{r.referralCode}</span>
                      {refereeFamilyName && <span className="ml-2">· 가족 등록: {refereeFamilyName}</span>}
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      <span className="text-[11px] text-[#1a7f4b]">피추천인 할인 {formatWon(r.referralDiscount)}</span>
                      <span className="text-[11px] text-p-green">추천인 쿠폰함 10% 적립</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[11px] text-p-muted">{r.createdAt ? formatDateTime(r.createdAt) : "-"}</div>
                    <span className="inline-block mt-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-[#f0fff4] text-[#1a7f4b]">
                      완료
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white border border-black/10 rounded-xl px-4 py-3.5" style={{ boxShadow: T.shadow }}>
      <div className="text-[11px] text-p-muted font-medium mb-1">{label}</div>
      <div className="text-[18px] font-extrabold tracking-[-0.3px]" style={{ color: color ?? "rgba(0,0,0,0.95)" }}>{value}</div>
      {sub && <div className="text-[10px] text-p-muted mt-0.5">{sub}</div>}
    </div>
  );
}
