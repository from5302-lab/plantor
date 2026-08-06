"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

const EMPTY: string[] = [];

/**
 * 지금 학습 중인 서비스 슬러그.
 *
 * 프로필 카드가 "이 학생이 무엇을 하는 사람인지"를 한 줄로 보여주는 데 쓴다.
 * 판정은 useChildData 의 활성 구독 규칙과 같다 — active(만료일 없거나 남았음)
 * 또는 transferred(만료일 남았음). 두 곳이 다르면 카드와 학습 화면이 어긋난다.
 *
 * 1:1 직강(directClasses)은 포함하지 않는다. 그쪽은 loginId 로 조회해야 해서
 * 이 훅의 childId 하나로는 닿지 않는다.
 */
export function useActiveServiceSlugs(childId: string | null): string[] {
  const [slugs, setSlugs] = useState<string[]>(EMPTY);

  useEffect(() => {
    // childId 가 없을 때 여기서 setState 하면 렌더가 한 번 더 돈다 — 렌더에서 처리한다(반환문 참고)
    if (!childId) return;
    return onSnapshot(
      query(collection(db, "subscriptions"), where("childId", "==", childId)),
      (snap) => {
        const now = new Date();
        const next = snap.docs
          .filter((d) => {
            const status = d.data().status;
            if (status !== "active" && status !== "transferred") return false;
            const endTs = d.data().endDate;
            if (!endTs) return status === "active";
            const end = endTs.toDate ? endTs.toDate() : new Date(endTs);
            return end >= now;
          })
          .map((d) => String(d.data().serviceSlug ?? ""))
          .filter(Boolean);
        setSlugs([...new Set(next)]);
      },
      () => setSlugs(EMPTY),
    );
  }, [childId]);

  // childId 가 없으면 이전 학생의 값이 남지 않도록 렌더에서 비운다
  return childId ? slugs : EMPTY;
}
