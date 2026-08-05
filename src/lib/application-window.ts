// 신규/연장 신청 마감 규칙
// 2026년 8월부터: 수동 회원가입 처리 시간 확보를 위해 매달 25일까지만 신청을 받고,
// 26일~말일은 마감(다음 달 1일 재오픈). 1:1 수업은 공개 신청 폼이 없어 대상 아님.

export const APPLICATION_DEADLINE_DAY = 25;
export const APPLICATION_DEADLINE_EFFECTIVE_YM = "2026-08";

const KST_OFFSET = 9 * 60 * 60 * 1000;

/** KST 기준 오늘의 { ym: "YYYY-MM", day } */
function kstToday(): { ym: string; day: number } {
  const k = new Date(Date.now() + KST_OFFSET);
  return { ym: k.toISOString().slice(0, 7), day: k.getUTCDate() };
}

/** 이번 달 신규/연장 신청이 마감됐는지 (2026-08부터 26일~말일 마감) */
export function isApplicationClosed(): boolean {
  const { ym, day } = kstToday();
  if (ym < APPLICATION_DEADLINE_EFFECTIVE_YM) return false;
  return day > APPLICATION_DEADLINE_DAY;
}
