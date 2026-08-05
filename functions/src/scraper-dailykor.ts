import { parse } from "node-html-parser";
import * as functions from "firebase-functions";

// 매일국어(dailykor) 스크래퍼 Node 이식.
//   Laravel 로그인(_token CSRF) → sreport 페이지 meta csrf → ajax_sreport(중고등/초등) → 오늘 셀 파싱.
//   학생은 이름으로 매칭(리포트 행에 이름 포함).

const BASE = "https://www.dailykor.com";
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" };

export type DailykorCreds = { id: string; pw: string };

// 오늘의 학습 지문 1개 상세
export type DailykorPassage = {
  passageCode?: string;   // 지문 코드 "B000220"
  type?: string;          // 학습 유형 "비문학 > 사회"
  accuracy?: string;      // 정답률 (실전 문제풀이) "50%"
  // 리포트 셀 원본은 "4473/분 1342자 / 18초" (분당독해속도 / 글자 수 / 독해 시간)
  readingSpeed?: string;   // 분당 독해속도 "620/분"
  readingChars?: number;   // 지문 글자 수 1342 (독해속도 산출 근거)
  readingElapsed?: string; // 실제 읽은 시간 "18초" (독해훈련 시간과 다름)
  prepTime?: string;      // 준비훈련 시간
  readingTime?: string;   // 독해훈련 시간
  practiceTime?: string;  // 실전대비훈련 시간
};

// 오늘의 학습 일별 상세 (ajax_calendar_dailyreport 파싱). 중고등 리포트 전용.
// 하루에 여러 지문 학습 시 지문별로 배열(리포트가 지문=열 매트릭스 구조).
export type DailykorDetail = {
  passages?: DailykorPassage[];  // 오늘 학습한 지문들 (열 단위)
  xp?: string;                   // 오늘 총 획득/최대 경험치 "18xp / 30xp"
  recommendedSpeed?: number;     // 리포트 각주의 추천 분당 독해속도 600 (매일국어 기준)
  // ── 리워드(품질·뱃지) 판정용 ──
  xpGot?: number;                // 14
  xpMax?: number;                // 30  → 달성률 = got/max 가 품질 Q의 기준축
  /** 단계별 경험치 — 준비/독해/실전 각각의 획득·최대 */
  stepXp?: Array<{ step: string; got: number; max: number }>;
};

/**
 * 초등 '오늘의 학습' 회차 한 건 (과목별).
 * 중등은 지문 단위(passages)지만 초등은 과목 단위라 스키마를 따로 둔다.
 */
export type DailykorElementaryRound = {
  date: string | null;
  round: number | null;      // 회차
  subject: string;           // 국어 · 사회 · 과학 …
  wordStars: number | null;  // 단어 별 1~5
  bookStars: number | null;  // 교과서 별
  testStars: number | null;  // 실전 별
  firstPoint: number | null; // 최초 점수
  reviewPoint: number | null;// 복습 점수
  reviewDate: string | null;
  /** 학습 시작·종료 시각 "HH:MM" (studylist 경로에서만 채워진다) */
  startAt?: string | null;
  endAt?: string | null;
  /** 별 뒤의 실제 점수 (studylist 경로에서만) */
  wordScore?: number | null;
  bookScore?: number | null;
  testScore?: number | null;
};

// 어휘력 센터 완료 세트 (누적) — { category:"문학", sets:["08","09"] }
// grades: sets와 같은 순서의 등급 class (verygood=100% / good=99~85 / normal=84~70 / nogood=69↓)
export type DailykorVocaItem = { category: string; sets: string[]; grades?: string[]; categoryComplete?: boolean };

export type DailykorResult = {
  autoStatus: "시작전" | "진행중" | "완료";
  /** 그 달 날짜별 상태 ("YYYY-MM-DD" → "완료"|"진행중"). 과거 날짜 만회 판정용. */
  monthStatus?: Record<string, string>;
  units: Array<{ unitLabel: string; completed: boolean; scores: Record<string, number | string> }>;
  totalStudyMinutes: number;
  matchedName?: string;
  detail?: DailykorDetail | null;
  /** 초등 전용 — 과목별 회차 결과 (중등의 detail.passages에 대응) */
  elementary?: DailykorElementaryRound[] | null;
  voca?: DailykorVocaItem[] | null;
};

const STATUS_RANK: Record<string, number> = { 시작전: 0, 진행중: 1, 완료: 2 };
function higher(a: string, b: string) { return (STATUS_RANK[a] ?? 0) >= (STATUS_RANK[b] ?? 0) ? a : b; }

// 이 스크래퍼가 읽는 sreport는 "오늘의 학습" 성적표만 반영(어휘력 센터는 리포트에 없음).
// → 자동 완료는 daily 파트 과제만 인정 (vocab-center는 수동 체크 유지).
export const DAILYKOR_REPORT_PARTS = ["daily"];

