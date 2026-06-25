/** 금액을 쉼표 포맷으로 변환 */
export function formatAmount(amount: number): string {
  return amount.toLocaleString("ko-KR");
}

/** 입력 중 실시간 쉼표 삽입 (숫자만 남기고 포맷) */
export function formatInputAmount(raw: string): string {
  const num = raw.replace(/[^\d]/g, "");
  if (!num) return "";
  return Number(num).toLocaleString("ko-KR");
}

/** 포맷된 문자열에서 숫자 추출 */
export function parseAmount(formatted: string): number {
  return Number(formatted.replace(/[^\d]/g, "")) || 0;
}

/** 날짜를 YYYY-MM-DD 형식으로 */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** YYYY-MM-DD를 Date 객체로 */
export function fromDateString(str: string): Date {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** 두 날짜 사이의 일수 (시작·종료 포함) */
export function daysBetween(start: string, end: string): number {
  const s = fromDateString(start);
  const e = fromDateString(end);
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

/** 월의 모든 날짜 배열 생성 */
export function getMonthDates(year: number, month: number): Date[] {
  const dates: Date[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    dates.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

