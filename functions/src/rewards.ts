import { FieldValue } from "firebase-admin/firestore";
import * as functions from "firebase-functions";
import { db } from "./config";
import {
  BADGE_BY_CODE, QUALITY_ANCHOR, RARITY_BONUS, REWARD_SLUGS,
  SPEED_PENALTY_FACTOR, SPEED_PENALTY_MULTIPLE, XP,
  levelFromXp, streakMultiplier, bundleEffects, scoreTier,
} from "./rewards-config";
import { recordRewardFeed, type FeedInput } from "./feed-events";

// XP · 포인트 · 히든 뱃지 적립 엔진.
//   writeAutoLog 직후(클릭 인증·스케줄 배치 공통)에 호출된다.
//   같은 날짜·서비스가 하루에도 여러 번 재계산되므로 **멱등**이 핵심:
//   원장(xpLedger)에 이전 적립값을 남기고, 재계산 시 '차액'만 합계에 반영한다.

// 스크랩 원본은 파트너 사이트마다 모양이 달라 스키마를 못 박는다.
// 값은 꺼낼 때 toScore()/String()/Array.isArray 로 좁힌다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

export type AwardResult = {
  xp: number;
  gainedXp: number;      // 이번 호출로 실제 늘어난 XP (멱등 차액)
  points: number;
  level: number;
  newBadges: string[];
};

type Stats = {
  streak: number;
  lastEarnDate: string;
  allClearStreak: number;
  lastAllClearDate: string;
  testHundredStreak: number;
  conceptPerfectStreak: number;
  vocaPerfectStreak: number;
  gameHigh: Record<string, number>;
  lastBook: string;
  lastDkGrade: string;
  makeupCount: number;
  weekly: Record<string, { week: string; sum: number; n: number; prevAvg: number | null }>;
  badgeCodes: string[];
  weekendDates: string[];
  unitTotal: number;
};

const EMPTY_STATS: Stats = {
  streak: 0, lastEarnDate: "", allClearStreak: 0, lastAllClearDate: "",
  testHundredStreak: 0, conceptPerfectStreak: 0, vocaPerfectStreak: 0,
  gameHigh: {}, lastBook: "", lastDkGrade: "", makeupCount: 0,
  weekly: {}, badgeCodes: [], weekendDates: [], unitTotal: 0,
};

