const admin = require("firebase-admin");
admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();

const NAMES = ["오준영", "오재영", "오수영"];

async function main() {
  for (const name of NAMES) {
    console.log(`\n===== ${name} =====`);
    const kids = await db.collection("children").where("name", "==", name).get();
    if (kids.empty) { console.log("children 문서 없음!"); continue; }
    for (const d of kids.docs) {
      const x = d.data();
      console.log(`[children/${d.id}] loginId=${JSON.stringify(x.loginId ?? null)} familyId=${x.familyId} grade=${x.grade ?? "-"}`);

      // loginId 중복 여부
      if (x.loginId) {
        const dup = await db.collection("children").where("loginId", "==", x.loginId).get();
        if (dup.size > 1) console.log(`  ⚠️ loginId "${x.loginId}" 를 가진 children ${dup.size}건: ${dup.docs.map(k => `${k.id}(${k.data().name})`).join(", ")}`);
        // 연결된 users 계정
        const users = await db.collection("users").where("plantor_id", "==", x.loginId).get();
        console.log(`  users(plantor_id=${x.loginId}): ${users.empty ? "없음 (학생 계정 미연결)" : users.docs.map(u => u.id).join(", ")}`);
      } else {
        console.log("  ⚠️ loginId 없음 → 학생 로그인/플랜 사용 불가");
      }

      // 구독
      const subs = await db.collection("subscriptions").where("childId", "==", d.id).get();
      console.log(`  subscriptions: ${subs.size}건 ${subs.docs.map(s => `${s.data().serviceSlug}(${s.data().status})`).join(", ")}`);

      // tasks
      const tasks = await db.collection("tasks").where("childId", "==", d.id).get();
      const byStatus = {};
      tasks.docs.forEach(t => { const s = t.data().status; byStatus[s] = (byStatus[s] || 0) + 1; });
      console.log(`  tasks: ${tasks.size}건 ${JSON.stringify(byStatus)}`);
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
