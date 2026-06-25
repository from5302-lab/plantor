const admin = require("firebase-admin");
admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();

const MISSING_FAMILY_IDS = [];
const MISSING_PARENT_NAMES = ["정세희", "수현", "이혜진", "김민주"];

async function main() {
  // 1. 윈도우 안의 가족들 모두 fullly simulate
  const KST_OFFSET = 9 * 60 * 60 * 1000;
  const nowKst = new Date(Date.now() + KST_OFFSET);
  const y = nowKst.getUTCFullYear();
  const m = nowKst.getUTCMonth();
  const d = nowKst.getUTCDate() + 7;
  const from = new Date(Date.UTC(y, m, d) - KST_OFFSET);
  const to = new Date(Date.UTC(y, m, d + 1));

  const allActive = await db.collection("subscriptions").where("status", "==", "active").get();
  const matching = allActive.docs.filter((doc) => {
    const ed = doc.data().endDate;
    if (!ed?.toDate) return false;
    const ms = ed.toDate().getTime();
    return ms >= from.getTime() && ms < to.getTime();
  });

  const grouped = new Map();
  for (const doc of matching) {
    const data = doc.data();
    const fid = data.familyId;
    if (!fid) continue;
    if (!grouped.has(fid)) grouped.set(fid, []);
    grouped.get(fid).push({ subId: doc.id, ...data });
  }

  console.log(`처리할 가족 수: ${grouped.size}\n`);

  let order = 0;
  for (const [familyId, subs] of grouped) {
    order++;
    const familySnap = await db.collection("families").doc(familyId).get();
    if (!familySnap.exists) {
      console.log(`${order}. ❌ families/${familyId} 없음`);
      continue;
    }
    const family = familySnap.data();
    const phone = family.phone?.replace?.(/\D/g, "");
    const parentName = family.parentName || "";
    const userId = family.userId;
    const isTargetMissing = MISSING_PARENT_NAMES.includes(parentName);
    const marker = isTargetMissing ? "🔍 [누락]" : "✅";

    console.log(`\n${order}. ${marker} ${parentName} (familyId=${familyId}, phone=${phone || "(없음)"})`);
    console.log(`   userId: ${userId || "(없음)"}`);

    // users 조회
    if (userId) {
      try {
        const userSnap = await db.collection("users").doc(userId).get();
        if (userSnap.exists) {
          console.log(`   users/${userId}: exists, plantor_id=${userSnap.data().plantor_id || "(없음)"}`);
        } else {
          console.log(`   ⚠️ users/${userId}: 존재 안 함`);
        }
      } catch (e) {
        console.log(`   💥 users/${userId} 조회 에러: ${e.message}`);
      }
    } else {
      console.log(`   (userId 없음 → users 조회 스킵)`);
    }

    // children 조회 (각 sub의 childId마다)
    const childIds = [...new Set(subs.map((s) => s.childId))];
    console.log(`   subs: ${subs.length}건, unique childIds: ${JSON.stringify(childIds)}`);
    for (const cid of childIds) {
      if (cid === undefined || cid === null || cid === "") {
        console.log(`   💥 childId가 falsy: ${JSON.stringify(cid)} → db.doc()에 전달되면 throw!`);
        continue;
      }
      try {
        const cSnap = await db.collection("children").doc(cid).get();
        if (cSnap.exists) {
          console.log(`   children/${cid}: exists, name=${cSnap.data().name || "(없음)"}`);
        } else {
          console.log(`   ⚠️ children/${cid}: 존재 안 함 (이름 빈 문자열로 채워짐)`);
        }
      } catch (e) {
        console.log(`   💥 children/${cid} 조회 에러: ${e.message}`);
      }
    }

    // 각 sub 상세
    for (const s of subs) {
      console.log(`   - sub=${s.subId} service=${s.serviceSlug} childId=${JSON.stringify(s.childId)} end=${s.endDate?.toDate?.()?.toISOString() ?? "?"}`);
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
