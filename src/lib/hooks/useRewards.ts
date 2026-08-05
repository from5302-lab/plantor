"use client";

import { useCallback, useEffect, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { DEFAULT_ITEMS, levelFromXp, titleOf, xpAtLevelStart, xpToNext } from "@/lib/rewards/catalog";

export type EarnedBadge = { code: string; earnedAt: Date | null; seen: boolean; date?: string };

export type RewardState = {
  ready: boolean;
  xpTotal: number;
  level: number;
  title: { name: string; color: string };
  /** 현재 레벨 안에서의 진행도 0~1 */
  progress: number;
  xpInLevel: number;
  xpNeeded: number;
  points: number;
  streak: number;
  /** 피드·공유 카드에 쓰는 학년 (children.grade) */
  grade: string;
  /** 상점 미리보기에 쓰는 실명 (children.name) */
  name: string;
  /** true면 내 리워드가 /community 피드에 올라가지 않는다 */
  feedOptOut: boolean;
  badges: EarnedBadge[];
  /** 아직 획득 연출을 보여주지 않은 뱃지 */
  unseen: EarnedBadge[];
  owned: Set<string>;
  equipped: Record<string, string | null>;
};

const EMPTY: RewardState = {
  ready: false, xpTotal: 0, level: 1, title: { name: "씨앗", color: "#78716c" },
  progress: 0, xpInLevel: 0, xpNeeded: 500, points: 0, streak: 0, grade: "", name: "",
  feedOptOut: false, badges: [], unseen: [], owned: new Set(DEFAULT_ITEMS), equipped: {},
};

/** 학생 본인의 XP·레벨·포인트·뱃지·인벤토리를 실시간 구독한다. */
export function useRewards(childId: string | null, enabled = true): RewardState {
  const [child, setChild] = useState<{ xpTotal: number; points: number; grade: string; name: string; feedOptOut: boolean; equipped: Record<string, string | null> } | null>(null);
  const [streak, setStreak] = useState(0);
  const [badges, setBadges] = useState<EarnedBadge[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set(DEFAULT_ITEMS));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!childId || !enabled) return;
    return onSnapshot(doc(db, "children", childId), (snap) => {
      const d = snap.data() ?? {};
      setChild({
        xpTotal: Number(d.xpTotal ?? 0),
        points: Number(d.points ?? 0),
        grade: String(d.grade ?? ""),
        name: String(d.name ?? ""),
        feedOptOut: d.feedOptOut === true,
        equipped: (d.equipped ?? {}) as Record<string, string | null>,
      });
      setReady(true);
    });
  }, [childId, enabled]);

  useEffect(() => {
    if (!childId || !enabled) return;
    return onSnapshot(doc(db, "children", childId, "stats", "summary"), (snap) => {
      setStreak(Number(snap.data()?.streak ?? 0));
    });
  }, [childId, enabled]);

  useEffect(() => {
    if (!childId || !enabled) return;
    return onSnapshot(collection(db, "children", childId, "badges"), (snap) => {
      setBadges(snap.docs.map((d) => ({
        code: d.id,
        earnedAt: d.data().earnedAt?.toDate?.() ?? null,
        seen: d.data().seen === true,
        date: d.data().date,
      })).sort((a, b) => (b.earnedAt?.getTime() ?? 0) - (a.earnedAt?.getTime() ?? 0)));
    });
  }, [childId, enabled]);

  useEffect(() => {
    if (!childId || !enabled) return;
    return onSnapshot(collection(db, "children", childId, "inventory"), (snap) => {
      setOwned(new Set([...DEFAULT_ITEMS, ...snap.docs.map((d) => d.id)]));
    });
  }, [childId, enabled]);

  if (!childId || !enabled) return EMPTY;

  const xpTotal = child?.xpTotal ?? 0;
  const level = levelFromXp(xpTotal);
  const xpInLevel = xpTotal - xpAtLevelStart(level);
  const xpNeeded = xpToNext(level);

  return {
    ready,
    xpTotal,
    level,
    title: titleOf(level),
    progress: Math.max(0, Math.min(1, xpInLevel / xpNeeded)),
    xpInLevel,
    xpNeeded,
    points: child?.points ?? 0,
    streak,
    grade: child?.grade ?? "",
    name: child?.name ?? "",
    feedOptOut: child?.feedOptOut ?? false,
    badges,
    unseen: badges.filter((b) => !b.seen),
    owned,
    equipped: child?.equipped ?? {},
  };
}

/** 뱃지 발견 연출을 마친 뒤 호출 — 같은 뱃지가 다시 뜨지 않게 한다. */
export function useMarkBadgesSeen() {
  return useCallback(async (codes: string[]) => {
    if (!codes.length) return;
    try {
      await httpsCallable(functions, "markBadgesSeen")({ codes });
    } catch {
      /* 연출은 이미 봤으므로 실패해도 조용히 넘어간다 */
    }
  }, []);
}
