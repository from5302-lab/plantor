// 작은 포매팅 유틸 모음
import { Timestamp } from "firebase/firestore";

/** Firestore Timestamp → Date 변환 유틸 */
export function tsToDate(v: unknown): Date | null {
  return v instanceof Timestamp ? v.toDate() : null;
}

export function formatWon(n: number): string {
  return `₩${n.toLocaleString("ko-KR")}`;
}

export function formatDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
