// 클래스5(class5.co.kr) 스크래퍼 — class5-homework-planner의 Class5Client 최소 이식.
//   교사 계정 로그인(sess_key) → reportHomeworkDate(일자별 전 학생 과제, is_end 포함)
//   → 재원생 명단(/academy/student)으로 std_user_idx ↔ 이름 매칭.
// 교사 계정은 클래스카드와 동일(CLASSCARD_ID/TEACHER_PW 재사용).

import { logger } from "firebase-functions";

const BASE = "https://www.class5.co.kr";
// 카테고리 판정용 세트명 → 카테고리 맵. class5-planner가 배포해 둔 라이브러리 옵션을 재사용.
const LIBRARY_OPTIONS_URL = "https://class5-planner.web.app/api/library-options";
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" };

export type Class5Creds = { id: string; pw: string };

/** 활동 한 칸. n=이름, p=그 활동의 1회 정답률 %(채점하는 활동에만 있다) */
export type Class5Step = { n: string; p?: number };

// AutoUnit(클라이언트 types.ts) 호환: type=카테고리, unitLabel=교재/유닛, completed=is_end
export type Class5Unit = {
  type: string;
  unitLabel: string;
  completed: boolean;
  // ── 리워드(품질·뱃지) 판정용 — 학생별 상세(user_hw_list)에서만 얻을 수 있다 ──
  /** 카드(단어·문장) 1회 정답률 % — 클래스5의 실질 품질 지표 (score는 완료 시 전부 100이라 못 씀) */
  cardFirstTry?: number;
  /** 과제 총 학습시간(초) */
  durationSec?: number;
  /** 게임형 활동의 raw 점수 (백분율 아님 — 문법 게임은 2~5만점대) */
  gameScore?: number;
  /** 그 과제에서 한 활동 — 클래스5 리포트의 단계 카드와 같은 항목. p 는 그 활동의 1회 정답률 % */
  steps?: Class5Step[];
  /** 배정된 활동을 하나도 빠짐없이 끝냈는지 */
  allStepsDone?: boolean;
  movieType?: string;
  startHour?: number;
  /** 학습 시작·종료 시각 "HH:MM". last_ts가 마지막(=종료) 시각이라 소요시간으로 시작을 역산한다. */
  startAt?: string;
  endAt?: string;
};

export type Class5Result = {
  autoStatus: "시작전" | "진행중" | "완료";
  units: Class5Unit[];
  totalStudyMinutes: number; // Class5는 학습시간 미제공 → 항상 0
  matchedStudentId?: string; // std_user_idx (이름 폴백 매칭 성공 시 저장용)
};

// plantor class5 서비스 파트(site.ts): phonics/song/movie/reading/writing/grammar — 카테고리와 1:1
const CLASS5_CATEGORIES = new Set(["Phonics", "Song", "Movie", "Reading", "Writing", "Grammar"]);

// 과제 유형 필터. 6=Grammar, 7=예비 — 0~5만 조회하면 Grammar 과제가 통째로 누락된다.
const HW_TYPES = "0,1,2,3,4,5,6,7";

/** 완료 유닛들이 커버하는 파트 슬러그 집합 (파트 단위 자동체크용). */
export function class5DonePartSlugs(units: Array<{ type?: string; completed?: boolean }>): string[] {
  const parts = new Set<string>();
  for (const u of units) {
    if (!u.completed) continue;
    const cat = u.type ?? "";
    if (CLASS5_CATEGORIES.has(cat)) parts.add(cat.toLowerCase());
  }
  return [...parts];
}

/** 파트별 오늘 완료 유닛 수 — 만회 판정(예정량 초과분)용. */
export function class5DonePartCounts(units: Array<{ type?: string; completed?: boolean }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const u of units) {
    if (!u.completed) continue;
    const cat = u.type ?? "";
    if (!CLASS5_CATEGORIES.has(cat)) continue;
    const p = cat.toLowerCase();
    counts[p] = (counts[p] ?? 0) + 1;
  }
  return counts;
}

// ── 쿠키 저장 ──────────────────────────────────────────────────────────────────
class Jar {
  private m = new Map<string, string>();
  store(cs: string[]) { for (const c of cs) { const p = c.split(";")[0]; const i = p.indexOf("="); if (i > 0) this.m.set(p.slice(0, i).trim(), p.slice(i + 1).trim()); } }
  header(): string { return [...this.m].map(([k, v]) => `${k}=${v}`).join("; "); }
}

