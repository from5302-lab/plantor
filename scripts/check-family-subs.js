const admin = require("firebase-admin");
admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();

async function main() {
  const familyId = process.argv[2] || "notion_camellia124";
  console.log(`\n=== families/${familyId} ===`);
  const fSnap = await db.collection("families").doc(familyId).get();
  console.log(fSnap.data());

  console.log(`\n=== subscriptions where familyId == ${familyId} ===`);
  const subs = await db.collection("subscriptions").where("familyId", "==", familyId).get();
  for (const d of subs.docs) {
    const x = d.data();
    console.log(`[${d.id}]`, JSON.stringify({
      familyId: x.familyId, childId: x.childId, serviceSlug: x.serviceSlug,
      status: x.status, startDate: x.startDate?.toDate?.()?.toISOString(),
      endDate: x.endDate?.toDate?.()?.toISOString(),
      createdAt: x.createdAt?.toDate?.()?.toISOString(),
    }, null, 2));
  }

  console.log(`\n=== renewalRequests where familyId == ${familyId} ===`);
  const reqs = await db.collection("renewalRequests").where("familyId", "==", familyId).get();
  for (const d of reqs.docs) {
    const x = d.data();
    console.log(`[${d.id}]`, JSON.stringify({
      childId: x.childId, childName: x.childName, serviceSlug: x.serviceSlug,
      months: x.months, subscriptionId: x.subscriptionId, status: x.status,
      isParentService: x.isParentService,
      createdAt: x.createdAt?.toDate?.()?.toISOString(),
    }, null, 2));
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
