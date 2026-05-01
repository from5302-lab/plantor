/**
 * 3쌍둥이 directClasses 문서 병합 스크립트
 *
 * 실행 방법:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json node scripts/merge-triplets.js
 *
 * 수행 내용:
 *   - directClasses 컬렉션에서 오수영/오재영/오준영 문서 3개를 찾아 하나로 병합
 *   - 새 문서: name="3쌍둥이", students=[{name:"오수영",...},{name:"오재영",...},{name:"오준영",...}]
 *   - 병합 후 원본 3개 문서 삭제
 */
const admin = require("firebase-admin");

admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();

const TRIPLET_NAMES = ["오수영", "오재영", "오준영"];

async function main() {
  console.log("directClasses 전체 조회 중...");
  const snap = await db.collection("directClasses").get();

  const tripletDocs = [];
  snap.forEach((doc) => {
    const d = doc.data();
    const name = d.name ?? "";
    if (TRIPLET_NAMES.includes(name)) {
      tripletDocs.push({ id: doc.id, data: d });
    }
  });

  console.log(`\n찾은 문서 (${tripletDocs.length}개):`);
  tripletDocs.forEach((t) => {
    console.log(`  [${t.id}] name="${t.data.name}", students=${JSON.stringify(t.data.students)}`);
  });

  if (tripletDocs.length === 0) {
    console.log("\n병합할 문서가 없습니다. 문서 이름을 확인하세요.");
    return;
  }

  // 첫 번째 문서에서 공통 정보 추출
  const base = tripletDocs[0].data;

  // 학생 배열 구성: 각 문서의 students[0] 또는 name으로 구성
  const students = tripletDocs.map((t) => {
    const s = t.data.students?.[0] ?? {};
    return {
      name: t.data.name,
      grade: s.grade ?? t.data.grades?.[0] ?? "",
      studentPhone: s.studentPhone ?? "",
      studentLoginId: s.studentLoginId ?? "",
      parentPhone: s.parentPhone ?? base.students?.[0]?.parentPhone ?? "",
      parentLoginId: s.parentLoginId ?? base.students?.[0]?.parentLoginId ?? "",
    };
  });

  // 서비스 슬러그 합집합
  const allSlugs = [...new Set(tripletDocs.flatMap((t) => t.data.serviceSlugs ?? []))];

  // 학년 합집합
  const allGrades = [...new Set(tripletDocs.flatMap((t) => t.data.grades ?? []))];

  // serviceExpiry 병합
  const mergedExpiry = tripletDocs.reduce((acc, t) => {
    return { ...acc, ...(t.data.serviceExpiry ?? {}) };
  }, {});

  // 스케줄 (첫 번째 문서 기준)
  const schedule = base.schedule ?? [];

  const mergedData = {
    name: "3쌍둥이",
    serviceSlugs: allSlugs,
    agencyFee: base.agencyFee ?? 0,
    grades: allGrades,
    schedule,
    tuition: base.tuition ?? 0,
    students,
    notes: base.notes ?? "",
    status: base.status ?? "active",
    serviceExpiry: mergedExpiry,
    createdAt: base.createdAt ?? admin.firestore.FieldValue.serverTimestamp(),
  };

  console.log("\n병합 데이터:");
  console.log(JSON.stringify(mergedData, null, 2));

  const batch = db.batch();

  // 새 문서 생성 (첫 번째 문서 ID 재사용)
  const keepId = tripletDocs[0].id;
  batch.set(db.collection("directClasses").doc(keepId), mergedData);

  // 나머지 문서 삭제
  for (let i = 1; i < tripletDocs.length; i++) {
    batch.delete(db.collection("directClasses").doc(tripletDocs[i].id));
  }

  await batch.commit();
  console.log(`\n병합 완료: 문서 ID="${keepId}", 삭제된 문서 ${tripletDocs.length - 1}개`);
}

main().catch(console.error);
