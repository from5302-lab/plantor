"use client";

import { useEffect, useState } from "react";
import {
  collection, query, where, onSnapshot,
  getDoc, doc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Subscription, LearningLog } from "@/lib/types";
import { todayStr } from "@/lib/learn-utils";

type UseChildDataOptions = {
  userId: string;
  userEmail?: string | null;
  isDemo?: boolean;
  /** isDemo=true 일 때 초기값으로 사용할 데이터 */
  demoData?: {
    subscriptions: Subscription[];
    logs: LearningLog[];
    allLogs: LearningLog[];
  };
};

/**
 * 학생 userId로 자녀 정보, 구독, 오늘 로그, 전체 로그, 출석 여부를 실시간으로 가져온다.
 * setLogs / setAllLogs 는 데모 모드의 낙관적 업데이트에 사용된다.
 */
export function useChildData({ userId, userEmail, isDemo = false, demoData }: UseChildDataOptions) {
  const [childId, setChildId] = useState<string | null>(isDemo ? "demo-child" : null);
  const [childName, setChildName] = useState<string>(isDemo ? "민준" : "");
  const [childGrade, setChildGrade] = useState<string>(isDemo ? "초4" : "");
  const [childLoginId, setChildLoginId] = useState<string>(isDemo ? "demo" : "");
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(
    isDemo ? (demoData?.subscriptions ?? []) : []
  );
  const [logs, setLogs] = useState<LearningLog[]>(
    isDemo ? (demoData?.logs ?? []) : []
  );
  const [allLogs, setAllLogs] = useState<LearningLog[]>(
    isDemo ? (demoData?.allLogs ?? []) : []
  );
  const [todayAttended, setTodayAttended] = useState(false);
  const [ready, setReady] = useState(isDemo);

  // 1) userId → plantor_id → child
  useEffect(() => {
    if (isDemo) return;
    let unsubChild: (() => void) | undefined;
    getDoc(doc(db, "users", userId)).then((userSnap) => {
      let plantorId = userSnap.data()?.plantor_id as string | undefined;
      if (!plantorId && userEmail?.endsWith("@plantor.app")) {
        plantorId = userEmail.replace("@plantor.app", "");
      }
      if (!plantorId) { setReady(true); return; }
      const q = query(collection(db, "children"), where("loginId", "==", plantorId));
      unsubChild = onSnapshot(q, (snap) => {
        if (!snap.empty) {
          const d = snap.docs[0];
          setChildId(d.id);
          setChildName(d.data().name ?? "");
          setChildGrade(d.data().grade ?? "");
          setChildLoginId(d.data().loginId ?? "");
        }
        setReady(true);
      });
    });
    return () => unsubChild?.();
  }, [userId, userEmail, isDemo]);

  // 2) 활성 구독
  useEffect(() => {
    if (isDemo || !childId) return;
    return onSnapshot(
      query(collection(db, "subscriptions"), where("childId", "==", childId), where("status", "==", "active")),
      (snap) => setSubscriptions(snap.docs.map((d) => ({
        id: d.id,
        childId: d.data().childId ?? "",
        serviceSlug: d.data().serviceSlug ?? "",
        monthlyPrice: d.data().monthlyPrice ?? 0,
        status: d.data().status ?? "active",
        startDate: null,
        endDate: null,
      })))
    );
  }, [childId, isDemo]);

  // 3) 오늘 로그
  useEffect(() => {
    if (isDemo || !childId) return;
    return onSnapshot(
      query(collection(db, "learningLogs"), where("childId", "==", childId), where("date", "==", todayStr())),
      (snap) => setLogs(snap.docs.map((d) => ({
        id: d.id,
        serviceSlug: d.data().serviceSlug ?? "",
        date: d.data().date ?? "",
        flagged: d.data().flagged ?? false,
        method: d.data().method ?? "self",
        autoStatus: d.data().autoStatus ?? undefined,
      })))
    );
  }, [childId, isDemo]);

  // 4) 전체 로그 (스트릭용)
  useEffect(() => {
    if (isDemo || !childId) return;
    return onSnapshot(
      query(collection(db, "learningLogs"), where("childId", "==", childId)),
      (snap) => setAllLogs(snap.docs.map((d) => ({
        id: d.id,
        serviceSlug: d.data().serviceSlug ?? "",
        date: d.data().date ?? "",
      })))
    );
  }, [childId, isDemo]);

  // 5) 오늘 출석 세션
  useEffect(() => {
    if (isDemo || !childId) return;
    return onSnapshot(
      query(
        collection(db, "attendanceSessions"),
        where("childId", "==", childId),
        where("date", "==", todayStr()),
        where("status", "==", "completed")
      ),
      (snap) => setTodayAttended(!snap.empty)
    );
  }, [childId, isDemo]);

  return { childId, childName, childGrade, childLoginId, subscriptions, logs, setLogs, allLogs, setAllLogs, todayAttended, ready };
}
