"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { tsToDate } from "@/lib/format";
import { SERVICES } from "@/data/site";

const AI_PACKAGE_PRICE = 10000;

const SERVICE_NAME: Record<string, string> = Object.fromEntries(
  SERVICES.map((s) => [s.slug, s.name])
);
const SERVICE_AGENCY: Record<string, number> = Object.fromEntries(
  SERVICES.map((s) => [s.slug, s.agencyFee ?? 0])
);

// 클래스카드(Max) 구간별 요금: 학생 수 5명 단위 올림(최소 10명), 10명 42,000 / +5명당 +14,000
function classcardMaxFee(count: number): number {
  if (count <= 0) return 0;
  const bracket = Math.max(10, Math.ceil(count / 5) * 5);
  return 2800 * bracket + 14000;
}

// 클래스5(Max=Movie+Reading+Writing) 요금: 5~10명 소규모 구간, 10명 초과 6,000원/명
function class5MaxFee(count: number): number {
  if (count <= 0) return 0;
  if (count <= 5) return 47100;
  const tier: Record<number, number> = { 6: 49600, 7: 52100, 8: 54600, 9: 57100, 10: 60000 };
  if (count <= 10) return tier[count];
  return count * 6000;
}

export type BillingItem = {
  key: string;
  label: string;
  sub: string;
  amount: number; // 실입금액 (할인 반영)
  due: string; // YYYY-MM-DD
  kind: "구독" | "1:1" | "AI";
  count: number;
};

type Sub = { id: string; familyId: string; childId: string; serviceSlug: string; customName?: string; monthlyPrice: number; discount: number; agencyFee: number; end: string | null };
type Family = { id: string; parentName: string; aiPackageEndDate: string | null; isTest: boolean };
type DirectClass = { id: string; tuition: number; agencyFee: number; expiry: string | null; studentNames: string; studentSlugs: string[][] };

