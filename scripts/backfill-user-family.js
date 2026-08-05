/**
 * users.familyId 백필 (1회성).
 *
 * children 읽기 규칙을 "내 가족만"으로 좁히려면 보안 규칙이 uid로 가족을 알아야 한다.
 * 규칙은 쿼리를 못 하고 get(경로)만 되므로, users 문서에 familyId를 비정규화해 둔다.
 *
 * 해결 경로 (앞에서부터 시도):
 *   1) families.userId == uid                (학부모)
 *   2) families.parentPlantorId == plantor_id (학부모, 옛 데이터)
 *   3) children.loginId == plantor_id         (학생 본인 문서의 familyId)
 *   4) users.parentUid → 부모의 가족           (학생)
 *
 * 신규 계정은 approveSignup·createChildAccount 가 직접 넣으므로 이 스크립트는 기존분 전용.
 *
 * 사용법:
 *   node scripts/backfill-user-family.js --dry-run
 *   node scripts/backfill-user-family.js
 */
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const [users, families, children] = await Promise.all([
    db.collection("users").get(),
    db.collection("families").get(),
    db.collection("children").get(),
  ]);

  const byUserId = new Map(families.docs.map((d) => [d.data().userId, d.id]));
  const byParentPid = new Map(
    families.docs
      .filter((d) => d.data().parentPlantorId)
      .map((d) => [String(d.data().parentPlantorId).toLowerCase(), d.id]),
  );
  const byChildLogin = new Map(
    children.docs.map((d) => [String(d.data().loginId ?? "").toLowerCase(), d.data().familyId]),
  );
  const userById = new Map(users.docs.map((d) => [d.id, d.data()]));

  let updated = 0, skipped = 0;
  const unresolved = [];

  for (const doc of users.docs) {
    const u = doc.data();
    if (u.role === "admin") { skipped++; continue; }      // 운영자는 규칙이 따로 통과시킨다
    if (u.familyId) { skipped++; continue; }

    const pid = String(u.plantor_id ?? "").toLowerCase();
    let familyId = byUserId.get(doc.id) ?? byParentPid.get(pid) ?? byChildLogin.get(pid) ?? null;
    if (!familyId && u.parentUid) {
      familyId = byUserId.get(u.parentUid) ?? null;
      if (!familyId) {
        const parent = userById.get(u.parentUid);
        if (parent) familyId = byParentPid.get(String(parent.plantor_id ?? "").toLowerCase()) ?? null;
      }
    }

    if (!familyId) { unresolved.push(`${u.role}/${u.name}(${pid})`); continue; }

    console.log(`  ${u.role.padEnd(7)} ${String(u.name).padEnd(10)} → ${familyId}`);
    if (!DRY_RUN) await doc.ref.set({ familyId }, { merge: true });
    updated++;
  }

  console.log(`\n갱신 ${updated}건 / 건너뜀 ${skipped}건 / 미해결 ${unresolved.length}건${DRY_RUN ? "  [DRY RUN]" : ""}`);
  // 미해결은 가족·자녀가 아예 없는 계정이라 규칙을 좁혀도 읽을 것이 없다
  unresolved.forEach((u) => console.log(`   ✗ ${u} (가족 없음 — 읽을 자녀도 없음)`));
}

main().catch((e) => { console.error("실패:", e.message); process.exit(1); });
