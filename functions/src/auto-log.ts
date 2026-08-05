import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./config";

const coworkSecret = defineSecret("COWORK_SECRET");

/**
 * 자동인증 학습 로그를 기록/갱신하는 공용 함수.
 * autoLog 엔드포인트(외부 스크래퍼용)와 verifyAutoProgress 콜러블(클릭 실시간)이 공유한다.
 * 오늘·동일 서비스의 method:"auto" 로그가 있으면 update, 없으면 create.
 */
export async function writeAutoLog(params: {
  childId: string;
  serviceSlug: string;
  date: string;
  autoStatus: string;
  scrapedData?: Record<string, unknown> | null;
}): Promise<"created" | "updated"> {
  const { childId, serviceSlug, date, autoStatus, scrapedData } = params;

  const existing = await db.collection("learningLogs")
    .where("childId", "==", childId)
    .where("serviceSlug", "==", serviceSlug)
    .where("date", "==", date)
    .where("method", "==", "auto")
    .get();

  if (!existing.empty) {
    await existing.docs[0].ref.update({
      autoStatus,
      scrapedData: scrapedData ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return "updated";
  }

  await db.collection("learningLogs").add({
    childId,
    serviceSlug,
    date,
    method: "auto",
    autoStatus,
    scrapedData: scrapedData ?? null,
    confirmedAt: FieldValue.serverTimestamp(),
    flagged: false,
  });
  return "created";
}

/**
 * Cowork 스크래퍼가 Classcard 학습 결과를 기록하는 엔드포인트.
 *
 * POST /autoLog
 * Authorization: Bearer {COWORK_SECRET}
 * Body: {
 *   childId: string
 *   serviceSlug: string          // "classcard-middle" 등
 *   date: string                 // YYYY-MM-DD
 *   autoStatus: "시작전" | "진행중" | "완료"
 *   scrapedData?: {
 *     scores?: Record<string, number | string>
 *     studyMinutes?: number
 *     rawSummary?: string
 *   }
 * }
 */
export const autoLog = onRequest(
  { secrets: [coworkSecret], cors: true, invoker: "public" },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "POST only" });
      return;
    }

    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token || token !== coworkSecret.value()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { childId, serviceSlug, date, autoStatus, scrapedData } = req.body as {
      childId?: string;
      serviceSlug?: string;
      date?: string;
      autoStatus?: string;
      scrapedData?: Record<string, unknown>;
    };

    if (!childId || !serviceSlug || !date || !autoStatus) {
      res.status(400).json({ error: "childId, serviceSlug, date, autoStatus 필수" });
      return;
    }

    if (!["시작전", "진행중", "완료"].includes(autoStatus)) {
      res.status(400).json({ error: "autoStatus는 시작전|진행중|완료 중 하나" });
      return;
    }

    const result = await writeAutoLog({ childId, serviceSlug, date, autoStatus, scrapedData });
    res.json({ result });
  }
);