function todayKst(): string {
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
}
function prevDate(date: string): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() - 86400e3).toISOString().slice(0, 10);
}
function weekKey(date: string): string {
  // ISO 주차 대신 '그 주 월요일 날짜'를 키로 쓴다 (계산이 단순하고 비교만 하면 되므로)
  const d = new Date(`${date}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 월=0
  return new Date(d.getTime() - dow * 86400e3).toISOString().slice(0, 10);
}
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
function normalize(value: number, zero: number, full: number): number {
  return clamp01((value - zero) / (full - zero));
}
function avg(list: number[]): number | null {
  const a = list.filter((x) => Number.isFinite(x));
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
}
/** "96", 96, "96점", "95 → 100" 같은 셀에서 숫자를 뽑는다(마지막 숫자 기준). */
function toScore(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const nums = v.match(/\d+(?:\.\d+)?/g);
  if (!nums) return null;
  const n = Number(nums[nums.length - 1]);
  return Number.isFinite(n) ? n : null;
}

// ── 품질 Q (0~1) ──────────────────────────────────────────────────────────────

type QualityOut = { q: number; raw: number | null; note?: string };

function qualityAutovoca(units: Json[]): QualityOut {
  const spell = avg(units.map((u) => u?.accuracy?.write).filter((x: unknown) => typeof x === "number"));
  if (spell != null) return { q: normalize(spell, QUALITY_ANCHOR.autovocaSpell.zero, QUALITY_ANCHOR.autovocaSpell.full), raw: Math.round(spell) };
  // 리뷰 유닛처럼 스펠 학습이 없는 경우 테스트 평균으로 폴백
  const tests = avg(units.flatMap((u) => (Array.isArray(u?.testScores) ? u.testScores : [])));
  if (tests != null) return { q: normalize(tests, QUALITY_ANCHOR.autovocaTest.zero, QUALITY_ANCHOR.autovocaTest.full), raw: Math.round(tests) };
  return { q: 0.5, raw: null, note: "지표 없음 → 기본값" };
}

/**
 * 클래스카드 단계 중 **점수로 볼 수 있는 것만** 골라낸다.
 *   - 암기·리콜·스펠·스피킹: 누적 반복량 %라 200·300·800%까지 나온다 (점수 아님)
 *   - 딕테이션: "0회"·"1.4회" 횟수다. 점수로 읽으면 0점이 되어 듣기 평균을 끌어내린다
 *   - 완료여부: "완료" 텍스트
 * 품질 산정(XP)과 피드 표시가 같은 기준을 쓰도록 여기 한 곳에 모은다.
 */
function gradedScores(scores: Json | undefined): number[] {
  const out: number[] = [];
  for (const [label, v] of Object.entries(scores ?? {})) {
    if (label === "완료여부") continue;
    if (/암기|리콜|스펠|스피킹|반복|딕테이션/.test(label)) continue;
    const n = toScore(v);
    if (n != null && n <= 100) out.push(n);
  }
  return out;
}

function qualityClasscard(units: Json[]): QualityOut {
  const scores: number[] = units.flatMap((u) => gradedScores(u?.scores));
  const m = avg(scores);
  if (m == null) return { q: 0.5, raw: null, note: "점수 열 없음 → 기본값" };
  const anchor = units.some((u) => u?.type === "듣기") ? QUALITY_ANCHOR.classcardListen : QUALITY_ANCHOR.classcard;
  return { q: normalize(m, anchor.zero, anchor.full), raw: Math.round(m) };
}

function qualityDailykor(detail: Json | null): QualityOut {
  const got = Number(detail?.xpGot);
  const max = Number(detail?.xpMax);
  if (!Number.isFinite(got) || !Number.isFinite(max) || max <= 0) return { q: 0.5, raw: null, note: "경험치 정보 없음 → 기본값" };
  const pct = (got / max) * 100;
  let q = normalize(pct, QUALITY_ANCHOR.dailykor.zero, QUALITY_ANCHOR.dailykor.full);
  // 속도 페널티: 추천치의 2배를 넘게 '읽으면' 지문을 넘긴 것으로 본다
  const recommended = Number(detail?.recommendedSpeed) || 600;
  const speeds = (detail?.passages ?? [])
    .map((p: Json) => parseInt(String(p?.readingSpeed ?? ""), 10))
    .filter((n: number) => Number.isFinite(n));
  const speed = avg(speeds);
  if (speed != null && speed > recommended * SPEED_PENALTY_MULTIPLE) {
    q *= SPEED_PENALTY_FACTOR;
    return { q, raw: Math.round(pct), note: "너무 빠름 — 지문을 읽으면 XP가 2배" };
  }
  return { q, raw: Math.round(pct) };
}

function qualityClass5(units: Json[]): QualityOut {
  const acc = avg(units.map((u) => u?.cardFirstTry).filter((x: unknown) => typeof x === "number"));
  if (acc == null) return { q: 0.5, raw: null, note: "정답률 정보 없음 → 기본값" };
  return { q: normalize(acc, QUALITY_ANCHOR.class5.zero, QUALITY_ANCHOR.class5.full), raw: Math.round(acc) };
}

/** 표준량을 넘어선 학습량(보너스 대상 건수). */
function volumeExtra(serviceSlug: string, units: Json[], detail: Json | null): number {
  if (serviceSlug === "dailykor") return Math.max(0, (detail?.passages?.length ?? 0) - 2);
  if (serviceSlug === "class5") return 0; // 배정 기반이라 '초과' 개념이 없다
  return Math.max(0, units.length - 1);
}

/** 학습 세트 한 개 — 종류(어휘/본문·문법…), 교재·유닛명, 단계별 성적. */
export type StudyStat = { name: string; value: string };
export type StudyItem = { kind: string | null; label: string; stats: StudyStat[] };

/**
 * 단계 값 한 개를 단위까지 붙여 표기한다.
 *   암기·리콜·스펠·스피킹 → % (반복량), 딕테이션 → 회, 나머지 → 점
 * 반복량 0%는 안 한 단계라 표시하지 않는다.
 */
function formatStage(label: string, v: unknown): string | null {
  const raw = String(v ?? "").trim();
  if (!raw || raw === "-") return null;
  if (/암기|리콜|스펠|스피킹|반복/.test(label)) {
    const n = toScore(v);
    if (n == null) return raw;
    return n > 0 ? `${n}%` : null;
  }
  if (/딕테이션/.test(label)) return /회/.test(raw) ? raw : `${raw}회`;
  const n = toScore(v);
  return n == null ? raw : `${n}점`;
}

/** "HH:MM" → 분. 형식이 아니면 null. */
function hhmmToMin(v: string | null): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v ?? "");
  if (!m) return null;
  const h = Number(m[1]); const mi = Number(m[2]);
  return h < 24 && mi < 60 ? h * 60 + mi : null;
}

/** 24시간제 "21:40" → "오후 9:40". 학생·학부모가 읽는 화면이라 12시간제로 통일한다. */
function ampm(v: string | null): string | null {
  const t = hhmmToMin(v);
  if (t == null) return null;
  const h = Math.floor(t / 60);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h < 12 ? "오전" : "오후"} ${h12}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * 학습 시각을 칩 하나로 만든다 — 피드와 개인 학습현황이 같은 문장을 쓰도록 여기 한 곳만 둔다.
 * (클라이언트 쪽 동일 규칙: src/components/learn/auto-result-card.tsx 의 TimeRange)
 *
 * 시작·종료가 뒤집혀 오는 리포트가 있어(끝이 시작보다 빠름) 이른 쪽을 시작으로 세운다.
 * 종료시각이 리포트의 실제 학습시간과 크게 어긋나면(오토보카는 그날 세션이 아닌 값이 섞여 온다)
 * 틀린 값을 보여주느니 시작시각만 남긴다.
 */
function timeStats(u: Json | undefined, minutes?: number | null): StudyStat[] {
  const a = hhmmToMin(u?.startAt ? String(u.startAt) : null);
  const b = hhmmToMin(u?.endAt ? String(u.endAt) : null);
  const [s, e] = a != null && b != null && b < a ? [b, a] : [a, b];
  const fmt = (t: number) => ampm(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`);

  // 시작~종료는 "학습 창을 연 시각 ~ 닫은 시각"이라 중간에 쉰 시간이 들어간다.
  // 활동 시간보다 긴 건 정상이므로 막지 않되, 3시간 넘게 벌어지면 값이 깨진 것으로 보고 버린다.
  const mins = minutes ?? (u?.durationSec ? Math.round(Number(u.durationSec) / 60) : null);
  const trustEnd = s != null && e != null && (mins == null || mins <= 0 || e - s <= mins + 180);

  // 어제 열어 오늘 끝낸 유닛은 시작이 오늘 것이 아니라 비어 온다 → 종료만 보여준다
  const span = trustEnd ? `${fmt(s!)} ~ ${fmt(e!)}`
    : s != null ? `${fmt(s)} 시작`
      : e != null ? `${fmt(e)} 종료` : null;
  return span ? [{ name: "", value: span }] : [];
}

/** 단계별 성적을 하나씩 나눠 담는다 — 평균 하나로 뭉치지 않는다. */
function stageStats(scores: Json | undefined): StudyStat[] {
  const out: StudyStat[] = [];
  for (const [name, v] of Object.entries(scores ?? {})) {
    if (name === "완료여부") continue;
    const value = formatStage(name, v);
    if (value) out.push({ name, value });
  }
  return out.slice(0, 8);
}

/**
 * 클래스카드 어휘/본문 세트가 단어 세트인지 문장 세트인지 가른다.
 * 스크래퍼가 둘을 한 시트("어휘/본문")로 받아오기 때문에 세트 이름으로 판별한다.
 *   본문·대화문·문장 → 문장세트 / 영한단어·단어·어휘 → 단어세트
 * 어느 쪽 낱말도 없으면 원래 이름을 그대로 둔다(추측하지 않는다).
 */
function classcardSetKind(unitLabel: string): string | null {
  if (/본문|대화문|문장/.test(unitLabel)) return "문장세트";
  if (/영한단어|단어|어휘|voca/i.test(unitLabel)) return "단어세트";
  return null;
}

/**
 * "2분 18초"(또는 "2분"/"18초") → 초. 파싱 실패는 0.
 * 개인 학습현황 카드와 같은 규칙(src/components/learn/auto-result-card.tsx parseKoTime).
 */
function koTimeSec(t: unknown): number {
  const s = String(t ?? "");
  return Number(s.match(/(\d+)\s*분/)?.[1] ?? 0) * 60 + Number(s.match(/(\d+)\s*초/)?.[1] ?? 0);
}

/** 초 → "5분 20초" (1분 미만은 "20초", 초가 0이면 "5분") */
function koTimeText(sec: number): string {
  const m = Math.floor(sec / 60); const s = sec % 60;
  if (m === 0) return `${s}초`;
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}

