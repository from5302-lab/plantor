#!/usr/bin/env node
// 임서주: 구독 → 1:1 직강 전환
// 사용법: node scripts/transfer-to-direct.mjs

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({ projectId: "plantor-from302" });
const db = getFirestore();

async function main() {
  // 1. 임서주 child 문서 찾기
  const childSnap = await db.collection("children").where("name", "==", "임서주").get();
  if (childSnap.empty) { console.error("❌ 임서주 child 문서 없음"); return; }

  const childDoc = childSnap.docs[0];
  const child = childDoc.data();
  console.log("✅ child 발견:", childDoc.id, child);

  // 2. 활성 구독 조회
  const subsSnap = await db.collection("subscriptions")
    .where("childId", "==", childDoc.id)
    .where("status", "==", "active")
    .get();

  console.log(`📋 활성 구독 ${subsSnap.size}건:`);
  for (const s of subsSnap.docs) {
    const d = s.data();
    console.log(`  - ${d.serviceSlug} (~${d.endDate?.toDate?.()?.toISOString?.()?.slice(0,10) ?? "?"})`);
  }

  // 3. 가족 정보 (부모 연락처)
  const familyId = child.familyId;
  let parentPhone = "";
  let parentLoginId = "";
  let parentName = "";
  if (familyId) {
    const famDoc = await db.collection("families").doc(familyId).get();
    if (famDoc.exists) {
      const fam = famDoc.data();
      parentPhone = fam.phone ?? "";
      parentLoginId = fam.loginId ?? "";
      parentName = fam.parentName ?? fam.name ?? "";
      console.log("✅ 가족:", parentLoginId, parentPhone, parentName);
    }
  }

  // 4. directClass 문서 생성
  const serviceSlugs = ["classcard-middle", "autovoca", "dailykor"];
  const agencyFee = 4000 + 0 + 22000; // 26000

  const dcData = {
    name: child.name,
    parentName: parentName,
    serviceSlugs,
    agencyFee,
    grades: [child.grade ?? "중3"],
    schedule: [],       // 스케줄은 나중에 설정
    tuition: 0,         // 수업료는 나중에 설정
    students: [{
      name: child.name,
      grade: child.grade ?? "중3",
      serviceSlugs,
      studentPhone: child.phone ?? "",
      studentLoginId: child.loginId ?? "",
      parentPhone,
      parentLoginId,
    }],
    notes: "구독→직강 전환 (2026-05-03)",
    status: "active",
    expiry: "2026-05-31",
    serviceExpiry: {
      "classcard-middle": "2026-05-31",
      "autovoca": "2026-05-31",
      "dailykor": "2026-05-31",
    },
    createdAt: new Date(),
  };

  const dcRef = await db.collection("directClasses").add(dcData);
  console.log("✅ directClass 생성:", dcRef.id);

  // 5. 기존 구독 비활성화
  const batch = db.batch();
  for (const s of subsSnap.docs) {
    batch.update(s.ref, { status: "cancelled", cancelledAt: new Date(), cancelReason: "직강전환" });
  }
  await batch.commit();
  console.log(`✅ 구독 ${subsSnap.size}건 cancelled 처리 완료`);

  console.log("\n🎉 전환 완료!");
}

main().catch(console.error);
