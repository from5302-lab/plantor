"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, doc, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { FeedEventCard, toFeedEvent, type FeedEvent } from "@/components/community/feed-event-card";

// 소개 페이지에서 유일하게 '말'이 아닌 섹션.
// 리워드가 돈다는 걸 설명으로 납득시키려 하지 않고, 지금 돌아가는 피드를 그대로 보여준다.
// 카드는 피드와 같은 컴포넌트를 쓴다 — 소개에서 본 화면이 들어가서 다르면 그게 더 나쁘다.
const PEEK = 3;

const EMPTY_NAMES: Map<string, string> = new Map();

export function FeedPeek() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [pending, setPending] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "feedEvents"), orderBy("occurredAt", "desc"), limit(PEEK));
    return onSnapshot(q, (snap) => {
      setEvents(snap.docs.map((d) => toFeedEvent(d.id, d.data())));
      setReady(true);
    }, () => setReady(true));
  }, []);

  useEffect(() => {
    const today = new Date().toLocaleDateString("sv-SE");
    return onSnapshot(doc(db, "feedStats", today), (snap) => {
      const n = Number(snap.data()?.pending ?? 0);
      setPending(Number.isFinite(n) ? n : 0);
    }, () => setPending(0));
  }, []);

  const today = new Date().toLocaleDateString("sv-SE");
  const daily = events.filter((e) => e.type === "daily" && e.date === today);
  const todayXp = daily.reduce((sum, e) => sum + (e.xp ?? 0), 0);

  // 아직 아무것도 안 올라왔으면 섹션을 통째로 접는다. 빈 상자를 보여주는 건 역효과다.
  if (ready && events.length === 0) return null;

  return (
    <section className="bg-p-bg px-5 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-[640px]">
        <div className="text-center">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-p-muted">Live</p>
          <h2
            className="text-[24px] font-bold text-black/95 sm:text-[32px]"
            style={{ letterSpacing: "-0.03em" }}
          >
            지금 이 순간에도 쌓이고 있어요
          </h2>
          <p className="mt-3 text-[14px] leading-[1.6] text-p-secondary sm:text-[15px]">
            아래는 설명용 예시가 아니라 <b className="font-semibold text-black/75">실제 피드</b>입니다.
            {pending > 0 && <> 지금 <b className="font-semibold text-[#8a6d10] tabular-nums">{pending}</b>명이 학습 중이에요.</>}
          </p>
        </div>

        <div className="mt-7 overflow-hidden rounded-2xl border border-black/[0.08] bg-white">
          {!ready ? (
            <div className="px-5 py-14 text-center text-[14px] text-p-muted">피드를 불러오는 중…</div>
          ) : (
            <>
              {todayXp > 0 && (
                <div className="border-b border-black/[0.07] bg-[#f0faf1] px-4 py-2.5 text-[12px] text-p-secondary sm:px-5">
                  오늘 모인 경험치{" "}
                  <b className="text-[15px] font-bold text-[#2a8438] tabular-nums">{todayXp.toLocaleString()}</b>
                </div>
              )}
              {events.map((e) => (
                <FeedEventCard key={e.id} event={e} myUid={null} familyNames={EMPTY_NAMES} />
              ))}
            </>
          )}
        </div>

        <div className="mt-5 text-center">
          <Link href="/" className="text-[14px] font-semibold text-p-green no-underline">
            전체 피드 보기 →
          </Link>
        </div>
      </div>
    </section>
  );
}
