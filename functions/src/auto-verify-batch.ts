import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as functions from "firebase-functions";
import { db, solapiApiKey, solapiApiSecret } from "./config";
import { writeAutoLog } from "./auto-log";
import { scrapeAutovocaAll, autovocaDonePartSlugs, autovocaDonePartCounts } from "./scraper-autovoca";
import { scrapeDailykorAll, DAILYKOR_REPORT_PARTS } from "./scraper-dailykor";
import { scrapeClasscardAll, classcardDonePartSlugs, classcardDonePartCounts } from "./scraper-classcard";
import { scrapeClass5All, scrapeClass5Past, class5PastDates, class5DonePartSlugs, class5DonePartCounts } from "./scraper-class5";
import { loadClasscardConfig } from "./verify-auto";
import { reconcileAutoChecks, reconcileDailykorPast, reconcileClass5Past, runIncompleteNotify } from "./completion-notify";

// 클릭 없이 전 학생 자동인증(오토보카·매일국어·클래스카드)을 스케줄로 기록한다.
// 클래스카드는 교사 "엑셀 저장" 엔드포인트를 사용(문법·어휘·본문·듣기, 점수 무관 완료 판정).

const autovocaId = defineSecret("AUTOVOCA_ID");
const classcardId = defineSecret("CLASSCARD_ID");
const teacherPw = defineSecret("TEACHER_PW");
const autovocaHmacSecret = defineSecret("AUTOVOCA_HMAC_SECRET");
const coworkSecret = defineSecret("COWORK_SECRET");

const SECRETS = [autovocaId, classcardId, teacherPw, autovocaHmacSecret];

function norm(s: unknown) { return String(s ?? "").replace(/\s+/g, ""); }
function todayKst() { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }

