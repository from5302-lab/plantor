/**
 * 1:1 직강(directClasses) → 구독(subscriptions) 통합 이관.
 *
 * 배경: 1:1이 directClasses / 1on1-* 구독 / 일반서비스(vibe-coding) 3갈래로 흩어져 있어
 *       "신청서로 들어오든 어드민이 만들든 같은 DB"로 통일한다.
 *
 * 처리:
 *   A) families 없는 가정 생성 (등록된 별칭·전화 그대로)
 *   B) children 없는 학생 생성 (정휘운·최가은)
 *   C) children.familyId가 directClasses.id를 가리키는 건 교정
 *   D) 구독 생성 — 학생 2명 이상인 수업은 수업료를 인원수로 분할
 *   E) lessonLogs에 childId 추가 (수업일지 연결 보존)
 *   F) directClasses는 삭제하지 않고 과금 필드만 해제
 *      (status=active 유지 → 수업일지·플랜탭 계속 동작 / tuition=0·expiry=null → 정산·알림에서 제외)
 *
 * 주의: 정산(use-admin-billing)은 status를 안 보고 expiry+tuition만 보므로
 *       status를 바꾸는 대신 tuition/expiry를 비워야 이중 계산이 안 생긴다.
 *
 * 사용법:
 *   node scripts/migrate-direct-to-subscription.js --dry-run   # 미리 확인
 *   node scripts/migrate-direct-to-subscription.js             # 실행
 */
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();

const DRY_RUN = process.argv.includes("--dry-run");
const KST = 9 * 60 * 60 * 1000;

/** "YYYY-MM-DD"(KST 자정) → Timestamp */
function toTs(ymd) {
  if (!ymd) return null;
  return admin.firestore.Timestamp.fromDate(new Date(ymd + "T00:00:00+09:00"));
}

/** 수업 이름 → serviceSlug ("1:1"·공백·+ 제거) */
function slugify(name) {
  const base = (name || "수업").replace(/1:1/g, "").replace(/[+\s]/g, "").trim();
  return "1on1-" + (base || "수업");
}

