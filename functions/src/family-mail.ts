import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db, auth } from "./config";
import { XP } from "./rewards-config";
import { resolveChild } from "./rewards-api";
import { idToEmail } from "./utils";

// 가족 편지함 — 부모와 자녀가 가족 안에서만 주고받는다. 공개 피드에는 올라가지 않는다.
//
// 선물은 **포인트**다. 캠퍼스 벨은 users/{uid}.campus 자기쓰기라 학생이 직접 늘릴 수 있어
// 부모가 보내도 값어치가 없다. 포인트는 서버만 쓰므로 선물이 선물 노릇을 한다.
//
// 포인트는 편지를 **열 때** 지급한다(openFamilyMail). 보낼 때 넣으면 아이는 통장에
// 숫자가 는 것만 보고 누가 왜 줬는지 모른다.

const MAX_TEXT = 200;
/** 한 사람이 하루에 보낼 수 있는 편지 수 — 편지함이 알림창이 되지 않게 */
const DAILY_SEND_LIMIT = 5;
/** 매칭 선물 상한. 상점가가 200~1500이라 이보다 크면 한 주에 다 살 수 있다 */
const MATCH_CAP = 200;
const MATCH_MULTS = [0.5, 1] as const;

const kstNow = () => new Date(Date.now() + 9 * 3600e3);
const dateStr = (d: Date) => d.toISOString().slice(0, 10);

/** 그 주 월요일 날짜 — 매칭 주 1회를 판정하는 키 */
function weekMonday(d: Date): string {
  const dow = (d.getUTCDay() + 6) % 7;            // 0=월 (KST 보정된 Date라 UTC 게터를 쓴다)
  return dateStr(new Date(d.getTime() - dow * 86400e3));
}

/** 이번 주(월~일) 자녀가 서버에서 적립한 XP 합. 매칭의 기준값. */
async function weekXpOf(childId: string, monday: string): Promise<number> {
  const sunday = dateStr(new Date(new Date(`${monday}T00:00:00Z`).getTime() + 6 * 86400e3));
  const snap = await db.collection("children").doc(childId).collection("xpLedger")
    .where("date", ">=", monday).where("date", "<=", sunday).get();
  return snap.docs.reduce((sum, d) => sum + (Number(d.data().xp) || 0), 0);
}

/** 매칭 선물 금액. 클라이언트가 보낸 값은 미리보기일 뿐이고 확정은 여기서 한다. */
export function matchPoints(weekXp: number, mult: number): number {
  return Math.min(MATCH_CAP, Math.max(0, Math.round(weekXp * XP.POINT_RATE * mult)));
}

/** 호출자가 학부모라면 그 가족 문서. 아니면 null. */
async function resolveParentFamily(uid: string) {
  const byUser = await db.collection("families").where("userId", "==", uid).limit(1).get();
  if (!byUser.empty) return byUser.docs[0];
  // userId 가 비어 있는 옛 가족 — 가족 문서 ID 가 부모 uid 다(auth.ts:144)
  const byId = await db.collection("families").doc(uid).get();
  return byId.exists ? byId : null;
}

/** 자녀 로그인 ID → 그 학생의 인증 uid. 계정이 없으면 null. */
async function childUidOf(loginId: string): Promise<string | null> {
  if (!loginId) return null;
  const byField = await db.collection("users").where("plantor_id", "==", loginId).limit(1).get();
  if (!byField.empty) return byField.docs[0].id;
  // users 문서에 plantor_id 가 없는 계정이 있다(useMyFamilyNames 와 같은 폴백)
  try {
    return (await auth.getUserByEmail(idToEmail(loginId))).uid;
  } catch {
    return null;
  }
}

function cleanText(raw: unknown): string {
  const text = String(raw ?? "").trim();
  if (!text) throw new HttpsError("invalid-argument", "편지 내용을 적어 주세요.");
  if (text.length > MAX_TEXT) throw new HttpsError("invalid-argument", `편지는 ${MAX_TEXT}자까지 쓸 수 있어요.`);
  return text;
}

/**
 * 편지 보내기 — 부모→자녀(선물 첨부 가능), 자녀→부모(답장).
 * 호출자가 학부모인지 학생인지는 서버가 판별한다. 클라이언트가 정하게 두면 남의 이름으로 쓸 수 있다.
 */
