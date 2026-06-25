// 서비스별 가맹비 진단: 인원/정가/저장값 비교
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();

// site.ts 의 서비스 가맹비(정가)
const AGENCY = { dailykor: 22000, autovoca: 0, class5: 6000, "classcard-middle": 4000, "great-books": 0 };

async function main() {
  const MONTH = process.argv[2] || "2026-06";
  const monthStart = `${MONTH}-01`;
  const toYMD = (ts) => { const d = ts?.toDate?.(); if (!d) return null; return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

  const subsSnap = await db.collection("subscriptions").where("status","==","active").get();
  const head = {};         // slug -> 인원 (구독)
  const storedAgency = {}; // slug -> 저장된 agencyFee 합 (구독)
  let subActive = 0;
  subsSnap.forEach((doc) => {
    const x = doc.data();
    const end = toYMD(x.endDate);
    if (!end || end < monthStart) return;
    subActive++;
    const slug = x.serviceSlug || "?";
    head[slug] = (head[slug]||0) + 1;
    storedAgency[slug] = (storedAgency[slug]||0) + (x.agencyFee||0);
  });

  // 1:1수업 학생
  const dcSnap = await db.collection("directClasses").get();
  const directHead = {};
  let dcActive = 0, dcAgencyLump = 0;
  dcSnap.forEach((doc) => {
    const x = doc.data();
    if (!x.expiry || x.expiry < monthStart) return;
    dcActive++;
    dcAgencyLump += (x.agencyFee||0);
    const students = x.students || [];
    const list = students.length ? students : [{ serviceSlugs: x.serviceSlugs||[] }];
    list.forEach((s) => (s.serviceSlugs || x.serviceSlugs || []).forEach((slug) => { directHead[slug] = (directHead[slug]||0)+1; }));
  });

  console.log(`\n=== ${MONTH} 기준 (endDate/expiry >= ${monthStart}) ===`);
  console.log(`활성 구독 ${subActive} / 활성 1:1수업 ${dcActive} (가맹비 lump 합 ${dcAgencyLump})`);
  const slugs = new Set([...Object.keys(head), ...Object.keys(directHead)]);
  console.log("\nslug | 구독인원 | 1:1인원 | 총인원 | 정가 | 정가×총인원 | 구독저장가맹비합");
  for (const slug of slugs) {
    const sc = head[slug]||0, dc = directHead[slug]||0, tot = sc+dc;
    const fee = AGENCY[slug] ?? "?";
    const byList = (AGENCY[slug]||0) * tot;
    console.log(`${slug} | ${sc} | ${dc} | ${tot} | ${fee} | ${byList} | ${storedAgency[slug]||0}`);
  }
  const totalByList = [...slugs].reduce((s,slug)=> s + (AGENCY[slug]||0)*((head[slug]||0)+(directHead[slug]||0)), 0);
  const totalStored = Object.values(storedAgency).reduce((a,b)=>a+b,0);
  console.log(`\n정가×인원 총 가맹비: ${totalByList}`);
  console.log(`구독 저장 가맹비 합: ${totalStored} (+1:1 lump ${dcAgencyLump} = ${totalStored+dcAgencyLump})`);
}
main().then(()=>process.exit(0)).catch((e)=>{console.error(e);process.exit(1);});
