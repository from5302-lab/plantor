/**
 * 클래스5 문법(grammar) 자동체크 소급 복구.
 *
 * 2026-08-07 까지 스크래퍼가 movie_type "grammar" 를 판정에서 빠뜨려
 * 문법 과제가 전부 Movie 로 잡혔다. 그래서 grammar 파트 자동체크가 **한 건도** 기록되지 않았고,
 * 학부모 화면에는 아이가 실제로 한 문법 학습이 ✗ 로 남았다.
 *
 * 배치의 과거 정정 창은 7일이라 그 밖(과제 확정일 ~ 8일 전)은 손이 닿지 않는다.
 * 이 스크립트가 그 구간만 메운다.
 *
 * 판정은 functions/src/completion-notify.ts 의 reconcileClass5Past 와 **같은 규칙**이다.
 *   - 그날 예정된 요일(scheduleDays)에 배정된 과제만
 *   - 클래스5가 준 배정일·완료시각으로 정시/만회를 가른다 (추정 없음)
 *   - 없으면 만들고, not_done 이면 올린다. **done 을 지우거나 뒤집지 않는다.**
 *
 * XP 는 소급하지 않는다. 그날 리워드를 다시 계산하면 연속 학습일이 흔들린다.
 * 되살리는 것은 "그날 문법을 했다"는 기록뿐이다.
 *
 * 사용법:
 *   node scripts/backfill-class5-grammar.js            → 미리보기(쓰기 없음)
 *   node scripts/backfill-class5-grammar.js --apply    → 실제 반영
 */
const { createRequire } = require("node:module");
const path = require("node:path");

const funcRequire = createRequire(path.join(__dirname, "../functions/package.json"));
const admin = funcRequire("firebase-admin");
admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();
const { FieldValue } = funcRequire("firebase-admin/firestore");

const APPLY = process.argv.includes("--apply");
const PART = "grammar";
const TODAY = process.env.TODAY_KST || new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

const dowMon0 = (d) => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;

function dateRange(from, to) {
  const out = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86400e3) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

(async () => {
  const { scrapeClass5Past } = await import("../functions/lib/scraper-class5.js");

  // 자격증명은 배치와 같은 시크릿을 쓴다
  const { execFileSync } = require("node:child_process");
  const secret = (name) => execFileSync("gcloud",
    ["secrets", "versions", "access", "latest", `--secret=${name}`, "--project", "plantor-from302"],
    { encoding: "utf8" }).trim();
  const creds = { id: secret("CLASSCARD_ID"), pw: secret("TEACHER_PW") };

  // 대상: 확정된 클래스5 문법 과제
  const taskSnap = await db.collection("tasks")
    .where("serviceSlug", "==", "class5").where("status", "==", "confirmed").get();
  const tasks = taskSnap.docs.filter((d) => d.data().partSlug === PART && d.data().active !== false);
  if (!tasks.length) { console.log("문법 과제 없음 — 할 일 없음"); return; }

  // 과제가 확정된 날부터 어제까지 (그 전에는 애초에 예정이 없다)
  const starts = tasks.map((t) => (t.data().createdAt?.toDate?.() ?? t.data().confirmedAt?.toDate?.()));
  const from = new Date(Math.min(...starts.map((d) => d.getTime()))).toISOString().slice(0, 10);
  const to = new Date(Date.parse(`${TODAY}T00:00:00Z`) - 86400e3).toISOString().slice(0, 10);
  const dates = dateRange(from, to);
  console.log(`${APPLY ? "[반영]" : "[미리보기]"} ${from} ~ ${to} (${dates.length}일) · 문법 과제 ${tasks.length}건\n`);

  const { byStudentId } = await scrapeClass5Past(creds, dates);

  let added = 0, upgraded = 0;
  for (const t of tasks) {
    const cid = t.data().childId;
    const child = (await db.collection("children").doc(cid).get()).data();
    const sid = String(child?.class5StudentId ?? "");
    if (!sid || !byStudentId[sid]) { console.log(`  ${child?.name ?? cid}: 클래스5 연결 없음 — 건너뜀`); continue; }
    const days = t.data().scheduleDays;
    if (!Array.isArray(days)) continue;

    const rows = [];
    for (const date of dates) {
      if (!days.includes(dowMon0(date))) continue;          // 그날 예정된 과제만
      const hit = byStudentId[sid][date]?.parts?.[PART];
      if (!hit) continue;                                    // 그날 문법을 안 했다
      const existing = await db.collection("taskChecks")
        .where("taskId", "==", t.id).where("date", "==", date).limit(1).get();
      const status = hit.late ? "made_up" : "done";
      if (existing.empty) {
        rows.push([date, status, "신규"]);
        added++;
        if (APPLY) {
          await db.collection("taskChecks").add({
            taskId: t.id, childId: cid, date, status,
            detail: hit.late ? "자동인증(배정일 이후 만회)" : "자동인증(과거 날짜 확인)",
            reason: null, reasonNote: null, checkedBy: "agent",
            checkedAt: FieldValue.serverTimestamp(),
            ...(hit.late ? { madeUpAt: FieldValue.serverTimestamp() } : {}),
          });
        }
      } else if (existing.docs[0].data().status === "not_done") {
        rows.push([date, status, "미완료였던 것 올림"]);
        upgraded++;
        if (APPLY) {
          await existing.docs[0].ref.update(hit.late
            ? { status: "made_up", madeUpAt: FieldValue.serverTimestamp() }
            : { status: "done", checkedBy: "agent", checkedAt: FieldValue.serverTimestamp(), reason: null, reasonNote: null });
        }
      }
    }
    console.log(`  ${child.name} ${child.grade ?? ""} — ${rows.length}건`);
    for (const [d, s, why] of rows) console.log(`     ${d}  ${s}  (${why})`);
  }

  console.log(`\n신규 ${added}건 · 올림 ${upgraded}건`);
  if (!APPLY) console.log("반영하려면 --apply");
})().catch((e) => { console.error(e); process.exit(1); });
