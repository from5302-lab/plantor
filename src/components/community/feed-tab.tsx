"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, limit, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { FeedCard, type FeedLog } from "./feed-card";

function SkeletonCard() {
  return (
    <div className="bg-white border-b border-black/[0.07] px-5 py-4">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-black/[0.07] shrink-0" />
        <div className="flex-1">
          <div className="h-[13px] w-[120px] bg-black/[0.07] rounded-md mb-2.5" />
          <div className="h-[13px] w-[160px] bg-black/5 rounded-md mb-3.5" />
          <div className="h-[200px] w-full max-w-[480px] bg-black/5 rounded-[10px]" />
        </div>
      </div>
    </div>
  );
}

export function FeedTab({ myUid, isAdmin = false }: { myUid: string | null; isAdmin?: boolean }) {
  const [logs, setLogs] = useState<FeedLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, "learningLogs"),
      orderBy("confirmedAt", "desc"),
      limit(40),
    );
    const unsub = onSnapshot(q, (snap) => {
      const items: FeedLog[] = snap.docs
        .filter((d) => !!d.data().screenshotUrl)
        .map((d) => {
          const data = d.data();
          const confirmedAt = data.confirmedAt instanceof Timestamp
            ? data.confirmedAt.toDate()
            : new Date();
          return {
            id: d.id,
            childId: data.childId ?? "",
            serviceSlug: data.serviceSlug ?? "",
            screenshotUrl: data.screenshotUrl as string,
            confirmedAt,
            grade: data.grade ?? "",
            displayId: data.displayId ?? "",
            reportCount: data.reportCount ?? 0,
            flagged: data.flagged ?? false,
            durationSeconds: data.durationSeconds ?? null,
          };
        });
      setLogs(items);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const today = new Date();
  const todayCount = logs.filter((l) => {
    const d = l.confirmedAt;
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  }).length;

  void todayCount;

  return (
    <div className="min-h-screen bg-p-bg">
      <div className="max-w-[600px] mx-auto bg-white min-h-[calc(100vh-113px)]">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : logs.length === 0 ? (
          <div className="px-6 py-20 text-center">
            <div className="text-5xl mb-4">📚</div>
            <p className="text-[15px] text-p-muted" style={{ lineHeight: 1.7 }}>
              아직 인증한 친구가 없어요.<br />첫 번째로 올려보세요!
            </p>
          </div>
        ) : (
          logs.map((log) => <FeedCard key={log.id} log={log} myUid={myUid} isAdmin={isAdmin} />)
        )}
      </div>
    </div>
  );
}