// 셀에 색이 있으면 오늘의 학습을 끝낸 것 → 성취 수준(최우수~미흡)과 무관하게 모두 "완료" 인정.
// 수준 차이는 COLOR_TO_GRADE의 등급으로 넘겨 카드에서 색으로만 구분한다.
const COLOR_TO_STATUS: Record<string, string> = {
  "bg-primary": "완료", "bg-success": "완료", "bg-secondary": "완료",
  "bg-warning": "완료", "bg-danger": "완료",
};
const COLOR_TO_GRADE: Record<string, string> = {
  "bg-primary": "최우수", "bg-success": "양호", "bg-warning": "보통", "bg-danger": "미흡", "bg-secondary": "완료",
};

class Jar {
  private m = new Map<string, string>();
  store(cs: string[]) { for (const c of cs) { const p = c.split(";")[0]; const i = p.indexOf("="); if (i > 0) this.m.set(p.slice(0, i).trim(), p.slice(i + 1).trim()); } }
  header() { return [...this.m].map(([k, v]) => `${k}=${v}`).join("; "); }
}

function norm(s: unknown) { return String(s ?? "").replace(/\s+/g, ""); }

type DkSession = {
  get: (path: string, extra?: Record<string, string>) => Promise<Response>;
  postForm: (path: string, form: Record<string, string>, extra?: Record<string, string>) => Promise<Response>;
  /** 절대 URL 요청 — 초등 상세 API는 app/api 호스트라 BASE 접두가 맞지 않는다. */
  absGet: (url: string, extra?: Record<string, string>) => Promise<Response>;
  csrf: string;
};

type NameInfo = { status: string; scores: Record<string, number | string>; idx?: string; kind?: "mh" | "el"; elCell?: string; elRow?: string };
// 이름 → { "YYYY-MM-DD": "완료"|"진행중" } — 그 달에 학습 흔적이 있는 날짜만 (시작전은 미수록)
export type MonthByName = Record<string, Record<string, string>>;

// 로그인 → 인증된 세션(get/postForm + csrf) 반환. 리포트·상세가 같은 쿠키 세션을 재사용.
async function dailykorLogin(creds: DailykorCreds): Promise<DkSession> {
  const jar = new Jar();
  // 리다이렉트를 수동으로 따라가며 각 홉의 쿠키를 저장 (Node fetch의 follow는 중간 홉 Set-Cookie를 잃음)
  const doFetch = async (path: string, init: { method?: string; body?: URLSearchParams; headers?: Record<string, string> }) => {
    let url = `${BASE}${path}`;
    let method = init.method ?? "GET";
    let body: URLSearchParams | undefined = init.body;
    for (let i = 0; i < 6; i++) {
      const r: Response = await fetch(url, { method, headers: { ...UA, ...(init.headers ?? {}), Cookie: jar.header() }, body, redirect: "manual" });
      jar.store(r.headers.getSetCookie());
      const loc = r.headers.get("location");
      if (r.status >= 300 && r.status < 400 && loc) {
        url = new URL(loc, url).toString();
        method = "GET"; body = undefined;
        continue;
      }
      return r;
    }
    throw new Error("매일국어 리다이렉트 과다");
  };
  const get = (path: string, extra: Record<string, string> = {}) => doFetch(path, { headers: extra });
  const postForm = (path: string, form: Record<string, string>, extra: Record<string, string> = {}) =>
    doFetch(path, { method: "POST", body: new URLSearchParams(form), headers: { "Content-Type": "application/x-www-form-urlencoded", ...extra } });

  const loginPage = await get("/academy");
  const tok = parse(await loginPage.text()).querySelector('input[name="_token"]')?.getAttribute("value");
  if (!tok) throw new Error("매일국어 _token 없음 (로그인 페이지 구조 변경)");
  await postForm("/academy/auth/login", { _token: tok, id: creds.id, password: creds.pw, save_login: "T" }, { Referer: `${BASE}/academy` });

  const sreport = await get("/academy/student/sreport");
  const sreportHtml = await sreport.text();
  if (!sreportHtml.includes("로그아웃") && sreportHtml.includes("학원 로그인")) throw new Error("매일국어 로그인 실패");
  const csrf = parse(sreportHtml).querySelector('meta[name="csrf-token"]')?.getAttribute("content");
  if (!csrf) throw new Error("매일국어 csrf meta 없음");

  const absGet = (url: string, extra: Record<string, string> = {}) =>
    fetch(url, { headers: { ...UA, ...extra, Cookie: jar.header() }, redirect: "manual" });

  return { get, postForm, absGet, csrf };
}

