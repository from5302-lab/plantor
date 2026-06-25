const admin = require("firebase-admin");
admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();

const KST_OFFSET = 9 * 60 * 60 * 1000;

function window(daysAhead) {
  const nowKst = new Date(Date.now() + KST_OFFSET);
  const y = nowKst.getUTCFullYear();
  const m = nowKst.getUTCMonth();
  const d = nowKst.getUTCDate() + daysAhead;
  return {
    from: new Date(Date.UTC(y, m, d) - KST_OFFSET),
    to: new Date(Date.UTC(y, m, d + 1)),
  };
}

function kst(d) {
  return new Date(d.getTime() + KST_OFFSET).toISOString().replace("T", " ").slice(0, 19) + " KST";
}

async function diagnose(daysAhead) {
  const { from, to } = window(daysAhead);
  console.log(`\n========== D-${daysAhead} 윈도우 ==========`);
  console.log(`from: ${kst(from)}`);
  console.log(`to:   ${kst(to)}`);

  const allActive = await db.collection("subscriptions").where("status", "==", "active").get();
  const matches = allActive.docs.filter((doc) => {
    const ed = doc.data().endDate;
    if (!ed?.toDate) return false;
    const ms = ed.toDate().getTime();
    return ms >= from.getTime() && ms < to.getTime();
  });

  console.log(`active 전체: ${allActive.size}, 윈도우 매칭: ${matches.length}`);

  if (matches.length === 0) {
    console.log("(매칭 없음)");
    return;
  }

  let sent = 0;
  const skipped = [];

  for (const doc of matches) {
    const data = doc.data();
    const subId = doc.id;
    const endDate = data.endDate?.toDate ? kst(data.endDate.toDate()) : "?";
    const result = {
      subId,
      familyId: data.familyId || "(없음)",
      childId: data.childId || "(없음)",
      serviceSlug: data.serviceSlug,
      endDate,
      reason: null,
      parentName: null,
      phone: null,
    };

    if (!data.familyId) {
      result.reason = "❌ familyId 없음";
      skipped.push(result);
      continue;
    }

    const familySnap = await db.collection("families").doc(data.familyId).get();
    if (!familySnap.exists) {
      result.reason = `❌ families/${data.familyId} 문서 없음`;
      skipped.push(result);
      continue;
    }
    const fam = familySnap.data();
    result.parentName = fam.parentName || "(없음)";
    const rawPhone = fam.phone;
    const phone = rawPhone?.replace?.(/\D/g, "");
    if (!phone) {
      result.reason = `❌ family.phone 없음/공백 (raw=${JSON.stringify(rawPhone)})`;
      skipped.push(result);
      continue;
    }
    result.phone = phone;
    result.reason = "✅ 발송 통과";
    sent++;
    console.log(`  ✅ ${result.parentName} (${result.phone}) - ${result.serviceSlug} - end=${endDate}`);
  }

  console.log(`\n발송 통과: ${sent} / 매칭: ${matches.length}`);
  if (skipped.length) {
    console.log(`\n--- 누락 ${skipped.length}건 ---`);
    for (const s of skipped) {
      console.log(`  ${s.reason}`);
      console.log(`    sub=${s.subId} family=${s.familyId} child=${s.childId} parent=${s.parentName || "?"} service=${s.serviceSlug} end=${s.endDate}`);
    }
  }
}

async function main() {
  for (const d of [0, 3, 7]) {
    await diagnose(d);
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
