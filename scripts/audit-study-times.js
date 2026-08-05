// 학습 시각 기록 점검 — 저장된 learningLogs 에서 말이 안 되는 시각을 찾아낸다.
//
// 2026-08-05 에 두 종류의 사고가 있었다:
//   1) 시작 > 종료 ("23:47 ~ 20:12") — unit_start/unit_end 가 서로 다른 날짜인데
//      날짜를 버리고 시:분만 뽑아 써서 생겼다.
//   2) undefined 필드 하나 때문에 학습로그 문서 전체가 저장되지 않았다.
// 둘 다 화면에 드러나기 전까지 아무도 몰랐다. 그래서 눈이 아니라 이 스크립트로 본다.
//
// 실행: node scripts/audit-study-times.js [YYYY-MM-DD]   (기본: 최근 7일)

const admin = require("firebase-admin");
admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();

const toMin = (v) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v ?? "");
  if (!m) return null;
  const h = +m[1]; const mi = +m[2];
  return h < 24 && mi < 60 ? h * 60 + mi : null;
};

function checkUnit(u) {
  const s = toMin(u.startAt); const e = toMin(u.endAt);
  const mins = Number(u.studyMinutes) || 0;
  if (u.startAt && s == null) return `startAt 형식 이상: ${u.startAt}`;
  if (u.endAt && e == null) return `endAt 형식 이상: ${u.endAt}`;
  if (s != null && e != null && e < s) return `종료가 시작보다 빠름: ${u.startAt} ~ ${u.endAt}`;
  // 학습 창을 열어둔 시간에는 쉰 시간이 섞이므로 여유를 크게 준다.
  // 그래도 3시간 넘게 벌어지면 값이 깨진 것으로 본다(표시 로직과 같은 기준).
  if (s != null && e != null && mins > 0 && e - s > mins + 180) {
    return `구간(${e - s}분)이 학습시간(${mins}분)보다 3시간 넘게 김: ${u.startAt} ~ ${u.endAt}`;
  }
  return null;
}

(async () => {
  const arg = process.argv[2];
  const dates = [];
  if (arg) dates.push(arg);
  else {
    const now = new Date(Date.now() + 9 * 3600 * 1000);
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getTime() - i * 86400000);
      dates.push(d.toISOString().slice(0, 10));
    }
  }

  const names = new Map();
  for (const k of (await db.collection("children").get()).docs) names.set(k.id, k.data().name);

  let scanned = 0; const problems = [];
  for (const date of dates) {
    const logs = await db.collection("learningLogs").where("date", "==", date).get();
    for (const d of logs.docs) {
      const x = d.data();
      for (const u of x.scrapedData?.units ?? []) {
        scanned++;
        const bad = checkUnit(u);
        if (bad) problems.push(`${date} ${names.get(x.childId) ?? x.childId} [${x.serviceSlug}] ${u.unitLabel ?? "?"} — ${bad}`);
      }
    }
  }

  console.log(`검사 대상: ${dates.length}일 · 유닛 ${scanned}개`);
  if (!problems.length) { console.log("이상 없음"); return; }
  console.log(`\n문제 ${problems.length}건:`);
  for (const p of problems) console.log("  " + p);
  process.exitCode = 1;
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
