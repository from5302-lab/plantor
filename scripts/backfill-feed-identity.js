/**
 * feedEvents 백필 (1회성).
 *
 * 피드가 닉네임(새싹310) 대신 실명·학년을 공개하도록 바뀌면서,
 * 그 전에 기록된 이벤트에는 name/grade가 없다. children에서 채워 넣는다.
 * daily 카드의 과목별 학습 요약(services)도 xpLedger에서 복원한다.
 *   - 교재·유닛명(labels)은 원장에 labels 필드가 생기기 전 기록에는 없으므로
 *     과목명과 XP만 채운다. 상세 내용은 이후 학습분부터 붙는다.
 *
 * 멱등: 여러 번 돌려도 같은 결과.
 *
 * 사용법:
 *   node scripts/backfill-feed-identity.js --dry-run
 *   node scripts/backfill-feed-identity.js
 */
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "plantor-from302" });
const db = admin.firestore();

const DRY_RUN = process.argv.includes("--dry-run");

/** 이름 가운데를 ○로 (functions/src/feed-events.ts의 maskName·callName과 같은 규칙). */
function maskName(name) {
  const raw = String(name ?? "").trim();
  // 괄호 표기는 버리고 부르는 이름만 남긴다: 사랑이(박수현) → 사랑이 → 사○이
  const n = raw.replace(/\s*[(（][^)）]*[)）]\s*/g, " ").trim() || raw;
  if (n.length <= 1) return n;
  if (n.length === 2) return `${n[0]}○`;
  return `${n[0]}${"○".repeat(n.length - 2)}${n[n.length - 1]}`;
}

/** 뱃지 코드 접두사 → 과목. rewards-config.ts의 BADGES.service와 같은 규칙. */
function serviceOfBadge(code) {
  if (!code) return null;
  if (code.startsWith("av-")) return "autovoca";
  if (code.startsWith("cc-")) return "classcard-middle";
  if (code.startsWith("dk-")) return "dailykor";
  if (code.startsWith("c5-")) return "class5";
  return null; // st-/x- 는 과목 공통
}

/** functions/src/rewards.ts의 toScore와 같은 규칙 — null/빈값은 0이 아니라 null이다. */
const num = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const m = v.match(/\d+(?:\.\d+)?/g);
  if (!m) return null;
  const n = Number(m[m.length - 1]);
  return Number.isFinite(n) ? n : null;
};

/** 매일국어 획득/최대 경험치 — 신형 xpGot·xpMax, 구형 "19xp / 30xp" 문자열 둘 다 지원. */
function dailykorXp(detail) {
  const got = Number(detail?.xpGot), max = Number(detail?.xpMax);
  if (Number.isFinite(got) && Number.isFinite(max) && max > 0) return { got, max };
  const m = String(detail?.xp ?? "").match(/(\d+)\s*xp\s*\/\s*(\d+)\s*xp/i);
  return m ? { got: Number(m[1]), max: Number(m[2]) } : null;
}

/** 점수로 볼 수 있는 단계만 — rewards.ts의 gradedScores와 같은 규칙.
 *  암기·리콜·스펠·스피킹은 누적 반복량 %(최대 800%), 딕테이션은 횟수라 점수가 아니다. */
function gradedScores(scores) {
  const out = [];
  for (const [label, v] of Object.entries(scores ?? {})) {
    if (label === "완료여부") continue;
    if (/암기|리콜|스펠|스피킹|반복|딕테이션/.test(label)) continue;
    const n = num(v);
    if (n !== null && n <= 100) out.push(n);
  }
  return out;
}

function avgScore(scores) {
  const vals = gradedScores(scores);
  return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
}

/** 단계 값 표기 — 반복 계열은 %, 딕테이션은 회, 나머지는 점. 반복 0%는 안 한 것이라 생략. */
function formatStage(label, v) {
  const raw = String(v ?? "").trim();
  if (!raw || raw === "-") return null;
  if (/암기|리콜|스펠|스피킹|반복/.test(label)) {
    const n = num(v);
    if (n === null) return raw;
    return n > 0 ? `${n}%` : null;
  }
  if (/딕테이션/.test(label)) return /회/.test(raw) ? raw : `${raw}회`;
  const n = num(v);
  return n === null ? raw : `${n}점`;
}

