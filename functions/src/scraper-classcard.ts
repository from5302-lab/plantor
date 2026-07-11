import * as XLSX from "xlsx";
import * as functions from "firebase-functions";

// 클래스카드 스크래퍼 — 엑셀 리포트 + 듣기평가 HTML 파싱 (2026-07 재작성)
//   문법(gClass):        POST /GClass/getReportToExcel        (.xls / OLE2)
//   어휘·본문(classMain): POST /ClassReports/userReportToExcel (save_scope=2 → .xlsx)
//   듣기평가(gClass, kind:"듣기"): getReportToExcel이 빈 엑셀을 반환 →
//     GET /GClass/report/{idx} 페이지의 서버렌더 report-table을 파싱 (기본 창 오늘-7일~오늘).
//   판정: 오늘 학습 흔적이 있으면 "완료"(점수 무관).

const BASE = "https://www.classcard.net";
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" };

export type ClasscardCreds = { loginId: string; loginPw: string };
export type ClasscardClass = { type: "classMain" | "gClass"; classIdx?: string; gClassIdx?: string; name: string; kind?: string };
export type ClasscardConfig = { loginUserIdx: string; bSIdx: string; classes: ClasscardClass[] };

// 교사(from302) 계정 기준 기본 설정 — Firestore config/autoVerify.classcard 로 override 가능
// 2026-07-08: 듣기평가 7반 idx·이름을 리포트 페이지 초대코드로 전수 검증(전부 정확).
//   kind:"듣기"는 HTML 리포트 파싱 경로 사용. 순수 /Listen 세트 자가학습은 여전히 미수집(반 리포트에 없음).
export const CLASSCARD_DEFAULT_CONFIG: ClasscardConfig = {
  loginUserIdx: "5101739",
  bSIdx: "19167",
  classes: [
    // ── 문법 (gClass, 2.문법164 그룹) ──
    { type: "gClass", gClassIdx: "65419", name: "교실", kind: "문법" },
    { type: "gClass", gClassIdx: "109586", name: "intro", kind: "문법" },
    { type: "gClass", gClassIdx: "110249", name: "중2 비상황 문법", kind: "문법" },
    { type: "gClass", gClassIdx: "66998", name: "중3 비상김 문법", kind: "문법" },
    { type: "gClass", gClassIdx: "127033", name: "고등", kind: "문법" },
    { type: "gClass", gClassIdx: "116419", name: "중1 천재이 문법", kind: "문법" },
    { type: "gClass", gClassIdx: "120840", name: "중2 YBM박준언 문법", kind: "문법" },
    // ── 듣기평가 (gClass, 4.듣기평가 그룹) ──
    { type: "gClass", gClassIdx: "93468", name: "듣기 중1", kind: "듣기" },
    { type: "gClass", gClassIdx: "82592", name: "듣기 중2", kind: "듣기" },
    { type: "gClass", gClassIdx: "92730", name: "듣기 중3", kind: "듣기" },
    { type: "gClass", gClassIdx: "82439", name: "듣기 고1 (EBS)", kind: "듣기" },
    { type: "gClass", gClassIdx: "95899", name: "듣기 고1 모의고사", kind: "듣기" },
    { type: "gClass", gClassIdx: "111208", name: "듣기 고2 모의고사", kind: "듣기" },
    { type: "gClass", gClassIdx: "96356", name: "듣기 예비고1", kind: "듣기" },
    // ── 어휘/본문 (classMain, 1.능률보카 그룹 등) ──
    { type: "classMain", classIdx: "1708319", name: "중등기본" },
    { type: "classMain", classIdx: "1922227", name: "중1 천재이 단어,본문" },
    { type: "classMain", classIdx: "1868336", name: "중2 비상황 단어,본문" },
    { type: "classMain", classIdx: "1883945", name: "중2 YBM박준언 본문" },
    { type: "classMain", classIdx: "1998157", name: "중2 YBM박준언 단어" },
    { type: "classMain", classIdx: "1478465", name: "중2 능률김" },
    { type: "classMain", classIdx: "1111034", name: "중3 비상김 단어,본문" },
    { type: "classMain", classIdx: "1308432", name: "단어" },
  ],
};

export type ClasscardUnit = {
  type: string;
  unitLabel: string;
  studyMinutes: number;
  dateRangeRaw?: string;    // 듣기평가 "07/07 18:02 ~07/07 18:15" 원본
  avgScore: number | null;
  completed: boolean;
  scores: Record<string, number | string>;
};

