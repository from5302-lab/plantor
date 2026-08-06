"use client";

import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type MyFamily = {
  /** { childId: 실명 } — 피드의 가린 이름을 되살리는 데 쓴다 */
  names: Map<string, string>;
  /** 학생 본인의 childId (학부모·운영자는 null) */
  myChildId: string | null;
  /** 같은 가족 자녀 전체. 학부모의 프로필 카드 목록이 된다 (이름순) */
  childIds: string[];
};

const EMPTY: MyFamily = { names: new Map(), myChildId: null, childIds: [] };

/**
 * 로그인한 사용자와 **같은 가족**인 자녀들.
 *
 * 피드에는 가린 이름(임○주)만 저장되므로, 본인·형제·자녀는 여기서 실명을 되살린다.
 * 학부모는 자기 가족 전원, 학생은 본인과 형제를 본다.
 *
 * childId 해석을 여기서 함께 내보내는 이유: children 조회는 규칙상 반드시 familyId 로
 * 좁혀야 통과한다(firestore.rules:94). 같은 제약을 두 군데서 관리하면 한쪽만 어긋난다
 * — 2026-08-05 에 실제로 그래서 학생 페이지가 통째로 막혔다.
 *
 * 가족 구성은 세션 중 바뀌지 않으므로 실시간 구독 대신 1회 조회한다(읽기 비용 절약).
 */
export function useMyFamilyNames(uid: string | null, isAdmin = false, email?: string | null, asChildId?: string): MyFamily {
  const [family, setFamily] = useState<MyFamily>(EMPTY);

  useEffect(() => {
    if (!uid) return;
    let alive = true;

    (async () => {
      try {
        // 어드민 미리보기 — 그 학생이 보는 것과 같아야 한다.
        // 여기서 운영자 권한(전 학생 실명)을 쓰면 미리보기가 실제 학생 화면과 달라진다.
        if (asChildId) {
          const child = await getDoc(doc(db, "children", asChildId));
          const fid = child.data()?.familyId as string | undefined;
          if (!fid || !alive) return;
          const kids = await getDocs(query(collection(db, "children"), where("familyId", "==", fid)));
          if (!alive) return;
          const docs = kids.docs
            .map((d) => ({ id: d.id, name: String(d.data().name ?? "") }))
            .sort((a, b) => a.name.localeCompare(b.name, "ko"));
          setFamily({
            names: new Map(docs.map((d) => [d.id, d.name])),
            myChildId: asChildId,
            childIds: docs.map((d) => d.id),
          });
          return;
        }

        // 운영자는 전 학생을 실명으로 본다(규칙상 children 전체 읽기 허용).
        // 자기 자녀가 아니므로 카드 대상(myChildId·childIds)은 비운다.
        if (isAdmin) {
          const all = await getDocs(collection(db, "children"));
          if (!alive) return;
          setFamily({
            names: new Map(all.docs.map((d) => [d.id, String(d.data().name ?? "")])),
            myChildId: null,
            childIds: [],
          });
          return;
        }

        const userSnap = await getDoc(doc(db, "users", uid));
        // users 문서에 plantor_id 가 없는 계정이 있어 이메일로 폴백한다(useChildData 와 같은 규칙).
        // 이게 없으면 그런 학생만 프로필 카드가 안 뜬다.
        const plantorId = String(userSnap.data()?.plantor_id ?? "").toLowerCase()
          || (email?.endsWith("@plantor.app") ? email.replace("@plantor.app", "").toLowerCase() : "");
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

        const docs = kids.docs
          .map((d) => ({ id: d.id, name: String(d.data().name ?? ""), loginId: String(d.data().loginId ?? "").toLowerCase() }))
          .sort((a, b) => a.name.localeCompare(b.name, "ko"));

        setFamily({
          names: new Map(docs.map((d) => [d.id, d.name])),
          // 학생 본인은 loginId 가 내 plantor_id 인 문서. 학부모는 일치하는 게 없어 null 이 된다.
          myChildId: plantorId ? (docs.find((d) => d.loginId === plantorId)?.id ?? null) : null,
          childIds: docs.map((d) => d.id),
        });
      } catch {
        /* 가족을 못 찾으면 가린 이름 그대로 — 실패해도 피드는 정상 동작한다 */
      }
    })();

    return () => { alive = false; };
  }, [uid, isAdmin, email, asChildId]);

  // 로그아웃 상태는 렌더에서 처리한다(효과 안에서 setState 하면 렌더가 한 번 더 돈다)
  return uid ? family : EMPTY;
}
