/**
 * 연속 학습일(stats/summary.streak) 재계산.
 *
 * 2026-08-06 에 규칙이 바뀌었다 — 사이에 낀 날이 전부 '계획 없는 요일'이면
 * 연속이 이어진다(주말 계획이 없으면 금→월도 연속). 그 전에 주말 때문에 끊긴
 * 기록을 새 규칙으로 다시 계산해 되살린다.
 *
 * 판정은 functions/src/rewards.ts 의 continuesStreak 와 **같은 규칙**이다.
 * 여기가 어긋나면 백필 직후 다음 적립에서 값이 튄다.
 *
 * 적립일 출처: children/{id}/xpLedger 의 date (xp > 0 인 것).
 * 계획 요일 출처: tasks (status=confirmed) 의 scheduleDays.
 *
 * 사용법:
 *   node scripts/rebuild-streaks.js            → 미리보기(쓰기 없음)
 *   node scripts/rebuild-streaks.js --apply    → 실제 반영
 */
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();

const APPLY = process.argv.includes("--apply");

function prevDate(d) {
  return new Date(new Date(`${d}T00:00:00Z`).getTime() - 86400e3).toISOString().slice(0, 10);
}
function dowOf(d) {
  return (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7; // 0=월
}

/** rewards.ts 의 continuesStreak 와 동일 */
function continuesStreak(lastEarnDate, date, plannedDows) {
  if (!lastEarnDate) return false;
  if (lastEarnDate === prevDate(date)) return true;
  if (lastEarnDate >= date) return false;
  if (plannedDows.size === 0) return false;
  let cursor = prevDate(date);
  let gap = 0;
  while (cursor > lastEarnDate) {
    if (++gap > 14) return false;
    if (plannedDows.has(dowOf(cursor))) return false;
    cursor = prevDate(cursor);
  }
  return cursor === lastEarnDate;
}

async function main() {
  const children = await db.collection("children").get();
  const rows = [];
  const skipped = [];

  for (const child of children.docs) {
    const name = String(child.data().name ?? "");

    // 계획 요일
    const tasks = await db.collection("tasks")
      .where("childId", "==", child.id).where("status", "==", "confirmed").get();
    const plannedDows = new Set();
    tasks.docs.forEach((t) => {
      const days = t.data().scheduleDays;
      if (Array.isArray(days)) days.forEach((n) => { if (typeof n === "number") plannedDows.add(n); });
    });

    // 적립일 (xp > 0)
    const ledger = await child.ref.collection("xpLedger").get();
    const dates = [...new Set(
      ledger.docs.filter((d) => Number(d.data().xp ?? 0) > 0).map((d) => String(d.data().date ?? "")),
    )].filter(Boolean).sort();
    if (dates.length === 0) continue;

    // 새 규칙으로 처음부터 다시 센다
    let streak = 0, last = "";
    for (const d of dates) {
      streak = continuesStreak(last, d, plannedDows) ? streak + 1 : 1;
      last = d;
    }

    const statsRef = child.ref.collection("stats").doc("summary");
    const cur = Number((await statsRef.get()).data()?.streak ?? 0);
    if (cur === streak) continue;

    // 지금도 살아 있는 연속만 되살린다.
    // 과거 기록만 보면 몇 주째 학습이 없는 학생도 "4일 연속"으로 복구되는데,
    // 화면에는 지금 이어지는 것처럼 보여 사실과 다르게 읽힌다.
    const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    const alive = last === today || continuesStreak(last, today, plannedDows);
    if (!alive) {
      skipped.push({ name, cur, next: streak, last });
      continue;
    }

    rows.push({ id: child.id, name, cur, next: streak, last, dows: [...plannedDows].sort().join(""), ref: statsRef });
  }

  const WD = ["월", "화", "수", "목", "금", "토", "일"];
  for (const r of rows) {
    const dowLabel = r.dows ? [...r.dows].map((n) => WD[Number(n)]).join("") : "계획없음";
    console.log(`  ${r.name.padEnd(8)} ${String(r.cur).padStart(3)} → ${String(r.next).padStart(3)}일   마지막 적립 ${r.last} (계획 ${dowLabel})`);
  }
  if (skipped.length) {
    console.log("\n건너뜀 — 이미 끊긴 지 오래라 되살리면 사실과 달라진다:");
    skipped.forEach((r) => console.log(`  ${r.name.padEnd(8)} ${r.cur} → (${r.next}) 마지막 적립 ${r.last}`));
  }
  console.log(`\n대상 ${rows.length}명 ${APPLY ? "(반영함)" : "(미리보기 — 쓰기 없음)"}`);

  if (APPLY && rows.length) {
    const batch = db.batch();
    rows.forEach((r) => batch.set(r.ref, { streak: r.next }, { merge: true }));
    await batch.commit();
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