export type ClasscardResult = {
  autoStatus: "시작전" | "진행중" | "완료";
  units: ClasscardUnit[];
  totalStudyMinutes: number;
  rawToday?: unknown;
};

const STATUS_RANK: Record<string, number> = { 시작전: 0, 진행중: 1, 완료: 2 };
function higherStatus(a: string, b: string) {
  return (STATUS_RANK[a] ?? 0) >= (STATUS_RANK[b] ?? 0) ? a : b;
}

// "개념 톡  (96점)" → { label: "개념 톡", score: 96 }
function parseScoreCell(text: string): { label: string; value: number | string } | null {
  const t = text.trim();
  if (!t || t === "NA" || t === "-") return null;
  const m = /^(.*?)\s*\((\d+)점\)\s*$/.exec(t);
  if (m) return { label: m[1].trim() || "점수", value: parseInt(m[2], 10) };
  return { label: t, value: t };
}

// "2026-07-05 00:00" ~ "2026-07-05 00:11" → 11(분). 자정 넘김/파싱불가 시 0.
function minutesBetween(start: string, end: string): number {
  const p = (s: string) => {
    const m = /(\d{2}):(\d{2})/.exec(s);
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
  };
  const a = p(start); const b = p(end);
  if (a == null || b == null || !start.slice(0, 10) || start.slice(0, 10) !== end.slice(0, 10)) return 0;
  return Math.max(0, b - a);
}

// 반 명단 1명 (오늘 활동 있으면 units 포함)
type RosterEntry = { loginId: string; name: string; units: ClasscardUnit[] };