/** 그 로그에서 마지막으로 학습을 끝낸 시각 "HH:MM". */
function lastEndOf(sd) {
  const ends = [];
  for (const u of (sd?.units ?? [])) if (u?.endAt) ends.push(String(u.endAt));
  for (const e of (sd?.elementary ?? [])) if (e?.endAt) ends.push(String(e.endAt));
  return ends.length ? ends.sort().pop() : null;
}

/** 시작~종료 · 소요시간 칩 (rewards.ts의 timeStats와 같은 규칙). */
function timeStats(u, minutes) {
  const out = [];
  const start = u?.startAt ? String(u.startAt) : null;
  const end = u?.endAt ? String(u.endAt) : null;
  if (start || end) out.push({ name: "", value: `${start ?? ""}${start && end ? " ~ " : ""}${end ?? ""}` });
  const mins = minutes ?? (u?.durationSec ? Math.round(Number(u.durationSec) / 60) : null);
  if (mins != null && mins > 0) out.push({ name: "", value: `${mins}분` });
  return out;
}

/** 단계별 성적을 하나씩 나눠 담는다. */
function stageStats(scores) {
  const out = [];
  for (const [name, v] of Object.entries(scores ?? {})) {
    if (name === "완료여부") continue;
    const value = formatStage(name, v);
    if (value) out.push({ name, value });
  }
  return out.slice(0, 8);
}

/** 클래스카드 어휘/본문 세트 이름으로 단어/문장 세트를 가른다 (rewards.ts와 같은 규칙). */
function classcardSetKind(unitLabel) {
  if (/본문|대화문|문장/.test(unitLabel)) return "문장세트";
  if (/영한단어|단어|어휘|voca/i.test(unitLabel)) return "단어세트";
  return null;
}

/** functions/src/rewards.ts의 studySummary와 같은 규칙 (백필용 JS 사본). */
function studySummary(slug, units, detail, scraped) {
  const items = [];
  let note = null;
  units = Array.isArray(units) ? units : [];

  if (slug === "autovoca") {
    for (const u of units) {
      if (!u?.unitLabel) continue;
      const sc = num(u?.testScore);
      items.push({ kind: null, label: String(u.unitLabel),
        stats: [...(sc !== null ? [{ name: "테스트", value: `${sc}점` }] : []), ...timeStats(u, num(u?.studyMinutes))] });
    }
  } else if (slug === "classcard-middle") {
    for (const u of units) {
      if (!u?.unitLabel) continue;
      const label = String(u.unitLabel);
      const type = u.type ? String(u.type) : null;
      items.push({
        kind: type === "어휘/본문" ? (classcardSetKind(label) ?? type) : type,
        label,
        stats: [...stageStats(u?.scores), ...timeStats(u, num(u?.studyMinutes))],
      });
    }
  } else if (slug === "dailykor") {
    // 초등: 과목별 회차 + 별점수 (중등의 지문 단위와 다르다)
    for (const e of (scraped?.elementary ?? [])) {
      if (!e?.subject) continue;
      const stats = [];
      const star = (n, label) => { const v = Number(n); if (Number.isFinite(v) && v > 0) stats.push({ name: label, value: "★".repeat(v) }); };
      star(e.wordStars, "단어"); star(e.bookStars, "교과서"); star(e.testStars, "실전");
      const score = (n, label) => { if (n != null) stats.push({ name: label, value: `${Number(n)}점` }); };
      if (e.wordStars == null) score(e.wordScore, "단어");
      if (e.bookStars == null) score(e.bookScore, "교과서");
      if (e.testStars == null) score(e.testScore, "실전");
      if (e.firstPoint != null) stats.push({ name: "최초", value: `${Number(e.firstPoint)}점` });
      if (e.reviewPoint != null) stats.push({ name: "복습", value: `${Number(e.reviewPoint)}점` });
      stats.push(...timeStats(e));
      items.push({ kind: e.round != null ? `${e.round}회차` : null, label: String(e.subject), stats });
    }
    for (const p of (detail?.passages ?? [])) {
      if (!p?.type) continue;
      items.push({ kind: null, label: String(p.type), stats: p.accuracy ? [{ name: "정답률", value: String(p.accuracy) }] : [] });
    }
    const xp = dailykorXp(detail);
    if (xp) note = `경험치 ${xp.got}/${xp.max}`;
    else {
      const g = units.map((u) => u?.scores?.["등급"]).find((v) => !!v);
      if (g) note = String(g);
    }
  } else if (slug === "class5") {
    for (const u of units) {
      if (!u?.unitLabel) continue;
      items.push({ kind: u.type ? String(u.type) : null, label: String(u.unitLabel), stats: timeStats(u) });
    }
  }

  return { items: items.slice(0, 6), note };
}

