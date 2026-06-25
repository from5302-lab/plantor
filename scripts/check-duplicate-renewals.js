const admin = require("firebase-admin");
admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();

async function main() {
  const snap = await db.collection("renewalRequests").where("status", "==", "pending").get();
  console.log(`pending renewalRequests: ${snap.size}건\n`);

  // familyId + childId + serviceSlug 조합으로 그룹핑
  const groups = new Map();
  for (const d of snap.docs) {
    const data = d.data();
    const key = `${data.familyId}|${data.childId ?? "null"}|${data.serviceSlug}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({
      id: d.id,
      childName: data.childName,
      serviceName: data.serviceName,
      months: data.months,
      finalAmount: data.finalAmount,
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? "?",
    });
  }

  let dupCount = 0;
  for (const [key, items] of groups) {
    if (items.length > 1) {
      dupCount++;
      console.log(`\n💥 중복: ${key} (${items.length}건)`);
      for (const it of items) {
        console.log(`  - id=${it.id} childName=${it.childName} svcName=${it.serviceName} months=${it.months} final=${it.finalAmount} created=${it.createdAt}`);
      }
    }
  }

  console.log(`\n중복 그룹: ${dupCount}건 / 전체 고유 (childId+serviceSlug) 조합: ${groups.size}건`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
