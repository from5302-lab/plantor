import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as functions from "firebase-functions";
import { db } from "./config";
import { assertAdmin } from "./utils";
import { writeAutoLog } from "./auto-log";
import { scrapeAutovocaForStudent, autovocaDonePartSlugs } from "./scraper-autovoca";
import { scrapeClasscardForStudent, classcardDonePartSlugs, CLASSCARD_DEFAULT_CONFIG, type ClasscardConfig } from "./scraper-classcard";
import { scrapeDailykorForStudent, DAILYKOR_REPORT_PARTS } from "./scraper-dailykor";
import { reconcileAutoChecks } from "./completion-notify";

// 클릭 실시간 자동인증: 학생이 클래스카드/오토보카 "완료" 클릭 시
//   교사 계정으로 해당 학생의 오늘 진도를 스크래핑 → learningLogs(method:"auto") 기록.

const autovocaId = defineSecret("AUTOVOCA_ID");
const classcardId = defineSecret("CLASSCARD_ID");
// 오토보카·클래스카드 교사 계정 비밀번호가 동일 → 공유 시크릿 하나로 관리
const teacherPw = defineSecret("TEACHER_PW");
const autovocaHmacSecret = defineSecret("AUTOVOCA_HMAC_SECRET");

/** config/autoVerify.classcard (있으면) 로 기본 설정 override. */
export async function loadClasscardConfig(): Promise<ClasscardConfig> {
  try {
    const snap = await db.collection("config").doc("autoVerify").get();
    const cc = snap.data()?.classcard as Partial<ClasscardConfig> | undefined;
    if (cc?.loginUserIdx && cc?.bSIdx && Array.isArray(cc?.classes) && cc.classes.length) {
      return { loginUserIdx: cc.loginUserIdx, bSIdx: cc.bSIdx, classes: cc.classes };
    }
  } catch {
    /* 기본값 사용 */
  }
  return CLASSCARD_DEFAULT_CONFIG;
}

// 반복 클릭 시 재스크래핑 방지 (동일 학생·서비스·오늘 로그가 이 시간 내면 재사용)
const THROTTLE_MS = 2 * 60 * 1000;

function todayKst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 최근 method:"auto" 로그의 기록 시각(ms) — 스로틀 판정용. */
function logStampMs(data: FirebaseFirestore.DocumentData): number {
  const t = data.updatedAt ?? data.confirmedAt;
  return t && typeof t.toMillis === "function" ? t.toMillis() : 0;
}

