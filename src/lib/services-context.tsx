"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { SERVICES } from "@/data/site";
import type { Service } from "@/data/site";
import { filterSignupServices } from "@/lib/load-services";

type ServicesContextValue = {
  allServices: Service[];
  signupServices: Service[];
  loading: boolean;
};

const ServicesContext = createContext<ServicesContextValue>({
  allServices: SERVICES,
  signupServices: filterSignupServices(SERVICES),
  loading: true,
});

export function ServicesProvider({ children }: { children: React.ReactNode }) {
  const [allServices, setAllServices] = useState<Service[]>(SERVICES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "serviceOverrides"), (snap) => {
      const overrides: Record<string, Record<string, unknown>> = {};
      const extras: Service[] = [];
      snap.docs.forEach((d) => {
        const data = d.data() as Service & { _extra?: boolean; _hidden?: boolean };
        if (data._hidden) { overrides[d.id] = { _hidden: true }; return; }
        if (data._extra) extras.push({ ...data, slug: d.id });
        else overrides[d.id] = data as Record<string, unknown>;
      });
      const base = SERVICES
        .filter((s) => !(overrides[s.slug] as { _hidden?: boolean } | undefined)?._hidden)
        .map((s) => overrides[s.slug] ? { ...s, ...(overrides[s.slug] as Partial<Service>) } : s);
      const all = [...base, ...extras].map((s) => {
        // priceLabel이 있으면 항상 거기서 pricePerMonth 추출 (단일 소스)
        if (s.priceLabel) {
          const num = Number(s.priceLabel.replace(/[^0-9]/g, ""));
          if (num > 0) return { ...s, pricePerMonth: num };
        }
        return s;
      });
      setAllServices(all);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return (
    <ServicesContext.Provider value={{ allServices, signupServices: filterSignupServices(allServices), loading }}>
      {children}
    </ServicesContext.Provider>
  );
}

export function useServices() {
  return useContext(ServicesContext);
}