// ── Class5 HTTP 클라이언트 ─────────────────────────────────────────────────────
class Class5Client {
  private jar = new Jar();
  constructor(private creds: Class5Creds) {}

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = { ...UA, ...(init.headers as Record<string, string> ?? {}) };
    const cookie = this.jar.header();
    if (cookie) headers.cookie = cookie;
    const res = await fetch(`${BASE}${path}`, { redirect: "manual", ...init, headers });
    this.jar.store(res.headers.getSetCookie?.() ?? []);
    return res;
  }

  async login(): Promise<void> {
    const page = await this.request("/login");
    const html = await page.text();
    const sessKey = /name="sess_key"\s+value="([^"]+)"/.exec(html)?.[1];
    if (!sessKey) throw new Error("class5: 로그인 페이지에서 sess_key를 찾지 못했습니다.");
    const res = await this.request("/login/proc", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ sess_key: sessKey, redirect: "", login_id: this.creds.id, login_pwd: this.creds.pw }).toString(),
    });
    const json = JSON.parse(await res.text()) as { result?: string };
    if (json.result !== "ok") throw new Error("class5: 로그인에 실패했습니다.");
  }

  /** 해당 날짜의 전 학생 과제 목록(hw_list) — is_end/progress/std_user_idx 포함. */
  async fetchDateHomework(date: string): Promise<Class5Item[]> {
    const res = await this.request(`/movie/reportHomeworkDate/${date}/${HW_TYPES}`);
    return parseVar(await res.text(), "hw_list") as Class5Item[];
  }

  /**
   * 학생 1명의 해당 날짜 과제 상세(user_hw_list) — 활동별 점수·카드별 정답 여부·학습시간 포함.
   * 날짜 단위 hw_list에는 activity_list가 없어서, 품질 판정용으로 학생당 1회 더 조회한다.
   */
  async fetchStudentHomework(studentId: string, date: string): Promise<Class5UserItem[]> {
    const res = await this.request(`/movie/reportHomework/${studentId}/${date}/${HW_TYPES}`);
    return parseVar(await res.text(), "user_hw_list") as Class5UserItem[];
  }

  /** 학원 재원생 명단: std_user_idx → 이름 ([렉사일] 접두어 제거). */
  async fetchRoster(): Promise<Map<string, string>> {
    const res = await this.request("/academy/student");
    let html = await res.text();
    // 퇴원생 섹션(collapseExit)은 활성 재원생 뒤의 단일 블록 → 잘라내고 앞부분만 파싱
    const exitIdx = html.indexOf("collapseExit");
    if (exitIdx >= 0) html = html.slice(0, exitIdx);
    const roster = new Map<string, string>();
    // 이름 칸이 행의 **첫 번째** 자식이라고 못 박으면 안 된다 — 실제로 앞에 선택 체크박스 칸이
    // 하나 생기면서 이 정규식이 0명을 반환했고, 그 뒤로 이름 매칭이 조용히 죽어 있었다.
    // 자리 대신 의미(std-name-link)로 찾는다.
    const rowRe = /<div class="[^"]*\bstd-items\b[^"]*"[^>]*?data-idx="(\d+)"[^>]*>[\s\S]{0,1500}?<a[^>]*\bstd-name-link\b[^>]*>([^<]*)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(html))) {
      const id = m[1];
      if (!id || id === "0" || roster.has(id)) continue;
      const raw = m[2].trim();
      roster.set(id, raw.replace(/^\[[^\]]*\]\s*/, "").trim() || raw);
    }
    return roster;
  }
}

type Class5Item = {
  hw_idx?: string | number;
  std_user_idx?: string | number;
  is_end?: string | number;
  progress?: string | number;
  title?: string;
  subtitle?: string;
  book_title?: string;
  movie_type?: string;
  grade?: string | number;
  last_ts?: string;      // 마지막 학습 시각 "2026-07-16 21:41:16" — 배정일 이후면 만회
};

// 학생별 상세(user_hw_list) — 활동·카드 단위 결과가 들어 있다
type Class5Card = { try_cnt?: string | number; is_correct?: string | number };
type Class5Activity = { activity?: string | number; score?: string | number; card_list?: Class5Card[] };
type Class5UserItem = Class5Item & {
  total_duration?: string | number;
  is_clear?: boolean;
  activity_list?: Class5Activity[];
};