// 리포트 파싱 → { 이름: { status, scores, idx, kind } } (전체 학생). idx/kind는 일별 상세 조회용.
// 리포트는 원래 월 단위로 받으므로, 같은 응답에서 날짜별 상태(monthByName)도 함께 모은다.
// 매일국어는 날짜마다 다른 지문을 배정하고 그 날짜 칸에 결과를 기록하므로,
// 지난 날짜 지문을 나중에 하면 그 날짜 칸이 채워진다 → 과거 날짜 만회 판정에 쓴다.
async function reportByName(session: DkSession, dateKst: string): Promise<{ byName: Record<string, NameInfo>; monthByName: MonthByName }> {
  const ym = dateKst.slice(0, 7);
  const byName: Record<string, NameInfo> = {};
  const monthByName: MonthByName = {};

  // 리포트 파싱 (중고등 + 초등). 일별 상세(지문코드 등)는 중고등(mh) 리포트만 지원.
  const reports = [
    { path: "/academy/student/ajax_sreport", ref: "/academy/student/sreport", tdClass: "btn_dailyreport", dateAttr: "data-study_date", kind: "mh" as const },
    { path: "/academy/elementary/ajax_sreport_tab1", ref: "/academy/elementary/sreport", tdClass: "btn_learning_modal", dateAttr: "data-date_round", kind: "el" as const },
  ];

  for (const rep of reports) {
    try {
      const r = await session.postForm(rep.path, { filter_sdate: ym }, { "X-Requested-With": "XMLHttpRequest", "X-CSRF-TOKEN": session.csrf, Referer: `${BASE}${rep.ref}` });
      if (r.status !== 200) continue;
      const root = parse(await r.text());
      for (const row of root.querySelectorAll("tr")) {
        const tds = row.querySelectorAll("td");
        if (tds.length < 3 || !/^\d+$/.test((tds[0].text ?? "").trim())) continue;
        const name = (tds[1]?.text ?? "").trim();
        if (!name) continue;
        for (const td of row.querySelectorAll(`td.${rep.tdClass}`)) {
          const cellDate = td.getAttribute(rep.dateAttr) ?? "";
          if (!cellDate) continue;
          const cls = (td.getAttribute("class") ?? "").split(/\s+/);
          let status = "시작전"; let grade: string | null = null;
          for (const c of cls) { if (COLOR_TO_STATUS[c]) { status = COLOR_TO_STATUS[c]; grade = COLOR_TO_GRADE[c]; break; } }
          // 날짜별 상태는 전 날짜 수집 (오늘 칸만 쓰던 기존 동작과 별개)
          if (status !== "시작전") {
            const m = (monthByName[name] ??= {});
            m[cellDate] = higher(m[cellDate] ?? "시작전", status);
          }
          if (cellDate !== dateKst) continue;
          const scoreText = (td.text ?? "").trim();
          const score = /^\d+$/.test(scoreText) ? parseInt(scoreText, 10) : null;
          const scores: Record<string, number | string> = {};
          if (grade) scores["등급"] = grade;
          if (score != null) scores["점수"] = score;
          const idx = td.getAttribute("data-student_idx") ?? undefined;
          const prev = byName[name];
          byName[name] = {
            status: higher(prev?.status ?? "시작전", status),
            scores: { ...(prev?.scores ?? {}), ...scores },
            idx: idx ?? prev?.idx,
            kind: rep.kind,
            // [조사용] 초등 모달이 어떤 속성으로 상세를 여는지 보려고 원문을 남긴다
            elCell: rep.kind === "el" ? td.outerHTML?.slice(0, 800) : prev?.elCell,
            elRow: rep.kind === "el" ? row.outerHTML?.slice(0, 2500) : prev?.elRow,
          };
        }
      }
    } catch (e) {
      functions.logger.warn("[dailykor] 리포트 실패", { path: rep.path, error: String(e) });
    }
  }

  return { byName, monthByName };
}

// 오늘의 학습 일별 상세: 지문코드·유형·정답률·독해속도·경험치·훈련시간 (중고등 리포트 셀의 data-student_idx 사용)
async function fetchDailykorDetail(session: DkSession, idx: string, dateKst: string): Promise<DailykorDetail | null> {
  try {
    const r = await session.get(`/academy/student/ajax_calendar_dailyreport/${idx}/${dateKst}`, { "X-Requested-With": "XMLHttpRequest", Referer: `${BASE}/academy/student/sreport` });
    if (r.status !== 200) return null;
    const data = JSON.parse(await r.text());
    if (data?.result !== "T" || !data.html) return null;
    return parseDailykorDetail(String(data.html));
  } catch (e) {
    functions.logger.warn("[dailykor] 상세 실패", { idx, error: String(e) });
    return null;
  }
}