/** 1265 → "1,265". toLocaleString은 런타임 ICU에 기대게 되므로 직접 넣는다. */
function comma(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * 그날 학습을 시작한 시각(시) 모음 — 얼리버드(7시 전)·올빼미(23시 후) 판정의 유일한 근거.
 *
 * 대부분의 스크래퍼는 units[].startHour를 채우지만 **매일국어는 채우지 않는다.**
 * 초등은 시각이 units가 아니라 elementary[].startAt("09:35")에 들어 있어,
 * units만 보던 예전 코드에서는 매일국어만 하는 학생이 두 뱃지에 아예 도달할 수 없었다.
 * (중등 리포트는 시계 시각 자체를 주지 않아 여전히 대상이 아니다.)
 */
function startHours(scraped: Json | null): number[] {
  const units: Json[] = Array.isArray(scraped?.units) ? scraped!.units : [];
  const out = units.map((u) => u?.startHour).filter((h: unknown): h is number => typeof h === "number");
  const elementary: Json[] = Array.isArray(scraped?.elementary) ? scraped!.elementary : [];
  for (const e of elementary) {
    const h = parseInt(String(e?.startAt ?? "").slice(0, 2), 10);
    if (Number.isFinite(h) && h >= 0 && h <= 23) out.push(h);
  }
  return out;
}

/** 매일국어 획득/최대 경험치 — 신형은 xpGot·xpMax, 구형 로그는 "19xp / 30xp" 문자열. */
function dailykorXp(detail: Json | null): { got: number; max: number } | null {
  const got = Number(detail?.xpGot);
  const max = Number(detail?.xpMax);
  if (Number.isFinite(got) && Number.isFinite(max) && max > 0) return { got, max };
  const m = String(detail?.xp ?? "").match(/(\d+)\s*xp\s*\/\s*(\d+)\s*xp/i);
  if (m) return { got: Number(m[1]), max: Number(m[2]) };
  return null;
}

/**
 * 피드에 보여줄 "어디서 무엇을 했는지" 요약.
 * 학습 세트가 여러 개면 세트별로 나눠 각자의 점수를 붙인다 — 평균 하나로 뭉치지 않는다.
 * 스크랩 원본에서 사람이 읽을 수 있는 값만 뽑는다.
 */
export function studySummary(
  serviceSlug: string, units: Json[], detail: Json | null, scraped?: Json | null,
): { items: StudyItem[]; note: string | null; lastEnd: string | null } {
  const items: StudyItem[] = [];
  let note: string | null = null;

  if (serviceSlug === "autovoca") {
    for (const u of units) {
      if (!u?.unitLabel) continue;
      const score = toScore(u?.testScore);
      items.push({
        kind: null,
        label: String(u.unitLabel),
        stats: [
          ...(score !== null ? [{ name: "테스트", value: `${score}점` }] : []),
          ...timeStats(u, toScore(u?.studyMinutes)),
        ],
      });
    }
  } else if (serviceSlug === "classcard-middle") {
    for (const u of units) {
      if (!u?.unitLabel) continue;
      const label = String(u.unitLabel);
      const type = u.type ? String(u.type) : null;
      items.push({
        kind: type === "어휘/본문" ? (classcardSetKind(label) ?? type) : type,
        label,
        stats: [...stageStats(u?.scores), ...timeStats(u, toScore(u?.studyMinutes))],
      });
    }
  } else if (serviceSlug === "dailykor") {
    // 초등은 지문이 아니라 과목(국어·사회…) 단위로 별·점수가 나온다
    const elementary: Json[] = Array.isArray(scraped?.elementary) ? scraped!.elementary : [];
    for (const e of elementary) {
      if (!e?.subject) continue;
      const stats: StudyStat[] = [];
      const star = (n: unknown, label: string) => {
        const v = Number(n);
        if (Number.isFinite(v) && v > 0) stats.push({ name: label, value: "★".repeat(v) });
      };
      star(e.wordStars, "단어");
      star(e.bookStars, "교과서");
      star(e.testStars, "실전");
      // null을 Number()에 넣으면 0이 되어 "0점"이 찍힌다 → 존재 여부를 먼저 본다
      // 별이 없고 점수만 오는 경로(studylist)도 있다
      const score = (n: unknown, label: string) => {
        if (n == null) return;
        stats.push({ name: label, value: `${Number(n)}점` });
      };
      if (e.wordStars == null) score(e.wordScore, "단어");
      if (e.bookStars == null) score(e.bookScore, "교과서");
      if (e.testStars == null) score(e.testScore, "실전");
      if (e.firstPoint != null) stats.push({ name: "최초", value: `${Number(e.firstPoint)}점` });
      if (e.reviewPoint != null) stats.push({ name: "복습", value: `${Number(e.reviewPoint)}점` });
      stats.push(...timeStats(e));
      // 진행 중인 회차(date="학습중")는 점수가 하나도 없다 — 피드에 과목명만 뜨는 빈 칸이 된다
      if (!stats.some((s) => s.name)) continue;
      items.push({
        kind: e.round != null ? `${e.round}회차` : null,
        label: String(e.subject),
        stats,
      });
    }

    // 중등은 지문 단위. 정답률 하나만 싣던 것을 초등 수준까지 채운다 —
    // 독해속도·훈련시간은 이미 긁어 오고 있었는데 피드에서 버리고 있었다.
    const passages: Json[] = Array.isArray(detail?.passages) ? detail!.passages : [];
    const rows: StudyItem[] = [];
    for (const [i, p] of passages.entries()) {
      if (!p?.type) continue;
      const stats: StudyStat[] = [];
      if (p.accuracy) stats.push({ name: "정답률", value: String(p.accuracy) });
      // 숫자(1,265자/분)는 높은 게 좋은 건지 낮은 게 좋은 건지 알 수가 없다 — 정답률과 반대다.
      // 매일국어가 스스로 밝힌 추천 속도의 2배를 넘으면 지문을 넘긴 것으로 보고
      // 리워드에서도 **이미 XP를 절반으로 깎고 있다**. 그 판정을 그대로 적는다(/learn 과 같은 문구).
      const speed = parseInt(String(p.readingSpeed ?? ""), 10);
      if (Number.isFinite(speed) && speed > 0) {
        const recommended = Number(detail?.recommendedSpeed) || 600;
        stats.push({ name: "독해속도", value: speed > recommended * SPEED_PENALTY_MULTIPLE ? "너무 빠름" : "적정" });
      }
      // 중등 리포트는 시계 시각을 주지 않는다(초등은 준다). 대신 걸린 시간을 싣는다.
      const sec = koTimeSec(p.prepTime) + koTimeSec(p.readingTime) + koTimeSec(p.practiceTime);
      if (sec > 0) stats.push({ name: "학습", value: koTimeText(sec) });
      if (!stats.length) continue;
      rows.push({ kind: passages.length > 1 ? `${i + 1}지문` : null, label: String(p.type), stats });
    }
    items.push(...rows.slice(0, 5));

    // 단계별 경험치 — 초등의 단어·교과서·실전 세 칸에 대응한다.
    // 지문이 아니라 하루 단위 값이라 지문 줄에 붙이면 같은 값이 두 번 찍힌다 → 요약 줄로 따로 둔다.
    // 파싱을 나중에 붙여 과거 로그에는 없다 → 있을 때만.
    const steps: Json[] = Array.isArray(detail?.stepXp) ? detail!.stepXp : [];
    if (rows.length && steps.length) {
      items.push({
        kind: null,
        label: "단계별 경험치",
        stats: steps.map((s) => ({ name: String(s.step), value: `${Number(s.got)}/${Number(s.max)}` })),
      });
    }
    // 등급("완료")만으로는 얼마나 했는지 알 수 없다 → 획득 경험치를 쓴다
    const xp = dailykorXp(detail);
    if (xp) note = `경험치 ${xp.got}/${xp.max}`;
    else {
      const grade = units.map((u) => u?.scores?.["등급"]).find((g) => !!g);
      if (grade) note = String(grade);
    }
  } else if (serviceSlug === "class5") {
    // 예전엔 시각만 실었다 — 문법·리딩을 끝내도 피드에는 제목과 시각뿐이라
    // 클래스카드 줄(단계별 점수)과 나란히 놓으면 아무것도 안 한 것처럼 보였다.
    // 정답률(cardFirstTry)은 리워드 품질 판정이 쓰는 바로 그 값이라 새로 만드는 지표가 아니다.
    for (const u of units) {
      if (!u?.unitLabel) continue;
      const stats: StudyStat[] = [];
      // 클래스5 리포트의 단계 카드(암기·무비보기·쉐도잉·더빙…)와 같은 항목을 하나씩.
      // 사이트가 주는 단계 '점수'는 끝내면 전부 100이라 안 싣고, 대신 그 단계의 **1회 정답률**을
      // 활동별로 적는다 — 하나로 뭉치면 어느 단계에서 막혔는지가 사라진다.
      // 채점하지 않는 활동(더빙·쉐도잉·무비보기)은 카드가 없어 이름만 남는다.
      // 칩은 줄바꿈이 안 되므로(feed-event-card) 이어 붙이지 않고 항목마다 하나씩 낸다.
      const steps: Json[] = Array.isArray(u?.steps) ? u.steps : [];
      let anyPct = false;
      for (const s of steps.slice(0, 6)) {
        // 옛 로그는 문자열 배열이다(활동별 정답률을 붙이기 전에 긁힌 것)
        const name = typeof s === "string" ? s : String(s?.n ?? "");
        if (!name) continue;
        const p = typeof s === "object" && s?.p != null ? toScore(s.p) : null;
        if (p != null) anyPct = true;
        stats.push(p != null ? { name, value: `${p}%` } : { name: "", value: name });
      }
      // 활동별로 적었으면 전체 정답률은 같은 말을 한 번 더 하는 셈이다.
      // 활동별 값이 하나도 없을 때(옛 로그·카드 없는 과제)만 전체를 적는다.
      const acc = toScore(u?.cardFirstTry);
      if (acc != null && !anyPct) stats.push({ name: "정답률", value: `${acc}%` });
      // 문법 게임은 백분율이 아니라 2~5만점대 raw 점수다 — % 를 붙이면 안 된다
      const game = toScore(u?.gameScore);
      if (game != null) stats.push({ name: "게임", value: `${comma(game)}점` });
      // 학습시간은 넣지 않는다 — 시각 범위가 이미 durationSec 으로 역산한 값이라 같은 말이다
      stats.push(...timeStats(u));
      items.push({ kind: u.type ? String(u.type) : null, label: String(u.unitLabel), stats });
    }
  }

  // 그 서비스에서 마지막으로 학습을 끝낸 시각 — 피드 카드의 작성 시각 기준이 된다
  const ends: string[] = [];
  for (const u of units) if (u?.endAt) ends.push(String(u.endAt));
  for (const e of (Array.isArray(scraped?.elementary) ? scraped!.elementary : [])) {
    if (e?.endAt) ends.push(String(e.endAt));
  }
  const lastEnd = ends.length ? ends.sort()[ends.length - 1] : null;

  return { items: items.slice(0, 6), note, lastEnd };
}

export type XpComputation = {
  xp: number; quality: number; qualityRaw: number | null; note?: string;
  breakdown: {
    base: number; quality: number; volume: number; streakMult: number; lateFactor: number;
    badgeMult?: number; badgePct?: number;
    /** 점수 구간 보너스 XP (0이면 어느 구간에도 못 닿음) */
    tier?: number;
    /** 그 보너스를 받은 문턱 점수 — 화면에 "95점↑" 으로 적는다 */
    tierMin?: number;
  };
};

/** 순수 계산 — 저장하지 않는다. 소급 스크립트/재계산 도구도 이걸 쓴다. */
export function computeXp(
  serviceSlug: string,
  autoStatus: string,
  scrapedData: Json | null,
  opts: { streak: number; late: boolean; date?: string; equippedBadges?: string[] },
): XpComputation {
  const units: Json[] = Array.isArray(scrapedData?.units) ? scrapedData!.units : [];
  const detail: Json | null = (scrapedData?.detail as Json) ?? null;

  const base = autoStatus === "완료" ? XP.DONE : autoStatus === "진행중" ? XP.PARTIAL : 0;
  if (base === 0) {
    return { xp: 0, quality: 0, qualityRaw: null, breakdown: { base: 0, quality: 0, volume: 0, streakMult: 1, lateFactor: 1, badgeMult: 1, badgePct: 0, tier: 0 } };
  }

  const qOut = serviceSlug === "autovoca" ? qualityAutovoca(units)
    : serviceSlug === "classcard-middle" ? qualityClasscard(units)
      : serviceSlug === "dailykor" ? qualityDailykor(detail)
        : qualityClass5(units);

  const qualityPts = Math.round(qOut.q * XP.QUALITY_MAX);
  // 점수 구간 보너스 — 품질 점수와 **따로** 얹되, 그날 벌어들인 몫이므로
  // 연속 배수·상한은 품질과 똑같이 받는다 (상한 밖에 두면 상한이 뚫린다).
  const tier = scoreTier(serviceSlug, qOut.raw);
  const tierPts = tier?.xp ?? 0;
  const volumePts = Math.min(XP.VOLUME_CAP, volumeExtra(serviceSlug, units, detail) * XP.VOLUME_UNIT);
  const mult = streakMultiplier(opts.streak);

  // 장착 뱃지 효과 — 조건을 만족한 날에만 붙는다.
  // 상한(SERVICE_CAP)보다 **먼저** 곱해야 한다. 뒤에 붙이면 상한을 우회한다.
  const eff = bundleEffects(opts.equippedBadges ?? []);
  const hours = startHours(scrapedData);
  const minutes = units
    .map((u) => Number(u?.studyMinutes))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => a + b, 0);
  const dow = opts.date ? (new Date(`${opts.date}T00:00:00Z`).getUTCDay() + 6) % 7 : -1;
  const met: Record<string, boolean> = {
    earlyBird: hours.some((h) => h < 7),
    weekend: dow === 5 || dow === 6,
    quality80: qOut.q >= 0.8,
    long60: minutes >= 60,
  };
  const badgePct = (Object.entries(eff.xpWhen) as [string, number][])
    .reduce((sum, [cond, pct]) => sum + (met[cond] ? pct : 0), 0);
  const badgeMult = 1 + badgePct / 100;
  const lateFactor = opts.late ? (eff.lateFactor ?? XP.LATE_FACTOR) : 1;

  const xp = Math.min(XP.SERVICE_CAP, Math.round((base + qualityPts + tierPts) * mult * badgeMult * lateFactor) + volumePts);
  return {
    xp, quality: qOut.q, qualityRaw: qOut.raw, note: qOut.note,
    breakdown: {
      base, quality: qualityPts, volume: volumePts, streakMult: mult, lateFactor, badgeMult, badgePct,
      tier: tierPts, ...(tier ? { tierMin: tier.min } : {}),
    },
  };
}