// ── 쿠키 저장 ──────────────────────────────────────────────────────────────────
class CookieJar {
  private jar = new Map<string, string>();
  store(setCookies: string[]) {
    for (const c of setCookies) {
      const pair = c.split(";")[0];
      const eq = pair.indexOf("=");
      if (eq > 0) this.jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  header(): string {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

function headerIndex(rows: unknown[][]): Record<string, number> {
  const idx: Record<string, number> = {};
  (rows[0] ?? []).forEach((h, i) => { idx[String(h ?? "").trim()] = i; });
  return idx;
}

// 듣기평가 리포트 페이지(서버렌더 HTML) 파싱.
//   듣기평가 gClass는 getReportToExcel이 빈 엑셀(헤더만)을 반환 → /GClass/report/{idx} 페이지의
//   table.report-table(학생|유닛명|학습일자|테스트|딕테이션|오답 테스트|선택)을 직접 파싱한다.
//   학생 셀(td.report-user)은 rowspan으로 유닛 여러 개에 병합될 수 있고, 구분선 행(line-bottom)이 끼어 있음.
//   기본 렌더 창이 오늘-7일 ~ 오늘이라 오늘 학습은 항상 포함된다.
function parseListeningReport(html: string, dateKst: string): RosterEntry[] {
  const tStart = html.indexOf("report-table");
  if (tStart < 0) return [];
  const table = html.slice(tStart, html.indexOf("</table>", tStart));
  const [, mmStr, ddStr] = dateKst.split("-");
  const todayMonth = parseInt(mmStr, 10); const todayDay = parseInt(ddStr, 10);

  const byId = new Map<string, RosterEntry>();
  let curLoginId = ""; let curName = "";
  for (const tr of table.match(/<tr>[\s\S]*?<\/tr>/g) ?? []) {
    if (tr.includes("<th") || tr.includes("line-bottom")) continue;
    // 학생 셀이 있으면 현재 학생 갱신 (rowspan 병합 시 다음 행에선 생략됨)
    const user = /report-user[^>]*>([\s\S]*?)<div[^>]*>([\s\S]*?)<\/div>/.exec(tr);
    if (user) {
      curName = user[1].replace(/<[^>]+>/g, "").trim();
      curLoginId = user[2].replace(/<[^>]+>/g, "").trim().toLowerCase();
    }
    if (!curLoginId) continue;
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    const off = user ? 1 : 0; // 학생 셀 포함 여부에 따른 오프셋 (마지막 셀은 선택 체크박스)
    if (cells.length < off + 5) continue;
    const [unitLabel, dateRaw, test, dictation, wrong] = cells.slice(off, off + 5);
    // 학습일자 "07/07 18:02 ~07/07 18:15" (월 0-패딩 유무 무관) → 오늘 행만
    const times = [...dateRaw.matchAll(/(\d{1,2})\/(\d{1,2})\s+(\d{2}):(\d{2})/g)];
    const isToday = times.some((t) => parseInt(t[1], 10) === todayMonth && parseInt(t[2], 10) === todayDay);
    if (!isToday) continue;
    let minutes = 0; // 같은 날짜 안에서만 계산, 자정 넘김 등 불확실하면 0 (원본은 dateRangeRaw 보존)
    if (times.length === 2 && times[0][1] === times[1][1] && times[0][2] === times[1][2]) {
      minutes = Math.max(0, (parseInt(times[1][3], 10) * 60 + parseInt(times[1][4], 10))
        - (parseInt(times[0][3], 10) * 60 + parseInt(times[0][4], 10)));
    }
    const scores: Record<string, number | string> = {};
    if (test && test !== "-") scores["테스트"] = test;
    if (dictation && dictation !== "-") scores["딕테이션"] = dictation;
    if (wrong && wrong !== "-") scores["오답 테스트"] = wrong;
    const entry = byId.get(curLoginId) ?? { loginId: curLoginId, name: curName, units: [] };
    entry.units.push({
      type: "듣기",
      unitLabel: unitLabel || "듣기평가",
      studyMinutes: minutes,
      dateRangeRaw: dateRaw || undefined,
      avgScore: null,
      completed: true, // 오늘 학습 흔적 = 완료(점수 무관)
      scores,
    });
    byId.set(curLoginId, entry);
  }
  return [...byId.values()];
}

class ClasscardClient {
  private jar = new CookieJar();
  constructor(private creds: ClasscardCreds, private cfg: ClasscardConfig) {}

  private async get(path: string): Promise<Response> {
    const resp = await fetch(`${BASE}${path}`, { headers: { ...UA, Cookie: this.jar.header() } });
    this.jar.store(resp.headers.getSetCookie());
    return resp;
  }
  private async postForm(path: string, form: Record<string, string>, extra: Record<string, string> = {}): Promise<Response> {
    const resp = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded", Cookie: this.jar.header(), ...extra },
      body: new URLSearchParams(form),
    });
    this.jar.store(resp.headers.getSetCookie());
    return resp;
  }

  async login(): Promise<void> {
    const page = await this.get("/login");
    const html = await page.text();
    const m = /name=["']sess_key["']\s+value=["']([^"']+)["']/i.exec(html)
      || /value=["']([^"']+)["']\s+name=["']sess_key["']/i.exec(html);
    if (!m) throw new Error("클래스카드 sess_key 없음 (로그인 페이지 구조 변경)");
    const resp = await this.postForm("/LoginProc", {
      sess_key: m[1], login_id: this.creds.loginId, login_pwd: this.creds.loginPw, redirect: "",
    });
    const result = await resp.json().catch(() => ({}));
    if (result?.result !== "ok") throw new Error(`클래스카드 로그인 실패: ${result?.msg ?? JSON.stringify(result)}`);
  }

  private async downloadRows(path: string, form: Record<string, string>, referer: string): Promise<unknown[][]> {
    const resp = await this.postForm(path, form, { Referer: `${BASE}${referer}` });
    const buf = Buffer.from(await resp.arrayBuffer());
    // 로그인 만료/차단 시 HTML·JSON이 돌아올 수 있음 → 엑셀 시그니처(OLE2/ZIP)만 파싱
    const sig = buf.subarray(0, 2).toString("latin1");
    if (sig !== "PK" && buf.subarray(0, 4).toString("hex") !== "d0cf11e0") {
      throw new Error(`엑셀 아님(차단/만료 의심): ${buf.subarray(0, 80).toString("utf8")}`);
    }
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
  }

  // 듣기평가 (gClass, kind:"듣기") — 리포트 페이지 HTML 파싱 (엑셀 다운로드가 빈 파일을 반환하는 반)
  async scrapeGClassListening(gClassIdx: string, dateKst: string): Promise<RosterEntry[]> {
    const resp = await this.get(`/GClass/report/${gClassIdx}`);
    return parseListeningReport(await resp.text(), dateKst);
  }

  // 문법 (gClass) — 오늘 학습한 학생별 유닛. typeLabel 로 문법·듣기 구분.
  async scrapeGClass(gClassIdx: string, dateKst: string, typeLabel = "문법"): Promise<RosterEntry[]> {
    const rows = await this.downloadRows(
      "/GClass/getReportToExcel",
      { g_class_idx: gClassIdx, b_s_idx: this.cfg.bSIdx, from_date: dateKst, to_date: dateKst, is_include_teacher: "1" },
      `/GClass/report/${gClassIdx}`,
    );
    const h = headerIndex(rows);
    const cId = h["아이디"]; const cName = h["학생이름"]; const cUnit = h["유닛명"];
    const cStart = h["학습시작"]; const cEnd = h["학습종료"];
    const knownCols = new Set([h["아이디"], h["학생이름"], h["클래스명"], h["유닛명"], h["학습시작"], h["학습종료"]]);
    const byId = new Map<string, RosterEntry>();
    for (const row of rows.slice(1)) {
      const loginId = String(row[cId] ?? "").toLowerCase().trim();
      if (!loginId) continue;
      const start = String(row[cStart] ?? ""); const end = String(row[cEnd] ?? "");
      if (!start.startsWith(dateKst) && !end.startsWith(dateKst)) continue; // 오늘만
      const scores: Record<string, number | string> = {};
      row.forEach((cell, i) => {
        if (knownCols.has(i)) return;
        const parsed = parseScoreCell(String(cell ?? ""));
        if (parsed) scores[parsed.label] = parsed.value;
      });
      const entry = byId.get(loginId) ?? { loginId, name: String(row[cName] ?? "").trim(), units: [] };
      entry.units.push({
        type: typeLabel,
        unitLabel: String(row[cUnit] ?? typeLabel).trim() || typeLabel,
        studyMinutes: minutesBetween(start, end),
        avgScore: null,
        completed: true, // 오늘 학습 흔적 = 완료(점수 무관)
        scores,
      });
      byId.set(loginId, entry);
    }
    return [...byId.values()];
  }

  // 어휘·본문·듣기 (classMain) — 오늘 학습한 학생별 세트
  async scrapeClassMain(classIdx: string, dateKst: string): Promise<RosterEntry[]> {
    const rows = await this.downloadRows(
      "/ClassReports/userReportToExcel",
      { class_idx: classIdx, mem_sort: "1", view_date: dateKst, save_scope: "2" },
      `/ClassReports/${classIdx}`,
    );
    // 학습일은 "6/17 13:30"처럼 월 0-패딩 없음 → 월/일을 숫자로 비교
    const [, mmStr, ddStr] = dateKst.split("-");
    const todayMonth = parseInt(mmStr, 10); const todayDay = parseInt(ddStr, 10);
    const h = headerIndex(rows);
    const cId = h["아이디"]; const cName = h["학생이름"]; const cSet = h["세트명"]; const cDay = h["학습일"];
    const cDone = h["완료여부"];
    const scoreCols = ["암기학습(%)", "리콜학습(%)", "스펠학습(%)", "스피킹(%)", "AI 평가 점수"]
      .map((k) => ({ key: k.replace("학습(%)", "").replace("(%)", ""), i: h[k] }))
      .filter((c) => c.i != null);
    const byId = new Map<string, RosterEntry>();
    for (const row of rows.slice(1)) {
      const loginId = String(row[cId] ?? "").toLowerCase().trim();
      if (!loginId) continue;
      const day = String(row[cDay] ?? "").trim(); // "M/D HH:MM"
      const dm = /(\d{1,2})\/(\d{1,2})/.exec(day);
      if (!dm || parseInt(dm[1], 10) !== todayMonth || parseInt(dm[2], 10) !== todayDay) continue; // 오늘 학습한 세트만
      const scores: Record<string, number | string> = {};
      for (const c of scoreCols) {
        const v = String(row[c.i] ?? "").trim();
        if (v && v !== "-") scores[c.key] = v;
      }
      const done = cDone != null ? String(row[cDone] ?? "").includes("완료") : false;
      const entry = byId.get(loginId) ?? { loginId, name: String(row[cName] ?? "").trim(), units: [] };
      entry.units.push({
        type: "어휘/본문",
        unitLabel: String(row[cSet] ?? "클래스카드").trim() || "클래스카드",
        studyMinutes: 0,
        avgScore: null,
        completed: true, // 오늘 학습 흔적 = 완료(점수 무관). done 은 참고용.
        scores: done ? { ...scores, 완료여부: "완료" } : scores,
      });
      byId.set(loginId, entry);
    }
    return [...byId.values()];
  }
}

// 반 전체 명단 수집 (loginId → { name, units }) — 오늘 활동 있는 학생만
async function collectRoster(
  client: ClasscardClient,
  cfg: ClasscardConfig,
  dateKst: string,
): Promise<Map<string, { name: string; units: ClasscardUnit[] }>> {
  const roster = new Map<string, { name: string; units: ClasscardUnit[] }>();
  for (const cls of cfg.classes) {
    try {
      const entries = cls.type === "classMain"
        ? await client.scrapeClassMain(cls.classIdx!, dateKst)
        : cls.kind === "듣기"
          ? await client.scrapeGClassListening(cls.gClassIdx!, dateKst)
          : await client.scrapeGClass(cls.gClassIdx!, dateKst, cls.kind ?? "문법");
      for (const e of entries) {
        const cur = roster.get(e.loginId) ?? { name: "", units: [] };
        if (!cur.name && e.name) cur.name = e.name;
        cur.units.push(...e.units);
        roster.set(e.loginId, cur);
      }
    } catch (e) {
      functions.logger.warn("[classcard] 클래스 스크랩 실패", { name: cls.name, error: String(e) });
    }
  }
  return roster;
}

function statusOf(units: ClasscardUnit[]): ClasscardResult["autoStatus"] {
  let status = "시작전";
  for (const u of units) status = higherStatus(status, u.completed ? "완료" : "진행중");
  return status as ClasscardResult["autoStatus"];
}

// 스크랩 unit.type → 과제 partSlug (site.ts classcard-middle parts).
//   어휘/본문은 리포트에서 구분 불가 → vocab·exam-prep 둘 다 인정.
const CLASSCARD_TYPE_TO_PARTS: Record<string, string[]> = {
  "듣기": ["listening"],
  "문법": ["grammar"],
  "어휘/본문": ["vocab", "exam-prep"],
};

/** 오늘 완료한 unit들이 커버하는 과제 partSlug 집합 (파트 단위 자동체크용). */
export function classcardDonePartSlugs(units: Array<{ type?: string; completed?: boolean }>): string[] {
  const parts = new Set<string>();
  for (const u of units) {
    if (u.completed === false) continue;
    for (const p of CLASSCARD_TYPE_TO_PARTS[u.type ?? ""] ?? []) parts.add(p);
  }
  return [...parts];
}

/**
 * 교사 계정으로 로그인해 대상 학생의 오늘 클래스카드 활동을 가져온다(클릭 실시간용).
 * 외부 아이디가 없으면 반 명단에서 학생 이름으로 폴백 매칭한다.
 * @param dateKst "YYYY-MM-DD"
 */
export async function scrapeClasscardForStudent(
  creds: ClasscardCreds,
  cfg: ClasscardConfig,
  externalLoginId: string,
  dateKst: string,
  studentName?: string,
): Promise<ClasscardResult & { matchedLoginId?: string }> {
  const client = new ClasscardClient(creds, cfg);
  await client.login();
  const roster = await collectRoster(client, cfg, dateKst);

  let resolved = externalLoginId.toLowerCase().trim();
  if (!resolved && studentName?.trim()) {
    const nm = studentName.replace(/\s+/g, "");
    for (const [lid, v] of roster) {
      const nn = (v.name ?? "").replace(/\s+/g, "");
      if (nn && (nn === nm || nn.endsWith(nm) || nn.includes(nm))) { resolved = lid; break; }
    }
  }

  const units = resolved ? (roster.get(resolved)?.units ?? []) : [];
  const totalMinutes = units.reduce((a, u) => a + u.studyMinutes, 0);
  return {
    autoStatus: statusOf(units),
    units,
    totalStudyMinutes: totalMinutes,
    matchedLoginId: resolved || undefined,
  };
}

/**
 * 교사 계정 로그인 1회로 오늘 학습한 전체 학생을 반환한다(스케줄 배치용).
 */
export async function scrapeClasscardAll(
  creds: ClasscardCreds,
  cfg: ClasscardConfig,
  dateKst: string,
): Promise<Array<{ loginId: string; name: string; autoStatus: ClasscardResult["autoStatus"]; units: ClasscardUnit[] }>> {
  const client = new ClasscardClient(creds, cfg);
  await client.login();
  const roster = await collectRoster(client, cfg, dateKst);
  return [...roster.entries()]
    .filter(([, v]) => v.units.length)
    .map(([loginId, v]) => ({ loginId, name: v.name, autoStatus: statusOf(v.units), units: v.units }));
}