async function main() {
  const [events, children] = await Promise.all([
    db.collection("feedEvents").get(),
    db.collection("children").get(),
  ]);

  const byId = new Map(children.docs.map((d) => [d.id, d.data()]));
  console.log(`이벤트 ${events.size}건${DRY_RUN ? "  [DRY RUN]" : ""}`);

  let updated = 0, skipped = 0;

  for (const doc of events.docs) {
    const e = doc.data();
    const child = byId.get(e.childId);
    if (!child) { skipped++; continue; }

    const patch = {};
    const masked = maskName(child.name ?? "");
    if (e.name !== masked) patch.name = masked;
    if (e.grade !== (child.grade ?? "")) patch.grade = child.grade ?? "";

    // 뱃지 카드에 과목명이 없으면 뱃지 코드에서 복원
    if (e.type === "badge" && !e.serviceSlug) {
      const svc = serviceOfBadge(e.badgeCode);
      if (svc) patch.serviceSlug = svc;
    }

    // daily 카드의 과목별 요약 — 원장(xp)과 학습로그(교재·유닛명)를 합쳐 복원.
    // 원장에는 labels 필드가 이번 변경부터 생기므로, 과거분은 scrapedData에서 다시 뽑는다.
    if (e.type === "daily") {
      {
        const [ledger, logs] = await Promise.all([
          db.collection("children").doc(e.childId).collection("xpLedger").where("date", "==", e.date).get(),
          db.collection("learningLogs").where("childId", "==", e.childId).where("date", "==", e.date).get(),
        ]);
        const scrapedBySlug = new Map(
          logs.docs.map((d) => [String(d.data().serviceSlug ?? ""), d.data().scrapedData ?? {}]),
        );
        const services = ledger.docs
          .map((d) => d.data())
          .filter((l) => Number(l.xp ?? 0) > 0)
          .map((l) => {
            const slug = String(l.serviceSlug ?? "");
            const sd = scrapedBySlug.get(slug) ?? {};
            const s = studySummary(slug, sd.units, sd.detail ?? null, sd);
            return {
              slug,
              xp: Number(l.xp ?? 0),
              items: Array.isArray(l.studyItems) && l.studyItems.length ? l.studyItems : s.items,
              note: l.studyNote ?? s.note,
            };
          })
          .filter((s) => s.slug);
        if (services.length) patch.services = services;
      }
    }

    // 작성 시각을 '학습이 끝난 시각'으로. 종료 시각이 없으면 기존 기록 시각을 유지한다.
    // (정렬 필드가 없는 문서는 Firestore 쿼리에서 아예 빠지므로 모든 문서에 채워야 한다)
    if (e.date) {
      const logs = await db.collection("learningLogs")
        .where("childId", "==", e.childId).where("date", "==", e.date).get();
      const ends = logs.docs.map((d) => lastEndOf(d.data().scrapedData)).filter(Boolean).sort();
      const hhmm = ends.length ? ends[ends.length - 1] : null;
      if (hhmm && /^\d{2}:\d{2}$/.test(hhmm)) {
        const t = new Date(`${e.date}T${hhmm}:00+09:00`);
        if (!Number.isNaN(t.getTime())) patch.occurredAt = admin.firestore.Timestamp.fromDate(t);
      }
    }
    if (!patch.occurredAt && !e.occurredAt) patch.occurredAt = e.createdAt ?? admin.firestore.Timestamp.now();

    if (Object.keys(patch).length === 0) { skipped++; continue; }

    const detail = patch.services
      ? " · " + patch.services.map((s) => `${s.slug}${s.note ? `(${s.note})` : ""}[${s.items.map((i) => (i.kind ? i.kind + "|" : "") + i.label + (i.stats.length ? " " + i.stats.map((t) => t.name + " " + t.value).join(",") : "")).join(" / ")}]`).join(", ")
      : patch.serviceSlug ? ` · ${patch.serviceSlug}` : "";
    console.log(`  ${e.name || patch.name || "?"}${patch.grade ? ` (${patch.grade})` : ""}${detail}`);
    if (!DRY_RUN) await doc.ref.set(patch, { merge: true });
    updated++;
  }

  console.log(`\n갱신 ${updated}건 / 건너뜀 ${skipped}건${DRY_RUN ? " (실제 쓰기 없음)" : ""}`);
}

main().catch((e) => { console.error("실패:", e.message); process.exit(1); });