/**
 * "왜 이만큼 받았는지" 한 줄. 피드와 학습현황이 같은 문장을 쓰도록 여기 한 곳에서 만든다.
 *
 * 점수에 따른 차등은 오래전부터 있었지만 화면 어디에도 그렇게 보이지 않았다.
 * 아이 입장에서 XP 는 그냥 매일 다른 숫자였다 — 모르는 보상은 동기가 되지 않는다.
 *   "점수 95 → +38 · 95점↑ 보너스 +20 · 연속 ×1.1"
 */
export function xpWhy(comp: XpComputation): string | null {
  const b = comp.breakdown;
  if (!b.base) return null;
  const parts: string[] = [];
  if (comp.qualityRaw != null) parts.push(`점수 ${comp.qualityRaw} → +${b.quality}`);
  if (b.tier) parts.push(`${b.tierMin}점↑ 보너스 +${b.tier}`);
  if (b.volume) parts.push(`추가 학습 +${b.volume}`);
  if (b.streakMult > 1) parts.push(`연속 ×${b.streakMult}`);
  if (b.badgePct) parts.push(`뱃지 +${b.badgePct}%`);
  if (b.lateFactor < 1) parts.push(`만회 ×${b.lateFactor}`);
  return parts.length ? parts.join(" · ") : null;
}

