const admin = require("firebase-admin");

admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();

async function main() {
  const names = ["김동한", "한우주"];

  for (const name of names) {
    const snap = await db.collection("children").where("name", "==", name).get();
    if (snap.empty) { console.log(`❌ 못 찾음: ${name}`); continue; }

    for (const childDoc of snap.docs) {
      const childId = childDoc.id;
      console.log(`✅ ${name} (${childId})`);

      const subs = await db.collection("subscriptions").where("childId", "==", childId).get();
      for (const sub of subs.docs) {
        await sub.ref.update({ discount: 3000 });
        console.log(`   구독 ${sub.id} discount → 3000`);
      }
    }
  }
  console.log("완료");
}

main().catch(console.error);