// activity 코드 → 활동 이름. 클래스5가 리포트를 그릴 때 쓰는 표( www.class5.co.kr/scripts/homer.js )를
// 그대로 옮겼다. 코드 번호는 교재 종류(movie_type)마다 다른 뜻이라 표를 나눠 둔다.
const ACT_MOVIE: Record<number, string> = {
  1: "암기", 2: "무비보기", 3: "어순배열", 4: "딕테이션", 5: "쉐도잉", 6: "문장만들기",
  7: "더빙", 8: "더빙리허설", 9: "암기", 10: "리콜", 11: "스펠", 12: "두더지 게임", 13: "스크램블",
};
const ACT_BOOK: Record<number, string> = {
  1: "암기", 2: "리콜", 3: "스펠", 4: "문장익히기", 5: "어순배열", 6: "쉐도잉", 7: "문장만들기",
  8: "본문듣기", 9: "본문익히기", 10: "낭독", 11: "퀴즈게임", 12: "두더지 게임", 13: "스크램블",
};
const ACT_WRITE: Record<number, string> = {
  1: "암기", 2: "리콜", 3: "스펠", 4: "패턴설명", 5: "패턴듣기", 6: "패턴쉐도잉", 7: "패턴스피킹",
  8: "패턴쓰기", 9: "스크램블", 10: "두더지 게임", 11: "Write My Story", 12: "Read My Story",
};
const ACT_GRAMMAR: Record<number, string> = {
  1: "Words", 2: "Rules", 3: "Check", 4: "Practice", 5: "Upgrade", 6: "Master",
};

/**
 * 그 과제에서 한 활동들 — 이름과 **활동별 1회 정답률**.
 *
 * 정답률을 하나로 뭉치면 어느 단계에서 막혔는지 안 보인다. 카드가 활동마다 따로 오므로
 * 활동별로 계산할 수 있다. 채점하지 않는 활동(더빙·쉐도잉·무비보기)은 카드가 없어 이름만 남는다.
 * 같은 이름이 두 번 오면(무비 표의 1·9번이 둘 다 '암기') 카드를 합쳐 한 줄로 만든다.
 */
function activitySteps(movieType: string | undefined, acts: Class5Activity[]): Class5Step[] {
  const t = String(movieType ?? "");
  const table = t === "book" || t === "read" ? ACT_BOOK
    : t === "write" ? ACT_WRITE
    : t === "grammar" ? ACT_GRAMMAR
    : ACT_MOVIE;                       // phonics·song·movie 는 같은 표를 쓴다
  const acc = new Map<string, { ok: number; tot: number; graded: boolean }>();
  const unknown: unknown[] = [];
  for (const a of acts) {
    const code = Number(a.activity);
    // 송(song)만 1번이 '암기'가 아니라 '단어'다
    const name = t === "song" && code === 1 ? "단어" : table[code];
    if (!name) { unknown.push(a.activity); continue; }
    const cards = a.card_list ?? [];
    // 정답 카드가 하나도 없으면 채점 대상이 아니다(더빙·쉐도잉) — 0% 로 적으면 누명이다
    const graded = cards.some((c) => String(c.is_correct) === "1");
    const cur = acc.get(name) ?? { ok: 0, tot: 0, graded: false };
    if (graded) {
      cur.graded = true;
      cur.tot += cards.length;
      cur.ok += cards.filter((c) => String(c.try_cnt) === "1" && String(c.is_correct) === "1").length;
    }
    acc.set(name, cur);
  }
  // 표에 없는 코드가 오면 조용히 빠진다 — 클래스5가 활동을 늘렸다는 뜻이라 로그로 남긴다
  if (unknown.length) logger.warn("[class5] 모르는 activity 코드", { movieType: t, unknown });
  return [...acc].map(([n, v]) =>
    v.graded && v.tot > 0 ? { n, p: Math.round((100 * v.ok) / v.tot) } : { n });
}