// ── 히든 뱃지 판정 ────────────────────────────────────────────────────────────

type BadgeCtx = {
  serviceSlug: string;
  date: string;
  autoStatus: string;
  units: Json[];
  detail: Json | null;
  voca: Json[];
  scraped: Json | null;
  quality: number;
  qualityRaw: number | null;
  stats: Stats;
  /** 이번 적립 후의 그날 완료 서비스 목록 */
  todayDoneSlugs: string[];
  /** 학생이 듣는 자동인증 서비스 수 */
  subscribedCount: number;
  /** 확정 과제가 잡힌 요일(0=월 … 6=일). 연속 학습 판정에서 쉬는 날을 건너뛰는 데 쓴다 */
  plannedDows: Set<number>;
  badgeTotal: number;
};

/** 조건을 만족한 뱃지 코드 목록 (이미 보유한 것 포함 — 호출부에서 걸러낸다). */
function detectBadges(ctx: BadgeCtx): string[] {
  const out: string[] = [];
  const { units, detail, stats } = ctx;
  const add = (code: string, cond: unknown) => { if (cond) out.push(code); };

  // ── 시간대 (모든 서비스 공통) ──
  const hours = startHours(ctx.scraped);
  add("x-early-bird", hours.some((h) => h < 7));
  add("x-night-owl", hours.some((h) => h >= 23));

  if (ctx.serviceSlug === "autovoca") {
    const tests = units.flatMap((u) => (Array.isArray(u?.testScores) ? u.testScores : [])) as number[];
    add("av-test-triple", stats.testHundredStreak >= 3);
    add("av-first-hundred", units.some((u) => Array.isArray(u?.testScores) && u.testScores[0] === 100));
    add("av-perfect-spell", units.some((u) => u?.accuracy?.write === 100));
    add("av-wrong-clear", ctx.scraped?.wrongReview?.cleared === true);
    add("av-point-burst", (units.reduce((s, u) => s + (Number(u?.points) || 0), 0)) >= 80);
    add("av-speedrun", units.some((u) => Number(u?.studyMinutes) > 0 && Number(u.studyMinutes) <= 10
      && Array.isArray(u?.testScores) && u.testScores.length > 0 && Math.min(...u.testScores) >= 90));
    add("av-grit", units.some((u) => Number(u?.studyMinutes) >= 60));
    add("av-book-up", units.some((u) => u?.bookLabel && stats.lastBook && u.bookLabel !== stats.lastBook));
    add("av-review-master", units.some((u) => u?.isReview && Array.isArray(u?.testScores) && u.testScores.length
      && (avg(u.testScores) ?? 0) >= 95));
    add("av-never-give-up", units.some((u) => u?.hardWordCleared === true));
    void tests;
  }

  if (ctx.serviceSlug === "classcard-middle") {
    const stepEntries = units.flatMap((u) => Object.entries(u?.scores ?? {})
      .map(([label, v]) => ({ label, score: toScore(v), type: u?.type })));
    const graded = stepEntries.filter((e) => e.score != null && e.score <= 100 && !/암기|리콜|스펠|스피킹|반복|완료여부/.test(e.label));
    add("cc-all-clear", graded.length >= 3 && graded.every((e) => e.score === 100));
    add("cc-real-master", graded.some((e) => /실전/.test(e.label) && e.score === 100));
    add("cc-essay", graded.some((e) => /서술형/.test(e.label) && (e.score ?? 0) >= 90));
    add("cc-wrong-clean", graded.some((e) => /누적오답/.test(e.label) && e.score === 100));
    add("cc-concept-triple", stats.conceptPerfectStreak >= 3);
    add("cc-long-run", units.some((u) => Number(u?.studyMinutes) >= 60) && (avg(graded.map((e) => e.score!)) ?? 0) >= 90);
    // 듣기 '오답 테스트'는 "95 → 100" 형태 — 상승했으면 재도전 성공
    add("cc-listen-retry", units.some((u) => {
      const raw = String(u?.scores?.["오답 테스트"] ?? "");
      const nums = raw.match(/\d+/g);
      return !!nums && nums.length >= 2 && Number(nums[nums.length - 1]) > Number(nums[0]);
    }));
  }

  if (ctx.serviceSlug === "dailykor") {
    const got = Number(detail?.xpGot), max = Number(detail?.xpMax);
    add("dk-perfect-day", Number.isFinite(got) && Number.isFinite(max) && max > 0 && got >= max);
    const steps: Json[] = Array.isArray(detail?.stepXp) ? detail!.stepXp : [];
    add("dk-prep-max", steps.some((s) => /준비/.test(s?.step) && s.got >= s.max && s.max > 0));
    add("dk-read-max", steps.some((s) => /독해/.test(s?.step) && s.got >= s.max && s.max > 0));
    add("dk-real-max", steps.some((s) => /실전/.test(s?.step) && s.got >= s.max && s.max > 0));
    // 제대로 읽었다 — 속도가 적정 구간이면서 정답률 80%↑
    const rec = Number(detail?.recommendedSpeed) || 600;
    const passages: Json[] = Array.isArray(detail?.passages) ? detail!.passages : [];
    const speeds = passages.map((p) => parseInt(String(p?.readingSpeed ?? ""), 10)).filter(Number.isFinite);
    const accs = passages.map((p) => parseInt(String(p?.accuracy ?? ""), 10)).filter(Number.isFinite);
    const sp = avg(speeds), ac = avg(accs);
    add("dk-true-reader", sp != null && ac != null && sp >= rec * 0.8 && sp <= rec * 1.5 && ac >= 80);
    add("dk-two-passages", passages.length >= 2 && ctx.autoStatus === "완료");
    add("dk-voca-complete", ctx.voca.some((v) => v?.categoryComplete === true));
    add("dk-voca-perfect", stats.vocaPerfectStreak >= 5);
    add("x-turnaround", stats.lastDkGrade === "미흡" && units.some((u) => u?.scores?.["등급"] === "최우수"));
  }

  if (ctx.serviceSlug === "class5") {
    add("c5-flawless", units.some((u) => u?.cardFirstTry === 100));
    add("c5-all-steps", units.some((u) => u?.allStepsDone === true));
    add("c5-30k", units.some((u) => Number(u?.gameScore) >= 30000));
    add("c5-record", units.some((u) => {
      const g = Number(u?.gameScore);
      const prev = stats.gameHigh?.[String(u?.type ?? "etc")] ?? 0;
      return Number.isFinite(g) && g > 0 && prev > 0 && g > prev;
    }));
    const types = new Set(units.filter((u) => u?.completed).map((u) => String(u?.movieType ?? "")));
    add("c5-triple-type", types.has("movie") && types.has("book") && types.has("grammar"));
    add("c5-focus", units.some((u) => Number(u?.durationSec) > 0 && Number(u.durationSec) <= 300 && Number(u?.cardFirstTry) >= 90));
    add("c5-marathon", units.reduce((s, u) => s + (Number(u?.durationSec) || 0), 0) >= 1800);
  }

  // ── 크로스 ──
  add("st-3", stats.streak >= 3);
  add("st-7", stats.streak >= 7);
  add("st-30", stats.streak >= 30);
  add("st-100", stats.streak >= 100);
  add("x-all-clear", ctx.subscribedCount > 0 && ctx.todayDoneSlugs.length >= ctx.subscribedCount);
  add("x-perfect-week", stats.allClearStreak >= 7);
  const dow = new Date(`${ctx.date}T00:00:00Z`).getUTCDay();
  const weekendSet = new Set([...stats.weekendDates, ...(dow === 0 || dow === 6 ? [ctx.date] : [])]);
  const wk = weekKey(ctx.date);
  const thisWeekend = [...weekendSet].filter((d) => weekKey(d) === wk);
  add("x-weekend", thisWeekend.length >= 2);
  add("x-catchup", stats.makeupCount >= 3);
  const wq = stats.weekly?.[ctx.serviceSlug];
  add("x-jump", ctx.qualityRaw != null && wq?.prevAvg != null && ctx.qualityRaw - wq.prevAvg >= 15);
  add("x-collector-10", ctx.badgeTotal >= 10);
  add("x-collector-25", ctx.badgeTotal >= 25);

  return out.filter((c) => BADGE_BY_CODE.has(c));
}

