"use client";

import { useEffect, useState } from "react";
import {
  collection, query, where, onSnapshot,
  getDoc, doc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Subscription, LearningLog } from "@/lib/types";
import { todayStr } from "@/lib/learn-utils";
import { SERVICES } from "@/data/site";

const KNOWN_SLUGS = new Set(SERVICES.map((s) => s.slug));

type UseChildDataOptions = {
  userId: string;
  userEmail?: string | null;
  isDemo?: boolean;
  /** 어드민 미리보기: childId 직접 지정 → loginId 해석 생략 */
  previewChildId?: string;
  /** 어드민 미리보기: loginId로 자녀 조회 (직강 학생 등 childId를 모를 때) */
  previewLoginId?: string;
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
export function useChildData({ userId, userEmail, isDemo = false, previewChildId, previewLoginId, demoData }: UseChildDataOptions) {
  const [childId, setChildId] = useState<string | null>(isDemo ? "demo-child" : null);
  const [childName, setChildName] = useState<string>(isDemo ? "민준" : "");
  const [childGrade, setChildGrade] = useState<string>(isDemo ? "초4" : "");
  const [childLoginId, setChildLoginId] = useState<string>(isDemo ? "demo" : "");
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(
    isDemo ? (demoData?.subscriptions ?? []) : []
  );
  // 직강(1:1) 학생 수강과목: subscriptions 컬렉션이 아니라 directClasses에 저장됨
  const [directSlugs, setDirectSlugs] = useState<string[]>([]);
  const [logs, setLogs] = useState<LearningLog[]>(
    isDemo ? (demoData?.logs ?? []) : []
  );
  const [allLogs, setAllLogs] = useState<LearningLog[]>(
    isDemo ? (demoData?.allLogs ?? []) : []
  );
  const [todayAttended, setTodayAttended] = useState(false);
  const [ready, setReady] = useState(isDemo);

  // 1) userId → plantor_id → child  (미리보기는 childId 직접 사용)
  useEffect(() => {
    if (isDemo) return;
    if (previewChildId) {
      getDoc(doc(db, "children", previewChildId)).then((snap) => {
        if (snap.exists()) {
          setChildId(snap.id);
          setChildName(snap.data().name ?? "");
          setChildGrade(snap.data().grade ?? "");
          setChildLoginId(snap.data().loginId ?? "");
        }
        setReady(true);
      });
      return;
    }
    if (previewLoginId) {
      const q = query(collection(db, "children"), where("loginId", "==", previewLoginId.toLowerCase()));
      const unsub = onSnapshot(q, (snap) => {
        if (!snap.empty) {
          const d = snap.docs[0];
          setChildId(d.id);
          setChildName(d.data().name ?? "");
          setChildGrade(d.data().grade ?? "");
          setChildLoginId(d.data().loginId ?? "");
        }
        setReady(true);
      });
      return () => unsub();
    }
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
  }, [userId, userEmail, isDemo, previewChildId, previewLoginId]);

  // 2) 활성 구독 (active + transferred 중 endDate가 유효한 것)
  useEffect(() => {
    if (isDemo || !childId) return;
    return onSnapshot(
      query(collection(db, "subscriptions"), where("childId", "==", childId)),
      (snap) => {
        const now = new Date();
        setSubscriptions(snap.docs
          .filter((d) => {
            const status = d.data().status;
            if (status === "active" || status === "transferred") {
              const endTs = d.data().endDate;
              if (!endTs) return status === "active";
              const endDate = endTs.toDate ? endTs.toDate() : new Date(endTs);
              return endDate >= now;
            }
            return false;
          })
          .map((d) => ({
            id: d.id,
            childId: d.data().childId ?? "",
            serviceSlug: d.data().serviceSlug ?? "",
            monthlyPrice: d.data().monthlyPrice ?? 0,
            status: d.data().status ?? "active",
            startDate: null,
            endDate: null,
          })));
      }
    );
  }, [childId, isDemo]);

  // 2-b) 직강(1:1) 수강과목 — loginId로 활성 directClass의 학생을 찾아 serviceSlugs 수집
  useEffect(() => {
    if (isDemo) return;
    const login = childLoginId.toLowerCase();
    if (!login) { setDirectSlugs([]); return; }
    return onSnapshot(
      query(collection(db, "directClasses"), where("status", "==", "active")),
      (snap) => {
        const today = todayStr();
        const slugs = new Set<string>();
        snap.docs.forEach((d) => {
          const cls = d.data();
          if (cls.expiry && cls.expiry < today) return; // 만료된 수업 제외
          const me = (cls.students ?? []).find(
            (s: { studentLoginId?: string }) => (s.studentLoginId ?? "").toLowerCase() === login
          );
          if (!me) return;
          const list: string[] = me.serviceSlugs ?? cls.serviceSlugs ?? [];
          list.forEach((slug) => { if (KNOWN_SLUGS.has(slug)) slugs.add(slug); });
        });
        setDirectSlugs([...slugs]);
      }
    );
  }, [childLoginId, isDemo]);

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

  // 실제 구독 + 직강 수강과목(합성 구독)을 병합해 반환
  const subSlugs = new Set(subscriptions.map((s) => s.serviceSlug));
  const mergedSubscriptions: Subscription[] = [
    ...subscriptions,
    ...directSlugs
      .filter((slug) => !subSlugs.has(slug))
      .map((slug) => ({
        id: `direct-${slug}`,
        childId: childId ?? "",
        serviceSlug: slug,
        monthlyPrice: 0,
        status: "active",
        startDate: null,
        endDate: null,
      })),
  ];

  return { childId, childName, childGrade, childLoginId, subscriptions: mergedSubscriptions, logs, setLogs, allLogs, setAllLogs, todayAttended, ready };
}
