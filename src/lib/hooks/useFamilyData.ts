"use client";

import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Child, Subscription, WeeklyLog } from "@/lib/types";
import { tsToDate } from "@/lib/format";
import { getWeekDates } from "@/lib/learn-utils";

/** familyId로 자녀 목록, 구독, 주간 학습 로그를 실시간으로 가져온다. */
export function useFamilyData(familyId: string | null, weekOffset = 0) {
  const [children, setChildren] = useState<Child[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);

  useEffect(() => {
    if (!familyId) return;
    return onSnapshot(
      query(collection(db, "children"), where("familyId", "==", familyId)),
      (snap) => setChildren(snap.docs.map((d) => ({
        id: d.id,
        name: d.data().name ?? "",
        grade: d.data().grade ?? "",
        loginId: d.data().loginId ?? "",
        studentPhone: d.data().studentPhone ?? "",
      })))
    );
  }, [familyId]);

  useEffect(() => {
    if (!familyId) { setSubscriptions([]); return; }
    // familyId로 조회 → 자녀 sub + 학부모 sub (childId=null) 모두 포함
    return onSnapshot(
      query(collection(db, "subscriptions"), where("familyId", "==", familyId)),
      (snap) => setSubscriptions(snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          childId: data.childId ?? null,
          serviceSlug: data.serviceSlug ?? "",
          customName: data.customName ?? undefined,
          monthlyPrice: data.monthlyPrice ?? 0,
          status: data.status ?? "active",
          startDate: tsToDate(data.startDate),
          endDate: tsToDate(data.endDate),
          discount: data.discount ?? 0,
        };
      }))
    );
  }, [familyId]);

  useEffect(() => {
    if (!familyId || children.length === 0) return;
    const childIds = children.map((c) => c.id);
    const weekDates = getWeekDates(weekOffset);
    // 복합 인덱스(childId in + date범위) 회피: childId in 만으로 구독하고 주간은 콜백에서 필터.
    // (범위 쿼리는 인덱스 미존재 시 onSnapshot이 조용히 실패해 로그가 통째로 안 뜨는 버그)
    return onSnapshot(
      query(collection(db, "learningLogs"), where("childId", "in", childIds)),
      (snap) => setWeeklyLogs(snap.docs
        .filter((d) => {
          const date = d.data().date ?? "";
          return date >= weekDates[0] && date <= weekDates[6];
        })
        .map((d) => ({
          id: d.id,
          childId: d.data().childId ?? "",
          date: d.data().date ?? "",
          serviceSlug: d.data().serviceSlug ?? "",
          method: d.data().method,
          autoStatus: d.data().autoStatus,
          scrapedData: d.data().scrapedData ?? null,
          flagged: d.data().flagged,
        })))
    );
  }, [familyId, children, weekOffset]);

  return { children, subscriptions, weeklyLogs };
}
