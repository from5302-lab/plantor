const admin = require("firebase-admin");

admin.initializeApp({ projectId: "plantor-from302" });

async function main() {
  const auth = admin.auth();
  const db = admin.firestore();

  const email = "from302@plantor.app";
  const password = "vision00^^";
  const displayName = "from302";

  // Auth 계정 생성
  let uid;
  try {
    const user = await auth.createUser({ email, password, displayName });
    uid = user.uid;
    console.log("✅ Auth 계정 생성:", uid);
  } catch (e) {
    if (e.code === "auth/email-already-exists") {
      const user = await auth.getUserByEmail(email);
      uid = user.uid;
      await auth.updateUser(uid, { password, displayName });
      console.log("✅ 기존 계정 업데이트:", uid);
    } else {
      throw e;
    }
  }

  // Firestore users 문서
  await db.collection("users").doc(uid).set({
    name: displayName,
    plantor_id: "from302",
    role: "admin",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log("✅ Firestore users 문서 저장 완료");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
