/**
 * 잘못 붙은 만회 계수(×0.7) 되돌리기.
 *
 * 2026-08-08 사고: 새 산식을 반영하려고 `runAutoVerifyNow?date=2026-08-07` 을
 * 다음 날 호출했다. awardRewards 는 `late = date < 오늘` 로 만회를 판정하므로,
 * **제때 한 학습인데 재계산 시점이 늦었다는 이유로** 18건에 ×0.7 이 붙었다.
 *
 * 만회 계수 자체는 옳다 — 밀린 과제를 나중에 한 경우를 위한 것이다.
 * 잘못된 건 판정 근거가 "학생이 언제 했는가" 가 아니라 "우리가 언제 계산했는가" 였다는 점이다.
 *
 * 되돌리는 방법: 원장에 계산 조각(breakdown)이 그대로 남아 있으므로
 * lateFactor 만 1 로 놓고 computeXp 와 **같은 식**으로 다시 조립한다. 추정이 없다.
 *
 * 포인트도 XP 차액에 맞춰 보정한다(XP × 0.2 + 장착 뱃지 보너스율).
 * 뱃지·레벨업 포인트는 이미 지급된 별개 몫이라 건드리지 않는다.
 *
 * 사용법:
 *   node scripts/repair-late-factor.js 2026-08-07            → 미리보기
 *   node scripts/repair-late-factor.js 2026-08-07 --apply    → 반영
 */
const { createRequire } = require("node:module");
const path = require("node:path");

const funcRequire = createRequire(path.join(__dirname, "../functions/package.json"));
const admin = funcRequire("firebase-admin");
admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();
const { FieldValue } = funcRequire("firebase-admin/firestore");

const APPLY = process.argv.includes("--apply");
const DATE = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
if (!DATE) { console.error("날짜를 주세요: node scripts/repair-late-factor.js 2026-08-07"); process.exit(1); }

(async () => {
  const { xpWhy } = await import("../functions/lib/rewards.js");
  const { XP, levelFromXp, bundleEffects } = await import("../functions/lib/rewards-config.js");

  const kids = await db.collection("children").get();
  let count = 0, xpDelta = 0;

  for (const k of kids.docs) {
    const led = await k.ref.collection("xpLedger").get();
    const targets = led.docs.filter((d) => d.data().date === DATE && Number(d.data().breakdown?.lateFactor ?? 1) < 1);
    if (!targets.length) continue;

    let childDelta = 0;
    for (const d of targets) {
      const v = d.data();
      const b = v.breakdown;
      // computeXp 와 같은 조립 — lateFactor 만 1
      const fixed = Math.min(
        XP.SERVICE_CAP,
        Math.round((b.base + b.quality + (b.tier ?? 0)) * b.streakMult * (b.badgeMult ?? 1)) + b.volume,
      );
      const delta = fixed - Number(v.xp ?? 0);
      if (delta === 0) continue;
      const nextBreakdown = { ...b, lateFactor: 1 };
      const why = xpWhy({ xp: fixed, quality: v.quality, qualityRaw: v.qualityRaw ?? null, breakdown: nextBreakdown });
      console.log(`  ${k.data().name} ${d.id}: ${v.xp} → ${fixed} (${delta > 0 ? "+" : ""}${delta})`);
      count++; xpDelta += delta; childDelta += delta;
      if (APPLY) await d.ref.set({ xp: fixed, breakdown: nextBreakdown, xpWhy: why }, { merge: true });
    }
    if (!childDelta) continue;

    const prevTotal = Number(k.data().xpTotal ?? 0);
    const newTotal = Math.max(0, prevTotal + childDelta);
    const pointPct = bundleEffects((k.data().equippedBadges ?? [])).pointPct;
    const basePoints = Math.round(childDelta * XP.POINT_RATE);
    const points = basePoints + Math.round(basePoints * pointPct / 100);
    console.log(`  → ${k.data().name}: XP ${prevTotal} → ${newTotal} · 포인트 ${points > 0 ? "+" : ""}${points}`);
    if (APPLY) {
      await k.ref.set({
        xpTotal: newTotal, level: levelFromXp(newTotal),
        points: FieldValue.increment(points),
        rewardUpdatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }

  // 피드 하루 요약은 원장을 모아 만든 파생 데이터다. 원장만 고치면 피드가 옛 XP를 계속 보여준다.
  // (피드 카드는 적립 차액이 있을 때만 다시 써지므로 스크립트가 직접 맞춰 준다)
  let feeds = 0;
  for (const k of kids.docs) {
    const led = (await k.ref.collection("xpLedger").get()).docs.filter((d) => d.data().date === DATE);
    const services = led
      .map((d) => ({
        slug: String(d.data().serviceSlug ?? ""),
        xp: Number(d.data().xp ?? 0),
        items: d.data().studyItems ?? [],
        note: d.data().studyNote ?? null,
        xpWhy: d.data().xpWhy ?? null,
      }))
      .filter((s) => s.slug && s.xp > 0);
    if (!services.length) continue;

    const ref = db.collection("feedEvents").doc(`${k.id}_daily_${DATE}`);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const dayXp = services.reduce((s, x) => s + x.xp, 0);
    if (Number(snap.data().xp ?? 0) === dayXp && JSON.stringify(snap.data().services ?? []) === JSON.stringify(services)) continue;
    console.log(`  [피드] ${k.data().name} ${DATE}: ${snap.data().xp} → ${dayXp} XP`);
    feeds++;
    if (APPLY) await ref.set({ xp: dayXp, services }, { merge: true });
  }

  console.log(`\n${APPLY ? "반영" : "미리보기"} — 원장 ${count}건 · XP 합계 ${xpDelta > 0 ? "+" : ""}${xpDelta} · 피드 ${feeds}장`);
  if (!APPLY) console.log("반영하려면 --apply");
})().catch((e) => { console.error(e); process.exit(1); });
