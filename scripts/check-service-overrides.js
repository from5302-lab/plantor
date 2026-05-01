const admin = require("firebase-admin");
admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();

async function main() {
  const snap = await db.collection("serviceOverrides").get();
  console.log("=== serviceOverrides ===");
  snap.docs.forEach(d => {
    console.log(`[${d.id}]`, JSON.stringify(d.data(), null, 2));
  });
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
