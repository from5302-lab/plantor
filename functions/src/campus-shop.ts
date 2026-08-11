import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { resolveChild } from "./rewards-api";

// 캠퍼스 옷장 — 얼굴·헤어·옷을 학습 포인트로 산다.
//
// **통화는 캠퍼스 사과(bells)가 아니라 학습 포인트다.** 사과로 사게 두면 공부와
// 무관한 경제가 생긴다. 포인트는 클래스카드·오토보카 채점에서 rewards 가 올려 주는
// children/{childId}.points 다. 캠퍼스 저장분은 users/{uid} 에 있어서 클라이언트가
// child 문서를 직접 볼 수 없다 — 잔액 조회도 구매도 이 콜러블을 거친다.
// (규칙을 열어 children 을 읽게 하는 쪽은 가족 범위 조회라 대가가 크다)
//
// 차감은 **트랜잭션 안에서** 한다. 클라이언트가 깎게 두면 조작된다.

const db = getFirestore();

/** 12종. 캠퍼스의 avatar-kenney.MODELS 와 같은 목록이어야 한다. */
const MODELS = [
  "male-a", "male-b", "male-c", "male-d", "male-e", "male-f",
  "female-a", "female-b", "female-c", "female-d", "female-e", "female-f",
];

/** 처음부터 주는 것 — 남·여 한 벌씩. 이걸로 시작해서 나머지를 사 모은다. */
const FREE = new Set(["male-a", "female-a"]);

/** 슬롯별 값. 얼굴과 옷이 헤어보다 비싼 건 캐릭터가 더 크게 바뀌기 때문이다. */
const PRICE: Record<string, number> = { base: 500, head: 300, body: 500 };
const SLOTS = Object.keys(PRICE);

/** 상점 열림. 값을 손볼 땐 false 로 내리면 구매가 즉시 막힌다(포인트는 계속 쌓인다). */
const OPEN = true;

type Owned = Record<string, string[]>;

/** 저장분에서 소유 목록을 꺼낸다. 없는 슬롯·모르는 값은 버린다. */
function readOwned(raw: unknown): Owned {
  const src = (raw ?? {}) as Record<string, unknown>;
  const out: Owned = {};
  for (const slot of SLOTS) {
    const list = Array.isArray(src[slot]) ? (src[slot] as unknown[]) : [];
    out[slot] = list.filter((v): v is string => typeof v === "string" && MODELS.includes(v));
  }
  return out;
}

/** 무료분을 얹어 돌려준다 — 저장분에 없어도 언제나 가진 것으로 친다. */
function withFree(owned: Owned): Owned {
  const out: Owned = {};
  for (const slot of SLOTS) out[slot] = [...new Set([...FREE, ...owned[slot]])];
  return out;
}

/**
 * 운영자는 전부 열려 있고 포인트가 무제한이다.
 *
 * 운영자에겐 자녀 문서가 없어서 resolveChild 가 실패한다(포인트가 children 에
 * 있으므로). 그래서 상점 자체를 못 쓰는데, 어떻게 보이는지 확인하려면 열 수 있어야
 * 한다. 깎을 포인트가 없으니 구매도 그냥 통과시킨다 — 남의 잔액을 건드리지 않는다.
 */
async function adminUnlimited(auth: { uid: string; token: Record<string, unknown> } | undefined) {
  if (!auth) return false;
  if (auth.token.admin === true) return true;
  try { return (await db.collection("users").doc(auth.uid).get()).data()?.role === "admin"; }
  catch { return false; }
}

const ALL: Owned = Object.fromEntries(SLOTS.map((s) => [s, MODELS]));

/** 지갑 — 잔액과 가진 것. 캠퍼스가 꾸미기 화면을 열 때 한 번 부른다. */
export const getCampusWardrobe = onCall(async (request) => {
  if (await adminUnlimited(request.auth as never)) {
    return { points: Number.MAX_SAFE_INTEGER, owned: ALL, price: PRICE, free: MODELS, open: OPEN, unlimited: true };
  }
  const childDoc = await resolveChild(request.auth as never);
  const d = childDoc.data() ?? {};
  return {
    points: Number(d.points) || 0,
    owned: withFree(readOwned(d.campusOwned)),
    price: PRICE,
    free: [...FREE],
    open: OPEN,
  };
});

/** 한 칸 구매 — 포인트 차감과 소유 추가를 한 트랜잭션으로(이중 차감 방지). */
export const buyCampusItem = onCall(async (request) => {
  if (!OPEN) throw new HttpsError("failed-precondition", "옷장은 준비 중이에요. 포인트는 그대로 쌓이고 있어요.");
  const { slot, id } = (request.data ?? {}) as { slot?: string; id?: string };
  if (!slot || !PRICE[slot]) throw new HttpsError("invalid-argument", "없는 칸입니다.");
  if (!id || !MODELS.includes(id)) throw new HttpsError("invalid-argument", "없는 물건입니다.");
  if (FREE.has(id)) throw new HttpsError("failed-precondition", "이미 가지고 있어요.");

  // 운영자는 깎을 포인트가 없다. 소유만 인정하고 아무 문서도 건드리지 않는다.
  if (await adminUnlimited(request.auth as never)) {
    return { ok: true, already: true, points: Number.MAX_SAFE_INTEGER, owned: ALL, cost: 0 };
  }

  const childRef = (await resolveChild(request.auth as never)).ref;
  const cost = PRICE[slot];

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(childRef);
    const d = snap.data() ?? {};
    const owned = readOwned(d.campusOwned);
    // 이미 가진 것을 또 사면 포인트만 없어진다. 트랜잭션 안에서 다시 본다.
    if (owned[slot].includes(id)) return { already: true, points: Number(d.points) || 0, owned };
    const points = Number(d.points) || 0;
    if (points < cost) throw new HttpsError("failed-precondition", "포인트가 모자라요.");
    owned[slot] = [...owned[slot], id];
    tx.set(childRef, {
      points: FieldValue.increment(-cost),
      campusOwned: owned,
      campusShopAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { already: false, points: points - cost, owned };
  });

  return { ok: true, already: result.already, points: result.points, owned: withFree(result.owned), cost };
});
