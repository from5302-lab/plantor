"use client";

import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Child, Subscription, WeeklyLog } from "@/lib/types";
import { tsToDate } from "@/lib/format";
import { getWeekDates } from "@/lib/learn-utils";

/** 완료 판정용 최소 필드 (확정 과제 / 과제 체크) */
export type DayTask = { id: string; childId: string; scheduleDays: number[] };
export type DayCheck = { childId: string; taskId: string; date: string; status: string };

/** familyId로 자녀 목록, 구독, 주간 학습 로그, 확정 과제·체크를 실시간으로 가져온다. */
export function useFamilyData(familyId: string | null, weekOffset = 0) {
  const [children, setChildren] = useState<Child[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
  const [tasks, setTasks] = useState<DayTask[]>([]);
  const [checks, setChecks] = useState<DayCheck[]>([]);

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
    // 그 주간만 조회한다. 전체를 받아 걸러내면 로그가 쌓일수록 읽기가 무한히 늘어난다.
    // 복합 인덱스(learningLogs: childId+date)가 있으므로 범위 쿼리가 안전하다.
    return onSnapshot(
      query(
        collection(db, "learningLogs"),
        where("childId", "in", childIds),
        where("date", ">=", weekDates[0]),
        where("date", "<=", weekDates[6]),
      ),
      (snap) => setWeeklyLogs(snap.docs
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

  // 확정 과제 — 복합 인덱스 회피: childId in 만으로 구독하고 status는 콜백에서 필터
  useEffect(() => {
    if (!familyId || children.length === 0) return;
    const childIds = children.map((c) => c.id);
    return onSnapshot(
      query(collection(db, "tasks"), where("childId", "in", childIds)),
      (snap) => setTasks(snap.docs
        .filter((d) => d.data().status === "confirmed")
        .map((d) => ({
          id: d.id,
          childId: d.data().childId ?? "",
          scheduleDays: d.data().scheduleDays ?? [],
        })))
    );
  }, [familyId, children]);

  // 과제 체크 — 주간 범위는 콜백에서 필터 (learningLogs와 동일 패턴)
  useEffect(() => {
    if (!familyId || children.length === 0) return;
    const childIds = children.map((c) => c.id);
    const weekDates = getWeekDates(weekOffset);
    return onSnapshot(
      query(collection(db, "taskChecks"), where("childId", "in", childIds)),
      (snap) => setChecks(snap.docs
        .filter((d) => {
          const date = d.data().date ?? "";
          return date >= weekDates[0] && date <= weekDates[6];
        })
        .map((d) => ({
          childId: d.data().childId ?? "",
          taskId: d.data().taskId ?? "",
          date: d.data().date ?? "",
          status: d.data().status ?? "",
        })))
    );
  }, [familyId, children, weekOffset]);

  return { children, subscriptions, weeklyLogs, tasks, checks };
}
