import { onDocumentCreated, onDocumentDeleted } from "firebase-functions/v2/firestore";
import * as functions from "firebase-functions";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "./config";
import { BADGE_BY_CODE, SHOP_BY_ID, titleFromLevel } from "./rewards-config";

// 리워드 자랑 피드(/community)의 이벤트 기록.
//   학생이 쓰는 글은 없다. 뱃지·칭호·레벨·구매가 생길 때 서버가 카드를 남긴다.
//   XP 낱개는 기록하지 않는다 — 배치(09·13·17·21시)+클릭으로 하루 최대 20번 재계산되므로
//   그대로 흘리면 피드가 소음이 된다. 대신 'daily' 카드 한 장을 갱신한다.
//
// 히든 뱃지 조건(desc)은 절대 담지 않는다. 조건을 미리 공개하지 않는 것이
// 뱃지 설계의 전제이고(plan-reward-system.md §5.0), 피드는 그걸 무너뜨리기 가장 쉬운 곳이다.

/**
 * 괄호 표기는 버리고 부르는 이름만 남긴다.
 *   사랑이(박수현) → 사랑이
 * 괄호까지 글자로 세면 "사○○○○○○)"처럼 닫는 괄호만 살아남아 이름으로 읽히지 않는다.
 */
function callName(name: string): string {
  const raw = (name ?? "").trim();
  const stripped = raw.replace(/\s*[(（][^)）]*[)）]\s*/g, " ").trim();
  return stripped || raw;
}

/**
 * 이름 가운데를 ○로 가린다. 피드는 공개 페이지라 **공개 문서에 실명을 두지 않는다**
 * (화면에서만 가리면 Firestore를 직접 읽어 실명을 볼 수 있다).
 * 같은 가족은 클라이언트가 childId로 실명을 되살린다.
 *   임효주 → 임○주 / 김민 → 김○ / 남궁민수 → 남○○수 / 사랑이(박수현) → 사○이
 */
function maskName(name: string): string {
  const n = callName(name);
  if (n.length <= 1) return n;
  if (n.length === 2) return `${n[0]}○`;
  return `${n[0]}${"○".repeat(n.length - 2)}${n[n.length - 1]}`;
}

/**
 * 이름이 바뀐 학생의 기존 피드 카드를 새 이름으로 맞춘다.
 *
 * 피드 문서는 기록 시점의 가린 이름을 박아 두므로, 이름을 고쳐도 저절로 따라오지 않는다.
 * daily 카드는 다음 적립 때 갱신되지만 뱃지·레벨·아이템 카드는 create 전용(putOnce)이라
 * 손대지 않으면 **영영 옛 이름으로 남는다**. 그래서 이름 변경 경로에서 직접 맞춰 준다.
 */
export async function syncFeedName(childId: string, name: string): Promise<void> {
  const masked = maskName(name);
  const snap = await db.collection("feedEvents").where("childId", "==", childId).get();
  const stale = snap.docs.filter((d) => d.data().name !== masked);
  if (!stale.length) return;

  const batch = db.batch();
  for (const d of stale) batch.update(d.ref, { name: masked });
  await batch.commit();
  functions.logger.info("[feed] 이름 동기화", { childId, masked, count: stale.length });
}

/** 성장형 뱃지 — 잘하는 학생이 아니라 나아진 학생이 눈에 띄게 한다. */
const GROWTH_BADGES = new Set(["x-jump", "x-turnaround", "av-never-give-up", "x-catchup", "c5-record"]);

export type StudyStat = { name: string; value: string };
export type StudyItem = { kind: string | null; label: string; stats: StudyStat[] };
/** 과목 하나 — 그 과목에서 한 학습 세트들(items)과 과목 단위 요약(note). */
export type StudyEntry = { slug: string; xp: number; items: StudyItem[]; note: string | null };

export type FeedInput = {
  childId: string;
  date: string;
  /** 피드는 실명·학년을 공개한다 (사용자 확정, plan-community-feed.md §2 참고) */
  name: string;
  grade: string;
  equipped: Record<string, string | null>;
  level: number;
  prevLevel: number;
  newBadges: string[];
  /** 이번 적립이 어느 서비스였는지 — 뱃지 카드에 '어디서' 를 붙인다 */
  serviceSlug: string;
  dayXp: number;
  doneCount: number;
  streak: number;
  /** 그날 학습한 과목별 요약 (무엇을 했는지) */
  services: StudyEntry[];
  /** 학습이 실제로 끝난 시각 "HH:MM" — 카드의 작성 시각 기준. 없으면 기록 시각으로 폴백. */
  occurredAt: string | null;
  /** 지난 날짜를 뒤늦게 만회한 적립 — 하루 요약 카드는 만들지 않는다. */
  late: boolean;
  optOut: boolean;
};

type Author = {
  childId: string;
  name: string;
  grade: string;
  equipped: Record<string, string | null>;
  level: number;
  title: string;
};

/**
 * 학습 종료 시각("HH:MM" + 날짜)을 Timestamp로. 피드는 이 시각 순으로 정렬된다.
 * 스크랩 시각이 아니라 **학생이 실제로 학습을 끝낸 시각**이어야 카드 순서가 학습 순서와 맞는다.
 */
function occurredTs(date: string, hhmm: string | null): FirebaseFirestore.Timestamp | null {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const t = new Date(`${date}T${hhmm}:00+09:00`);
  return Number.isNaN(t.getTime()) ? null : Timestamp.fromDate(t);
}

