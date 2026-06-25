// 임서주 직강 데이터 정합: 구독 endDate 5/31(stale) → 6/30, directClass serviceExpiry → 6/30
// 사용법: GOOGLE_APPLICATION_CREDENTIALS=... node scripts/repair-izapick-direct.js
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();

const CHILD_ID = "K1OuqN7QUSm9B8BmiLQa";
const DC_ID = "6MzSrGENwCxiv1rYiCQV";
const NEW_END = new Date("2026-06-30T23:59:59+09:00"); // KST 6/30 끝
const EXPIRY_STR = "2026-06-30";

async function main() {
  // 1) 전환된 구독 endDate 갱신
  const subSnap = await db.collection("subscriptions").where("childId", "==", CHILD_ID).get();
  console.log(`[subscriptions] childId=${CHILD_ID} → ${subSnap.size}건`);
  const batch = db.batch();
  let n = 0;
  for (const d of subSnap.docs) {
    const s = d.data();
    if (s.status !== "transferred") { console.log(`  skip ${s.serviceSlug} (status=${s.status})`); continue; }
    const before = s.endDate?.toDate?.()?.toISOString?.() ?? "null";
    batch.update(d.ref, { endDate: admin.firestore.Timestamp.fromDate(NEW_END) });
    console.log(`  ${s.serviceSlug}: endDate ${before} → ${NEW_END.toISOString()}`);
    n++;
  }

  // 2) directClass serviceExpiry 정합
  const dcRef = db.collection("directClasses").doc(DC_ID);
  const dc = await dcRef.get();
  if (dc.exists) {
    const se = dc.data().serviceExpiry ?? {};
    const fixed = {};
    for (const k of Object.keys(se)) fixed[k] = EXPIRY_STR;
    batch.update(dcRef, { serviceExpiry: fixed });
    console.log(`[directClass] serviceExpiry ${JSON.stringify(se)} → ${JSON.stringify(fixed)}`);
  }

  await batch.commit();
  console.log(`\n✅ 완료: 구독 ${n}건 + directClass serviceExpiry 갱신`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
