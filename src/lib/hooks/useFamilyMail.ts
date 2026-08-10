"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";

/**
 * 가족 편지함 — 부모와 자녀가 가족 안에서만 주고받는다.
 *
 * 규칙(firestore.rules)은 문서의 parentUid·childUid 를 내 uid 와 직접 비교한다.
 * 그래서 조회도 **반드시 그 두 필드 중 하나로 좁혀야** 통과한다.
 * 쓰기는 전부 콜러블이다 — 선물이 포인트라 클라이언트가 만들면 안 된다.
 */
export type FamilyMail = {
  id: string;
  childId: string;
  dir: "toChild" | "toParent";
  fromName: string;
  text: string;
  /** 부모가 얹은 매칭 선물. 열어야 지급된다 */
  gift: { points: number; weekXp: number; mult: number; weekKey: string } | null;
  giftClaimed: boolean;
  read: boolean;
  createdAt: Date | null;
};

const NO_MAIL: FamilyMail[] = [];

export function useFamilyMail(uid: string | null, role: "parent" | "child") {
  // 값에 어느 구독의 것인지를 함께 담는다 — 효과 안에서 동기적으로 비우면
  // (react-hooks/set-state-in-effect) 에 걸리고, 안 비우면 계정을 바꾼 순간
  // 남의 편지가 잠깐 보인다. useXpLedger 와 같은 패턴이다.
  const key = `${uid ?? ""}_${role}`;
  const [state, setState] = useState<{ key: string; items: FamilyMail[] }>({ key: "", items: NO_MAIL });

  useEffect(() => {
    if (!uid) return;
    const k = `${uid}_${role}`;
    const q = query(
      collection(db, "familyMail"),
      where(role === "parent" ? "parentUid" : "childUid", "==", uid),
      orderBy("createdAt", "desc"),
      limit(30),
    );
    return onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => {
        const v = d.data();
        const g = v.gift as { points?: number; weekXp?: number; mult?: number; weekKey?: string } | null;
        return {
          id: d.id,
          childId: String(v.childId ?? ""),
          dir: v.dir === "toParent" ? "toParent" : "toChild",
          fromName: String(v.fromName ?? ""),
          text: String(v.text ?? ""),
          gift: g?.points
            ? { points: Number(g.points), weekXp: Number(g.weekXp ?? 0), mult: Number(g.mult ?? 0), weekKey: String(g.weekKey ?? "") }
            : null,
          giftClaimed: v.giftClaimed === true,
          read: !!v.readAt,
          createdAt: v.createdAt?.toDate?.() ?? null,
        } as FamilyMail;
      });
      // 편지가 하나도 없는 계정도 있다 — 그때도 ready 다(빈 편지함을 보여줘야 한다)
      setState({ key: k, items });
    }, () => setState({ key: k, items: NO_MAIL }));
  }, [uid, role]);

  const ready = state.key === key;
  const items = ready ? state.items : NO_MAIL;

  /** 내가 받은 편지 중 안 읽은 것 — 부모는 자녀 답장, 학생은 부모 편지 */
  const unread = useMemo(() => {
    const incoming = role === "parent" ? "toParent" : "toChild";
    return items.filter((m) => m.dir === incoming && !m.read);
  }, [items, role]);

  return { items, unread, ready };
}

export function useSendFamilyMail() {
  return useCallback(async (args: { childId?: string; text: string; mult?: number }) => {
    await httpsCallable(functions, "sendFamilyMail")(args);
  }, []);
}

/** 편지 열기 — 선물이 들어 있으면 이때 포인트가 들어온다. 지급된 값을 돌려준다. */
export function useOpenFamilyMail() {
  return useCallback(async (mailId: string) => {
    const res = await httpsCallable(functions, "openFamilyMail")({ mailId });
    return (res.data ?? { claimed: false, points: 0 }) as { claimed: boolean; points: number };
  }, []);
}

/** 그 주 월요일 날짜 — 서버의 매칭 주 1회 판정과 같은 키를 클라이언트에서도 만든다 */
export function weekMondayStr(d = new Date()): string {
  const dow = (d.getDay() + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - dow);
  return monday.toLocaleDateString("sv-SE");
}
