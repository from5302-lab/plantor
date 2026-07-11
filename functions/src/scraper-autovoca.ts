import { createHmac } from "node:crypto";
import { crc32 } from "node:zlib";
import * as functions from "firebase-functions";

// 오토보카 모바일 API 이식 (원본: cowork/scrapers/autovoca.py)
//   로그인(HMAC 서명) → 학생 목록 → 주간 리포트 → 오늘 유닛/오답/포인트 추출

const AUTOVOCA_BASE = "https://mobile.autovoca.co.kr";

export type AutovocaCreds = { loginId: string; loginPw: string; hmacSecret: string };

export type AutovocaUnit = {
  unitLabel: string;
  studyMinutes: number;
  testScore: number | null;
  wrongReviewCount: number | null;
  points: number | null;
  completed: boolean;
};

export type AutovocaResult = {
  autoStatus: "시작전" | "진행중" | "완료";
  units: AutovocaUnit[];
  totalStudyMinutes: number;
  /** 필드명 최종 확정 전, 오늘 원본 day 객체 (디버그용). */
  rawToday?: unknown;
};

const STATUS_RANK: Record<string, number> = { 시작전: 0, 진행중: 1, 완료: 2 };
function higherStatus(a: string, b: string) {
  return (STATUS_RANK[a] ?? 0) >= (STATUS_RANK[b] ?? 0) ? a : b;
}

/**
 * 완료 유닛의 "N권" → 과제 partSlug "vol-N" (파트 단위 자동체크용).
 * 권수를 못 읽는 유닛이 하나라도 있으면 null 반환 → 호출부가 서비스 단위로 폴백(과소체크 방지).
 */
export function autovocaDonePartSlugs(units: Array<{ unitLabel?: string; completed?: boolean }>): string[] | null {
  const parts = new Set<string>();
  for (const u of units) {
    if (u.completed === false) continue;
    const m = /(\d+)\s*권/.exec(u.unitLabel ?? "");
    if (!m) return null;
    parts.add(`vol-${parseInt(m[1], 10)}`);
  }
  return [...parts];
}

/** KST 기준 "YYYY-MM-DD HH:MM:SS" (오토보카 Ts 헤더용). */
function kstTs(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
}

/** 원본 파이썬 _sign 이식: message = token + ts + crc32(dataStr), HMAC-SHA256. */
function sign(secret: string, token: string, method: string, path: string, body: unknown, ts: string): string {
  // GET → path, 그 외 → compact JSON (python json.dumps separators=(",",":") 와 동일)
  const dataStr = method.toUpperCase() === "GET" ? path : JSON.stringify(body ?? {});
  const crc = crc32(Buffer.from(dataStr, "utf8")) >>> 0;
  const message = `${token}${ts}${crc}`;
  return createHmac("sha256", secret).update(message).digest("hex");
}

const BASE_HEADERS = {
  "Content-Type": "application/json",
  Origin: "https://www.autovoca.co.kr",
  Referer: "https://www.autovoca.co.kr/",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
};

class AutovocaClient {
  private token = "";
  constructor(private creds: AutovocaCreds) {}

  private async req(method: "GET" | "POST", path: string, body?: unknown): Promise<any> {
    const ts = kstTs();
    const sig = sign(this.creds.hmacSecret, this.token, method, path, body, ts);
    const headers: Record<string, string> = {
      ...BASE_HEADERS,
      WebAuthorization: `Bearer ${this.token}`,
      Ts: ts,
      Hmac: sig,
    };
    const init: RequestInit = { method, headers };
    if (method === "POST") init.body = JSON.stringify(body ?? {});
    const resp = await fetch(`${AUTOVOCA_BASE}${path}`, init);
    if (!resp.ok) throw new Error(`오토보카 ${path} HTTP ${resp.status}`);
    return resp.json();
  }

