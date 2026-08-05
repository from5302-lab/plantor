/**
 * 리워드 소급 적립 (1회성).
 *
 * 시스템 오픈 첫날 학생 화면이 Lv1·0P로 비어 있지 않도록, 최근 30일 학습 기록을 XP로 쳐준다.
 *
 * 규칙 (plan-reward-system.md §8 확정):
 *   - 대상: learningLogs 중 method="auto" · autoStatus="완료" · 자동인증 4종 · 최근 30일
 *   - 과거 로그에는 품질 필드(단어별 try_cnt, 단계별 xp, activity_list)가 없다
 *     → **완료점 60만** 적립. 품질·연속·분량 보너스는 소급하지 않는다.
 *   - 상한: 최대 Lv10 / 1,000P — 초기 격차가 과하게 벌어지지 않게
 *   - 뱃지는 소급하지 않는다 (판정 근거가 과거 로그에 없음)
 *   - **웰컴 보너스 200P**: 자동인증 과목을 듣는 학생 전원에게 1회 지급.
 *     소급만 하면 학습이 적었던 학생은 12~24P라 상점에서 아무것도 못 사고,
 *     첫 화면에서 격차만 확인하게 된다 → 누구나 소품 하나는 살 수 있는 바닥을 깔아준다.
 *
 * 멱등: 원장 문서(xpLedger/{date}_{slug})가 이미 있으면 건너뛴다.
 *       웰컴 보너스는 children.welcomeBonusAt 유무로 1회만. 여러 번 돌려도 안전.
 *
 * 사용법:
 *   node scripts/retro-rewards.js --dry-run   # 미리 확인
 *   node scripts/retro-rewards.js             # 실행
 */
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();

const DRY_RUN = process.argv.includes("--dry-run");
const DAYS = 30;
const DONE_XP = 60;
const POINT_RATE = 0.2;
const MAX_LEVEL = 10;
const MAX_POINTS = 1000;
const WELCOME_POINTS = 200;
const SLUGS = ["autovoca", "classcard-middle", "dailykor", "class5"];

/** Lv10 시작 누적 XP = 500 × 9 (rewards-config.xpToNext와 같은 곡선) */
const MAX_XP = 500 * (MAX_LEVEL - 1);

function kst(offsetDays = 0) {
  return new Date(Date.now() + 9 * 3600e3 - offsetDays * 86400e3).toISOString().slice(0, 10);
}

async function main() {
  const from = kst(DAYS - 1);
  console.log(`소급 대상: ${from} ~ ${kst(0)} (${DAYS}일)${DRY_RUN ? "  [DRY RUN]" : ""}`);

  const snap = await db.collection("learningLogs")
    .where("date", ">=", from)
    .get();

  // (childId, date, slug) 단위로 완료 여부만 추린다
  const byChild = new Map();
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.method !== "auto" || d.autoStatus !== "완료") continue;
    if (!SLUGS.includes(d.serviceSlug)) continue;
    if (!d.childId || !d.date) continue;
    const slots = byChild.get(d.childId) ?? new Map();
    slots.set(`${d.date}_${d.serviceSlug}`, { date: d.date, serviceSlug: d.serviceSlug });
    byChild.set(d.childId, slots);
  }

  console.log(`대상 학생 ${byChild.size}명`);
  let totalWritten = 0;

  // ── 웰컴 보너스: 자동인증 과목을 듣는 학생 전원 200P (1회) ──
  const subs = await db.collection("subscriptions").get();
  const rewardChildren = new Set(
    subs.docs
      .filter((d) => ["active", "transferred"].includes(String(d.data().status)) && SLUGS.includes(d.data().serviceSlug))
      .map((d) => String(d.data().childId))
      .filter(Boolean),
  );
  let welcomeCount = 0;
  for (const childId of rewardChildren) {
    const ref = db.collection("children").doc(childId);
    const snap = await ref.get();
    if (!snap.exists || snap.data().welcomeBonusAt) continue;   // 이미 받았으면 skip (멱등)
    welcomeCount++;
    if (DRY_RUN) continue;
    await ref.set({
      points: admin.firestore.FieldValue.increment(WELCOME_POINTS),
      welcomeBonusAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  console.log(`웰컴 보너스 ${WELCOME_POINTS}P → ${welcomeCount}명 (자동인증 구독자 ${rewardChildren.size}명 중 미지급분)\n`);

  for (const [childId, slots] of byChild) {
    const childRef = db.collection("children").doc(childId);
    const child = await childRef.get();
    if (!child.exists) continue;

    // 이미 적립된 슬롯은 건너뛴다 (멱등)
    const existing = await childRef.collection("xpLedger").get();
    const done = new Set(existing.docs.map((d) => d.id));

    const fresh = [...slots.entries()].filter(([id]) => !done.has(id));
    if (!fresh.length) continue;

    const rawXp = fresh.length * DONE_XP;
    const curXp = Number(child.data().xpTotal ?? 0);
    const xp = Math.max(0, Math.min(rawXp, MAX_XP - curXp));
    const points = Math.min(MAX_POINTS, Math.round(xp * POINT_RATE));
    const level = Math.min(MAX_LEVEL, Math.floor((curXp + xp) / 500) + 1);

    console.log(`  ${child.data().name ?? childId}: 완료 ${fresh.length}건 → +${xp} XP (상한 적용 전 ${rawXp}) · +${points}P · Lv${level}`);
    if (DRY_RUN) continue;

    const batch = db.batch();
    for (const [id, slot] of fresh) {
      batch.set(childRef.collection("xpLedger").doc(id), {
        childId, serviceSlug: slot.serviceSlug, date: slot.date,
        xp: DONE_XP, done: true, quality: null, qualityRaw: null,
        retro: true, note: "소급 적립(완료점만)",
        computedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    batch.set(childRef, {
      xpTotal: curXp + xp,
      level,
      points: admin.firestore.FieldValue.increment(points),
      retroGrantedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await batch.commit();
    totalWritten++;
  }

  console.log(DRY_RUN ? "\n[DRY RUN] 쓰기 없음" : `\n완료 — ${totalWritten}명 적립`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
