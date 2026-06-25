#!/usr/bin/env node
// 기존 DB 불일치 복구: Auth 누락 계정 생성 + authUid 보강 + users 문서 복구
// 사용법: node scripts/run-repair.mjs

import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// Firebase Admin SDK — 서비스 계정 키 또는 기본 인증 사용
initializeApp({ projectId: "plantor-from302" });

const db = getFirestore();
const auth = getAuth();

function idToEmail(id) {
  return `${id.toLowerCase()}@plantor.app`;
}

async function getOrCreateAuthUser(email, password, displayName) {
  try {
    const user = await auth.createUser({ email, password, displayName });
    return { uid: user.uid, created: true };
  } catch (e) {
    if (e.code === "auth/email-already-exists") {
      const existing = await auth.getUserByEmail(email);
      return { uid: existing.uid, created: false };
    }
    throw e;
  }
}

async function main() {
  console.log("=== DB 불일치 복구 시작 ===\n");

  const childrenSnap = await db.collection("children").get();
  console.log(`children 문서 총 ${childrenSnap.size}건 확인\n`);

  let fixed = 0;
  let authCreated = 0;
  let skipped = 0;

  for (const childDoc of childrenSnap.docs) {
    const data = childDoc.data();
    const loginId = data.loginId?.toLowerCase();
    if (!loginId) {
      console.log(`  SKIP: ${childDoc.id} — loginId 없음`);
      skipped++;
      continue;
    }

    try {
      const { uid, created } = await getOrCreateAuthUser(
        idToEmail(loginId), "012345", data.name ?? ""
      );

      if (created) {
        console.log(`  CREATE AUTH: ${loginId} → uid=${uid}`);
        authCreated++;
      }

      // authUid 보강
      if (!data.authUid || data.authUid !== uid) {
        await db.collection("children").doc(childDoc.id).update({ authUid: uid });
      }

      // users 문서 복구
      await db.collection("users").doc(uid).set({
        name: data.name ?? "",
        plantor_id: loginId,
        role: "student",
        grade: data.grade ?? "",
        parentUid: data.userId ?? null,
        createdAt: new Date(),
      }, { merge: true });

      fixed++;
    } catch (e) {
      console.log(`  ERROR: ${loginId} — ${e.message}`);
      skipped++;
    }
  }

  console.log(`\n=== 복구 완료 ===`);
  console.log(`  수정: ${fixed}건`);
  console.log(`  Auth 신규 생성: ${authCreated}건`);
  console.log(`  스킵: ${skipped}건`);

  // 고아 구독 정리
  console.log(`\n=== 고아 구독 정리 ===`);
  const [nullSnap, emptySnap] = await Promise.all([
    db.collection("subscriptions").where("childId", "==", null).get(),
    db.collection("subscriptions").where("childId", "==", "").get(),
  ]);
  const orphans = [...nullSnap.docs, ...emptySnap.docs];
  if (orphans.length > 0) {
    const batch = db.batch();
    orphans.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log(`  삭제: ${orphans.length}건`);
  } else {
    console.log(`  고아 구독 없음`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
