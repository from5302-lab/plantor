"use client";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

/**
 * 계정별 마지막 접속 시각 (어드민 전용).
 *
 * Auth 의 metadata 는 Firestore 에 없어서 콜러블로 한 번에 받아 온다.
 * 회원 목록을 여는 동안 바뀔 값이 아니므로 구독하지 않고 1회 조회한다.
 *
 * 서버가 lastRefreshTime 을 우선으로 준다 — '로그인 버튼을 누른 시각'이 아니라
 * 마지막으로 앱을 쓴 때에 가깝다(자세한 건 functions/src/admin-api.ts).
 */
export type LastSignIns = {
  /** 인증 uid → 마지막 접속 (학부모는 카카오·구글 로그인이라 이메일이 제각각이다) */
  byUid: Map<string, Date>;
  /** plantor 아이디(소문자) → 마지막 접속 */
  byLoginId: Map<string, Date>;
  ready: boolean;
};

const EMPTY: LastSignIns = { byUid: new Map(), byLoginId: new Map(), ready: false };

export function useLastSignIns(enabled: boolean): LastSignIns {
  const [state, setState] = useState<LastSignIns>(EMPTY);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    (async () => {
      try {
        const res = await httpsCallable(functions, "getLastSignIns")({});
        const d = (res.data ?? {}) as { byUid?: Record<string, string>; byLoginId?: Record<string, string> };
        if (!alive) return;
        const toMap = (o?: Record<string, string>) =>
          new Map(Object.entries(o ?? {}).map(([k, v]) => [k, new Date(v)] as const));
        setState({ byUid: toMap(d.byUid), byLoginId: toMap(d.byLoginId), ready: true });
      } catch {
        // 접속 시각은 곁다리 정보다 — 못 받아도 회원 목록은 그대로 뜬다
        if (alive) setState({ byUid: new Map(), byLoginId: new Map(), ready: true });
      }
    })();
    return () => { alive = false; };
  }, [enabled]);

  return state;
}

/** "3일 전" 처럼 짧게. 목록에서 가입일 옆에 붙으므로 길면 줄이 밀린다. */
export function sinceText(d: Date | undefined): string | null {
  if (!d) return null;
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 31) return `${day}일 전`;
  const mon = Math.floor(day / 30);
  return mon < 12 ? `${mon}달 전` : `${Math.floor(mon / 12)}년 전`;
}
