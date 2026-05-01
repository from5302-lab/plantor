/**
 * 실행 방법:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json node scripts/fix-donghan-duplicate.js
 *
 * service account key 발급:
 *   Firebase Console → ⚙️ 프로젝트 설정 → 서비스 계정 탭 → "새 비공개 키 생성"
 */
const admin = require("firebase-admin");

admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();

async function main() {
  // ─── 1. 송휘선(ssong1214) 중복 가족 정리 ──────────────────────────────────
  console.log("\n[1] 송휘선 중복 가족 카드 정리...");

  const familiesSnap = await db.collection("families")
    .where("phone", "==", "010-8777-7065")
    .orderBy("createdAt", "asc")
    .get();

  if (familiesSnap.size < 2) {
    // phone으로 못 찾으면 parentName으로 시도
    const byName = await db.collection("families")
      .where("parentName", "==", "송휘선")
      .orderBy("createdAt", "asc")
      .get();

    if (byName.size < 2) {
      console.log("  중복 없음 또는 이미 정리됨, 스킵.");
    } else {
      await deleteOldFamily(byName.docs);
    }
  } else {
    await deleteOldFamily(familiesSnap.docs);
  }

  // ─── 2. 김동한 · 한우주 할인 3000원 설정 ────────────────────────────────
  console.log("\n[2] 김동한 · 한우주 구독 discount → 3000...");

  for (const name of ["김동한", "한우주"]) {
    const childSnap = await db.collection("children").where("name", "==", name).get();
    if (childSnap.empty) { console.log(`  ❌ ${name} 못 찾음`); continue; }

    for (const childDoc of childSnap.docs) {
      const childId = childDoc.id;
      console.log(`  ✅ ${name} (childId: ${childId})`);
      const subs = await db.collection("subscriptions").where("childId", "==", childId).get();
      for (const sub of subs.docs) {
        await sub.ref.update({ discount: 3000 });
        console.log(`     구독 ${sub.id} → discount: 3000`);
      }
    }
  }

  console.log("\n✅ 완료");
}

async function deleteOldFamily(familyDocs) {
  // 가장 오래된 것(index 0)이 구 카드 → 삭제
  const oldFamily = familyDocs[0];
  const newFamily = familyDocs[familyDocs.length - 1];
  console.log(`  구 카드: ${oldFamily.id} (${oldFamily.data().createdAt?.toDate().toLocaleDateString("ko-KR")})`);
  console.log(`  신 카드: ${newFamily.id} (${newFamily.data().createdAt?.toDate().toLocaleDateString("ko-KR")}) ← 유지`);

  // 구 카드의 children 찾기
  const oldChildren = await db.collection("children").where("familyId", "==", oldFamily.id).get();
  for (const child of oldChildren.docs) {
    // 구독 삭제
    const subs = await db.collection("subscriptions").where("childId", "==", child.id).get();
    for (const sub of subs.docs) {
      await sub.ref.delete();
      console.log(`  🗑 구독 삭제: ${sub.id}`);
    }
    await child.ref.delete();
    console.log(`  🗑 자녀 삭제: ${child.id} (${child.data().name})`);
  }

  await oldFamily.ref.delete();
  console.log(`  🗑 구 가족 카드 삭제: ${oldFamily.id}`);
}

main().catch(console.error);
