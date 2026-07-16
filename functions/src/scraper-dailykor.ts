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
};

// 어휘력 센터 완료 세트 (누적) — { category:"문학", sets:["08","09"] }
export type DailykorVocaItem = { category: string; sets: string[] };

export type DailykorResult = {
  autoStatus: "시작전" | "진행중" | "완료";
  units: Array<{ unitLabel: string; completed: boolean; scores: Record<string, number | string> }>;
  totalStudyMinutes: number;
  matchedName?: string;
  detail?: DailykorDetail | null;
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
  csrf: string;
};

type NameInfo = { status: string; scores: Record<string, number | string>; idx?: string; kind?: "mh" | "el" };

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

  return { get, postForm, csrf };
}

// 리포트 파싱 → { 이름: { status, scores, idx, kind } } (전체 학생). idx/kind는 일별 상세 조회용.
async function reportByName(session: DkSession, dateKst: string): Promise<Record<string, NameInfo>> {
  const ym = dateKst.slice(0, 7);
  const byName: Record<string, NameInfo> = {};

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
          if ((td.getAttribute(rep.dateAttr) ?? "") !== dateKst) continue;
          const cls = (td.getAttribute("class") ?? "").split(/\s+/);
          let status = "시작전"; let grade: string | null = null;
          for (const c of cls) { if (COLOR_TO_STATUS[c]) { status = COLOR_TO_STATUS[c]; grade = COLOR_TO_GRADE[c]; break; } }
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
          };
        }
      }
    } catch (e) {
      functions.logger.warn("[dailykor] 리포트 실패", { path: rep.path, error: String(e) });
    }
  }

  return byName;
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
  // 오늘 총 획득/최대 경험치 ("오늘 획득 경험치(최대 획득 경험치) 18xp(30xp)")
  const xpm = flat.match(/오늘 획득 경험치[^0-9]*(\d+)xp\s*\(\s*(\d+)xp/);
  if (xpm) detail.xp = `${xpm[1]}xp / ${xpm[2]}xp`;
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
    // 2) 분류(분류2) → cate_id 매핑
    const cateMap = await fetchVocaCateMap(session, idx);
    // 3) 분류별로 완료 세트 중 마지막 N개
    const out: DailykorVocaItem[] = [];
    for (const t of today) {
      const cate = cateMap[t.category];
      if (!cate || t.count <= 0) continue;
      const all = await fetchVocaSetNumbers(session, idx, cate);
      const sets = all.slice(-t.count);
      if (sets.length) out.push({ category: t.category, sets });
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

// 분류(분류2) → cate_id: ajax_voca_status
async function fetchVocaCateMap(session: DkSession, idx: string): Promise<Record<string, string>> {
  const r = await session.get(`/academy/student/ajax_voca_status/${idx}`, { "X-Requested-With": "XMLHttpRequest", Referer: `${BASE}/academy/student/sreport` });
  if (r.status !== 200) return {};
  const data = JSON.parse(await r.text());
  if (data?.code !== 200 || !data.content) return {};
  const root = parse(String(data.content));
  const map: Record<string, string> = {};
  for (const tr of root.querySelectorAll("tr")) {
    const tds = tr.querySelectorAll("td");
    if (tds.length < 4) continue;
    const cate = tr.querySelector(".btn_voca_status_detail")?.getAttribute("data-cate_id");
    const name = (tds[1].text ?? "").trim();
    if (cate && name) map[name] = cate;
  }
  return map;
}

// 분류상세 격자에서 완료 세트 번호. 세트 셀 = <td class="등급"><span>N</span></td>.
// 미완료/미학습(able·ready) 및 등급 없는 셀 제외 → 완료 세트만.
async function fetchVocaSetNumbers(session: DkSession, idx: string, cate: string): Promise<string[]> {
  try {
    const r = await session.get(`/academy/student/ajax_voca_status_detail/${idx}/${cate}`, { "X-Requested-With": "XMLHttpRequest", Referer: `${BASE}/academy/student/sreport` });
    if (r.status !== 200) return [];
    const root = parse(await r.text());
    const done: number[] = [];
    for (const td of root.querySelectorAll("td")) {
      const t = (td.text ?? "").trim();
      if (!/^\d+$/.test(t)) continue;               // 세트 번호 셀만 (범례는 "100%" 등 → 제외)
      const cls = td.getAttribute("class") ?? "";
      if (!cls.trim() || /\b(able|ready)\b/.test(cls)) continue;  // 미완료/미학습 제외
      done.push(parseInt(t, 10));
    }
    done.sort((a, b) => a - b);
    return done.map((n) => String(n).padStart(2, "0"));
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
  const byName = await reportByName(session, dateKst);
  const vocaMap = await vocaByName(session, dateKst);
  const target = norm(studentName);

  // 어휘력 센터: 오늘 어휘 학습했으면 오늘 한 세트를 수집
  let voca: DailykorVocaItem[] | null = null;
  const vHit = findName(Object.keys(vocaMap), target);
  if (vHit && vocaMap[vHit].studiedToday && vocaMap[vHit].idx) {
    const items = await fetchVocaToday(session, vocaMap[vHit].idx as string, dateKst);
    voca = items.length ? items : null;
  }

  const hitName = findName(Object.keys(byName), target);
  if (!hitName) return { autoStatus: "시작전", units: [], totalStudyMinutes: 0, voca };
  const info = byName[hitName];
  const detail = info.kind === "mh" && info.idx ? await fetchDailykorDetail(session, info.idx, dateKst) : null;
  return { autoStatus: info.status as DailykorResult["autoStatus"], units: toUnits(info), totalStudyMinutes: 0, matchedName: hitName, detail, voca };
}

// 전체 학생: 배치(스케줄러)용 — 로그인 1회로 오늘 학습한 모든 학생 반환 (중고등은 상세 포함)
export async function scrapeDailykorAll(
  creds: DailykorCreds,
  dateKst: string,
): Promise<Array<{ name: string; autoStatus: DailykorResult["autoStatus"]; units: DailykorResult["units"]; detail?: DailykorDetail | null; voca?: DailykorVocaItem[] | null }>> {
  const session = await dailykorLogin(creds);
  const byName = await reportByName(session, dateKst);
  const vocaMap = await vocaByName(session, dateKst);
  const studied = Object.entries(byName).filter(([, info]) => Object.keys(info.scores).length);
  const out: Array<{ name: string; autoStatus: DailykorResult["autoStatus"]; units: DailykorResult["units"]; detail?: DailykorDetail | null; voca?: DailykorVocaItem[] | null }> = [];
  for (const [name, info] of studied) {
    const detail = info.kind === "mh" && info.idx ? await fetchDailykorDetail(session, info.idx, dateKst) : null;
    const vHit = findName(Object.keys(vocaMap), norm(name));
    const items = vHit && vocaMap[vHit].studiedToday && vocaMap[vHit].idx ? await fetchVocaToday(session, vocaMap[vHit].idx as string, dateKst) : [];
    out.push({ name, autoStatus: info.status as DailykorResult["autoStatus"], units: toUnits(info), detail, voca: items.length ? items : null });
  }
  return out;
}
