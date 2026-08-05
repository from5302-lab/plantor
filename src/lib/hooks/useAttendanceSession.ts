"use client";

import { useState, useRef, useCallback } from "react";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { todayStr } from "@/lib/learn-utils";

type AttendanceState = "idle" | "consent" | "sharing" | "done";

export function useAttendanceSession({
  childId,
  isDemo,
  onMobileStart,
}: {
  childId: string | null;
  isDemo: boolean;
  onMobileStart?: () => void;
}) {
  const [attendanceState, setAttendanceState] = useState<AttendanceState>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStart, setSessionStart] = useState<Date | null>(null);
  const [interrupted, setInterrupted] = useState(false);
  const [interruptCount, setInterruptCount] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const startScreenShare = useCallback(async () => {
    // 모바일: 화면 공유 없이 바로 시작
    if (!navigator.mediaDevices?.getDisplayMedia) {
      if (!isDemo && childId) {
        const docRef = await addDoc(collection(db, "attendanceSessions"), {
          childId, date: todayStr(), startTime: serverTimestamp(),
          endTime: null, totalSeconds: 0, interruptCount: 0, status: "active", device: "mobile",
        });
        setSessionId(docRef.id);
        sessionIdRef.current = docRef.id;
      }
      setSessionStart(new Date());
      setInterrupted(false);
      setInterruptCount(0);
      setAttendanceState("sharing");
      onMobileStart?.();
      return;
    }

    // 전체 화면을 고를 때까지 최대 2번 요청한다.
    // 예전엔 자기 자신을 다시 불렀는데(재귀), 그러면 그 시점 렌더의 함수를 붙잡게 되고
    // 화면 선택을 취소했을 때 시도 횟수가 남아 다음 출석에서 한 번 만에 포기하기도 했다.
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const stream = await (navigator.mediaDevices as MediaDevices & {
          getDisplayMedia: (opts: object) => Promise<MediaStream>;
        }).getDisplayMedia({ video: { displaySurface: "monitor" }, audio: false });

        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings() as { displaySurface?: string };

        if (settings.displaySurface && settings.displaySurface !== "monitor") {
          track.stop();
          if (attempt === 2) {
            setAttendanceState("idle");
            alert("전체 화면을 선택해야 출석이 인정돼요. 다시 시도해 주세요.");
            return;
          }
          alert("전체 화면을 선택해 주세요! 탭이나 창을 선택하면 출석이 인정되지 않아요.");
          continue;
        }

        streamRef.current = stream;
        track.addEventListener("ended", () => { setInterrupted(true); streamRef.current = null; });

        if (!isDemo && childId) {
          const docRef = await addDoc(collection(db, "attendanceSessions"), {
            childId, date: todayStr(), startTime: serverTimestamp(),
            endTime: null, totalSeconds: 0, interruptCount: 0, status: "active",
          });
          setSessionId(docRef.id);
          sessionIdRef.current = docRef.id;
        }

        setSessionStart(new Date());
        setInterrupted(false);
        setInterruptCount(0);
        setAttendanceState("sharing");
        return;
      } catch { setAttendanceState("idle"); return; }
    }
  }, [childId, isDemo, onMobileStart]);

  const endSession = useCallback(async (startedSlugs: Set<string>, doneSlugs: Set<string>) => {
    const unconfirmed = [...startedSlugs].filter((slug) => !doneSlugs.has(slug));
    if (unconfirmed.length > 0) {
      if (!confirm(`인증샷이 없는 학습이 ${unconfirmed.length}개 있어요. 정말 마칠까요?`)) return false;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const totalSeconds = sessionStart ? Math.floor((Date.now() - sessionStart.getTime()) / 1000) : 0;

    if (!isDemo && sessionId) {
      await updateDoc(doc(db, "attendanceSessions", sessionId), {
        endTime: serverTimestamp(), totalSeconds, interruptCount, status: "completed",
      });
    }

    setAttendanceState("done");
    setSessionId(null);
    setSessionStart(null);
    return true;
  }, [sessionStart, sessionId, interruptCount, isDemo]);

  function restoreSession(data: {
    attendanceState: string;
    sessionId: string | null;
    sessionStart: string;
    startedSlugs: string[];
  }) {
    if (data.sessionId) { setSessionId(data.sessionId); sessionIdRef.current = data.sessionId; }
    if (data.sessionStart) setSessionStart(new Date(data.sessionStart));
    setAttendanceState(data.attendanceState as AttendanceState);
    if (data.attendanceState === "sharing") setInterrupted(true);
  }

  return {
    attendanceState, setAttendanceState,
    sessionId, sessionStart,
    interrupted, setInterrupted,
    interruptCount, setInterruptCount,
    sessionIdRef,
    startScreenShare, endSession, restoreSession,
  };
}
