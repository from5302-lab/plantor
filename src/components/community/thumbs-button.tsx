"use client";

import { useEffect, useState } from "react";
import { ThumbsUp } from "lucide-react";
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { notifyPreview } from "@/components/ui/preview-notice";

// 엄지척. 문서 ID가 uid라서 같은 사람이 두 번 누르는 게 규칙 단계에서 불가능하다.
// 개수는 서버(onFeedLike/onFeedUnlike)가 세므로 여기서는 내 한 표만 로컬로 보정한다.

export function ThumbsButton({ eventId, myUid, likeCount, preview = false }: {
  eventId: string;
  myUid: string | null;
  likeCount: number;
  /** 어드민 미리보기 — 학생과 똑같이 보이고 눌리되 서버에는 쓰지 않는다 */
  preview?: boolean;
}) {
  const [liked, setLiked] = useState(false);
  const [pending, setPending] = useState(false);
  // 내가 누른 표는 즉시 반영하고, 서버 집계가 도착하면 그 값으로 되돌린다.
  const [count, setCount] = useState(likeCount);
  const [serverCount, setServerCount] = useState(likeCount);
  if (serverCount !== likeCount) {
    setServerCount(likeCount);
    setCount(likeCount);
  }

  useEffect(() => {
    if (!myUid) return;
    let alive = true;
    getDoc(doc(db, "feedEvents", eventId, "likes", myUid))
      .then((snap) => { if (alive) setLiked(snap.exists()); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [eventId, myUid]);

  async function toggle() {
    if (preview) {
      setLiked((v) => !v);
      setCount((c) => c + (liked ? -1 : 1));
      notifyPreview();
      return;
    }
    if (!myUid || pending) return;
    const ref = doc(db, "feedEvents", eventId, "likes", myUid);
    const next = !liked;
    setPending(true);
    setLiked(next);
    setCount((c) => Math.max(0, c + (next ? 1 : -1)));
    try {
      if (next) await setDoc(ref, { createdAt: serverTimestamp() });
      else await deleteDoc(ref);
    } catch {
      setLiked(!next);
      setCount(serverCount);
    } finally {
      setPending(false);
    }
  }

  // 비회원은 개수만 (버튼 어포던스를 주지 않는다)
  if (!myUid) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-p-muted">
        <ThumbsUp size={14} strokeWidth={2} aria-hidden />
        <span className="font-semibold tabular-nums">{count}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={liked}
      aria-label={liked ? "엄지척 취소" : "엄지척"}
      className="thumbs-btn inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 sm:py-1.5 text-[12px] font-bold cursor-pointer"
      style={{
        border: liked ? "1px solid rgba(56,168,72,0.35)" : "1px solid rgba(0,0,0,0.1)",
        background: liked ? "#f0faf1" : "#fff",
        color: liked ? "#1f7a33" : "#615d59",
        opacity: pending ? 0.6 : 1,
        minHeight: 36,
        transition: "background-color 150ms cubic-bezier(.4,0,.2,1), border-color 150ms cubic-bezier(.4,0,.2,1)",
      }}
    >
      <ThumbsUp size={14} strokeWidth={2.25} fill={liked ? "#1f7a33" : "none"} aria-hidden />
      <span className="tabular-nums">{count}</span>
    </button>
  );
}