function toYMD(d: Date | null): string | null {
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 어드민 청구 데이터(구독/1:1/AI)를 가정 단위로 묶어 반환.
 * - items: 만료일이 month인 항목 (가정 그룹 + 1:1)
 * - revenueTotal: 실입금 합계 (예상 수입)
 * - agencyFeeTotal: 가맹비 합계 (만료분 기준)
 */
export function useAdminBilling(month: string) {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [children, setChildren] = useState<Record<string, string>>({});
  const [classes, setClasses] = useState<DirectClass[]>([]);
  // 벤더별 수동 인원 (Class5·클래스카드) — 설정에서 입력, 있으면 자동집계 대신 사용
  const [manualCounts, setManualCounts] = useState<Record<string, number>>({});
  // 승인된 연장신청 (가정·자녀·서비스) — 입금확인 완료 건을 '받을(미입금)'에서 제외하기 위함
  const [approvedRenewals, setApprovedRenewals] = useState<{ familyId: string; childId: string | null; serviceSlug: string; created: string }[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "vault", "agencyConfig"), (snap) => {
      setManualCounts(snap.exists() ? ((snap.data().counts as Record<string, number>) ?? {}) : {});
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "subscriptions"), where("status", "==", "active")), (snap) => {
      setSubs(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            familyId: data.familyId ?? "",
            childId: data.childId ?? "",
            serviceSlug: data.serviceSlug ?? "",
            customName: data.customName ?? undefined,
            monthlyPrice: data.monthlyPrice ?? 0,
            discount: data.discount ?? 0,
            agencyFee: data.agencyFee ?? 0,
            end: toYMD(tsToDate(data.endDate)),
          };
        })
      );
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "families"), (snap) => {
      setFamilies(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            parentName: data.parentName ?? "",
            aiPackageEndDate: data.aiPackageEndDate ?? null,
            isTest: !!data.isTest,
          };
        })
      );
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "children"), (snap) => {
      const map: Record<string, string> = {};
      snap.docs.forEach((d) => { map[d.id] = d.data().name ?? ""; });
      setChildren(map);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "renewalRequests"), where("status", "==", "approved")),
      (snap) => {
        setApprovedRenewals(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              familyId: data.familyId ?? "",
              childId: (data.childId ?? null) as string | null,
              serviceSlug: data.serviceSlug ?? "",
              created: toYMD(tsToDate(data.createdAt)) ?? "",
            };
          })
        );
      }
    );
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "directClasses"), (snap) => {
      setClasses(
        snap.docs.map((d) => {
          const data = d.data();
          const classSlugs = (data.serviceSlugs as string[]) ?? [];
          const students = (data.students as Array<{ name?: string; serviceSlugs?: string[] }>) ?? [];
          return {
            id: d.id,
            tuition: data.tuition ?? 0,
            agencyFee: data.agencyFee ?? 0,
            expiry: data.expiry ?? null,
            studentNames: students.map((s) => s.name ?? "").filter(Boolean).join(", ") || (data.name ?? ""),
            // 학생별 수강 서비스 (없으면 수업 단위 serviceSlugs, 학생 없으면 수업 1건)
            studentSlugs: students.length > 0
              ? students.map((s) => s.serviceSlugs ?? classSlugs)
              : [classSlugs],
          };
        })
      );
    });
    return unsub;
  }, []);

  return useMemo(() => {
    const famParent: Record<string, string> = {};
    families.forEach((f) => { famParent[f.id] = f.parentName; });

    type Group = { amount: number; due: string; names: Set<string>; parts: string[]; hasSub: boolean };
    const groups = new Map<string, Group>();
    const ensure = (fid: string): Group => {
      let g = groups.get(fid);
      if (!g) { g = { amount: 0, due: "", names: new Set(), parts: [], hasSub: false }; groups.set(fid, g); }
      return g;
    };

    // 이번 달 연장 승인(입금확인 완료)된 (가정|자녀|서비스) 키 — '받을(미입금)'에서 제외
    const normChild = (c: string | null) => (c && c.length > 0 ? c : "parent");
    const renewedKeys = new Set(
      approvedRenewals
        .filter((r) => r.created.startsWith(month))
        .map((r) => `${r.familyId}|${normChild(r.childId)}|${r.serviceSlug}`)
    );
    const isRenewed = (fid: string, childId: string, slug: string) =>
      renewedKeys.has(`${fid}|${normChild(childId || null)}|${slug}`);

    let revenueTotal = 0;

    // 이번 달(안정): 만료일이 이번 달 1일 이후인 활성 구독·수업·AI
    const monthStart = `${month}-01`;
    let monthlyTotal = 0;
    // 서비스별 수강 인원 (구독 + 1:1수업 학생 모두 포함)
    const headcount = new Map<string, number>();
    const addSlug = (slug: string) => headcount.set(slug, (headcount.get(slug) || 0) + 1);

    subs.forEach((s) => {
      if (s.end && s.end >= monthStart) {
        monthlyTotal += Math.max(0, s.monthlyPrice - s.discount);
        if (s.serviceSlug) addSlug(s.serviceSlug);
      }
    });
    classes.forEach((c) => {
      if (c.expiry && c.expiry >= monthStart) {
        monthlyTotal += c.tuition;
        c.studentSlugs.forEach((slugs) => slugs.forEach((slug) => slug && addSlug(slug)));
      }
    });
    families.forEach((f) => {
      if (!f.isTest && f.aiPackageEndDate && f.aiPackageEndDate >= monthStart) monthlyTotal += AI_PACKAGE_PRICE;
    });

    // 서비스별 가맹비:
    //  - 클래스카드/클래스5: 구간별 Max 요금 (수동 입력 인원 우선, 없으면 자동집계)
    //  - 그 외: 인원 × 서비스 정가 (매일국어 22,000 등)
    const slugs = new Set<string>([...headcount.keys(), ...Object.keys(manualCounts)]);
    const countOf = (slug: string) =>
      manualCounts[slug] != null ? manualCounts[slug] : (headcount.get(slug) || 0);
    const agencyByService = [...slugs]
      .map((slug) => {
        const count = countOf(slug);
        let amount: number;
        if (slug === "classcard-middle") amount = classcardMaxFee(count);
        else if (slug === "class5") amount = class5MaxFee(count);
        else amount = count * (SERVICE_AGENCY[slug] || 0);
        return { key: slug, name: SERVICE_NAME[slug] || slug, amount, count };
      })
      .filter((a) => a.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    const agencyFeeTotal = agencyByService.reduce((s, a) => s + a.amount, 0);

    // 구독
    subs.forEach((s) => {
      if (!s.familyId || !s.end || !s.end.startsWith(month)) return;
      const amount = Math.max(0, s.monthlyPrice - s.discount);
      if (amount <= 0) return;
      revenueTotal += amount;
      // 이미 이번 달 연장 승인(입금확인)된 건은 '받을(미입금)' 목록에서 제외 (endDate 동기화 실패 방어)
      if (isRenewed(s.familyId, s.childId, s.serviceSlug)) return;
      const g = ensure(s.familyId);
      g.amount += amount;
      g.hasSub = true;
      const childName = children[s.childId] || "";
      const svcName = SERVICE_NAME[s.serviceSlug] || s.customName || s.serviceSlug;
      if (childName) g.names.add(childName);
      g.parts.push([childName, svcName].filter(Boolean).join(" "));
      if (!g.due || s.end < g.due) g.due = s.end;
    });

    // AI 패키지 — 같은 가정이면 구독과 합산
    families.forEach((f) => {
      if (f.isTest || !f.aiPackageEndDate || !f.aiPackageEndDate.startsWith(month)) return;
      revenueTotal += AI_PACKAGE_PRICE;
      const g = ensure(f.id);
      g.amount += AI_PACKAGE_PRICE;
      g.parts.push("AI패키지");
      if (!g.due || f.aiPackageEndDate < g.due) g.due = f.aiPackageEndDate;
    });

    const items: BillingItem[] = [];
    groups.forEach((g, fid) => {
      if (g.amount <= 0) return;
      const names = [...g.names].join(", ");
      items.push({
        key: `fam_${fid}`,
        label: famParent[fid] || names || "가정",
        sub: g.parts.join(", "),
        amount: g.amount,
        due: g.due,
        kind: g.hasSub ? "구독" : "AI",
        count: g.parts.length,
      });
    });

    // 1:1 수업
    classes.forEach((c) => {
      if (!c.expiry || !c.expiry.startsWith(month)) return;
      if (c.tuition <= 0) return;
      revenueTotal += c.tuition;
      items.push({
        key: `direct_${c.id}`,
        label: c.studentNames || "1:1수업",
        sub: "1:1수업",
        amount: c.tuition,
        due: c.expiry,
        kind: "1:1",
        count: 1,
      });
    });

    items.sort((a, b) => a.due.localeCompare(b.due));
    return { items, revenueTotal, agencyFeeTotal, monthlyTotal, agencyByService };
  }, [subs, classes, families, children, month, manualCounts, approvedRenewals]);
}