  async login(): Promise<void> {
    const body = { login_id: this.creds.loginId, login_pw: this.creds.loginPw };
    const ts = kstTs();
    const sig = sign(this.creds.hmacSecret, "", "POST", "/auth/login", body, ts);
    const resp = await fetch(`${AUTOVOCA_BASE}/auth/login`, {
      method: "POST",
      headers: { ...BASE_HEADERS, WebAuthorization: "Bearer ", Ts: ts, Hmac: sig },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`오토보카 로그인 HTTP ${resp.status}`);
    const data = await resp.json();
    if (data?.result?.code !== 200) throw new Error(`오토보카 로그인 실패: ${data?.result?.msg ?? "unknown"}`);
    this.token = data.res_data.token;
  }

  async getStudentList(): Promise<Array<Record<string, any>>> {
    const data = await this.req("GET", "/academy/student/list");
    return data?.res_data?.student_list ?? [];
  }

  async getWeeklyReport(userIdx: number | string, year: number, month: number): Promise<any> {
    const mm = String(month).padStart(2, "0");
    const data = await this.req("GET", `/report/get_user_weekly_report/${userIdx}/${year}/${mm}`);
    return data?.res_data?.weekly_report_data ?? {};
  }
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * 주간 리포트에서 오늘(day-of-month) 활동 추출.
 *
 * ⚠️ 필드명 확정 필요: 아래 unitLabel / wrongReviewCount / points 는 실제 API 응답을
 * 확인해 정확한 키로 교체해야 한다(사용자 캡쳐: "4권 유닛 9" · 오답복습 3개 · +35P).
 * 현재는 추정 키 + 원본 passthrough(rawToday) 로 안전하게 수집한다.
 */
function extractToday(weekly: any, todayDom: number): AutovocaResult {
  let status = "시작전";
  let totalMinutes = 0;
  const units: AutovocaUnit[] = [];
  const rawDays: unknown[] = [];

  for (const week of weekly?.weeks ?? []) {
    for (const day of week?.days ?? []) {
      if (day?.day !== todayDom) continue;
      rawDays.push(day);

      for (const unit of day?.unit_data ?? []) {
        const unitStart = unit?.unit_start;
        const unitEnd = unit?.unit_end;
        const duration = Number(unit?.unit_duration ?? 0) || 0;
        if (!unitStart) continue;

        const completed = !!unitEnd;
        // 유닛을 열기만 하고 실제 학습 시간이 없는 경우(unit_start만 있고 unit_end·duration 없음)는
        // 활동으로 치지 않는다 → "학습 전인데 진행중" 오탐 방지.
        if (!completed && duration <= 0) continue;

        status = higherStatus(status, completed ? "완료" : "진행중");
        const minutes = Math.floor(duration / 60);
        totalMinutes += minutes;

        const jd = (unit?.json_data ?? {}) as Record<string, unknown>;
        // 유닛명: "5권 유닛 17" (book_short_name + report_name)
        const unitLabel = [unit?.book_short_name, unit?.report_name].filter(Boolean).join(" ") || "오토보카 유닛";
        // 테스트: test_score_list 평균
        const tsl = (Array.isArray(jd.test_score_list) ? jd.test_score_list : []).filter((x): x is number => typeof x === "number");
        const testScore = tsl.length ? Math.round(tsl.reduce((a, b) => a + b, 0) / tsl.length) : num(unit?.pager_test_score);
        // 포인트: point_list 합
        const pl = Array.isArray(jd.point_list) ? (jd.point_list as Array<{ point?: unknown }>) : [];
        const points = pl.length ? pl.reduce((a, p) => a + (Number(p?.point) || 0), 0) : null;
        // 누적오답복습: 오늘 오답복습 세션 수 (best-effort)
        const wrongReviewCount = (day?.wrong_data?.length ?? 0) || null;

        units.push({ unitLabel, studyMinutes: minutes, testScore, wrongReviewCount, points, completed });
      }

      // 오답복습(wrong_data)의 is_made 는 "복습 세트가 자동 생성됨"을 뜻할 뿐 실제 학습 여부가 아니다.
      // (생성만으로 진행중으로 뜨는 오탐이 있어 판정에서 제외 — 실제 오답복습 학습은 위 unit_data 의 학습시간으로 잡힘)
    }
  }

  return {
    autoStatus: status as AutovocaResult["autoStatus"],
    units,
    totalStudyMinutes: totalMinutes,
    rawToday: rawDays.length ? rawDays : undefined,
  };
}

/**
 * 교사 계정으로 로그인해 특정 학생(externalLoginId)의 오늘 진도를 가져온다.
 * @param dateKst "YYYY-MM-DD" (오늘, KST 기준)
 */
export async function scrapeAutovocaForStudent(
  creds: AutovocaCreds,
  externalLoginId: string,
  dateKst: string,
  studentName?: string,
): Promise<AutovocaResult & { matchedLoginId?: string }> {
  const client = new AutovocaClient(creds);
  await client.login();

  const target = externalLoginId.toLowerCase().trim();
  const students = await client.getStudentList();

  // 1) 외부 아이디로 매칭, 2) 없으면 이름으로 폴백 매칭 (교사 명단에서)
  let stu = target
    ? students.find((s) => String(s?.login_id ?? "").toLowerCase() === target && !s?.is_sample)
    : undefined;
  if (!stu && studentName?.trim()) {
    // 명단 이름은 "중1 오수영"처럼 학년 접두사가 붙음 → 공백 제거 후 접미/포함 매칭
    const nm = studentName.replace(/\s+/g, "");
    stu = students.find((s) => {
      if (s?.is_sample) return false;
      const nameNorm = String(s?.name ?? "").replace(/\s+/g, "");
      return nameNorm === nm || nameNorm.endsWith(nm) || nameNorm.includes(nm);
    });
  }
  if (!stu) {
    functions.logger.warn("[autovoca] 학생 미발견", { externalLoginId, studentName });
    return { autoStatus: "시작전", units: [], totalStudyMinutes: 0 };
  }
  const matchedLoginId = String(stu.login_id ?? "");

  const [y, m, d] = dateKst.split("-").map((x) => parseInt(x, 10));
  const weekly = await client.getWeeklyReport(stu.user_idx, y, m);
  const result = extractToday(weekly, d);
  return { ...result, matchedLoginId };
}

// 전체 학생: 배치(스케줄러)용 — 로그인 1회로 오늘 학습한 모든 학생 반환
export async function scrapeAutovocaAll(
  creds: AutovocaCreds,
  dateKst: string,
): Promise<Array<{ loginId: string; name: string; autoStatus: AutovocaResult["autoStatus"]; units: AutovocaUnit[]; totalStudyMinutes: number }>> {
  const client = new AutovocaClient(creds);
  await client.login();
  const students = await client.getStudentList();
  const [y, m, d] = dateKst.split("-").map((x) => parseInt(x, 10));
  const out: Array<{ loginId: string; name: string; autoStatus: AutovocaResult["autoStatus"]; units: AutovocaUnit[]; totalStudyMinutes: number }> = [];
  for (const stu of students) {
    if (stu?.is_sample) continue;
    try {
      const weekly = await client.getWeeklyReport(stu.user_idx, y, m);
      const res = extractToday(weekly, d);
      if (res.units.length) {
        out.push({ loginId: String(stu.login_id ?? ""), name: String(stu.name ?? ""), autoStatus: res.autoStatus, units: res.units, totalStudyMinutes: res.totalStudyMinutes });
      }
    } catch (e) {
      functions.logger.warn("[autovoca] 배치 학생 실패", { loginId: stu?.login_id, error: String(e) });
    }
  }
  return out;
}
