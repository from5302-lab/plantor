import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { db } from "./config";
import { writeAutoLog } from "./auto-log";

// 북마클릿(운영자 브라우저)이 긁은 클래스카드 문법/듣기 데이터를 받아 기록한다.
// 학생 매핑: children.classcardLoginId 우선, 없으면 이름(학년 접두사 무시)으로 매칭.

const coworkSecret = defineSecret("COWORK_SECRET");

function norm(s: unknown): string {
  return String(s ?? "").replace(/\s+/g, "");
}

type IncomingStudent = {
  loginId?: string;
  name?: string;
  autoStatus?: string;
  units?: Array<Record<string, unknown>>;
};

export const classcardLog = onRequest(
  { secrets: [coworkSecret], cors: true, invoker: "public" },
  async (req, res) => {
    if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token || token !== coworkSecret.value()) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { date, students } = req.body as { date?: string; students?: IncomingStudent[] };
    if (!date || !Array.isArray(students)) { res.status(400).json({ error: "date, students 필수" }); return; }

    // 전체 children 로드 → 매핑 맵 (외부아이디 / 이름)
    const snap = await db.collection("children").get();
    const byClasscard = new Map<string, string>();
    const byName: Array<{ id: string; name: string }> = [];
    snap.forEach((d) => {
      const data = d.data();
      const cc = String(data.classcardLoginId ?? "").toLowerCase();
      if (cc) byClasscard.set(cc, d.id);
      if (data.name) byName.push({ id: d.id, name: norm(data.name) });
    });

    const results: Array<Record<string, unknown>> = [];
    for (const s of students) {
      const loginId = String(s.loginId ?? "").toLowerCase();
      const nameNorm = norm(s.name); // "중1오수영"
      let childId = loginId ? byClasscard.get(loginId) : undefined;
      let matchedBy = childId ? "id" : "";
      if (!childId && nameNorm) {
        const hit = byName.find((c) => c.name && (nameNorm === c.name || nameNorm.endsWith(c.name) || nameNorm.includes(c.name)));
        if (hit) { childId = hit.id; matchedBy = "name"; }
      }
      if (!childId) { results.push({ loginId, name: s.name, matched: false }); continue; }

      const units = Array.isArray(s.units) ? s.units : [];
      const scrapedData = {
        source: "classcard",
        units,
        totalStudyMinutes: units.reduce((a, u) => a + (Number(u.studyMinutes) || 0), 0),
      };
      await writeAutoLog({ childId, serviceSlug: "classcard-middle", date, autoStatus: s.autoStatus || "진행중", scrapedData });
      // 이름 매칭으로 찾았고 외부아이디 미저장이면 자동 저장
      if (loginId && !byClasscard.has(loginId)) {
        await db.collection("children").doc(childId).update({ classcardLoginId: loginId }).catch(() => undefined);
      }
      results.push({ loginId, name: s.name, matched: true, childId, matchedBy });
    }

    res.json({ ok: true, matched: results.filter((r) => r.matched).length, total: results.length, results });
  },
);