async function main() {
  console.log(DRY_RUN ? "🧪 DRY RUN — 쓰기 없음\n" : "🚀 EXECUTE — 실제 반영\n");

  const [dcSnap, chSnap, famSnap, llSnap] = await Promise.all([
    db.collection("directClasses").get(),
    db.collection("children").get(),
    db.collection("families").get(),
    db.collection("lessonLogs").get(),
  ]);

  const famIds = new Set(famSnap.docs.map((d) => d.id));
  const childByName = {};
  chSnap.docs.forEach((d) => {
    const x = d.data();
    (childByName[x.name] ??= []).push({ id: d.id, familyId: x.familyId, grade: x.grade });
  });

  const classes = dcSnap.docs.filter((d) => d.data().status === "active");
  let createdFam = 0, createdChild = 0, fixedChild = 0, createdSub = 0, taggedLogs = 0, clearedClass = 0;
  let totalBefore = 0, totalAfter = 0;

  for (const cd of classes) {
    const cls = cd.data();
    const students = cls.students || [];
    if (students.length === 0) continue;

    totalBefore += cls.tuition || 0;

    const slug = slugify(cls.name);
    const perAmount =
      students.length > 1 ? Math.round((cls.tuition || 0) / students.length) : cls.tuition || 0;

    // ── A) 이 수업의 가정(families) 확보 ──
    // 같은 수업 학생들은 한 가정으로 묶는다(형제 케이스).
    let familyId = null;
    for (const s of students) {
      const m = (childByName[s.name] || [])[0];
      if (m && famIds.has(m.familyId)) { familyId = m.familyId; break; }
    }
    if (!familyId) {
      const phone = (students.find((s) => s.parentPhone)?.parentPhone || "").replace(/\D/g, "");
      const payload = {
        parentName: cls.parentName || "",
        phone,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        note: `directClasses ${cd.id} 이관 생성`,
      };
      if (DRY_RUN) {
        familyId = `(신규families:${cls.parentName || "?"}/${phone || "전화없음"})`;
      } else {
        familyId = (await db.collection("families").add(payload)).id;
        famIds.add(familyId);
      }
      createdFam++;
      console.log(`  [A] families 생성: ${cls.parentName || "(이름없음)"} phone=${phone || "없음"} → ${familyId}`);
    }

    for (const s of students) {
      let match = (childByName[s.name] || [])[0];

      // ── B) children 없으면 생성 ──
      if (!match) {
        const grade = Array.isArray(cls.grades) ? cls.grades[0] || "" : cls.grades || "";
        const payload = {
          name: s.name,
          grade,
          loginId: "",           // 로그인 계정은 별도 발급 필요
          familyId,
          studentPhone: "",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          note: `directClasses ${cd.id} 이관 생성`,
        };
        const newId = DRY_RUN ? `(신규children:${s.name})` : (await db.collection("children").add(payload)).id;
        match = { id: newId, familyId };
        createdChild++;
        console.log(`  [B] children 생성: ${s.name} (${grade || "학년미상"}) → ${newId}`);
      }
      // ── C) familyId가 directClasses.id를 가리키면 교정 ──
      else if (!famIds.has(match.familyId)) {
        console.log(`  [C] children.familyId 교정: ${s.name} ${match.familyId} → ${familyId}`);
        if (!DRY_RUN) await db.collection("children").doc(match.id).update({ familyId });
        fixedChild++;
        match.familyId = familyId;
      }

      // ── D) 구독 생성 ──
      const subPayload = {
        familyId: match.familyId || familyId,
        childId: match.id,
        serviceSlug: slug,
        customName: cls.name || "1:1 수업",
        monthlyPrice: perAmount,
        agencyFee: 0,
        discount: 0,
        status: "active",
        startDate: admin.firestore.FieldValue.serverTimestamp(),
        endDate: toTs(cls.expiry),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        migratedFrom: cd.id,
      };
      totalAfter += perAmount;
      createdSub++;
      console.log(
        `  [D] 구독: ${s.name.padEnd(6)} ${String(perAmount).padStart(7)}원  ${slug}  만료 ${cls.expiry || "없음"}`
      );
      if (!DRY_RUN) await db.collection("subscriptions").add(subPayload);

      // ── E) 수업일지에 childId 태깅 ──
      const logs = llSnap.docs.filter(
        (l) => l.data().classId === cd.id && l.data().studentName === s.name
      );
      for (const l of logs) {
        if (!DRY_RUN) await l.ref.update({ childId: match.id });
        taggedLogs++;
      }
      if (logs.length) console.log(`  [E] 수업일지 ${logs.length}건에 childId 태깅 (${s.name})`);
    }

    // ── F) directClasses 과금 해제 (수업일지 유지 위해 status는 active 그대로) ──
    console.log(`  [F] ${cd.id} 과금해제: tuition ${cls.tuition} → 0, expiry ${cls.expiry} → null`);
    if (!DRY_RUN) {
      await cd.ref.update({
        tuition: 0,
        expiry: null,
        migratedAt: admin.firestore.FieldValue.serverTimestamp(),
        migratedNote: "구독(subscriptions)으로 이관됨 — 수업일지 보존용으로만 유지",
      });
    }
    clearedClass++;
    console.log("");
  }

  console.log("─".repeat(60));
  console.log(`families 생성 ${createdFam} · children 생성 ${createdChild} · familyId 교정 ${fixedChild}`);
  console.log(`구독 생성 ${createdSub} · 수업일지 태깅 ${taggedLogs} · 직강 과금해제 ${clearedClass}`);
  console.log(`금액 검증: 이관 전 ${totalBefore.toLocaleString()}원 → 이관 후 ${totalAfter.toLocaleString()}원 ${totalBefore === totalAfter ? "✅ 일치" : "❌ 불일치!"}`);
  if (DRY_RUN) console.log("\n🧪 DRY RUN이었습니다. 실제 반영하려면 --dry-run 없이 실행하세요.");
}

main().catch((e) => { console.error(e); process.exit(1); });