/**
 * 초등 일별 상세 — 학원 리포트 셀(btn_learning_modal)이 여는 것과 같은 엔드포인트.
 *   GET /academy/elementary/ajax_dailyreport/{student_idx}/date/{YYYY-MM-DD}  → { code, html }
 * www 호스트·학원 세션 그대로라 별도 토큰이 필요 없다(앱 API는 Access-Token이 따로 필요해 쓰지 않는다).
 *
 * 표: 학습일자 · 회차 · 과목 · 단어 · 교과서 · 실전 · 최초점수 · 복습점수 · 복습일자
 * 별은 <div class="main_stars"><i class="s3"></i></div> 형태로 s1~s5.
 */
/**
 * 초등 학습 목록 — 시작·종료 시각과 별 뒤의 실제 점수까지 있는 경로.
 *   GET /academy/elementary/studylist/{student_idx}
 * 학원 세션으로 열면 앱(app.dailykor.com)으로 **토큰이 붙은 채** 리다이렉트된다.
 * 그 토큰으로 앱 API(learning_history/academy)를 부르면 JSON을 그대로 받을 수 있다.
 * 실패하면 null → 호출부가 기존 ajax_dailyreport 경로로 폴백한다.
 */
async function fetchElementaryStudyList(
  session: DkSession, idx: string, dateKst: string,
): Promise<DailykorElementaryRound[] | null> {
  try {
    // 리다이렉트를 따라가며 token/api_key 를 회수
    let url = `${BASE}/academy/elementary/studylist/${idx}`;
    let token = "", apiKey = "";
    for (let i = 0; i < 6; i++) {
      const r = await session.absGet(url, { Referer: `${BASE}/academy/elementary/sreport` });
      const loc = r.headers.get("location");
      if (!(r.status >= 300 && r.status < 400 && loc)) break;
      url = new URL(loc, url).toString();
      const q = new URL(url).searchParams;
      token = q.get("token") ?? token;
      apiKey = q.get("api_key") ?? apiKey;
    }
    if (!token) return null;

    const call = async (path: string) => {
      const r = await session.absGet(`https://dailykor.com/api/${path}`, {
        "Access-Token": token, ...(apiKey ? { "Api-Key": apiKey } : {}),
        Accept: "application/json", Referer: "https://app.dailykor.com/",
      });
      if (r.status !== 200) return null;
      try { return JSON.parse(await r.text()); } catch { return null; }
    };

    // 학년/학기/개정은 meta에서 오므로 먼저 기본 호출로 받아온다
    const first = await call(`learning_history/academy/${idx}`);
    const gt = first?.meta?.grade_term;
    let rows = first?.data?.learning_history;
    if (!rows && Array.isArray(gt) && gt.length) {
      const g = gt[gt.length - 1];
      const second = await call(`learning_history/academy/${idx}/${g.grade}/${g.term}/${g.version ?? ""}`);
      rows = second?.data?.learning_history;
    }
    if (!Array.isArray(rows)) return null;

    const hhmm = (v: unknown) => {
      const m = String(v ?? "").match(/\d{2}:\d{2}/);
      return m ? m[0] : null;
    };
    const nz = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

    return rows
      .filter((r: Record<string, unknown>) => String(r?.date ?? "").slice(0, 10) === dateKst)
      .map((r: Record<string, unknown>) => ({
        date: String(r.date ?? "").slice(0, 10) || null,
        round: nz(r.round),
        subject: String(r.subject ?? ""),
        wordStars: null, bookStars: null, testStars: null,
        wordScore: nz(r.voca), bookScore: nz(r.training), testScore: nz(r.question),
        firstPoint: nz(r.first_point),
        reviewPoint: nz(r.last_point) !== nz(r.first_point) ? nz(r.last_point) : null,
        reviewDate: r.restudy_date ? String(r.restudy_date).slice(0, 10) : null,
        startAt: hhmm(r.start_date),
        endAt: hhmm(r.end_date),
      }))
      .filter((r) => r.subject);
  } catch (e) {
    functions.logger.warn("[dailykor] 초등 studylist 실패", { idx, error: String(e) });
    return null;
  }
}

async function fetchDailykorDetailElementary(
  session: DkSession, idx: string, dateKst: string,
): Promise<DailykorElementaryRound[] | null> {
  // 시작·종료 시각과 실제 점수까지 주는 경로를 먼저 시도하고, 안 되면 모달(별)로 폴백
  const rich = await fetchElementaryStudyList(session, idx, dateKst);
  if (rich?.length) return rich;
  try {
    const r = await session.get(`/academy/elementary/ajax_dailyreport/${idx}/date/${dateKst}`,
      { "X-Requested-With": "XMLHttpRequest", Referer: `${BASE}/academy/elementary/sreport` });
    const raw = await r.text();
    let rounds: DailykorElementaryRound[] = [];
    try {
      const data = JSON.parse(raw);
      if (data?.html) rounds = parseDailykorElementary(String(data.html));
    } catch { /* JSON 아님 → 아래 진단 로그로 확인 */ }
    if (!rounds.length) {
      functions.logger.warn("[dailykor] 초등 상세 비어있음", {
        idx, dateKst, status: r.status, len: raw.length, head: raw.slice(0, 400),
      });
    }
    return rounds.length ? rounds : null;
  } catch (e) {
    functions.logger.warn("[dailykor] 초등 상세 실패", { idx, error: String(e) });
    return null;
  }
}

