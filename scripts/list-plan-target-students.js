// 학습계획 안내 대상 학생 명단 추출
// 조건: 활성 구독 중 (클래스카드/오토보카/매일국어) + 초6 이상
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();

const TARGET = { "classcard-middle": "클래스카드", "autovoca": "오토보카", "dailykor": "매일국어" };

// 초6 이상 판정 (초1~5·미취학 제외, 중·고 전부 포함)
function gradeOk(grade) {
  const g = (grade ?? "").trim();
  if (!g) return false;
  if (g.startsWith("중") || g.startsWith("고")) return true;
  const m = g.match(/초\s*(\d+)/);
  return m ? Number(m[1]) >= 6 : false;
}

async function main() {
  // 1) 대상 과목의 활성 구독 수집
  const subSnap = await db.collection("subscriptions")
    .where("serviceSlug", "in", Object.keys(TARGET))
    .get();

  const byChild = new Map(); // childId -> Set(serviceSlug)
  for (const d of subSnap.docs) {
    const x = d.data();
    if (x.status && x.status !== "active") continue; // active만 (status 없으면 포함)
    if (!x.childId) continue;
    if (!byChild.has(x.childId)) byChild.set(x.childId, new Set());
    byChild.get(x.childId).add(x.serviceSlug);
  }

  // 2) 자녀/가족 정보 조인 + 학년 필터
  const rows = [];
  for (const [childId, slugs] of byChild) {
    const cSnap = await db.collection("children").doc(childId).get();
    if (!cSnap.exists) continue;
    const c = cSnap.data();
    if (!gradeOk(c.grade)) continue;

    let parentName = "", phone = "";
    if (c.familyId) {
      const fSnap = await db.collection("families").doc(c.familyId).get();
      if (fSnap.exists) { parentName = fSnap.data().parentName ?? ""; phone = fSnap.data().phone ?? ""; }
    }
    rows.push({
      parentName, phone,
      student: c.name ?? "", grade: c.grade ?? "",
      loginId: c.loginId ?? "",
      subjects: [...slugs].map((s) => TARGET[s] ?? s).join("·"),
    });
  }

  rows.sort((a, b) => a.parentName.localeCompare(b.parentName, "ko"));

  console.log(`\n대상 학생 ${rows.length}명 (초6↑ · 클래스카드/오토보카/매일국어 활성구독)\n`);
  console.log("학부모\t연락처\t학생\t학년\t아이디\t수강과목");
  console.log("─".repeat(80));
  for (const r of rows) {
    console.log(`${r.parentName}\t${r.phone}\t${r.student}\t${r.grade}\t${r.loginId}\t${r.subjects}`);
  }
  console.log("");
}

main().then(() => process.exit(0)).catch((e) => { console.error("오류:", e.message); process.exit(1); });
