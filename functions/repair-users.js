const admin = require("firebase-admin");

admin.initializeApp({ projectId: "plantor-from302" });

const db = admin.firestore();
const auth = admin.auth();

async function main() {
  const childrenSnap = await db.collection("children").get();
  let fixed = 0;

  for (const childDoc of childrenSnap.docs) {
    const data = childDoc.data();
    const loginId = data.loginId?.toLowerCase();
    if (!loginId) continue;

    const email = `${loginId}@plantor.app`;
    try {
      const userRecord = await auth.getUserByEmail(email);
      await db.collection("users").doc(userRecord.uid).set({
        name: data.name ?? "",
        plantor_id: loginId,
        role: "student",
        grade: data.grade ?? "",
        parentUid: data.userId ?? null,
      }, { merge: true });
      console.log(`✅ 복구: ${loginId} (uid: ${userRecord.uid})`);
      fixed++;
    } catch (e) {
      console.log(`⚠️  스킵: ${loginId} — ${e.message}`);
    }
  }

  console.log(`\n완료: ${fixed}건 복구됨`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
