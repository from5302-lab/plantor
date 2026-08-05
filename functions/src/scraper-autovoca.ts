import { createHmac } from "node:crypto";
import { crc32 } from "node:zlib";
import * as functions from "firebase-functions";

// 오토보카 모바일 API 이식 (원본: cowork/scrapers/autovoca.py)
//   로그인(HMAC 서명) → 학생 목록 → 주간 리포트 → 오늘 유닛/오답/포인트 추출

const AUTOVOCA_BASE = "https://mobile.autovoca.co.kr";

// 오토보카 응답에는 스키마 보증이 없다(필드가 언제든 늘거나 빈다).
// 구조를 강제하는 대신 느슨하게 받고, 값을 꺼낼 때 num()/String()/Array.isArray 로 좁힌다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiJson = any;

export type AutovocaCreds = { loginId: string; loginPw: string; hmacSecret: string };

export type AutovocaUnit = {
  unitLabel: string;
  studyMinutes: number;
  testScore: number | null;
  wrongReviewCount: number | null;
  points: number | null;
  completed: boolean;
  // ── 리워드(품질·뱃지) 판정용 ──
  /** 회차별 테스트 점수 원본 (평균만으로는 '3연속 100점'을 못 잡는다) */
  testScores?: number[];
  /** 활동별 1회 정답률 % — 스펠(write)이 실력 변별의 핵심 지표 */
  accuracy?: { mem?: number; write?: number; speak?: number; check?: number };
  /** 활동별 포인트 (speak/mem/check/write/test/wrong) */
  pointsByActivity?: Record<string, number>;
  /** 학습 시작 시각(KST 시) — 얼리버드/올빼미 판정 */
  startHour?: number;
  /** 학습 시작·종료 시각 "HH:MM" (KST). 원본 unit_start/unit_end에서 뽑는다. */
  startAt?: string;
  endAt?: string;
  /** "5권" 등 교재 라벨 — 승급 판정 */
  bookLabel?: string;
  isReview?: boolean;
  /** 4번 넘게 틀린 끝에 맞힌 단어가 있는지 */
  hardWordCleared?: boolean;
};

