// 가계부 리셋:
//  1) vaultEntries 전체 삭제 (수동 거래 + 고정지출 완료기록 + 예정 입금기록)
//  2) vault/recurring 의 각 항목 상태 초기화: skipMonths=[] (이월 해제), startMonth=현재 월
// 유지: 고정지출 정의(금액/지정일/카테고리/메모/active), 예정(admin), 카테고리, 위시리스트
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();

const CURRENT_MONTH = "2026-05"; // 리셋 기준 월

async function main() {
  // 1) vaultEntries 전체 삭제
  const snap = await db.collection("vaultEntries").get();
  console.log(`vaultEntries: ${snap.size}건`);
  let batch = db.batch();
  let n = 0, deleted = 0;
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    if (++n === 450) { await batch.commit(); deleted += n; batch = db.batch(); n = 0; }
  }
  if (n > 0) { await batch.commit(); deleted += n; }
  console.log(`거래 내역 삭제: ${deleted}건`);

  // 2) 고정거래 상태 초기화
  const recRef = db.collection("vault").doc("recurring");
  const recSnap = await recRef.get();
  if (recSnap.exists) {
    const items = (recSnap.data().items || []).map((r) => ({
      ...r,
      skipMonths: [],
      startMonth: CURRENT_MONTH,
    }));
    await recRef.set({ items });
    console.log(`고정거래 ${items.length}개 상태 초기화 (skipMonths 해제, startMonth=${CURRENT_MONTH})`);
  }

  console.log("리셋 완료.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