/** 과제 1건의 상세 → 품질 지표. 채점하지 않는 활동(더빙 등)은 정답률 계산에서 뺀다. */
function summarizeUserItem(it: Class5UserItem): Pick<Class5Unit, "cardFirstTry" | "durationSec" | "gameScore" | "allStepsDone" | "movieType" | "startHour" | "startAt" | "endAt" | "steps"> {
  const acts = it.activity_list ?? [];
  // 정답 카드가 하나도 없는 활동 = 채점 대상이 아님(더빙·쉐도잉) → 제외하지 않으면 정답률이 부당하게 깎인다
  const graded = acts.filter((a) => (a.card_list ?? []).some((c) => String(c.is_correct) === "1"));
  const cards = graded.flatMap((a) => a.card_list ?? []);
  const firstTry = cards.length
    ? Math.round((100 * cards.filter((c) => String(c.try_cnt) === "1" && String(c.is_correct) === "1").length) / cards.length)
    : undefined;
  // 백분율 범위를 벗어나는 score는 게임 raw 점수
  const gameScores = acts.map((a) => Number(a.score)).filter((n) => Number.isFinite(n) && n > 100);
  const ts = norm(it.last_ts);
  const steps = activitySteps(it.movie_type, acts);
  return {
    cardFirstTry: firstTry,
    steps: steps.length ? steps : undefined,
    durationSec: Number(it.total_duration) || undefined,
    gameScore: gameScores.length ? Math.max(...gameScores) : undefined,
    allStepsDone: it.is_clear === true || String(it.progress) === "100",
    movieType: it.movie_type ? String(it.movie_type) : undefined,
    startHour: ts.length >= 13 ? parseInt(ts.slice(11, 13), 10) : undefined,
    ...timeRange(ts, Number(it.total_duration) || 0),
  };
}

/** last_ts는 마지막 학습 시각(=종료). 소요시간을 빼면 시작 시각이 나온다. */
function timeRange(lastTs: string, durationSec: number): { startAt?: string; endAt?: string } {
  if (lastTs.length < 16) return {};
  const endAt = lastTs.slice(11, 16);
  if (durationSec <= 0) return { endAt };
  const end = new Date(`${lastTs.slice(0, 10)}T${endAt}:00`);
  if (Number.isNaN(end.getTime())) return { endAt };
  const start = new Date(end.getTime() - durationSec * 1000);
  return { startAt: `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`, endAt };
}

// 과거 배정일 1일치 판정 (만회 확인용)
export type Class5PastDay = {
  parts: Record<string, { late: boolean }>;  // 완료된 파트 → 배정일 이후 완료 여부
  allDone: boolean;                          // 그날 배정분 전부 완료
  anyLate: boolean;
};
// std_user_idx → "YYYY-MM-DD" → 판정
export type Class5PastByStudent = Record<string, Record<string, Class5PastDay>>;

/** 페이지에 서버렌더된 `var hw_list = [...]` JS 변수를 파싱. */
function parseVar(html: string, name: string): unknown[] {
  const m = html.match(new RegExp(`var ${name} = (\\[[\\s\\S]*?\\]);`));
  return m ? (JSON.parse(m[1]) as unknown[]) : [];
}

function norm(v: unknown): string { return String(v ?? "").trim(); }

// ── 카테고리 판정 ──────────────────────────────────────────────────────────────
// 1차: 라이브러리 세트명 → 카테고리 맵 (class5-planner 배포 API, 모듈 캐시)
// 2차: movie_type/grade 휴리스틱 (planner.mjs inferCategory 폴백부와 동일)
let catMapCache: { map: Map<string, string>; ts: number } | null = null;
const CAT_MAP_TTL = 10 * 60 * 1000;

type LibraryOptions = Record<string, {
  hasLevel?: boolean;
  sets?: Array<{ value?: string }> | Record<string, Array<{ value?: string }>>;
}>;

async function getCategoryMap(): Promise<Map<string, string>> {
  if (catMapCache && Date.now() - catMapCache.ts < CAT_MAP_TTL) return catMapCache.map;
  const map = new Map<string, string>();
  try {
    const res = await fetch(LIBRARY_OPTIONS_URL);
    const data = (await res.json()) as LibraryOptions;
    for (const [category, entry] of Object.entries(data)) {
      const setLists = Array.isArray(entry.sets) ? [entry.sets] : Object.values(entry.sets ?? {});
      for (const rows of setLists) for (const row of rows) {
        const v = norm(row?.value);
        if (v) map.set(v, category);
      }
    }
  } catch {
    /* 맵 없이 휴리스틱만으로 진행 */
  }
  catMapCache = { map, ts: Date.now() };
  return map;
}

