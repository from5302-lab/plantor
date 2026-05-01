"use client";

import { useEffect, useState } from "react";
import { collection, addDoc, getDocs, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { T } from "@/lib/design-tokens";

export function ReportButton({
  logId,
  myUid,
  flagged,
  reportCount,
}: {
  logId: string;
  myUid: string | null;
  flagged: boolean;
  reportCount: number;
}) {
  const [reported, setReported] = useState(false);
  const [loading, setLoading] = useState(false);

  // 이미 신고했는지 확인
  useEffect(() => {
    if (!myUid) return;
    getDocs(query(
      collection(db, "feedReports"),
      where("logId", "==", logId),
      where("reporterUid", "==", myUid),
    )).then((snap) => { if (!snap.empty) setReported(true); });
  }, [logId, myUid]);

  async function handleReport() {
    if (!myUid || reported || loading) return;
    if (!confirm("이 인증샷을 허위로 신고하시겠어요?\n허위 신고를 반복하면 신고 권한이 제한될 수 있어요.")) return;
    setLoading(true);
    try {
      await addDoc(collection(db, "feedReports"), {
        logId,
        reporterUid: myUid,
        createdAt: serverTimestamp(),
      });
      setReported(true);
    } catch { alert("신고 중 오류가 발생했어요."); }
    finally { setLoading(false); }
  }

  if (!myUid) return null; // 비회원은 신고 버튼 없음

  if (flagged) {
    return (
      <span style={{ fontSize: 11, fontWeight: 600, color: "#c00000", backgroundColor: "#fff5f5", borderRadius: 6, padding: "4px 8px", whiteSpace: "nowrap" }}>
        신고 {reportCount}건
      </span>
    );
  }

  return (
    <button
      onClick={handleReport}
      disabled={reported || loading}
      style={{
        fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 6, whiteSpace: "nowrap",
        border: T.border, cursor: reported ? "default" : "pointer",
        backgroundColor: reported ? T.bg : "transparent",
        color: reported ? T.textMuted : T.textMuted,
        opacity: loading ? 0.5 : 1,
      }}
    >
      {loading ? "…" : reported ? "신고됨" : "🚩 신고"}
    </button>
  );
}
