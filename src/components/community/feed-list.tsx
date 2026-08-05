"use client";

import { useEffect, useState } from "react";
import { collection, doc, query, orderBy, limit, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Rarity } from "@/lib/rewards/catalog";
import { FeedEventCard, type FeedEvent, type StudyEntry } from "./feed-event-card";

// 리워드 자랑 피드. 랭킹이 아니라 **시간순 스트림**이다 —
// 상위 몇 명이 화면을 독점하면 나머지가 위축되고, 그건 리워드 설계의 원칙과 정면으로 어긋난다.

const PAGE = 40;

/**
 * 오늘 현황 한 줄 — 학부모가 피드를 열었을 때 가장 먼저 확인하고 싶은 것은
 * "우리 아이 말고 다른 애들도 하고 있나"다. 카드를 스크롤해서 세게 하지 않고 위에서 답한다.
 * 이미 받아온 이벤트로 계산하므로 추가 조회가 없다.
 */
function TodaySummary({ events }: { events: FeedEvent[] }) {
  const today = new Date().toLocaleDateString("sv-SE");
  const [pending, setPending] = useState<number | null>(null);

  // 아직 학습 중인 인원 — 서버가 만든 집계를 읽는다(이름 없음).
  // 클라이언트는 children 전체를 못 읽으므로 직접 셀 수 없고, 그게 맞다.
  useEffect(() => {
    return onSnapshot(doc(db, "feedStats", today), (snap) => {
      const n = Number(snap.data()?.pending ?? 0);
      setPending(Number.isFinite(n) ? n : 0);
    }, () => setPending(null));
  }, [today]);

  const daily = events.filter((e) => e.type === "daily" && e.date === today);
  if (daily.length === 0 && !pending) return null;

  const students = new Set(daily.map((e) => e.name)).size;
  const xp = daily.reduce((sum, e) => sum + (e.xp ?? 0), 0);
  const streak = Math.max(0, ...daily.map((e) => e.streak ?? 0));

  return (
    <div className="mt-3 flex flex-wrap items-baseline gap-x-3.5 gap-y-1 rounded-xl bg-[#f0faf1] px-3.5 py-2.5">
      <span className="text-[12px] text-p-secondary">
        오늘 <b className="text-[15px] font-bold text-[#2a8438] tabular-nums">{students}</b>명이 공부했어요
      </span>
      <span className="text-[12px] text-p-secondary">
        모은 경험치 <b className="text-[15px] font-bold text-[#2a8438] tabular-nums">{xp.toLocaleString()}</b>
      </span>
      {streak >= 2 && (
        <span className="text-[12px] text-p-secondary">
          최고 연속 <b className="text-[15px] font-bold text-[#b45309] tabular-nums">{streak}</b>일
        </span>
      )}
      {!!pending && (
        <span className="text-[12px] text-p-secondary">
          아직 <b className="text-[15px] font-bold text-[#8a6d10] tabular-nums">{pending}</b>명 학습 중
        </span>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white border-b border-black/[0.07] px-4 sm:px-5 py-4">
      <div className="flex gap-3">
        <div className="w-11 h-11 rounded-full bg-black/[0.07] shrink-0" />
        <div className="flex-1">
          <div className="h-[13px] w-[120px] bg-black/[0.07] rounded-md mb-3" />
          <div className="h-[64px] w-full bg-black/5 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function FeedList({ myUid, familyNames }: { myUid: string | null; familyNames: Map<string, string> }) {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 정렬·표시 기준은 '학습을 끝낸 시각'(occurredAt). 스크랩 시각(createdAt)이 아니다.
    // occurredAt이 없는 문서는 이 쿼리에서 빠지므로 전 문서에 백필해 두었다.
    const q = query(collection(db, "feedEvents"), orderBy("occurredAt", "desc"), limit(PAGE));
    return onSnapshot(q, (snap) => {
      setEvents(snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          type: (data.type ?? "daily") as FeedEvent["type"],
          name: String(data.name ?? ""),
          grade: String(data.grade ?? ""),
          equipped: (data.equipped ?? {}) as Record<string, string | null>,
          level: Number(data.level ?? 1),
          title: String(data.title ?? "씨앗"),
          likeCount: Number(data.likeCount ?? 0),
          createdAt: data.occurredAt instanceof Timestamp ? data.occurredAt.toDate()
            : data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
          badgeCode: data.badgeCode,
          badgeName: data.badgeName,
          rarity: data.rarity as Rarity | undefined,
          growth: data.growth === true,
          prevTitle: data.prevTitle,
          itemId: data.itemId,
          itemName: data.itemName,
          exclusive: data.exclusive === true,
          serviceSlug: data.serviceSlug ?? undefined,
          date: data.date ?? undefined,
          childId: String(data.childId ?? ""),
          xp: Number(data.xp ?? 0),
          doneCount: Number(data.doneCount ?? 0),
          streak: Number(data.streak ?? 0),
          services: Array.isArray(data.services) ? (data.services as StudyEntry[]) : [],
        };
      }));
      setLoading(false);
    }, () => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-p-bg">
      <div className="max-w-[600px] mx-auto bg-white min-h-[calc(100vh-113px)]">
        <div className="px-4 sm:px-5 py-4 border-b border-black/[0.07]">
          <TodaySummary events={events} />
        </div>

        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : events.length === 0 ? (
          <div className="px-6 py-20 text-center">
            <div className="text-5xl mb-4">🌱</div>
            <p className="text-[15px] text-p-muted" style={{ lineHeight: 1.7 }}>
              아직 올라온 소식이 없어요.<br />오늘 학습을 마치면 여기에 쌓입니다.
            </p>
          </div>
        ) : (
          events.map((e) => <FeedEventCard key={e.id} event={e} myUid={myUid} familyNames={familyNames} />)
        )}
      </div>
    </div>
  );
}
