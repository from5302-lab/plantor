import type { Service } from "@/data/site";

export function todayStr(): string {
  return new Date().toLocaleDateString("sv-SE"); // "YYYY-MM-DD"
}

/** 과제 표시 라벨: 진도형은 "서비스명 진도", 파트형은 파트명, 그 외 저장된 제목 */
export function taskLabel(
  task: { serviceSlug: string; partSlug?: string | null; progressLabel?: string | null; title: string },
  services: Service[],
): string {
  const svc = services.find((s) => s.slug === task.serviceSlug);
  if (task.progressLabel) return `${svc?.name ?? task.serviceSlug} ${task.progressLabel}`;
  const part = svc?.parts?.find((p) => p.slug === task.partSlug);
  return part ? part.name : task.title;
}

/** 이번 주(또는 offset주 전) 월요일~일요일 날짜 배열. offset=-1이면 지난주 */
export function getWeekDates(weekOffset = 0): string[] {
  const today = new Date();
  const dow = today.getDay(); // 0=Sun
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1) + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toLocaleDateString("sv-SE");
  });
}

/**
 * 오늘 날짜 표시값.
 *
 * 월 이름을 영문 대문자(AUGUST)로 두었더니 한글 요일과 한 줄에서 부딪혔다 —
 * 두 문자 체계는 baseline·자폭·밀도가 달라 나란히 두면 읽기 리듬이 끊긴다.
 * 한국어 서비스이므로 한국어로 통일한다.
 */
export function formatDateHeader(): { date: string; weekday: string } {
  const now = new Date();
  const WEEKDAYS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  return {
    date: `${now.getMonth() + 1}월 ${now.getDate()}일`,
    weekday: WEEKDAYS[now.getDay()],
  };
}

/** 연속 학습 일수 (오늘 or 어제부터 연속) */
export function calcStreak(logs: { date: string }[]): number {
  const dates = [...new Set(logs.map((l) => l.date))].sort().reverse();
  if (dates.length === 0) return 0;
  const today = todayStr();
  const yd = new Date();
  yd.setDate(yd.getDate() - 1);
  const yesterday = yd.toLocaleDateString("sv-SE");
  if (dates[0] !== today && dates[0] !== yesterday) return 0;
  let streak = 0;
  let expected = today;
  for (const d of dates) {
    if (d === expected) {
      streak++;
      const prev = new Date(expected);
      prev.setDate(prev.getDate() - 1);
      expected = prev.toLocaleDateString("sv-SE");
    } else if (d < expected) break;
  }
  return streak;
}
