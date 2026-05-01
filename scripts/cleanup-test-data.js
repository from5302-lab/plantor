const admin = require("firebase-admin");

admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();
const auth = admin.auth();

async function main() {
  // 1. 테스트 families 찾기
  const familiesSnap = await db.collection("families").where("parentName", "==", "테스트부모").get();
  const familyIds = familiesSnap.docs.map((d) => d.id);
  console.log("families 발견:", familyIds);

  // 2. children 찾기 (familyId 기준 + loginId 기준)
  let childIds = [];
  let childLoginIds = [];
  for (const fid of familyIds) {
    const snap = await db.collection("children").where("familyId", "==", fid).get();
    snap.docs.forEach((d) => { childIds.push(d.id); childLoginIds.push(d.data().loginId); });
  }
  // testmom/testkid/son 직접도 찾기
  for (const loginId of ["testmom", "testkid", "son"]) {
    const snap = await db.collection("children").where("loginId", "==", loginId).get();
    snap.docs.forEach((d) => { if (!childIds.includes(d.id)) { childIds.push(d.id); childLoginIds.push(loginId); } });
  }
  console.log("children 발견:", childIds, "loginIds:", childLoginIds);

  // 3. subscriptions 삭제
  let subCount = 0;
  for (const cid of childIds) {
    const snap = await db.collection("subscriptions").where("childId", "==", cid).get();
    for (const d of snap.docs) { await d.ref.delete(); subCount++; }
  }
  for (const fid of familyIds) {
    const snap = await db.collection("subscriptions").where("familyId", "==", fid).get();
    for (const d of snap.docs) { await d.ref.delete(); subCount++; }
  }
  console.log("subscriptions 삭제:", subCount);

  // 4. children 삭제
  for (const cid of childIds) { await db.collection("children").doc(cid).delete(); }
  console.log("children 삭제:", childIds.length);

  // 5. families 삭제
  for (const fid of familyIds) { await db.collection("families").doc(fid).delete(); }
  console.log("families 삭제:", familyIds.length);

  // 6. signups 삭제 (parentName 기준)
  const signupsSnap = await db.collection("signups").where("parentName", "==", "테스트부모").get();
  for (const d of signupsSnap.docs) { await d.ref.delete(); }
  console.log("signups 삭제:", signupsSnap.size);

  // 7. Firebase Auth 계정 삭제
  const authIds = ["testmom", "testkid", "son", ...childLoginIds];
  let authDeleted = 0;
  for (const id of [...new Set(authIds)]) {
    const email = `${id}@plantor.app`;
    try {
      const user = await auth.getUserByEmail(email);
      // users 문서도 삭제
      await db.collection("users").doc(user.uid).delete();
      await auth.deleteUser(user.uid);
      console.log(`  Auth 삭제: ${email}`);
      authDeleted++;
    } catch { /* 없으면 무시 */ }
  }
  console.log("Auth 계정 삭제:", authDeleted);
  console.log("✅ 완료");
}

main().catch(console.error).finally(() => process.exit());
