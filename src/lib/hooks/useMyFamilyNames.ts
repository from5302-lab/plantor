"use client";

import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

const EMPTY: Map<string, string> = new Map();

/**
 * 로그인한 사용자와 **같은 가족**인 자녀들의 실명 { childId: name }.
 *
 * 피드에는 가린 이름(임○주)만 저장되므로, 본인·형제·자녀는 여기서 실명을 되살린다.
 * 학부모는 자기 가족 전원, 학생은 본인과 형제를 본다.
 *
 * 가족 구성은 세션 중 바뀌지 않으므로 실시간 구독 대신 1회 조회한다(읽기 비용 절약).
 */
export function useMyFamilyNames(uid: string | null, isAdmin = false): Map<string, string> {
  const [names, setNames] = useState<Map<string, string>>(EMPTY);

  useEffect(() => {
    if (!uid) return;
    let alive = true;

    (async () => {
      try {
        // 운영자는 전 학생을 실명으로 본다(규칙상 children 전체 읽기 허용).
        if (isAdmin) {
          const all = await getDocs(collection(db, "children"));
          if (!alive) return;
          setNames(new Map(all.docs.map((d) => [d.id, String(d.data().name ?? "")])));
          return;
        }

        const userSnap = await getDoc(doc(db, "users", uid));
        const plantorId = String(userSnap.data()?.plantor_id ?? "").toLowerCase();
        // 규칙의 list 는 쿼리 제약으로만 증명된다 → children 조회는 언제나 familyId 로 좁힌다
        const myFamilyId = (userSnap.data()?.familyId as string | undefined) ?? null;

        // 학부모: families.userId 또는 families.parentId 로 가족을 찾는다
        let familyId: string | null = null;
        const byUser = await getDocs(query(collection(db, "families"), where("userId", "==", uid)));
        if (!byUser.empty) familyId = byUser.docs[0].id;
        else if (plantorId) {
          const byParent = await getDocs(query(collection(db, "families"), where("parentId", "==", plantorId)));
          if (!byParent.empty) familyId = byParent.docs[0].id;
        }

        // 학생: users 문서에 비정규화된 familyId 를 쓴다 (형제도 같은 familyId)
        if (!familyId) familyId = myFamilyId;
        if (!familyId || !alive) return;

        const kids = await getDocs(query(collection(db, "children"), where("familyId", "==", familyId)));
        if (!alive) return;
        setNames(new Map(kids.docs.map((d) => [d.id, String(d.data().name ?? "")])));
      } catch {
        /* 가족을 못 찾으면 가린 이름 그대로 — 실패해도 피드는 정상 동작한다 */
      }
    })();

    return () => { alive = false; };
  }, [uid, isAdmin]);

  // 로그아웃 상태는 렌더에서 처리한다(효과 안에서 setState 하면 렌더가 한 번 더 돈다)
  return uid ? names : EMPTY;
}