export const sendFamilyMail = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const uid = request.auth.uid;
  const { childId: reqChildId, text: rawText, mult: rawMult } = (request.data ?? {}) as {
    childId?: string; text?: string; mult?: number;
  };
  const text = cleanText(rawText);

  const today = dateStr(kstNow());
  const senderDay = `${uid}_${today}`;
  // 발신자·날짜를 한 필드에 합쳐 두면 동등 조건 하나로 세어진다(복합 인덱스 불필요)
  const sentToday = await db.collection("familyMail").where("senderDay", "==", senderDay).count().get();
  if (sentToday.data().count >= DAILY_SEND_LIMIT) {
    throw new HttpsError("resource-exhausted", `편지는 하루 ${DAILY_SEND_LIMIT}통까지 보낼 수 있어요.`);
  }

  const family = await resolveParentFamily(uid);

  // ── 부모가 보내는 경우 ──────────────────────────────────────────────
  if (family) {
    if (!reqChildId) throw new HttpsError("invalid-argument", "받는 자녀를 골라 주세요.");
    const childSnap = await db.collection("children").doc(reqChildId).get();
    if (!childSnap.exists || childSnap.data()?.familyId !== family.id) {
      throw new HttpsError("permission-denied", "내 가족의 자녀가 아닙니다.");
    }
    const childUid = await childUidOf(String(childSnap.data()?.loginId ?? "").toLowerCase());
    if (!childUid) throw new HttpsError("failed-precondition", "자녀 계정이 아직 없어요. 편지를 받을 곳이 없습니다.");

    let gift: { kind: "match"; weekKey: string; weekXp: number; mult: number; points: number } | null = null;
    let matchKey: string | null = null;
    const mult = Number(rawMult);
    if ((MATCH_MULTS as readonly number[]).includes(mult)) {
      const weekKey = weekMonday(kstNow());
      matchKey = `${reqChildId}_${weekKey}`;
      const dup = await db.collection("familyMail").where("matchKey", "==", matchKey).limit(1).get();
      if (!dup.empty) throw new HttpsError("failed-precondition", "이번 주 선물은 이미 보냈어요. 다음 주에 다시 얹을 수 있어요.");
      const weekXp = await weekXpOf(reqChildId, weekKey);
      gift = { kind: "match", weekKey, weekXp, mult, points: matchPoints(weekXp, mult) };
    }

    const ref = await db.collection("familyMail").add({
      familyId: family.id, childId: reqChildId,
      parentUid: uid, childUid,
      dir: "toChild",
      fromName: String(family.data()?.parentName ?? "") || "부모님",
      text, gift, matchKey, giftClaimed: false,
      senderDay, readAt: null, createdAt: FieldValue.serverTimestamp(),
    });
    return { id: ref.id, gift };
  }

  // ── 자녀가 답장하는 경우 ────────────────────────────────────────────
  const childDoc = await resolveChild(request.auth as never);
  const familyId = String(childDoc.data()?.familyId ?? "");
  const famSnap = familyId ? await db.collection("families").doc(familyId).get() : null;
  // 가족 문서 ID 가 곧 부모 uid 인 경로가 있어(auth.ts:144) userId 가 비어도 되살릴 수 있다
  const parentUid = String(famSnap?.data()?.userId ?? "") || familyId;
  if (!parentUid) throw new HttpsError("failed-precondition", "부모님 계정을 찾을 수 없어요.");

  const ref = await db.collection("familyMail").add({
    familyId, childId: childDoc.id,
    parentUid, childUid: uid,
    dir: "toParent",
    fromName: String(childDoc.data()?.name ?? "") || "자녀",
    text, gift: null, matchKey: null, giftClaimed: false,
    senderDay, readAt: null, createdAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id, gift: null };
});

/**
 * 편지 열기 — 받는 사람만 열 수 있다. 선물이 들어 있으면 이때 포인트가 지급된다.
 * 두 번 열어도 선물은 한 번만 나온다(giftClaimed 를 트랜잭션 안에서 뒤집는다).
 */
export const openFamilyMail = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const uid = request.auth.uid;
  const { mailId } = (request.data ?? {}) as { mailId?: string };
  if (!mailId) throw new HttpsError("invalid-argument", "편지를 찾을 수 없습니다.");

  const mailRef = db.collection("familyMail").doc(mailId);
  return db.runTransaction(async (tx) => {
    const mail = await tx.get(mailRef);
    if (!mail.exists) throw new HttpsError("not-found", "편지를 찾을 수 없습니다.");
    const m = mail.data()!;
    const recipient = m.dir === "toChild" ? m.childUid : m.parentUid;
    if (uid !== recipient) throw new HttpsError("permission-denied", "내가 받은 편지가 아닙니다.");

    const gift = m.gift as { points?: number } | null;
    const claiming = m.dir === "toChild" && !!gift?.points && m.giftClaimed !== true;
    if (claiming) {
      tx.set(db.collection("children").doc(String(m.childId)),
             { points: FieldValue.increment(Number(gift!.points)) }, { merge: true });
    }
    tx.set(mailRef, {
      readAt: m.readAt ?? FieldValue.serverTimestamp(),
      ...(claiming ? { giftClaimed: true } : {}),
    }, { merge: true });

    return { claimed: claiming, points: claiming ? Number(gift!.points) : 0 };
  });
});