// ── 누적 상태(stats) 갱신 ─────────────────────────────────────────────────────

/** 날짜 문자열의 요일 (0=월 … 6=일). tasks.scheduleDays 와 같은 기준. */
function dowOf(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/**
 * 연속 학습이 이어졌는가.
 *
 * 바로 어제 적립했으면 당연히 이어진다. 하루 이상 비었을 때는 **사이에 낀 날이
 * 전부 계획 없는 요일**이면 이어진 것으로 본다(주말에 계획이 없으면 금→월도 연속).
 *
 * 계획 요일을 하나도 모를 때(확정 과제가 없는 학생)는 예전 규칙 그대로 어제만 인정한다.
 * 모르는 상태에서 전부 봐주면 몇 주를 쉬어도 연속이 이어져 지표가 뜻을 잃는다.
 * 빈 구간이 지나치게 길면(14일 초과) 계획과 무관하게 끊는다 — 장기 휴식은 새로 시작하는 게 맞다.
 */
export function continuesStreak(lastEarnDate: string, date: string, plannedDows: Set<number>): boolean {
  if (!lastEarnDate) return false;
  if (lastEarnDate === prevDate(date)) return true;
  if (lastEarnDate >= date) return false;
  if (plannedDows.size === 0) return false;

  let cursor = prevDate(date);
  let gap = 0;
  while (cursor > lastEarnDate) {
    if (++gap > 14) return false;
    if (plannedDows.has(dowOf(cursor))) return false; // 계획이 있던 날을 건너뛰었다
    cursor = prevDate(cursor);
  }
  return cursor === lastEarnDate;
}

function updateStats(stats: Stats, ctx: Omit<BadgeCtx, "stats" | "badgeTotal">): Stats {
  const s: Stats = { ...stats, gameHigh: { ...stats.gameHigh }, weekly: { ...stats.weekly } };
  const { units, detail, date, serviceSlug } = ctx;

  // 연속 학습일 — 그날 XP를 얻은 날 기준.
  // 사이에 낀 날이 전부 '계획 없는 날'이면 이어진 것으로 본다 — 주말에 계획이 없는 학생이
  // 금요일에 하고 월요일에 이어서 해도 끊기지 않아야 한다(사용자 확정).
  if (s.lastEarnDate !== date) {
    s.streak = continuesStreak(s.lastEarnDate, date, ctx.plannedDows) ? s.streak + 1 : 1;
    s.lastEarnDate = date;
  }

  // 올클리어 연속
  if (ctx.subscribedCount > 0 && ctx.todayDoneSlugs.length >= ctx.subscribedCount && s.lastAllClearDate !== date) {
    s.allClearStreak = s.lastAllClearDate === prevDate(date) ? s.allClearStreak + 1 : 1;
    s.lastAllClearDate = date;
  }

  if (serviceSlug === "autovoca") {
    // 테스트 100점 연속 (회차 순서대로 이어서 판정)
    for (const u of units) {
      for (const t of (Array.isArray(u?.testScores) ? u.testScores : [])) {
        s.testHundredStreak = t === 100 ? s.testHundredStreak + 1 : 0;
      }
      if (u?.bookLabel) s.lastBook = String(u.bookLabel);
    }
  }
  if (serviceSlug === "classcard-middle") {
    for (const u of units) {
      const concept = Object.entries(u?.scores ?? {}).find(([label]) => /개념/.test(label));
      if (concept) s.conceptPerfectStreak = toScore(concept[1]) === 100 ? s.conceptPerfectStreak + 1 : 0;
    }
  }
  if (serviceSlug === "dailykor") {
    for (const v of ctx.voca) {
      for (const g of (Array.isArray(v?.grades) ? v.grades : [])) {
        s.vocaPerfectStreak = g === "verygood" ? s.vocaPerfectStreak + 1 : 0;
      }
    }
    const grade = units.map((u) => u?.scores?.["등급"]).find((g) => typeof g === "string");
    if (grade) s.lastDkGrade = String(grade);
  }
  if (serviceSlug === "class5") {
    for (const u of units) {
      const g = Number(u?.gameScore);
      const key = String(u?.type ?? "etc");
      if (Number.isFinite(g) && g > 0) s.gameHigh[key] = Math.max(s.gameHigh[key] ?? 0, g);
    }
  }

  // 주간 품질 평균 (껑충 판정용)
  if (ctx.qualityRaw != null) {
    const wk = weekKey(date);
    const cur = s.weekly[serviceSlug];
    if (!cur || cur.week !== wk) {
      s.weekly[serviceSlug] = { week: wk, sum: ctx.qualityRaw, n: 1, prevAvg: cur ? cur.sum / Math.max(1, cur.n) : null };
    } else {
      s.weekly[serviceSlug] = { ...cur, sum: cur.sum + ctx.qualityRaw, n: cur.n + 1 };
    }
  }

  // 주말 학습 날짜 (최근 14개만 유지)
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  if ((dow === 0 || dow === 6) && !s.weekendDates.includes(date)) {
    s.weekendDates = [...s.weekendDates, date].slice(-14);
  }

  s.unitTotal += units.filter((u) => u?.completed !== false).length;
  void detail;
  return s;
}

// ── 적립 ──────────────────────────────────────────────────────────────────────

/**
 * 하루·서비스 단위로 XP/포인트/뱃지를 멱등 적립한다.
 * 재호출 시 원장의 이전 값과 비교해 **차액만** 반영하므로 몇 번 돌려도 안전하다.
 */
export async function awardRewards(params: {
  childId: string;
  serviceSlug: string;
  date: string;
  autoStatus: string;
  scrapedData: Json | null;
  /**
   * 지난 날짜를 **그날인 것처럼** 다시 계산한다 (표기 규칙을 고친 뒤 과거 카드를 다시 그릴 때).
   *
   * 이게 없으면 백필이 그날 제때 한 학습을 만회(×0.7)로 깎고, 하루 요약 카드도 만들지 않는다
   * (과거 만회는 피드를 어지럽히므로 일부러 안 만든다). 2026-08-11 에 실제로 8/10 원장 23건이
   * 이렇게 깎였다. 운영자 백필 경로에서만 켠다.
   */
  replay?: boolean;
}): Promise<AwardResult | null> {
  const { childId, serviceSlug, date, autoStatus, scrapedData } = params;
  if (!REWARD_SLUGS.includes(serviceSlug)) return null;

  const childRef = db.collection("children").doc(childId);
  const statsRef = childRef.collection("stats").doc("summary");
  const ledgerRef = childRef.collection("xpLedger").doc(`${date}_${serviceSlug}`);
  const late = !params.replay && date < todayKst();

  // 구독 중인 자동인증 서비스 수 (올클리어 판정) — 트랜잭션 밖에서 미리 조회
  const subsSnap = await db.collection("subscriptions").where("childId", "==", childId).get();
  const subscribedCount = new Set(
    subsSnap.docs
      .filter((d) => ["active", "transferred"].includes(String(d.data().status)))
      .map((d) => String(d.data().serviceSlug))
      .filter((slug) => REWARD_SLUGS.includes(slug)),
  ).size;

  // 계획이 있는 요일(0=월 … 6=일). 연속 학습 판정에서 '쉬는 날'을 건너뛰기 위해 쓴다.
  // 주말에 계획이 없는 학생이 금요일에 하고 월요일에 이어서 해도 연속이 끊기지 않아야 한다.
  const tasksSnap = await db.collection("tasks")
    .where("childId", "==", childId)
    .where("status", "==", "confirmed")
    .get();
  const plannedDows = new Set<number>();
  tasksSnap.docs.forEach((d) => {
    const days = d.data().scheduleDays;
    if (Array.isArray(days)) days.forEach((n: unknown) => { if (typeof n === "number") plannedDows.add(n); });
  });

  try {
    const out = await db.runTransaction(async (tx) => {
      // ── 읽기 (쓰기 전에 전부) ──
      const [childSnap, statsSnap, ledgerSnap, dayLedger] = await Promise.all([
        tx.get(childRef),
        tx.get(statsRef),
        tx.get(ledgerRef),
        tx.get(childRef.collection("xpLedger").where("date", "==", date)),
      ]);
      if (!childSnap.exists) return null;

      const stats: Stats = { ...EMPTY_STATS, ...(statsSnap.data() as Partial<Stats> | undefined) };
      const prevXp = Number(ledgerSnap.data()?.xp ?? 0);

      // 그날 이미 적립된 다른 서비스 XP 합 (하루 상한 계산용)
      const otherXp = dayLedger.docs
        .filter((d) => d.id !== ledgerRef.id)
        .reduce((s, d) => s + Number(d.data().xp ?? 0), 0);

      // ── 계산 ──
      // 장착 뱃지 — 효과 판정에 쓴다. 보유 검증은 장착 시점(equipBadges)에 이미 했다.
      const equippedBadges = (childSnap.data()?.equippedBadges ?? []) as string[];
      const comp = computeXp(serviceSlug, autoStatus, scrapedData, {
        streak: stats.streak, late, date, equippedBadges,
      });
      const capped = Math.max(0, Math.min(comp.xp, XP.DAILY_CAP - otherXp));
      const deltaXp = capped - prevXp;

      const units: Json[] = Array.isArray(scrapedData?.units) ? scrapedData!.units : [];
      const voca: Json[] = Array.isArray(scrapedData?.voca) ? scrapedData!.voca : [];
      const todayDoneSlugs = [
        ...new Set([
          ...dayLedger.docs.filter((d) => d.id !== ledgerRef.id && d.data().done === true).map((d) => String(d.data().serviceSlug)),
          ...(autoStatus === "완료" ? [serviceSlug] : []),
        ]),
      ];

      const ctxBase = {
        serviceSlug, date, autoStatus, units, detail: (scrapedData?.detail as Json) ?? null, voca,
        scraped: scrapedData, quality: comp.quality, qualityRaw: comp.qualityRaw,
        todayDoneSlugs, subscribedCount, plannedDows,
      };

      // 이 날짜·서비스를 처음 적립할 때만 누적 상태를 갱신한다(재계산 시 연속 카운트 중복 방지)
      const firstTimeForSlot = !ledgerSnap.exists;
      const nextStats = firstTimeForSlot && capped > 0 ? updateStats(stats, ctxBase) : stats;

      const owned = new Set(nextStats.badgeCodes ?? []);
      const detected = capped > 0
        ? detectBadges({ ...ctxBase, stats: nextStats, badgeTotal: owned.size })
        : [];
      const newBadges = [...new Set(detected)].filter((c) => !owned.has(c));

      const badgeBonus = newBadges.reduce((s, c) => s + (RARITY_BONUS[BADGE_BY_CODE.get(c)!.rarity] ?? 0), 0);

      const prevTotal = Number(childSnap.data()?.xpTotal ?? 0);
      const newTotal = Math.max(0, prevTotal + deltaXp);
      const prevLevel = levelFromXp(prevTotal);
      const newLevel = levelFromXp(newTotal);
      const levelUps = Math.max(0, newLevel - prevLevel);

      // 포인트 보너스는 XP 로 번 몫에만 붙인다 — 뱃지·레벨업 보상까지 불리면 두 번 얹는 셈이 된다.
      const pointPct = bundleEffects(equippedBadges).pointPct;
      const basePoints = Math.round(deltaXp * XP.POINT_RATE);
      const deltaPoints = basePoints + Math.round(basePoints * pointPct / 100) + badgeBonus + levelUps * XP.LEVELUP_POINT;

      // ── 쓰기 ──
      // 피드 카드에 쓸 학습 요약도 원장에 함께 남긴다 — 하루 요약은 이 원장을 모아 만든다.
      const study = studySummary(serviceSlug, units, (scrapedData?.detail as Json) ?? null, scrapedData);
      // 표시용 요약이 달라졌으면 XP가 그대로여도 다시 쓴다.
      // 안 그러면 표기 규칙을 고쳐 배포해도 이미 적립된 날의 카드는 옛 문구로 남는다.
      const why = xpWhy(comp);
      const summaryStale =
        JSON.stringify(ledgerSnap.data()?.studyItems ?? null) !== JSON.stringify(study.items) ||
        (ledgerSnap.data()?.studyNote ?? null) !== study.note ||
        (ledgerSnap.data()?.studyEndAt ?? null) !== study.lastEnd ||
        (ledgerSnap.data()?.xpWhy ?? null) !== why;
      if (deltaXp !== 0 || newBadges.length || !ledgerSnap.exists || summaryStale) {
        tx.set(ledgerRef, {
          childId, serviceSlug, date, xp: capped, done: autoStatus === "완료",
          quality: comp.quality, qualityRaw: comp.qualityRaw, note: comp.note ?? null,
          studyItems: study.items, studyNote: study.note, studyEndAt: study.lastEnd, xpWhy: why,
          breakdown: comp.breakdown, computedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      if (deltaXp !== 0 || deltaPoints !== 0) {
        tx.set(childRef, {
          xpTotal: newTotal,
          level: newLevel,
          points: FieldValue.increment(deltaPoints),
          rewardUpdatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      if (nextStats !== stats || newBadges.length) {
        tx.set(statsRef, { ...nextStats, badgeCodes: [...owned, ...newBadges] }, { merge: true });
      }
      for (const code of newBadges) {
        tx.set(childRef.collection("badges").doc(code), {
          code, earnedAt: FieldValue.serverTimestamp(), seen: false,
          serviceSlug: BADGE_BY_CODE.get(code)?.service ?? null,
          rarity: BADGE_BY_CODE.get(code)?.rarity ?? "common",
          date,
        }, { merge: true });
      }

      // 피드에 남길 값은 트랜잭션 안에서 모아두고, 기록은 밖에서 한다
      // (피드 실패가 적립을 되돌리면 안 되므로).
      const feed: FeedInput | null = deltaXp !== 0 || newBadges.length
        ? {
          childId, date,
          name: String(childSnap.data()?.name ?? ""),
          grade: String(childSnap.data()?.grade ?? ""),
          equipped: (childSnap.data()?.equipped ?? {}) as Record<string, string | null>,
          level: newLevel, prevLevel,
          newBadges,
          serviceSlug,
          dayXp: otherXp + capped,
          doneCount: todayDoneSlugs.length,
          streak: nextStats.streak,
          // 그날 한 과목들을 한 카드에 모아 보여준다 (이번 서비스는 방금 계산한 값으로 대체)
          services: [
            ...dayLedger.docs
              .filter((d) => d.id !== ledgerRef.id)
              .map((d) => ({
                slug: String(d.data().serviceSlug ?? ""),
                xp: Number(d.data().xp ?? 0),
                items: (d.data().studyItems ?? []) as StudyItem[],
                note: (d.data().studyNote ?? null) as string | null,
                xpWhy: (d.data().xpWhy ?? null) as string | null,
              })),
            { slug: serviceSlug, xp: capped, items: study.items, note: study.note, xpWhy: why },
          ].filter((s) => s.slug && s.xp > 0),
          // 학습이 실제로 끝난 시각 (스크랩 시각이 아니라) — 없으면 null → 기록 시각으로 폴백
          occurredAt: [
            ...dayLedger.docs.filter((d) => d.id !== ledgerRef.id).map((d) => d.data().studyEndAt as string | null),
            study.lastEnd,
          ].filter((v): v is string => !!v).sort().pop() ?? null,
          late,
          optOut: childSnap.data()?.feedOptOut === true,
        }
        : null;

      return { xp: capped, gainedXp: deltaXp, points: deltaPoints, level: newLevel, newBadges, feed };
    });

    if (!out) return null;
    const { feed, ...result } = out;
    if (feed) {
      await recordRewardFeed(feed)
        .catch((e) => functions.logger.warn("[rewards] 피드 기록 실패", { childId, date, error: String(e) }));
    }
    return result;
  } catch (e) {
    // 리워드 실패가 학습 기록 자체를 막으면 안 된다 → 로그만 남기고 통과
    functions.logger.error("[rewards] 적립 실패", { childId, serviceSlug, date, error: String(e) });
    return null;
  }
}