// Song 세트 라벨("브랜드 / 서브타이틀") — planner.mjs inferSongSetLabel과 동일
function songSetLabel(title: string, subtitle: string): string {
  if (!title || !subtitle) return "";
  const brand = norm(/^(.*?)(?:\s*-\s*.+)$/.exec(title)?.[1]);
  return brand ? `${brand} / ${subtitle}` : "";
}

function inferCategory(item: Class5Item, catMap: Map<string, string>): string {
  const bookTitle = norm(item.book_title);
  const title = norm(item.title);
  const subtitle = norm(item.subtitle);
  for (const cand of [bookTitle, title, songSetLabel(title, subtitle)]) {
    const matched = cand && catMap.get(cand);
    if (matched) return matched;
  }
  // Grammar 과제는 라이브러리 세트명이 "명사"·"대명사" 같은 문법 주제인데
  // 실제 과제 제목은 "Unit 04 지시대명사: this, that" 이라 catMap 조회가 절대 맞지 않는다.
  // movie_type 이 "grammar" 로 명시돼 오므로 그걸 그대로 믿는다.
  // (이게 없어서 문법 과제가 전부 Movie 로 잡혔고, grammar 파트 자동체크가 한 번도 안 찍혔다)
  if (item.movie_type === "grammar") return "Grammar";
  if (item.movie_type === "song") return "Song";
  if (item.movie_type === "write") return "Writing";
  if (item.movie_type === "book" || item.movie_type === "read") return "Reading";
  if (String(item.grade) === "0") return "Phonics";
  return "Movie";
}

function unitLabelOf(item: Class5Item): string {
  const bookTitle = norm(item.book_title);
  const title = norm(item.title);
  const subtitle = norm(item.subtitle);
  if (!title) return bookTitle;
  return bookTitle ? `${bookTitle} / ${title}` : `${title}${subtitle ? ` / ${subtitle}` : ""}`;
}

// 배정 기반 판정: 전부 완료→완료, 하나라도 완료/진행→진행중, 아니면 시작전
function statusOf(items: Class5Item[]): Class5Result["autoStatus"] {
  if (!items.length) return "시작전";
  const done = items.filter((it) => String(it.is_end) === "1").length;
  if (done === items.length) return "완료";
  const started = done > 0 || items.some((it) => String(it.progress ?? "0") !== "0");
  return started ? "진행중" : "시작전";
}

async function toUnits(items: Class5Item[], detailByHw?: Map<string, Class5UserItem>): Promise<Class5Unit[]> {
  const catMap = await getCategoryMap();
  return items.map((it) => {
    const detail = detailByHw?.get(String(it.hw_idx ?? ""));
    return {
      type: inferCategory(it, catMap),
      unitLabel: unitLabelOf(it),
      completed: String(it.is_end) === "1",
      ...(detail ? summarizeUserItem(detail) : {}),
    };
  });
}

/** 학생 상세 조회 → hw_idx 기준 맵. 실패해도 완료 판정에는 영향이 없으므로 조용히 빈 맵. */
async function detailMap(client: Class5Client, studentId: string, date: string): Promise<Map<string, Class5UserItem>> {
  try {
    const items = await client.fetchStudentHomework(studentId, date);
    return new Map(items.map((it) => [String(it.hw_idx ?? ""), it]));
  } catch {
    return new Map();
  }
}

function nameMatch(roster: Map<string, string>, studentName: string): string {
  const nm = studentName.replace(/\s+/g, "");
  if (!nm) return "";
  for (const [id, name] of roster) {
    const nn = name.replace(/\s+/g, "");
    if (nn && (nn === nm || nn.endsWith(nm) || nn.includes(nm))) return id;
  }
  return "";
}

/**
 * 교사 계정으로 로그인해 대상 학생의 해당 날짜 클래스5 과제 완료 현황을 가져온다(클릭 실시간용).
 * 저장된 std_user_idx가 없으면 재원생 명단에서 학생 이름으로 폴백 매칭한다.
 * @param dateKst "YYYY-MM-DD"
 */
export async function scrapeClass5ForStudent(
  creds: Class5Creds,
  externalStudentId: string,
  dateKst: string,
  studentName?: string,
): Promise<Class5Result> {
  const client = new Class5Client(creds);
  await client.login();

  let resolved = externalStudentId.trim();
  if (!resolved && studentName?.trim()) {
    resolved = nameMatch(await client.fetchRoster(), studentName);
  }

  const all = await client.fetchDateHomework(dateKst);
  const items = resolved ? all.filter((it) => String(it.std_user_idx) === resolved) : [];
  // 활동·카드 단위 결과(품질 지표)는 학생별 상세에만 있다 → 학습 흔적이 있을 때만 1회 더 조회
  const detail = resolved && items.some((it) => String(it.is_end) === "1" || String(it.progress ?? "0") !== "0")
    ? await detailMap(client, resolved, dateKst)
    : undefined;
  return {
    autoStatus: statusOf(items),
    units: await toUnits(items, detail),
    totalStudyMinutes: 0,
    matchedStudentId: resolved || undefined,
  };
}

