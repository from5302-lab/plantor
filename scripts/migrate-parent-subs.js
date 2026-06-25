/**
 * 학부모 서비스 subscription의 childId를 null로 통일.
 * + 수현 가족의 great-books 중복 sub 통합.
 *
 *   - childId="__parent__"인 모든 active sub → childId=null로 변경
 *   - 수현(notion_camellia124)의 great-books:
 *       옛 sub (SnuI2acMSbUwcrWMZt3N) endDate를 새 sub의 endDate로 업데이트
 *       새 sub (qAHDYFRUjyehBzKuMCF9) 삭제
 *
 * --dry-run 으로 미리 확인.
 */
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(DRY_RUN ? "🧪 DRY RUN\n" : "🚀 EXECUTE\n");

  // === 1) 수현 가족 중복 sub 통합 ===
  console.log("=== Step A: 수현 가족 중복 sub 통합 ===");
  const OLD = "SnuI2acMSbUwcrWMZt3N";
  const NEW = "qAHDYFRUjyehBzKuMCF9";

  const [oldSnap, newSnap] = await Promise.all([
    db.collection("subscriptions").doc(OLD).get(),
    db.collection("subscriptions").doc(NEW).get(),
  ]);

  if (!oldSnap.exists || !newSnap.exists) {
    console.log("⚠️ 둘 중 하나가 없음 — Step A 건너뜀");
  } else {
    const oldData = oldSnap.data();
    const newData = newSnap.data();
    console.log(`  옛 ${OLD}: childId=${oldData.childId} endDate=${oldData.endDate?.toDate?.()?.toISOString()}`);
    console.log(`  새 ${NEW}: childId=${newData.childId} endDate=${newData.endDate?.toDate?.()?.toISOString()}`);
    console.log(`  → 옛 sub에 새 endDate 옮기고 childId=null로 정리, 새 sub 삭제`);

    if (!DRY_RUN) {
      await oldSnap.ref.update({
        childId: null,
        endDate: newData.endDate, // 새 만료일 적용
        // startDate / createdAt 유지
        status: "active",
      });
      await newSnap.ref.delete();
      console.log(`  ✅ 완료`);
    }
  }

  // === 2) 전체 __parent__ → null 마이그레이션 ===
  console.log("\n=== Step B: childId='__parent__' → null 전체 변환 ===");
  const allParent = await db.collection("subscriptions")
    .where("childId", "==", "__parent__")
    .get();
  console.log(`  대상: ${allParent.size}건`);

  let migrated = 0;
  for (const d of allParent.docs) {
    const data = d.data();
    console.log(`  - ${d.id}: familyId=${data.familyId} svc=${data.serviceSlug} endDate=${data.endDate?.toDate?.()?.toISOString()}`);
    if (!DRY_RUN) {
      await d.ref.update({ childId: null });
      migrated++;
    }
  }
  if (!DRY_RUN) console.log(`  ✅ ${migrated}건 migrated`);

  // === 3) 검증 ===
  console.log("\n=== Step C: 사후 검증 ===");
  if (!DRY_RUN) {
    const leftover = await db.collection("subscriptions").where("childId", "==", "__parent__").get();
    console.log(`  childId='__parent__' 잔여: ${leftover.size}건 (0이어야 함)`);
    const sooHyun = await db.collection("subscriptions")
      .where("familyId", "==", "notion_camellia124")
      .where("serviceSlug", "==", "great-books").get();
    console.log(`  수현 great-books sub 수: ${sooHyun.size}건 (1이어야 함)`);
    for (const d of sooHyun.docs) {
      console.log(`    [${d.id}] childId=${d.data().childId} endDate=${d.data().endDate?.toDate?.()?.toISOString()}`);
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
