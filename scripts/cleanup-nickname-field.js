/**
 * children.displayName 정리 (1회성).
 *
 * 닉네임 기능을 접으면서(공유 카드가 실명+학년을 쓰게 됨) 이 필드를 읽는 곳이 없어졌다.
 * 자동 생성기가 남긴 "새싹310" 류 값만 남아 있어 지운다.
 *
 * 사용법:
 *   node scripts/cleanup-nickname-field.js --dry-run
 *   node scripts/cleanup-nickname-field.js
 */
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const snap = await db.collection("children").get();
  const targets = snap.docs.filter((d) => d.data().displayName !== undefined);

  for (const d of targets) {
    console.log(`  ${d.data().name} — displayName "${d.data().displayName}" 제거`);
    if (!DRY_RUN) await d.ref.update({ displayName: admin.firestore.FieldValue.delete() });
  }
  console.log(`\n대상 ${targets.length}건 / 전체 ${snap.size}명${DRY_RUN ? "  [DRY RUN]" : " — 제거 완료"}`);
}

main().catch((e) => { console.error("실패:", e.message); process.exit(1); });