/**
 * 교사 계정 로그인 1회로 해당 날짜에 과제가 배정된 전체 학생을 반환한다(스케줄 배치용).
 */
export async function scrapeClass5All(
  creds: Class5Creds,
  dateKst: string,
): Promise<Array<{ studentId: string; name: string; autoStatus: Class5Result["autoStatus"]; units: Class5Unit[] }>> {
  const client = new Class5Client(creds);
  await client.login();
  const [roster, all] = await Promise.all([client.fetchRoster(), client.fetchDateHomework(dateKst)]);

  const byStudent = new Map<string, Class5Item[]>();
  for (const it of all) {
    const sid = String(it.std_user_idx ?? "");
    if (!sid) continue;
    let items = byStudent.get(sid);
    if (!items) byStudent.set(sid, (items = []));
    items.push(it);
  }

  const out: Array<{ studentId: string; name: string; autoStatus: Class5Result["autoStatus"]; units: Class5Unit[] }> = [];
  for (const [studentId, items] of byStudent) {
    // 학습 흔적이 있는 학생만 상세를 추가 조회한다 (학생당 요청 1회 — 배정만 있고 안 한 학생은 생략)
    const touched = items.some((it) => String(it.is_end) === "1" || String(it.progress ?? "0") !== "0");
    const detail = touched ? await detailMap(client, studentId, dateKst) : undefined;
    out.push({
      studentId,
      name: roster.get(studentId) ?? "",
      autoStatus: statusOf(items),
      units: await toUnits(items, detail),
    });
  }
  return out;
}

/** 과거 만회 확인 대상 날짜 — 오늘 제외 직전 N일 (날짜당 요청 1회라 범위를 제한한다). */
export const CLASS5_PAST_DAYS = 7;
export function class5PastDates(todayKst: string, days = CLASS5_PAST_DAYS): string[] {
  const base = new Date(`${todayKst}T00:00:00Z`).getTime();
  return Array.from({ length: days }, (_, i) => new Date(base - (i + 1) * 86400000).toISOString().slice(0, 10));
}

/**
 * 과거 배정일들의 과제 완료 현황 (만회 판정용).
 * 클래스5는 과제가 날짜별로 배정되고(homework_date) 마지막 학습 시각(last_ts)까지 주므로,
 * "배정일 7/13 과제를 7/16에 완료" 를 개수 추정 없이 확정할 수 있다.
 */
export async function scrapeClass5Past(
  creds: Class5Creds,
  dates: string[],
): Promise<{ byStudentId: Class5PastByStudent; roster: Map<string, string> }> {
  const client = new Class5Client(creds);
  await client.login();
  const roster = await client.fetchRoster();
  const catMap = await getCategoryMap();
  const byStudentId: Class5PastByStudent = {};

  for (const date of dates) {
    let all: Class5Item[];
    try { all = await client.fetchDateHomework(date); }
    catch { continue; }  // 하루 실패해도 나머지 날짜는 진행
    for (const it of all) {
      const sid = String(it.std_user_idx ?? "");
      if (!sid) continue;
      const done = String(it.is_end) === "1";
      const lastTs = norm(it.last_ts);
      // 배정일보다 뒤에 학습했으면 만회. (같은 날 마감 후 완료도 배정일 기준으로는 정시로 본다)
      const late = done && lastTs.length >= 10 && lastTs.slice(0, 10) > date;
      const day = ((byStudentId[sid] ??= {})[date] ??= { parts: {}, allDone: true, anyLate: false });
      if (!done) { day.allDone = false; continue; }
      if (late) day.anyLate = true;
      const cat = inferCategory(it, catMap);
      if (!CLASS5_CATEGORIES.has(cat)) continue;
      const part = cat.toLowerCase();
      day.parts[part] = { late: (day.parts[part]?.late ?? false) || late };
    }
  }
  return { byStudentId, roster };
}
