process.env.FIRESTORE_EMULATOR_HOST = "";
const admin = require("../functions/node_modules/firebase-admin");
admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();

async function main() {
  const snap = await db.collection("serviceOverrides").get();
  console.log("=== serviceOverrides 전체 목록 ===");
  const extras = [];
  snap.docs.forEach(d => {
    const data = d.data();
    console.log(`[${d.id}]`, JSON.stringify(data));
    if (data._extra) extras.push(d.id);
  });
  console.log("\n_extra 항목:", extras);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
