"use client";

import { useRef, useEffect } from "react";
import { addDoc, collection, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { todayStr } from "@/lib/learn-utils";

export function useWindowTracking({
  active,
  childId,
  isDemo,
  sessionIdRef,
}: {
  active: boolean;
  childId: string | null;
  isDemo: boolean;
  sessionIdRef: React.MutableRefObject<string | null>;
}) {
  const windowsRef = useRef<Map<string, { win: Window; openedAt: Date }>>(new Map());
  const timeBySlugRef = useRef<Map<string, number>>(new Map());

  function accumulate(slug: string, durationSeconds: number) {
    timeBySlugRef.current.set(slug, (timeBySlugRef.current.get(slug) ?? 0) + durationSeconds);
  }

  // 창 체류 시간 폴링 — active(sharing) 상태일 때만 동작
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      for (const [slug, { win, openedAt }] of windowsRef.current.entries()) {
        if (win.closed) {
          windowsRef.current.delete(slug);
          const durationSeconds = Math.floor((Date.now() - openedAt.getTime()) / 1000);
          accumulate(slug, durationSeconds);
          if (!isDemo && childId) {
            addDoc(collection(db, "learningTimeLogs"), {
              childId,
              serviceSlug: slug,
              date: todayStr(),
              openedAt: Timestamp.fromDate(openedAt),
              closedAt: serverTimestamp(),
              durationSeconds,
              sessionId: sessionIdRef.current ?? null,
            }).catch(() => {});
          }
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [active, childId, isDemo, sessionIdRef]);

  function handleWindowOpened(slug: string, win: Window) {
    windowsRef.current.set(slug, { win, openedAt: new Date() });
  }

  // 인증샷 제출 시점을 종료로 처리 — 탭이 열려있으면 지금까지 시간 누적하고 추적 종료
  function recordSlugTime(slug: string) {
    const entry = windowsRef.current.get(slug);
    if (!entry) return;
    const durationSeconds = Math.floor((Date.now() - entry.openedAt.getTime()) / 1000);
    accumulate(slug, durationSeconds);
    windowsRef.current.delete(slug);
    if (!isDemo && childId) {
      addDoc(collection(db, "learningTimeLogs"), {
        childId,
        serviceSlug: slug,
        date: todayStr(),
        openedAt: Timestamp.fromDate(entry.openedAt),
        closedAt: serverTimestamp(),
        durationSeconds,
        sessionId: sessionIdRef.current ?? null,
      }).catch(() => {});
    }
  }

  // 세션 종료 시 스냅샷 — 아직 열린 탭은 현재까지 경과 시간 포함
  function getTimeSummary(): Record<string, number> {
    const result: Record<string, number> = Object.fromEntries(timeBySlugRef.current);
    for (const [slug, { openedAt }] of windowsRef.current.entries()) {
      const elapsed = Math.floor((Date.now() - openedAt.getTime()) / 1000);
      result[slug] = (result[slug] ?? 0) + elapsed;
    }
    return result;
  }

  return { windowsRef, handleWindowOpened, recordSlugTime, getTimeSummary };
}