export type AutovocaResult = {
  autoStatus: "시작전" | "진행중" | "완료";
  units: AutovocaUnit[];
  totalStudyMinutes: number;
  /** 그날 오답복습 현황 — 전량 소탕 여부와 획득 포인트 */
  wrongReview?: { cleared: boolean; points: number };
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

/** 파트별 오늘 완료 유닛 수 — 만회 판정(예정량 초과분)용. 파트 판정 불가 시 null. */
export function autovocaDonePartCounts(units: Array<{ unitLabel?: string; completed?: boolean }>): Record<string, number> | null {
  const counts: Record<string, number> = {};
  for (const u of units) {
    if (u.completed === false) continue;
    const m = /(\d+)\s*권/.exec(u.unitLabel ?? "");
    if (!m) return null;
    const p = `vol-${parseInt(m[1], 10)}`;
    counts[p] = (counts[p] ?? 0) + 1;
  }
  return counts;
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

  private async req(method: "GET" | "POST", path: string, body?: unknown): Promise<ApiJson> {
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

  async getStudentList(): Promise<Array<Record<string, ApiJson>>> {
    const data = await this.req("GET", "/academy/student/list");
    return data?.res_data?.student_list ?? [];
  }

  async getWeeklyReport(userIdx: number | string, year: number, month: number): Promise<ApiJson> {
    const mm = String(month).padStart(2, "0");
    const data = await this.req("GET", `/report/get_user_weekly_report/${userIdx}/${year}/${mm}`);
    return data?.res_data?.weekly_report_data ?? {};
  }
}

/** KST 기준 날짜와 시:분으로 쪼갠다. */
function kstParts(v: unknown): { date: string; hhmm: string } | null {
  if (!v) return null;
  const d = new Date(new Date(String(v)).getTime() + 9 * 3600 * 1000);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`,
    hhmm: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`,
  };
}

/**
 * 유닛의 학습 시작·종료 시각(KST "HH:MM") — **그 날짜의 것만** 인정한다.
 *
 * unit_start/unit_end 는 서로 다른 날짜일 수 있다. 유닛이 배정일 기준으로 묶여 오기 때문에,
 * 어제 밤에 열어 오늘 끝낸 유닛이 흔하다. 예전엔 날짜를 버리고 시:분만 뽑아서
 * "23:47 ~ 20:12" 같은 뒤집힌 시각이 만들어졌다.
 *
 * 종료가 그날 것이 아니고 시작이 그날이면, 학습시간(unit_duration)만큼 뒤로 잡아 추정한다.
 */
export function unitTimes(
  unitStart: unknown, unitEnd: unknown, durationSec: number, dateKst: string,
): { startAt?: string; endAt?: string } {
  const ks = kstParts(unitStart); const ke = kstParts(unitEnd);
  const startAt = ks?.date === dateKst ? ks.hhmm : undefined;
  if (ke?.date === dateKst) return { startAt, endAt: ke.hhmm };
  if (!startAt || durationSec <= 0) return { startAt };
  // 추정 종료도 그날을 넘어가면 버린다 — 자정을 넘기면 "23:50 ~ 00:00"이 되어 표시가 뒤집힌다
  const est = kstParts(new Date(new Date(String(unitStart)).getTime() + durationSec * 1000).toISOString());
  return { startAt, endAt: est?.date === dateKst ? est.hhmm : undefined };
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
function extractToday(weekly: ApiJson, dateKst: string): AutovocaResult {
  const todayDom = parseInt(dateKst.split("-")[2], 10);
  let status = "시작전";
  let totalMinutes = 0;
  const units: AutovocaUnit[] = [];
  const rawDays: unknown[] = [];
  let wrongCleared = false;
  let wrongPoints = 0;

  /** 단어 리스트에서 '한 번에 맞힌 비율' %. 리스트가 없으면 undefined. */
  const firstTryRate = (list: unknown): number | undefined => {
    if (!Array.isArray(list) || !list.length) return undefined;
    const one = list.filter((x) => Number((x as { try_cnt?: unknown })?.try_cnt) === 1).length;
    return Math.round((100 * one) / list.length);
  };
  /** 4회 넘게 시도한 끝에 맞힌 단어가 있는지 */
  const hasHardWin = (lists: unknown[]): boolean =>
    lists.some((list) => Array.isArray(list) && list.some((x) => {
      const w = x as { try_cnt?: unknown; correct_cnt?: unknown };
      return Number(w?.try_cnt) >= 4 && Number(w?.correct_cnt) > 0;
    }));

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

        // ── 리워드 판정용 필드 ──
        const pointsByActivity: Record<string, number> = {};
        for (const p of pl) {
          const act = String((p as { activity?: unknown })?.activity ?? "etc");
          pointsByActivity[act] = (pointsByActivity[act] ?? 0) + (Number(p?.point) || 0);
        }
        const accuracy = {
          mem: firstTryRate(jd.mem_list),
          write: firstTryRate(jd.write_list),
          speak: firstTryRate(jd.speak_list),
          check: firstTryRate(jd.check_list),
        };
        const startHour = unitStart ? new Date(new Date(unitStart).getTime() + 9 * 3600 * 1000).getUTCHours() : undefined;
        const { startAt, endAt } = unitTimes(unitStart, unitEnd, duration, dateKst);

        // 값이 없는 필드(빈 단어 리스트의 accuracy, 그날이 아닌 startAt 등)는 undefined 로 두고,
        // 저장 단계에서 키가 빠진다 (config.ts 의 ignoreUndefinedProperties).
        units.push({
          unitLabel, studyMinutes: minutes, testScore, wrongReviewCount, points, completed,
          testScores: tsl.length ? tsl : undefined,
          accuracy,
          pointsByActivity: Object.keys(pointsByActivity).length ? pointsByActivity : undefined,
          startHour, startAt, endAt,
          bookLabel: unit?.book_short_name ? String(unit.book_short_name) : undefined,
          isReview: /리뷰/.test(String(unit?.report_name ?? "")),
          hardWordCleared: hasHardWin([jd.mem_list, jd.write_list, jd.speak_list, jd.check_list]),
        });
      }

      // 오답복습: end_cnt가 now_cnt에 도달하면 그날 몫을 전부 끝낸 것
      for (const w of day?.wrong_data ?? []) {
        const now = Number(w?.now_cnt) || 0;
        const end = Number(w?.end_cnt) || 0;
        if (end > 0 && end >= now) wrongCleared = true;
        wrongPoints += Number(w?.total_point) || 0;
      }

      // 오답복습(wrong_data)의 is_made 는 "복습 세트가 자동 생성됨"을 뜻할 뿐 실제 학습 여부가 아니다.
      // (생성만으로 진행중으로 뜨는 오탐이 있어 판정에서 제외 — 실제 오답복습 학습은 위 unit_data 의 학습시간으로 잡힘)
    }
  }

  return {
    autoStatus: status as AutovocaResult["autoStatus"],
    units,
    totalStudyMinutes: totalMinutes,
    wrongReview: { cleared: wrongCleared, points: wrongPoints },
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

  const [y, m] = dateKst.split("-").map((x) => parseInt(x, 10));
  const weekly = await client.getWeeklyReport(stu.user_idx, y, m);
  const result = extractToday(weekly, dateKst);
  return { ...result, matchedLoginId };
}

// 전체 학생: 배치(스케줄러)용 — 로그인 1회로 오늘 학습한 모든 학생 반환
export async function scrapeAutovocaAll(
  creds: AutovocaCreds,
  dateKst: string,
): Promise<Array<{ loginId: string; name: string; autoStatus: AutovocaResult["autoStatus"]; units: AutovocaUnit[]; totalStudyMinutes: number; wrongReview?: AutovocaResult["wrongReview"] }>> {
  const client = new AutovocaClient(creds);
  await client.login();
  const students = await client.getStudentList();
  const [y, m] = dateKst.split("-").map((x) => parseInt(x, 10));
  const out: Array<{ loginId: string; name: string; autoStatus: AutovocaResult["autoStatus"]; units: AutovocaUnit[]; totalStudyMinutes: number; wrongReview?: AutovocaResult["wrongReview"] }> = [];
  for (const stu of students) {
    if (stu?.is_sample) continue;
    try {
      const weekly = await client.getWeeklyReport(stu.user_idx, y, m);
      const res = extractToday(weekly, dateKst);
      if (res.units.length) {
        out.push({ loginId: String(stu.login_id ?? ""), name: String(stu.name ?? ""), autoStatus: res.autoStatus, units: res.units, totalStudyMinutes: res.totalStudyMinutes, wrongReview: res.wrongReview });
      }
    } catch (e) {
      functions.logger.warn("[autovoca] 배치 학생 실패", { loginId: stu?.login_id, error: String(e) });
    }
  }
  return out;
}