async function runBatch(date: string) {
  // 전체 children 로드 → 이름/외부아이디 매핑
  const snap = await db.collection("children").get();
  const children = snap.docs.map((d) => ({
    id: d.id, name: norm(d.data().name),
    av: String(d.data().autovocaLoginId ?? "").toLowerCase(),
    cc: String(d.data().classcardLoginId ?? "").toLowerCase(),
    c5: String(d.data().class5StudentId ?? ""),
  }));
  const byAv = new Map<string, string>();
  children.forEach((c) => { if (c.av) byAv.set(c.av, c.id); });
  const byCc = new Map<string, string>();
  children.forEach((c) => { if (c.cc) byCc.set(c.cc, c.id); });
  const byC5 = new Map<string, string>();
  children.forEach((c) => { if (c.c5) byC5.set(c.c5, c.id); });
  const matchName = (nm: string): string | undefined => {
    const n = norm(nm);
    return children.find((c) => c.name && (n === c.name || n.endsWith(c.name) || n.includes(c.name) || c.name.endsWith(n)))?.id;
  };

  const summary = { autovoca: { ok: 0, miss: 0 }, dailykor: { ok: 0, miss: 0 }, classcard: { ok: 0, miss: 0 }, class5: { ok: 0, miss: 0 } };

  // 오토보카
  try {
    const av = await scrapeAutovocaAll({ loginId: autovocaId.value(), loginPw: teacherPw.value(), hmacSecret: autovocaHmacSecret.value() }, date);
    for (const s of av) {
      const childId = (s.loginId && byAv.get(s.loginId.toLowerCase())) || matchName(s.name);
      if (!childId) { summary.autovoca.miss++; continue; }
      await writeAutoLog({ childId, serviceSlug: "autovoca", date, autoStatus: s.autoStatus, scrapedData: { source: "autovoca", units: s.units, totalStudyMinutes: s.totalStudyMinutes } });
      // 배치는 리포트에 나온 학생만 처리 → 확정 판정. 완료는 done, 그 외는 미인증 자기체크 해제.
      await reconcileAutoChecks(childId, "autovoca", date, autovocaDonePartSlugs(s.units), s.autoStatus === "완료", autovocaDonePartCounts(s.units) ?? undefined).catch(() => undefined);
      if (s.loginId && !byAv.has(s.loginId.toLowerCase())) await db.collection("children").doc(childId).update({ autovocaLoginId: s.loginId.toLowerCase() }).catch(() => undefined);
      summary.autovoca.ok++;
    }
  } catch (e) { functions.logger.error("[batch] autovoca 실패", { error: String(e) }); }

  // 매일국어
  try {
    const dk = await scrapeDailykorAll({ id: classcardId.value(), pw: teacherPw.value() }, date);
    for (const s of dk.students) {
      const childId = matchName(s.name);
      if (!childId) { summary.dailykor.miss++; continue; }
      await writeAutoLog({ childId, serviceSlug: "dailykor", date, autoStatus: s.autoStatus, scrapedData: { source: "dailykor", units: s.units, totalStudyMinutes: 0, detail: s.detail ?? null, voca: s.voca ?? null } });
      // sreport 완료 → daily 파트, 오늘 어휘 세트 있으면 vocab-center 파트. 그 외는 미인증 자기체크 해제.
      const dkParts = s.autoStatus === "완료" ? [...DAILYKOR_REPORT_PARTS] : [];
      if ((s.voca?.length ?? 0) > 0) dkParts.push("vocab-center");
      await reconcileAutoChecks(childId, "dailykor", date, dkParts, s.autoStatus === "완료").catch(() => undefined);
      summary.dailykor.ok++;
    }
    // 과거 날짜 정정 — 오늘 학습이 없는 학생도 대상(지난 날짜 지문만 만회한 경우를 놓치지 않는다)
    for (const [name, monthStatus] of Object.entries(dk.monthByName)) {
      const childId = matchName(name);
      if (!childId) continue;
      await reconcileDailykorPast(childId, monthStatus, date).catch((e) => functions.logger.warn("[batch] dailykor 과거정정 실패", { name, error: String(e) }));
    }
  } catch (e) { functions.logger.error("[batch] dailykor 실패", { error: String(e) }); }

  // 클래스카드 (문법·어휘·본문·듣기) — 교사 엑셀 리포트 기반
  try {
    const cfg = await loadClasscardConfig();
    const cc = await scrapeClasscardAll({ loginId: classcardId.value(), loginPw: teacherPw.value() }, cfg, date);
    for (const s of cc) {
      const childId = (s.loginId && byCc.get(s.loginId.toLowerCase())) || matchName(s.name);
      if (!childId) { summary.classcard.miss++; continue; }
      await writeAutoLog({
        childId, serviceSlug: "classcard-middle", date, autoStatus: s.autoStatus,
        scrapedData: { source: "classcard", units: s.units, totalStudyMinutes: s.units.reduce((a, u) => a + (u.studyMinutes || 0), 0) },
      });
      // 파트 단위 정밀 체크: 완료 유닛 타입은 done, 그 외 오늘 과제의 미인증 자기체크는 해제.
      await reconcileAutoChecks(childId, "classcard-middle", date, classcardDonePartSlugs(s.units), s.autoStatus === "완료", classcardDonePartCounts(s.units)).catch(() => undefined);
      if (s.loginId && !byCc.has(s.loginId.toLowerCase())) {
        await db.collection("children").doc(childId).update({ classcardLoginId: s.loginId.toLowerCase() }).catch(() => undefined);
      }
      summary.classcard.ok++;
    }
  } catch (e) { functions.logger.error("[batch] classcard 실패", { error: String(e) }); }

  // 클래스5 (Phonics·Song·Movie·Reading·Writing) — 교사 계정은 클래스카드와 동일
  try {
    const c5 = await scrapeClass5All({ id: classcardId.value(), pw: teacherPw.value() }, date);
    for (const s of c5) {
      const childId = byC5.get(s.studentId) || matchName(s.name);
      if (!childId) { summary.class5.miss++; continue; }
      await writeAutoLog({
        childId, serviceSlug: "class5", date, autoStatus: s.autoStatus,
        scrapedData: { source: "class5", units: s.units, totalStudyMinutes: 0 },
      });
      // 파트(카테고리) 단위 정밀 체크: 완료 카테고리는 done, 그 외 오늘 과제의 미인증 자기체크는 해제.
      await reconcileAutoChecks(childId, "class5", date, class5DonePartSlugs(s.units), s.autoStatus === "완료", class5DonePartCounts(s.units)).catch(() => undefined);
      if (!byC5.has(s.studentId)) {
        await db.collection("children").doc(childId).update({ class5StudentId: s.studentId }).catch(() => undefined);
      }
      summary.class5.ok++;
    }
    // 과거 배정일 정정 — 배정일 이후 완료(만회)와 뒤늦게 확인된 정시 완료를 구분해 기록.
    // 오늘 과제가 없는 학생도 대상(지난 날짜만 만회한 경우를 놓치지 않는다).
    const past = await scrapeClass5Past({ id: classcardId.value(), pw: teacherPw.value() }, class5PastDates(date));
    for (const [studentId, byDate] of Object.entries(past.byStudentId)) {
      const childId = byC5.get(studentId) || matchName(past.roster.get(studentId) ?? "");
      if (!childId) continue;
      await reconcileClass5Past(childId, byDate, date).catch((e) => functions.logger.warn("[batch] class5 과거정정 실패", { studentId, error: String(e) }));
    }
  } catch (e) { functions.logger.error("[batch] class5 실패", { error: String(e) }); }

  functions.logger.info("[batch] 완료", { date, summary });
  return summary;
}

// 스케줄: 매일 09/13/17/21시 KST 자동 실행 (하루 학습을 반복 갱신)
// 21시 실행에서는 스크랩 완료 후 미완료 알림까지 체이닝 — "싹 긁어 완료 갱신 → 그래도 안 한 학생만 알림".
export const autoVerifyScheduled = onSchedule(
  { schedule: "0 9,13,17,21 * * *", timeZone: "Asia/Seoul", secrets: [...SECRETS, solapiApiKey, solapiApiSecret], timeoutSeconds: 540, memory: "512MiB" },
  async () => {
    await runBatch(todayKst());
    // 21시 실행: 스크랩이 완료 마크를 모두 갱신한 뒤에 미완료 학생 알림 (순서 보장)
    const kstHour = new Date(Date.now() + 9 * 3600e3).getUTCHours();
    if (kstHour === 21) {
      try { await runIncompleteNotify(); }
      catch (e) { functions.logger.error("[batch] 미완료 알림 실패", { error: String(e) }); }
    }
  },
);

// 즉시 실행 트리거 (운영자용, COWORK_SECRET 필요)
export const runAutoVerifyNow = onRequest(
  { secrets: [...SECRETS, coworkSecret], cors: true, invoker: "public", timeoutSeconds: 540, memory: "512MiB" },
  async (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "") || String(req.query.key ?? "");
    if (token !== coworkSecret.value()) { res.status(403).json({ error: "no" }); return; }
    const date = String(req.query.date ?? todayKst());
    const summary = await runBatch(date);
    res.json({ ok: true, date, summary });
  },
);
