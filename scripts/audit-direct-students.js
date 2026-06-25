// 모든 1:1 직강 학생이 새 기능(수업일지 노출 + "1:1 수업 중" 배지)에 정상 적용되는지 감사
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();

async function main() {
  const now = new Date();
  const dcSnap = await db.collection("directClasses").where("status", "==", "active").get();
  console.log(`활성 directClasses ${dcSnap.size}건\n`);

  for (const dc of dcSnap.docs) {
    const d = dc.data();
    console.log(`■ directClass ${dc.id}  name="${d.name}"  expiry=${d.expiry}`);
    const students = d.students ?? [];
    for (const s of students) {
      const loginId = (s.studentLoginId ?? "").toLowerCase();
      console.log(`  · ${s.name}  loginId=${loginId || "(없음)"}`);

      // 1) 수업일지 매칭
      let logCount = 0, childId = null;
      if (loginId) {
        const childSnap = await db.collection("children").where("loginId", "==", loginId).limit(1).get();
        if (!childSnap.empty) {
          childId = childSnap.docs[0].id;
          const logSnap = await db.collection("lessonLogs").where("classId", "==", dc.id).where("studentName", "==", s.name).get();
          logCount = logSnap.size;
        }
      }
      // 2) 구독 상태/만료
      let subInfo = "구독 문서 없음";
      if (childId) {
        const subSnap = await db.collection("subscriptions").where("childId", "==", childId).get();
        subInfo = subSnap.docs.map((x) => {
          const sd = x.data();
          const ed = sd.endDate?.toDate?.();
          const live = (sd.status === "active" || sd.status === "transferred") && ed && ed > now;
          return `${sd.serviceSlug}[${sd.status}${ed ? " ~" + ed.toISOString().slice(0,10) : ""}${live ? " ✅live" : " ❌"}]`;
        }).join(" ") || "구독 없음";
      }
      const childFlag = childId ? "" : "  ⚠️child문서없음";
      console.log(`      수업일지 ${logCount}건${childFlag}`);
      console.log(`      구독: ${subInfo}`);
    }
    console.log("");
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
