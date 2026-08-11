import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { resolveChild } from "./rewards-api";

// 캠퍼스 캐릭터를 프로필에 내보낸다.
//
// 캠퍼스 캐릭터는 users/{uid}.campus 에 있는데 그 문서는 **본인만** 읽는다(firestore.rules).
// 그래서 피드·학부모 화면에서는 남의 캐릭터를 그릴 수 없다. 표시용 사본을
// children/{childId} 로 옮겨 두는 게 이 콜러블이 하는 일 전부다.
//
// look 은 **해석하지 않고 통째로** 보관한다. 캠퍼스가 지금 Kenney 모델로 갈아타는 중이라
// 스키마가 굳지 않았다 — 여기서 파츠를 뜯으면 캠퍼스가 바뀔 때마다 같이 깨진다.

/** look·body JSON 의 최대 크기. 지금 스키마는 1KB 안쪽이다 */
const MAX_LOOK_BYTES = 8_000;
/** 스냅샷 PNG 하나의 최대 크기(디코드 후). 3:4 @2x 면 100KB 안쪽이다 */
const MAX_PNG_BYTES = 400_000;
/** 하루 발행 횟수 — 꾸미기를 만질 때마다 올리면 업로드가 끝없이 일어난다 */
const DAILY_LIMIT = 20;

const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

/** data:image/png;base64,… → Buffer. 아니면 null. */
function decodePng(dataUrl: unknown): Buffer | null {
  const s = String(dataUrl ?? "");
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(s);
  if (!m) return null;
  const buf = Buffer.from(m[1], "base64");
  if (!buf.length || buf.length > MAX_PNG_BYTES) {
    throw new HttpsError("invalid-argument", "스냅샷이 너무 큽니다.");
  }
  return buf;
}

/**
 * 업로드 후 공개 URL. storage.rules 의 campus-shots/** 가 공개 읽기라
 * 토큰 없는 alt=media 주소로 바로 열린다(피드는 비로그인도 본다).
 */
async function upload(path: string, png: Buffer): Promise<string> {
  const bucket = getStorage().bucket();
  await bucket.file(path).save(png, {
    contentType: "image/png",
    // 파일명에 버전이 박히므로 오래 캐시해도 옛 얼굴이 남지 않는다
    metadata: { cacheControl: "public, max-age=31536000, immutable" },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media`;
}

export const publishCampusLook = onCall(async (request) => {
  const { look, body, fullPng, facePng } = (request.data ?? {}) as {
    look?: unknown; body?: unknown; fullPng?: string; facePng?: string;
  };
  if (!look || typeof look !== "object") throw new HttpsError("invalid-argument", "캐릭터 정보가 없습니다.");
  if (JSON.stringify({ look, body }).length > MAX_LOOK_BYTES) {
    throw new HttpsError("invalid-argument", "캐릭터 정보가 너무 큽니다.");
  }

  const childDoc = await resolveChild(request.auth as never);
  const childId = childDoc.id;

  const day = kstDay();
  const stats = childDoc.data()?.campusLookDay === day ? Number(childDoc.data()?.campusLookCount ?? 0) : 0;
  if (stats >= DAILY_LIMIT) {
    throw new HttpsError("resource-exhausted", "오늘은 캐릭터를 충분히 바꿨어요. 내일 다시 바꿀 수 있어요.");
  }

  const full = decodePng(fullPng);
  const face = decodePng(facePng);
  // 파일명이 매번 달라야 캐시가 옛 얼굴을 붙들지 않는다. 날짜+횟수면 충분하다(무작위 금지 — 재실행이 어려워진다).
  const v = `${day}-${stats + 1}`;
  const patch: Record<string, unknown> = {
    campusLook: look,
    campusBody: body ?? null,
    campusLookAt: FieldValue.serverTimestamp(),
    campusLookDay: day,
    campusLookCount: stats + 1,
  };
  if (full) patch.campusShot = await upload(`campus-shots/${childId}/full-${v}.png`, full);
  if (face) patch.campusFaceShot = await upload(`campus-shots/${childId}/face-${v}.png`, face);

  await childDoc.ref.set(patch, { merge: true });
  return { ok: true, shot: patch.campusShot ?? null, faceShot: patch.campusFaceShot ?? null };
});
