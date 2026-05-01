export function todayStr(): string {
  return new Date().toLocaleDateString("sv-SE"); // "YYYY-MM-DD"
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

export function formatDateHeader(): { month: string; day: string; weekday: string } {
  const now = new Date();
  const MONTHS = [
    "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
    "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
  ];
  const WEEKDAYS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  return {
    month: MONTHS[now.getMonth()],
    day: String(now.getDate()),
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