/** 1회성 카드 — 재계산으로 같은 키가 다시 와도 create가 실패하며 조용히 넘어간다. */
async function putOnce(id: string, data: Record<string, unknown>, occurred?: FirebaseFirestore.Timestamp | null): Promise<void> {
  try {
    await db.collection("feedEvents").doc(id).create({
      ...data,
      likeCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      // 학습 종료 시각이 있으면 그걸, 없으면 기록 시각을 쓴다
      occurredAt: occurred ?? FieldValue.serverTimestamp(),
    });
  } catch {
    /* 이미 기록된 이벤트 — 정상 경로 */
  }
}

function authorFields(a: Author) {
  return {
    childId: a.childId,
    // 공개 문서에는 가린 이름만. 가족은 클라이언트가 childId로 실명을 되살린다.
    name: maskName(a.name),
    grade: a.grade,
    equipped: a.equipped,
    // 이름 스타일은 피드에서 바로 쓰도록 따로 꺼내 둔다(카탈로그 조회 없이 렌더)
    nameStyle: a.equipped?.nameStyle ?? null,
    level: a.level,
    title: a.title,
  };
}

/**
 * 리워드 적립 결과를 피드 카드로 남긴다.
 * awardRewards 트랜잭션 **밖**에서 호출되며, 실패해도 적립 자체는 되돌리지 않는다.
 */
export async function recordRewardFeed(input: FeedInput): Promise<void> {
  const { childId, date, newBadges, level, prevLevel, dayXp, doneCount, streak, late, optOut } = input;
  if (optOut) return;

  // 뱃지·레벨도 그날 학습의 결과이므로 같은 종료 시각을 쓴다
  const occurred = occurredTs(date, input.occurredAt);
  const title = titleFromLevel(level);
  const author: Author = {
    childId,
    name: input.name,
    grade: input.grade,
    equipped: input.equipped ?? {},
    level,
    title,
  };

  for (const code of newBadges) {
    const badge = BADGE_BY_CODE.get(code);
    if (!badge) continue;
    await putOnce(`${childId}_badge_${code}`, {
      ...authorFields(author),
      type: "badge",
      badgeCode: code,
      badgeName: badge.name,
      rarity: badge.rarity,
      growth: GROWTH_BADGES.has(code),
      // 뱃지를 딴 과목 — 조건(desc)은 여전히 담지 않는다(히든 유지)
      serviceSlug: badge.service ?? input.serviceSlug ?? null,
      date,
    }, occurred);
  }

  if (level > prevLevel) {
    const prevTitle = titleFromLevel(prevLevel);
    // 칭호가 바뀐 레벨업은 칭호 카드 하나로만 알린다(같은 사건을 두 장으로 쪼개지 않는다).
    if (title !== prevTitle) {
      await putOnce(`${childId}_title_${title}`, { ...authorFields(author), type: "title", prevTitle, date }, occurred);
    } else {
      await putOnce(`${childId}_level_${level}`, { ...authorFields(author), type: "level", date }, occurred);
    }
  }

  // 과거 만회는 하루 요약을 만들지 않는다. 클래스5 과거 정정은 여러 날짜를 한꺼번에 처리하므로
  // 그대로 두면 지난 날짜 카드가 무더기로 피드 맨 위에 올라온다. 뱃지·레벨은 그대로 기록된다.
  if (dayXp > 0 && !late) {
    const ref = db.collection("feedEvents").doc(`${childId}_daily_${date}`);
    const snap = await ref.get();
    await ref.set({
      ...authorFields(author),
      type: "daily",
      date,
      xp: dayXp,
      doneCount,
      streak,
      services: input.services ?? [],
      // 정렬 기준은 '학습을 끝낸 시각'. 그날 학습을 더 하면 그만큼 뒤로 밀리는 게 맞다.
      occurredAt: occurred ?? (snap.data()?.occurredAt ?? FieldValue.serverTimestamp()),
      // 하루 요약은 재계산될 때마다 내용만 갱신한다(createdAt은 최초 기록 시각으로 보존).
      ...(snap.exists ? {} : { likeCount: 0, createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
  }
}

/** 아이템 구매 카드 — 아바타를 꾸민 걸 보여줄 창구. */
export async function recordPurchaseFeed(params: {
  childId: string;
  itemId: string;
  name: string;
  grade: string;
  equipped: Record<string, string | null>;
  level: number;
  optOut: boolean;
}): Promise<void> {
  const item = SHOP_BY_ID.get(params.itemId);
  if (!item || params.optOut) return;

  const author: Author = {
    childId: params.childId,
    name: params.name,
    grade: params.grade,
    equipped: params.equipped ?? {},
    level: params.level,
    title: titleFromLevel(params.level),
  };

  await putOnce(`${params.childId}_item_${item.id}`, {
    ...authorFields(author),
    type: "item",
    itemId: item.id,
    itemName: item.name,
    rarity: item.rarity,
    /** 포인트로 살 수 없는 뱃지 전용 아이템 — 자랑 가치가 가장 크다. */
    exclusive: !!item.badgeCode,
  });
}

// ── 엄지척 집계 ───────────────────────────────────────────────────────────────
// 문서 ID가 uid라 중복 좋아요는 rules 단계에서 이미 불가능하다.
// 여기서는 개수만 센다.

const likePath = "feedEvents/{eventId}/likes/{uid}";

export const onFeedLike = onDocumentCreated({ document: likePath }, async (event) => {
  await db.collection("feedEvents").doc(event.params.eventId)
    .set({ likeCount: FieldValue.increment(1) }, { merge: true })
    .catch((e) => functions.logger.warn("[feed] 엄지척 집계 실패", { error: String(e) }));
});

export const onFeedUnlike = onDocumentDeleted({ document: likePath }, async (event) => {
  await db.collection("feedEvents").doc(event.params.eventId)
    .set({ likeCount: FieldValue.increment(-1) }, { merge: true })
    .catch((e) => functions.logger.warn("[feed] 엄지척 취소 집계 실패", { error: String(e) }));
});
