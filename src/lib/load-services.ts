import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { SERVICES } from "@/data/site";
import type { Service } from "@/data/site";

/** Firestore serviceOverrides를 병합해 최종 서비스 목록 반환 */
export async function loadServices(): Promise<Service[]> {
  const snap = await getDocs(collection(db, "serviceOverrides"));
  if (snap.empty) return SERVICES;
  const overrides: Record<string, Record<string, unknown>> = {};
  const extras: Service[] = [];
  snap.docs.forEach((d) => {
    const data = d.data() as Service & { _extra?: boolean; _hidden?: boolean };
    if (data._hidden) { overrides[d.id] = { _hidden: true }; return; }
    if (data._extra) extras.push({ ...data, slug: d.id });
    else overrides[d.id] = data as Record<string, unknown>;
  });
  const base = SERVICES
    .filter((s) => !overrides[s.slug]?._hidden)
    .map((s) => overrides[s.slug] ? { ...s, ...(overrides[s.slug] as Partial<Service>) } : s);
  const all = [...base, ...extras];
  // pricePerMonth가 없으면 priceLabel에서 숫자 추출해서 보정
  return all.map((s) => {
    if ((s.pricePerMonth === null || s.pricePerMonth === undefined) && s.priceLabel) {
      const num = Number(s.priceLabel.replace(/[^0-9]/g, ""));
      if (num > 0) return { ...s, pricePerMonth: num };
    }
    return s;
  });
}

/** 회원가입/신청용 서비스 필터: 구독/프리미엄 + 가격 있음 + 등록중 */
export function filterSignupServices(services: Service[]): Service[] {
  return services.filter(
    (s) =>
      (s.category === "subscription" || s.category === "premium") &&
      (s.pricePerMonth !== null || (s.priceLabel && /\d/.test(s.priceLabel))) &&
      s.status !== "coming_soon" &&
      !s.slug.startsWith("coming-soon")
  );
}