/** main_stars 안의 <i class="sN"> → N (없으면 null). */
function starsOf(td: ReturnType<typeof parse>): number | null {
  const i = td.querySelector(".main_stars i") ?? td.querySelector("i");
  const m = (i?.getAttribute("class") ?? "").match(/\bs([1-5])\b/);
  return m ? Number(m[1]) : null;
}

export function parseDailykorElementary(html: string): DailykorElementaryRound[] {
  const root = parse(html);
  const txt = (n?: { text?: string }) => (n?.text ?? "").replace(/\s+/g, " ").trim();
  const num = (v: string) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
  const out: DailykorElementaryRound[] = [];

  for (const tr of root.querySelectorAll("tbody tr")) {
    const tds = tr.querySelectorAll("td");
    if (tds.length < 7) continue;
    const subject = txt(tds[2]);
    if (!subject) continue;
    out.push({
      date: txt(tds[0]) || null,
      round: num(txt(tds[1])),
      subject,
      wordStars: starsOf(tds[3]),
      bookStars: starsOf(tds[4]),
      testStars: starsOf(tds[5]),
      firstPoint: num(txt(tds[6])),
      reviewPoint: num(txt(tds[7] ?? { text: "" })),
      reviewDate: txt(tds[8] ?? { text: "" }).replace(/^-$/, "") || null,
    });
  }
  return out;
}