export const verifyAutoProgress = onCall(
  { secrets: [autovocaId, classcardId, teacherPw, autovocaHmacSecret] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");

    const { serviceSlug, loginId: targetOverride, debug } = request.data as {
      serviceSlug?: string;
      loginId?: string; // 어드민 미리보기용
      debug?: boolean;
    };
    if (!serviceSlug) throw new HttpsError("invalid-argument", "serviceSlug가 필요합니다.");
    if (!["autovoca", "classcard-middle", "dailykor"].includes(serviceSlug)) {
      throw new HttpsError("invalid-argument", "지원하지 않는 서비스입니다.");
    }

    // ── 본인 학생 해석 ──────────────────────────────────────────────
    // 호출자 plantor_id (users.plantor_id 또는 @plantor.app 이메일)
    const userSnap = await db.collection("users").doc(request.auth.uid).get();
    let plantorId = ((userSnap.data()?.plantor_id as string | undefined) ?? "").toLowerCase();
    if (!plantorId) {
      const email = (request.auth.token.email as string | undefined) ?? "";
      if (email.endsWith("@plantor.app")) plantorId = email.replace("@plantor.app", "").toLowerCase();
    }

    // 어드민이 타인(미리보기) 지정 시에만 override 허용
    const target = (targetOverride ?? plantorId).toLowerCase().trim();
    if (target !== plantorId) await assertAdmin(request.auth);
    if (!target) throw new HttpsError("failed-precondition", "학생 계정을 확인할 수 없습니다.");

    const childSnap = await db.collection("children").where("loginId", "==", target).limit(1).get();
    if (childSnap.empty) throw new HttpsError("not-found", "학생 정보를 찾을 수 없습니다.");
    const childDoc = childSnap.docs[0];
    const child = childDoc.data();
    const childId = childDoc.id;

    const date = todayKst();

    // ── 스로틀: 최근 스크래핑 결과 재사용 ────────────────────────────
    const existingSnap = await db.collection("learningLogs")
      .where("childId", "==", childId)
      .where("serviceSlug", "==", serviceSlug)
      .where("date", "==", date)
      .where("method", "==", "auto")
      .limit(1)
      .get();
    if (!existingSnap.empty && !debug) {
      const data = existingSnap.docs[0].data();
      if (Date.now() - logStampMs(data) < THROTTLE_MS) {
        return { result: "cached", autoStatus: data.autoStatus, scrapedData: data.scrapedData ?? null };
      }
    }

    // ── 서비스별 스크래핑 ────────────────────────────────────────────
    try {
      if (serviceSlug === "autovoca") {
        // 외부 아이디가 없으면 학생 이름으로 교사 명단에서 폴백 매칭
        const externalLoginId = (child.autovocaLoginId as string | undefined)?.trim() ?? "";
        const res = await scrapeAutovocaForStudent(
          { loginId: autovocaId.value(), loginPw: teacherPw.value(), hmacSecret: autovocaHmacSecret.value() },
          externalLoginId,
          date,
          child.name as string | undefined,
        );
        // 이름 매칭으로 찾았고 저장된 아이디가 없으면 매핑 자동 저장
        if (res.matchedLoginId && !externalLoginId) {
          await childDoc.ref.update({ autovocaLoginId: res.matchedLoginId }).catch(() => undefined);
        }
        const scrapedData: Record<string, unknown> = {
          source: "autovoca",
          units: res.units,
          totalStudyMinutes: res.totalStudyMinutes,
        };
        const result = await writeAutoLog({ childId, serviceSlug, date, autoStatus: res.autoStatus, scrapedData });
        // 학생을 확정적으로 판정했을 때만 정합(완료 표시/미인증 자기체크 해제). 미발견이면 스킵.
        if (res.matchedLoginId) await reconcileAutoChecks(childId, serviceSlug, date, autovocaDonePartSlugs(res.units), res.autoStatus === "완료").catch((e) => functions.logger.warn("[reconcile] 실패", { error: String(e) }));
        // 필드명 확정용 원본: 어드민 debug 호출 때만 반환(로그엔 저장 안 함)
        const rawOut = debug ? res.rawToday : undefined;
        return { result, autoStatus: res.autoStatus, scrapedData, ...(rawOut ? { rawToday: rawOut } : {}) };
      }

      if (serviceSlug === "dailykor") {
        const res = await scrapeDailykorForStudent(
          { id: classcardId.value(), pw: teacherPw.value() },
          (child.name as string) || "",
          date,
        );
        const scrapedData: Record<string, unknown> = {
          source: "dailykor", units: res.units, totalStudyMinutes: res.totalStudyMinutes,
        };
        const result = await writeAutoLog({ childId, serviceSlug, date, autoStatus: res.autoStatus, scrapedData });
        // 학생 이름이 리포트에서 확정 매칭됐을 때만 정합. 미발견이면 스킵.
        if (res.matchedName) await reconcileAutoChecks(childId, serviceSlug, date, res.autoStatus === "완료" ? DAILYKOR_REPORT_PARTS : [], res.autoStatus === "완료").catch((e) => functions.logger.warn("[reconcile] 실패", { error: String(e) }));
        return { result, autoStatus: res.autoStatus, scrapedData };
      }

      // classcard-middle — 외부 아이디가 없으면 학생 이름으로 반 명단에서 폴백 매칭
      const externalLoginId = (child.classcardLoginId as string | undefined)?.trim() ?? "";
      const cfg = await loadClasscardConfig();
      const res = await scrapeClasscardForStudent(
        { loginId: classcardId.value(), loginPw: teacherPw.value() },
        cfg,
        externalLoginId,
        date,
        child.name as string | undefined,
      );
      if (res.matchedLoginId && !externalLoginId) {
        await childDoc.ref.update({ classcardLoginId: res.matchedLoginId }).catch(() => undefined);
      }
      const scrapedData: Record<string, unknown> = {
        source: "classcard",
        units: res.units,
        totalStudyMinutes: res.totalStudyMinutes,
      };
      const result = await writeAutoLog({ childId, serviceSlug, date, autoStatus: res.autoStatus, scrapedData });
      // 학생을 반 명단에서 확정 매칭했을 때만 정합. 미발견이면 스킵.
      if (res.matchedLoginId) await reconcileAutoChecks(childId, serviceSlug, date, classcardDonePartSlugs(res.units), res.autoStatus === "완료").catch((e) => functions.logger.warn("[reconcile] 실패", { error: String(e) }));
      const rawOut = debug ? res.rawToday : undefined;
      return { result, autoStatus: res.autoStatus, scrapedData, ...(rawOut ? { rawToday: rawOut } : {}) };
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      functions.logger.error("[verifyAutoProgress] 스크래핑 실패", { serviceSlug, target, error: String(e) });
      throw new HttpsError("internal", "진도 확인에 실패했어요. 잠시 후 다시 시도해 주세요.");
    }
  },
);
