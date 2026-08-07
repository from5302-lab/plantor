"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * 그 날짜·서비스의 적립 원장 한 장.
 *
 * 산식은 서버가 계산하고 문장까지 만들어 `xpWhy` 로 넣어 둔다.
 * 클라이언트가 다시 계산하면 두 곳이 어긋날 수 있어 여기서는 **읽어서 그대로 보여주기만** 한다.
 * 원장 쓰기는 규칙에서 서버로 막혀 있고(firestore.rules), 읽기는 가족 범위다.
 */
export type XpLedgerEntry = {
  xp: number;
  /** "점수 95 → +38 · 95점↑ 보너스 +20 · 연속 ×1.1" */
  xpWhy: string | null;
  breakdown: {
    base?: number; quality?: number; volume?: number;
    streakMult?: number; lateFactor?: number; badgePct?: number;
    tier?: number; tierMin?: number;
  } | null;
  qualityRaw: number | null;
};

export function useXpLedger(childId: string | null, serviceSlug: string, date: string): XpLedgerEntry | null {
  // 값에 어느 원장의 것인지를 함께 담는다. 효과 안에서 동기적으로 초기화하면
  // 렌더 도중 setState 가 되어 (react-hooks/set-state-in-effect) 걸리고,
  // 그렇다고 안 지우면 아이·서비스를 바꾼 순간 남의 XP 가 잠깐 보인다.
  const key = `${childId ?? ""}_${date}_${serviceSlug}`;
  const [state, setState] = useState<{ key: string; entry: XpLedgerEntry | null }>({ key: "", entry: null });

  useEffect(() => {
    if (!childId || !serviceSlug || !date) return;
    const k = `${childId}_${date}_${serviceSlug}`;
    return onSnapshot(
      doc(db, "children", childId, "xpLedger", `${date}_${serviceSlug}`),
      (snap) => {
        const v = snap.data();
        setState({
          key: k,
          entry: v
            ? {
              xp: Number(v.xp ?? 0),
              xpWhy: (v.xpWhy ?? null) as string | null,
              breakdown: (v.breakdown ?? null) as XpLedgerEntry["breakdown"],
              qualityRaw: v.qualityRaw == null ? null : Number(v.qualityRaw),
            }
            : null,
        });
      },
      () => setState({ key: k, entry: null }),   // 권한 없음·오프라인 — 부가 정보라 조용히 접는다
    );
  }, [childId, serviceSlug, date]);

  return state.key === key ? state.entry : null;
}
