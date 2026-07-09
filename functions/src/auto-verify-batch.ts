import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as functions from "firebase-functions";
import { db } from "./config";
import { writeAutoLog } from "./auto-log";
import { scrapeAutovocaAll, autovocaDonePartSlugs } from "./scraper-autovoca";
import { scrapeDailykorAll, DAILYKOR_REPORT_PARTS } from "./scraper-dailykor";
import { scrapeClasscardAll, classcardDonePartSlugs } from "./scraper-classcard";
import { loadClasscardConfig } from "./verify-auto";
import { reconcileAutoChecks } from "./completion-notify";

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
  }));
  const byAv = new Map<string, string>();
  children.forEach((c) => { if (c.av) byAv.set(c.av, c.id); });
  const byCc = new Map<string, string>();
  children.forEach((c) => { if (c.cc) byCc.set(c.cc, c.id); });
  const matchName = (nm: string): string | undefined => {
    const n = norm(nm);
    return children.find((c) => c.name && (n === c.name || n.endsWith(c.name) || n.includes(c.name) || c.name.endsWith(n)))?.id;
  };

  const summary = { autovoca: { ok: 0, miss: 0 }, dailykor: { ok: 0, miss: 0 }, classcard: { ok: 0, miss: 0 } };

  // 오토보카
  try {
    const av = await scrapeAutovocaAll({ loginId: autovocaId.value(), loginPw: teacherPw.value(), hmacSecret: autovocaHmacSecret.value() }, date);
    for (const s of av) {
      const childId = (s.loginId && byAv.get(s.loginId.toLowerCase())) || matchName(s.name);
      if (!childId) { summary.autovoca.miss++; continue; }
      await writeAutoLog({ childId, serviceSlug: "autovoca", date, autoStatus: s.autoStatus, scrapedData: { source: "autovoca", units: s.units, totalStudyMinutes: s.totalStudyMinutes } });
      // 배치는 리포트에 나온 학생만 처리 → 확정 판정. 완료는 done, 그 외는 미인증 자기체크 해제.
      await reconcileAutoChecks(childId, "autovoca", date, autovocaDonePartSlugs(s.units), s.autoStatus === "완료").catch(() => undefined);
      if (s.loginId && !byAv.has(s.loginId.toLowerCase())) await db.collection("children").doc(childId).update({ autovocaLoginId: s.loginId.toLowerCase() }).catch(() => undefined);
      summary.autovoca.ok++;
    }
  } catch (e) { functions.logger.error("[batch] autovoca 실패", { error: String(e) }); }

  // 매일국어
  try {
    const dk = await scrapeDailykorAll({ id: classcardId.value(), pw: teacherPw.value() }, date);
    for (const s of dk) {
      const childId = matchName(s.name);
      if (!childId) { summary.dailykor.miss++; continue; }
      await writeAutoLog({ childId, serviceSlug: "dailykor", date, autoStatus: s.autoStatus, scrapedData: { source: "dailykor", units: s.units, totalStudyMinutes: 0 } });
      // sreport는 "오늘의 학습"만 반영 → daily 파트. 완료는 done, 그 외는 미인증 자기체크 해제.
      await reconcileAutoChecks(childId, "dailykor", date, s.autoStatus === "완료" ? DAILYKOR_REPORT_PARTS : [], s.autoStatus === "완료").catch(() => undefined);
      summary.dailykor.ok++;
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
      await reconcileAutoChecks(childId, "classcard-middle", date, classcardDonePartSlugs(s.units), s.autoStatus === "완료").catch(() => undefined);
      if (s.loginId && !byCc.has(s.loginId.toLowerCase())) {
        await db.collection("children").doc(childId).update({ classcardLoginId: s.loginId.toLowerCase() }).catch(() => undefined);
      }
      summary.classcard.ok++;
    }
  } catch (e) { functions.logger.error("[batch] classcard 실패", { error: String(e) }); }

  functions.logger.info("[batch] 완료", { date, summary });
  return summary;
}

// 스케줄: 매일 09/13/17/21시 KST 자동 실행 (하루 학습을 반복 갱신)
export const autoVerifyScheduled = onSchedule(
  { schedule: "0 9,13,17,21 * * *", timeZone: "Asia/Seoul", secrets: SECRETS, timeoutSeconds: 540, memory: "512MiB" },
  async () => { await runBatch(todayKst()); },
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
