const admin = require("firebase-admin");
admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();

const LOGINS = ["jayaprvn1", "jayelqu", "sueyeong", "sueyeoing"];
const OLD_CHILD = "PCr7O3VhQae6DgZZ3hzm";

async function main() {
  // 1) directClasses에서 세 학생 조회
  const dcs = await db.collection("directClasses").get();
  console.log(`=== directClasses 전체 ${dcs.size}건 중 매칭 ===`);
  dcs.docs.forEach((d) => {
    const cls = d.data();
    const hits = (cls.students ?? []).filter((s) =>
      LOGINS.includes((s.studentLoginId ?? "").toLowerCase())
    );
    if (hits.length) {
      console.log(`[directClasses/${d.id}] status=${cls.status} expiry=${cls.expiry ?? "-"} clsSlugs=${JSON.stringify(cls.serviceSlugs ?? [])}`);
      hits.forEach((h) => console.log(`  → ${h.studentLoginId} name=${h.studentName ?? "-"} slugs=${JSON.stringify(h.serviceSlugs ?? null)}`));
    }
  });

  // 2) 옛 오수영 child 문서 존재 여부 + 잔여 tasks
  const oldDoc = await db.collection("children").doc(OLD_CHILD).get();
  console.log(`\n=== 옛 오수영 children/${OLD_CHILD}: ${oldDoc.exists ? "존재함 ⚠️" : "삭제됨"} ===`);
  if (oldDoc.exists) console.log(oldDoc.data());
  const oldTasks = await db.collection("tasks").where("childId", "==", OLD_CHILD).get();
  console.log(`옛 childId의 tasks: ${oldTasks.size}건`);
  oldTasks.docs.forEach((t) => console.log(`  [tasks/${t.id}] ${t.data().title} status=${t.data().status}`));

  // 3) 세 학생 users 문서의 plantor_id 확인 (대소문자 등)
  console.log(`\n=== users plantor_id 정합성 ===`);
  for (const uid of ["7XzgWpYLlfSyqLCDy6Cc8XgNSjf1", "OYzLSB9wAkcBlVjNrnI0C1SU2Yk1", "eyYm5VZm43hjpSozD4zpg4BYSK72"]) {
    const u = await db.collection("users").doc(uid).get();
    console.log(`[users/${uid}] plantor_id=${JSON.stringify(u.data()?.plantor_id)} email=${u.data()?.email ?? "-"}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