// 리포트는 "지문 = 열(column)" 매트릭스 테이블. thead의 지문 컬럼 헤더, tbody 각 지표 행의
// 마지막 N개 td(=지문 컬럼 값)를 열별로 모아 지문마다 하나의 상세로 만든다.
function parseDailykorDetail(html: string): DailykorDetail {
  const root = parse(html);
  const norm = (c?: { text?: string }) => (c?.text ?? "").replace(/\s+/g, " ").trim();
  const table = root.querySelector("table.tbl_daily") ?? root;

  // 지문 컬럼 헤더: 첫 th(colspan=2 라벨칸) 이후가 지문 열. 코드 있으면 지문, 없으면 빈 슬롯(null)
  const headTh = (table.querySelector("thead tr")?.querySelectorAll("th") ?? []).map(norm);
  const cols = headTh.slice(1).map((t) => {
    const m = t.match(/[A-Z]\d{4,6}/);
    if (!m) return null;
    const type = t.slice(0, t.indexOf(m[0])).trim() || undefined;
    return { passageCode: m[0], type } as DailykorPassage;
  });
  const nCols = cols.length; // 값 td 개수(빈 컬럼 포함)

  // 라벨 행 → 지문 열별 값 배열(각 값행의 마지막 nCols개 td)
  const bodyRows = table.querySelectorAll("tbody tr");
  const rowVals = (labelRe: RegExp): string[] => {
    for (const tr of bodyRows) {
      const label = tr.querySelectorAll("th").map(norm).join(" ");
      if (!labelRe.test(label)) continue;
      const tds = tr.querySelectorAll("td").map(norm);
      return tds.slice(Math.max(0, tds.length - nCols));
    }
    return [];
  };
  const clean = (v?: string) => (v && v !== "-" ? v : undefined);

  const accuracy = rowVals(/실전\s*문제풀이\s*정답률/);
  const speed = rowVals(/분당\s*독해속도/);
  const prep = rowVals(/준비\s*훈련\s*시간/);
  const reading = rowVals(/독해\s*훈련\s*시간/);
  const practice = rowVals(/실전\s*대비\s*훈련\s*시간/);

  const passages: DailykorPassage[] = [];
  for (let j = 0; j < nCols; j++) {
    if (!cols[j]) continue; // 빈 컬럼
    // Firestore는 undefined를 거부 → 값 있는 필드만 담는다
    const p: DailykorPassage = { passageCode: cols[j]!.passageCode };
    if (cols[j]!.type) p.type = cols[j]!.type;
    const acc = clean(accuracy[j]); if (acc) p.accuracy = acc;
    // 셀 원본 "4473/분 1342자 / 18초" → 속도 + 근거(글자 수·읽은 시간)
    const rawSpeed = speed[j] ?? "";
    const spd = rawSpeed.match(/\d+\s*\/\s*분/)?.[0].replace(/\s+/g, ""); if (spd) p.readingSpeed = spd;
    const chars = Number(rawSpeed.match(/(\d[\d,]*)\s*자/)?.[1].replace(/,/g, ""));
    if (Number.isFinite(chars) && chars > 0) p.readingChars = chars;
    const elapsed = rawSpeed.match(/자\s*\/\s*([\d]+분(?:\s*\d+초)?|[\d]+초)/)?.[1].trim();
    if (elapsed) p.readingElapsed = elapsed;
    const pt = clean(prep[j]); if (pt) p.prepTime = pt;
    const rt = clean(reading[j]); if (rt) p.readingTime = rt;
    const prt = clean(practice[j]); if (prt) p.practiceTime = prt;
    passages.push(p);
  }

  const detail: DailykorDetail = { passages };
  const flat = root.text.replace(/\s+/g, " ");
  // 오늘 총 획득/최대 경험치 ("오늘 획득 경험치(최대 획득 경험치) 18xp(30xp)") — 표 밖 modal-footer
  const xpm = flat.match(/오늘 획득 경험치[^0-9]*(\d+)xp\s*\(\s*(\d+)xp/);
  if (xpm) {
    detail.xp = `${xpm[1]}xp / ${xpm[2]}xp`;
    detail.xpGot = parseInt(xpm[1], 10);
    detail.xpMax = parseInt(xpm[2], 10);
  }

  // 단계별 경험치 — 표 안의 '획득 경험치' 행을 섹션(준비/독해/실전)과 짝지어 읽는다.
  // (flat 텍스트 정규식으로 긁으면 표 밖 합계 문구가 섞여 들어와 단계가 밀린다)
  const stepXp: Array<{ step: string; got: number; max: number }> = [];
  let section = "";
  for (const tr of bodyRows) {
    const label = tr.querySelectorAll("th").map(norm).join(" ");
    if (/준비\s*훈련/.test(label)) section = "준비";
    else if (/독해\s*훈련/.test(label)) section = "독해";
    else if (/실전\s*대비/.test(label)) section = "실전";
    if (!/획득\s*경험치/.test(label) || !section) continue;
    const cell = tr.querySelectorAll("td").map(norm).find((t) => /\d+\s*xp/.test(t));
    const m = cell?.match(/(\d+)\s*xp\s*\(\s*(\d+)\s*xp/);
    if (m) stepXp.push({ step: section, got: parseInt(m[1], 10), max: parseInt(m[2], 10) });
  }
  if (stepXp.length) detail.stepXp = stepXp;
  // 각주 "* 추천 분당 독해속도는 600자 이며, ..." — 기준을 우리가 정하지 않고 리포트에서 그대로 가져온다
  const rec = Number(flat.match(/추천\s*분당\s*독해속도는\s*(\d+)\s*자/)?.[1]);
  if (Number.isFinite(rec) && rec > 0) detail.recommendedSpeed = rec;

  return detail;
}

type VocaInfo = { idx?: string; studiedToday: boolean };

// 어휘력 센터 월별 리포트 → { 이름: { idx, 오늘학습여부 } } (오늘의학습 안 한 어휘-only 학생도 잡기 위함)
async function vocaByName(session: DkSession, dateKst: string): Promise<Record<string, VocaInfo>> {
  const ym = dateKst.slice(0, 7);
  const out: Record<string, VocaInfo> = {};
  try {
    const r = await session.postForm("/academy/student/ajax_sreport_voca", { filter_sdate: ym }, { "X-Requested-With": "XMLHttpRequest", "X-CSRF-TOKEN": session.csrf, Referer: `${BASE}/academy/student/sreport` });
    if (r.status !== 200) return out;
    const root = parse(await r.text());
    for (const row of root.querySelectorAll("tr")) {
      const tds = row.querySelectorAll("td");
      if (tds.length < 3 || !/^\d+$/.test((tds[0].text ?? "").trim())) continue;
      const name = (tds[1]?.text ?? "").trim();
      if (!name) continue;
      let idx = row.querySelector(".btn_voca_status")?.getAttribute("data-student_idx") ?? undefined;
      let studiedToday = false;
      for (const td of row.querySelectorAll("td.btn_voca_date")) {
        idx = idx ?? (td.getAttribute("data-student_idx") ?? undefined);
        const cls = td.getAttribute("class") ?? "";
        if ((td.getAttribute("data-study_date") ?? "") === dateKst && /bg-(primary|success|warning|danger|secondary)/.test(cls)) studiedToday = true;
      }
      out[name] = { idx, studiedToday };
    }
  } catch (e) {
    functions.logger.warn("[dailykor] voca 리포트 실패", { error: String(e) });
  }
  return out;
}

// 어휘력 센터 "오늘 한 세트": 세트별 완료 날짜가 API에 없어, 아래로 추정한다.
//   오늘 분류별 학습 횟수(ajax_voca_date) + 분류별 완료 세트 번호(순차, ajax_voca_status_detail)
//   → 각 분류에서 완료 세트 중 "마지막 N개"(N=오늘 학습 횟수) = 오늘 한 세트. (세트는 순서대로 진행)
async function fetchVocaToday(session: DkSession, idx: string, dateKst: string): Promise<DailykorVocaItem[]> {
  try {
    // 1) 오늘 분류별 학습 횟수
    const today = await fetchVocaDailyCounts(session, idx, dateKst);
    if (!today.length) return [];
    // 2) 분류(분류2) → cate_id + 진행률 매핑
    const cateMap = await fetchVocaCateMap(session, idx);
    // 3) 분류별로 완료 세트 중 마지막 N개
    const out: DailykorVocaItem[] = [];
    for (const t of today) {
      const info = cateMap[t.category];
      if (!info || t.count <= 0) continue;
      const all = await fetchVocaSetNumbers(session, idx, info.cateId);
      const picked = all.slice(-t.count);
      if (picked.length) {
        out.push({
          category: t.category,
          sets: picked.map((p) => p.set),
          grades: picked.map((p) => p.grade),
          categoryComplete: info.total > 0 && info.done >= info.total,
        });
      }
    }
    return out;
  } catch (e) {
    functions.logger.warn("[dailykor] voca 오늘 실패", { idx, error: String(e) });
    return [];
  }
}

// 오늘 분류별 학습 횟수: ajax_voca_date → [{ category:"비문학", count:1 }]
async function fetchVocaDailyCounts(session: DkSession, idx: string, dateKst: string): Promise<Array<{ category: string; count: number }>> {
  const r = await session.get(`/academy/student/ajax_voca_date/${idx}/${dateKst}`, { "X-Requested-With": "XMLHttpRequest", Referer: `${BASE}/academy/student/sreport` });
  if (r.status !== 200) return [];
  const data = JSON.parse(await r.text());
  if (data?.code !== 200 || !data.content) return [];
  const root = parse(String(data.content));
  const out: Array<{ category: string; count: number }> = [];
  for (const tr of root.querySelectorAll("tr")) {
    const cells = tr.querySelectorAll("td").map((c) => (c.text ?? "").replace(/\s+/g, " ").trim());
    if (cells.length < 2 || !cells[0] || cells[0] === "어휘 분류") continue;
    const m = cells[1].match(/(\d+)\s*\/\s*\d+/);
    if (!m) continue;
    out.push({ category: cells[0], count: parseInt(m[1], 10) });
  }
  return out;
}

// 분류(분류2) → cate_id + 진행률("19 / 19"): ajax_voca_status
async function fetchVocaCateMap(session: DkSession, idx: string): Promise<Record<string, { cateId: string; done: number; total: number }>> {
  const r = await session.get(`/academy/student/ajax_voca_status/${idx}`, { "X-Requested-With": "XMLHttpRequest", Referer: `${BASE}/academy/student/sreport` });
  if (r.status !== 200) return {};
  const data = JSON.parse(await r.text());
  if (data?.code !== 200 || !data.content) return {};
  const root = parse(String(data.content));
  const map: Record<string, { cateId: string; done: number; total: number }> = {};
  for (const tr of root.querySelectorAll("tr")) {
    const tds = tr.querySelectorAll("td");
    if (tds.length < 4) continue;
    const cate = tr.querySelector(".btn_voca_status_detail")?.getAttribute("data-cate_id");
    const name = (tds[1].text ?? "").trim();
    const prog = /(\d+)\s*\/\s*(\d+)/.exec((tds[2]?.text ?? "").trim());
    if (cate && name) {
      map[name] = { cateId: cate, done: prog ? parseInt(prog[1], 10) : 0, total: prog ? parseInt(prog[2], 10) : 0 };
    }
  }
  return map;
}

// 분류상세 격자에서 완료 세트. 세트 셀 = <td class="등급"><span>N</span></td>.
// 미완료/미학습(able·ready) 및 등급 없는 셀 제외 → 완료 세트만.
// class가 곧 정답률 등급: verygood=100% / good=99~85% / normal=84~70% / nogood=69%↓
async function fetchVocaSetNumbers(session: DkSession, idx: string, cate: string): Promise<Array<{ set: string; grade: string }>> {
  try {
    const r = await session.get(`/academy/student/ajax_voca_status_detail/${idx}/${cate}`, { "X-Requested-With": "XMLHttpRequest", Referer: `${BASE}/academy/student/sreport` });
    if (r.status !== 200) return [];
    const root = parse(await r.text());
    const done: Array<{ n: number; grade: string }> = [];
    for (const td of root.querySelectorAll("td")) {
      const t = (td.text ?? "").trim();
      if (!/^\d+$/.test(t)) continue;               // 세트 번호 셀만 (범례는 "100%" 등 → 제외)
      const cls = (td.getAttribute("class") ?? "").trim();
      if (!cls || /\b(able|ready)\b/.test(cls)) continue;  // 미완료/미학습 제외
      done.push({ n: parseInt(t, 10), grade: cls.split(/\s+/)[0] });
    }
    done.sort((a, b) => a.n - b.n);
    return done.map((d) => ({ set: String(d.n).padStart(2, "0"), grade: d.grade }));
  } catch {
    return [];
  }
}

// 이름 매칭 (정규화 후 완전/부분 일치)
function findName(names: string[], target: string): string | undefined {
  return names.find((n) => { const nn = norm(n); return nn === target || nn.endsWith(target) || nn.includes(target) || target.endsWith(nn); });
}

function toUnits(info: NameInfo) {
  return Object.keys(info.scores).length
    ? [{ unitLabel: "매일국어", completed: info.status === "완료", scores: info.scores }]
    : [];
}

// 한 학생: 이름으로 매칭 + (중고등이면) 일별 상세 조회
export async function scrapeDailykorForStudent(
  creds: DailykorCreds,
  studentName: string,
  dateKst: string,
): Promise<DailykorResult> {
  const session = await dailykorLogin(creds);
  const { byName, monthByName } = await reportByName(session, dateKst);
  const vocaMap = await vocaByName(session, dateKst);
  const target = norm(studentName);

  // 어휘력 센터: 오늘 어휘 학습했으면 오늘 한 세트를 수집
  let voca: DailykorVocaItem[] | null = null;
  const vHit = findName(Object.keys(vocaMap), target);
  if (vHit && vocaMap[vHit].studiedToday && vocaMap[vHit].idx) {
    const items = await fetchVocaToday(session, vocaMap[vHit].idx as string, dateKst);
    voca = items.length ? items : null;
  }

  // 오늘 학습이 없어도 과거 날짜를 만회했을 수 있으므로 monthStatus는 이름 매칭만 되면 반환
  const monthHit = findName(Object.keys(monthByName), target);
  const monthStatus = monthHit ? monthByName[monthHit] : undefined;

  const hitName = findName(Object.keys(byName), target);
  if (!hitName) return { autoStatus: "시작전", units: [], totalStudyMinutes: 0, voca, monthStatus };
  const info = byName[hitName];
  const detail = info.kind === "mh" && info.idx ? await fetchDailykorDetail(session, info.idx, dateKst) : null;
  const elementary = info.kind === "el" && info.idx ? await fetchDailykorDetailElementary(session, info.idx, dateKst) : null;
  return { autoStatus: info.status as DailykorResult["autoStatus"], units: toUnits(info), totalStudyMinutes: 0, matchedName: hitName, detail, elementary, voca, monthStatus };
}

// 전체 학생: 배치(스케줄러)용 — 로그인 1회로 오늘 학습한 모든 학생 반환 (중고등은 상세 포함).
// monthByName은 오늘 학습이 없는 학생도 포함 — 과거 날짜만 만회한 학생을 놓치지 않기 위함.
export async function scrapeDailykorAll(
  creds: DailykorCreds,
  dateKst: string,
): Promise<{
  students: Array<{ name: string; autoStatus: DailykorResult["autoStatus"]; units: DailykorResult["units"]; detail?: DailykorDetail | null; elementary?: DailykorElementaryRound[] | null; voca?: DailykorVocaItem[] | null }>;
  monthByName: MonthByName;
}> {
  const session = await dailykorLogin(creds);
  const { byName, monthByName } = await reportByName(session, dateKst);
  const vocaMap = await vocaByName(session, dateKst);
  const studied = Object.entries(byName).filter(([, info]) => Object.keys(info.scores).length);
  const out: Array<{ name: string; autoStatus: DailykorResult["autoStatus"]; units: DailykorResult["units"]; detail?: DailykorDetail | null; elementary?: DailykorElementaryRound[] | null; voca?: DailykorVocaItem[] | null }> = [];
  for (const [name, info] of studied) {
    const detail = info.kind === "mh" && info.idx ? await fetchDailykorDetail(session, info.idx, dateKst) : null;
    const elementary = info.kind === "el" && info.idx ? await fetchDailykorDetailElementary(session, info.idx, dateKst) : null;
    const vHit = findName(Object.keys(vocaMap), norm(name));
    const items = vHit && vocaMap[vHit].studiedToday && vocaMap[vHit].idx ? await fetchVocaToday(session, vocaMap[vHit].idx as string, dateKst) : [];
    out.push({ name, autoStatus: info.status as DailykorResult["autoStatus"], units: toUnits(info), detail, elementary, voca: items.length ? items : null });
  }
  return { students: out, monthByName };
}
