import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as functions from "firebase-functions";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./config";
import { BADGE_BY_CODE, DEFAULT_ITEMS, SHOP_BY_ID, badgeSlots, bundleEffects, levelFromXp } from "./rewards-config";
import { recordPurchaseFeed } from "./feed-events";

// 학생이 직접 호출하는 리워드 API — 구매·착용·뱃지 확인·피드 공개 설정.
// 포인트 차감은 클라이언트를 믿을 수 없으므로 전부 서버에서 처리한다.

/** 호출자 → 본인 children 문서. 남의 계정은 건드릴 수 없다. */
async function resolveChild(auth: { uid: string; token: Record<string, unknown> } | undefined) {
  if (!auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const userSnap = await db.collection("users").doc(auth.uid).get();
  let plantorId = String(userSnap.data()?.plantor_id ?? "").toLowerCase();
  if (!plantorId) {
    const email = String(auth.token.email ?? "");
    if (email.endsWith("@plantor.app")) plantorId = email.replace("@plantor.app", "").toLowerCase();
  }
  if (!plantorId) throw new HttpsError("failed-precondition", "학생 계정을 확인할 수 없습니다.");
  const snap = await db.collection("children").where("loginId", "==", plantorId).limit(1).get();
  if (snap.empty) throw new HttpsError("not-found", "학생 정보를 찾을 수 없습니다.");
  return snap.docs[0];
}

/** 상점 오픈 여부. 아이템을 손볼 때 false 로 내리면 구매가 즉시 막힌다. */
const SHOP_OPEN = true;

/** 상점 구매 — 포인트 차감과 인벤토리 추가를 한 트랜잭션으로 (이중 차감 방지). */
export const purchaseShopItem = onCall(async (request) => {
  if (!SHOP_OPEN) throw new HttpsError("failed-precondition", "상점은 준비 중이에요. 포인트는 그대로 쌓이고 있어요.");
  const { itemId } = (request.data ?? {}) as { itemId?: string };
  const item = itemId ? SHOP_BY_ID.get(itemId) : undefined;
  if (!item) throw new HttpsError("invalid-argument", "없는 아이템입니다.");

  const childDoc = await resolveChild(request.auth as never);
  const childRef = childDoc.ref;
  const invRef = childRef.collection("inventory").doc(item.id);
  const statsRef = childRef.collection("stats").doc("summary");

  const bought = await db.runTransaction(async (tx) => {
    const [child, inv, stats] = await Promise.all([tx.get(childRef), tx.get(invRef), tx.get(statsRef)]);
    if (inv.exists) return { result: "already-owned", points: Number(child.data()?.points ?? 0) };

    const points = Number(child.data()?.points ?? 0);
    const level = levelFromXp(Number(child.data()?.xpTotal ?? 0));

    if (item.badgeCode) {
      const owned: string[] = stats.data()?.badgeCodes ?? [];
      if (!owned.includes(item.badgeCode)) throw new HttpsError("failed-precondition", "아직 이 뱃지를 얻지 못했어요.");
    }
    if (item.minLevel && level < item.minLevel) {
      throw new HttpsError("failed-precondition", `레벨 ${item.minLevel}부터 열려요.`);
    }
    // 장착 뱃지의 상점 할인. 가격 계산은 서버에서만 한다 — 클라이언트가 보낸 값을 믿으면 공짜로 산다.
    const discountPct = bundleEffects((child.data()?.equippedBadges ?? []) as string[]).shopDiscountPct;
    const price = Math.max(0, Math.round(item.cost * (100 - discountPct) / 100));
    if (price > points) throw new HttpsError("failed-precondition", "포인트가 모자라요.");

    tx.set(invRef, {
      itemId: item.id, slot: item.slot,
      source: item.badgeCode ? "badge" : item.minLevel ? "level" : "point",
      cost: price, listPrice: item.cost, discountPct, acquiredAt: FieldValue.serverTimestamp(),
    });
    if (price > 0) {
      tx.set(childRef, {
        points: FieldValue.increment(-price),
        pointsSpent: FieldValue.increment(price),
      }, { merge: true });
    }
    return {
      result: "ok",
      points: points - price,
      feed: {
        name: String(child.data()?.name ?? ""),
        grade: String(child.data()?.grade ?? ""),
        equipped: (child.data()?.equipped ?? {}) as Record<string, string | null>,
        level,
        optOut: child.data()?.feedOptOut === true,
      },
    };
  });

  // 자랑 피드 기록은 구매 성사 뒤에 — 실패해도 구매를 되돌리지 않는다
  if (bought.result === "ok" && bought.feed) {
    await recordPurchaseFeed({ childId: childRef.id, itemId: item.id, ...bought.feed })
      .catch((e) => functions.logger.warn("[shop] 피드 기록 실패", { itemId: item.id, error: String(e) }));
  }
  return { result: bought.result, points: bought.points };
});

/** 피드 비공개 — 켜면 내 리워드가 /community에 올라가지 않는다. */
export const setFeedOptOut = onCall(async (request) => {
  const { optOut } = (request.data ?? {}) as { optOut?: boolean };
  const childDoc = await resolveChild(request.auth as never);
  await childDoc.ref.set({ feedOptOut: optOut === true }, { merge: true });
  return { result: "ok", optOut: optOut === true };
});

/** 아바타 착용 — 보유한 아이템만. slot에 null을 주면 해제. */
export const equipAvatarItem = onCall(async (request) => {
  const { slot, itemId } = (request.data ?? {}) as { slot?: string; itemId?: string | null };
  if (!slot) throw new HttpsError("invalid-argument", "slot이 필요합니다.");

  const childDoc = await resolveChild(request.auth as never);
  if (itemId) {
    const item = SHOP_BY_ID.get(itemId);
    if (!item || item.slot !== slot) throw new HttpsError("invalid-argument", "슬롯에 맞지 않는 아이템입니다.");
    const owned = await childDoc.ref.collection("inventory").doc(itemId).get();
    const isDefault = DEFAULT_ITEMS.includes(itemId);
    if (!owned.exists && !isDefault) throw new HttpsError("failed-precondition", "아직 가지고 있지 않은 아이템이에요.");
  }
  await childDoc.ref.set({ equipped: { [slot]: itemId ?? null } }, { merge: true });
  return { result: "ok" };
});

/**
 * 뱃지 장착 — 보유한 뱃지만, 레벨로 열린 슬롯 수만큼.
 *
 * 효과는 서버 산식(computeXp)이 children.equippedBadges 를 읽어 적용한다.
 * 그래서 검증은 반드시 여기서 끝내야 한다 — 클라이언트가 보낸 목록을 그대로 저장하면
 * 안 딴 뱃지의 효과를 쓸 수 있다.
 */
export const equipBadges = onCall(async (request) => {
  const { codes } = (request.data ?? {}) as { codes?: string[] };
  const list = Array.isArray(codes) ? [...new Set(codes.map(String))] : [];

  const childDoc = await resolveChild(request.auth as never);
  const level = levelFromXp(Number(childDoc.data()?.xpTotal ?? 0));
  const slots = badgeSlots(level);
  if (list.length > slots) {
    throw new HttpsError("failed-precondition", `지금은 ${slots}개까지 장착할 수 있어요.`);
  }
  for (const code of list) {
    if (!BADGE_BY_CODE.has(code)) throw new HttpsError("invalid-argument", "없는 뱃지입니다.");
    const owned = await childDoc.ref.collection("badges").doc(code).get();
    if (!owned.exists) throw new HttpsError("failed-precondition", "아직 따지 않은 뱃지예요.");
  }
  await childDoc.ref.set({ equippedBadges: list }, { merge: true });
  return { result: "ok", slots };
});

/** 뱃지 발견 연출을 보여준 뒤 호출 — 다음 접속 때 다시 뜨지 않게 한다. */
export const markBadgesSeen = onCall(async (request) => {
  const { codes } = (request.data ?? {}) as { codes?: string[] };
  if (!Array.isArray(codes) || !codes.length) return { result: "noop" };
  const childDoc = await resolveChild(request.auth as never);
  const batch = db.batch();
  for (const code of codes.slice(0, 50)) {
    batch.set(childDoc.ref.collection("badges").doc(code), { seen: true }, { merge: true });
  }
  await batch.commit();
  return { result: "ok", count: codes.length };
});
