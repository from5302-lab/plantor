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
      })))
    );
  }, [familyId]);

  useEffect(() => {
    if (children.length === 0) { setSubscriptions([]); return; }
    const childIds = children.map((c) => c.id);
    return onSnapshot(
      query(collection(db, "subscriptions"), where("childId", "in", childIds)),
      (snap) => setSubscriptions(snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          childId: data.childId ?? "",
          serviceSlug: data.serviceSlug ?? "",
          monthlyPrice: data.monthlyPrice ?? 0,
          status: data.status ?? "active",
          startDate: tsToDate(data.startDate),
          endDate: tsToDate(data.endDate),
          discount: data.discount ?? 0,
        };
      }))
    );
  }, [children]);

  useEffect(() => {
    if (!familyId || children.length === 0) return;
    const childIds = children.map((c) => c.id);
    const weekDates = getWeekDates(weekOffset);
    return onSnapshot(
      query(
        collection(db, "learningLogs"),
        where("childId", "in", childIds),
        where("date", ">=", weekDates[0]),
        where("date", "<=", weekDates[6])
      ),
      (snap) => setWeeklyLogs(snap.docs.map((d) => ({
        childId: d.data().childId ?? "",
        date: d.data().date ?? "",
      })))
    );
  }, [familyId, children, weekOffset]);

  return { children, subscriptions, weeklyLogs };
}
