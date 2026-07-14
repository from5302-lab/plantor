import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as functions from "firebase-functions";
import { FieldValue } from "firebase-admin/firestore";
import { db, solapiApiKey, solapiApiSecret, KAKAO_TEMPLATES, SERVICE_META } from "./config";
import { sendAlimtalk, sendSms } from "./sms";

// 과제 완료/미완료 카카오 알림
//   완료(실시간): taskChecks 변경 → 그 학생 오늘 과제 전부 done 이면 부모에게 1건
//   미완료(마감): 21시 자동인증 스크랩 직후(autoVerifyScheduled 체이닝) → 오늘 과제 미완료 학생에게 1건
//   완료 truth = 오늘 스케줄된 confirmed tasks + 그날 taskChecks.done (클릭/자동인증 공통)

const SECRETS = [solapiApiKey, solapiApiSecret];

// config/notifications 로 on/off + 테스트 모드 제어 (기본 OFF → 배포해도 실발송 안 됨)
type NotifyConfig = { enabled: boolean; testPhone: string };
async function loadNotifyConfig(): Promise<NotifyConfig> {
  const d = (await db.collection("config").doc("notifications").get()).data() ?? {};
  return { enabled: d.enabled === true, testPhone: String(d.testPhone ?? "").trim() };
}

function todayKst(): string {
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
}
// "YYYY-MM-DD" → 0=월 ~ 6=일 (정오 UTC 기준으로 TZ 경계 회피)
function dowMon0(dateKst: string): number {
  return (new Date(`${dateKst}T12:00:00Z`).getUTCDay() + 6) % 7;
}
function norm(s: unknown): string {
  return String(s ?? "").replace(/\s+/g, "");
}

// ── 연락처 해석 (직강/가족) ──────────────────────────────────────────────────
type Contacts = { name: string; parentPhone: string; studentPhone: string; model: "direct" | "family" };

async function resolveContacts(childId: string): Promise<Contacts | null> {
  const cs = await db.collection("children").doc(childId).get();
  if (!cs.exists) return null;
  const c = cs.data()!;
  const name = String(c.name ?? "");
  const loginId = String(c.loginId ?? "").toLowerCase();

  if (c.directClassId) {
    const dc = (await db.collection("directClasses").doc(String(c.directClassId)).get()).data() ?? {};
    const students = (dc.students ?? []) as Array<Record<string, unknown>>;
    const st = students.find((s) => String(s.studentLoginId ?? "").toLowerCase() === loginId)
      ?? students.find((s) => norm(s.name) === norm(name));
    return {
      name,
      parentPhone: String(st?.parentPhone ?? dc.parentPhone ?? ""),
      studentPhone: String(st?.studentPhone ?? ""),
      model: "direct",
    };
  }
  // 가족: 부모폰 = families.phone, 학생폰 = children.studentPhone(신규)
  let parentPhone = "";
  if (c.familyId) {
    parentPhone = String((await db.collection("families").doc(String(c.familyId)).get()).data()?.phone ?? "");
  }
  return { name, parentPhone, studentPhone: String(c.studentPhone ?? ""), model: "family" };
}

// ── 오늘 과제 / 완료 판정 ────────────────────────────────────────────────────
type TodayTask = { id: string; serviceSlug: string; title: string };

async function todayTasks(childId: string, dateKst: string): Promise<TodayTask[]> {
  const dow = dowMon0(dateKst);
  const snap = await db.collection("tasks")
    .where("childId", "==", childId).where("status", "==", "confirmed").get();
  return snap.docs
    .filter((d) => d.data().active !== false && Array.isArray(d.data().scheduleDays) && d.data().scheduleDays.includes(dow))
    .map((d) => ({ id: d.id, serviceSlug: String(d.data().serviceSlug ?? ""), title: String(d.data().title ?? "") }));
}

type CompletionResult = { total: number; allDone: boolean; remaining: TodayTask[]; doneServices: string[] };

async function evalCompletion(childId: string, dateKst: string): Promise<CompletionResult> {
  const tasks = await todayTasks(childId, dateKst);
  if (tasks.length === 0) return { total: 0, allDone: false, remaining: [], doneServices: [] };
  const checks = await db.collection("taskChecks")
    .where("childId", "==", childId).where("date", "==", dateKst).get();
  const doneIds = new Set(checks.docs.filter((d) => d.data().status === "done").map((d) => String(d.data().taskId)));
  const remaining = tasks.filter((t) => !doneIds.has(t.id));
  const doneServices = [...new Set(tasks.filter((t) => doneIds.has(t.id)).map((t) => t.serviceSlug))];
  return { total: tasks.length, allDone: remaining.length === 0, remaining, doneServices };
}

function serviceNames(slugs: string[]): string {
  return [...new Set(slugs.map((s) => SERVICE_META[s]?.name ?? s))].join(", ");
}

// ── 자동인증 → taskCheck 정합(reconcile) (verify-auto / batch 에서 호출) ──────────
/**
 * 서버 스크래핑 결과를 taskChecks의 유일한 권위로 반영한다. **스크래핑이 학생을 확정적으로
 * 판정했을 때만**(호출부의 definitive 가드) 호출해야 한다. 오늘 해당 서비스의 confirmed·스케줄
 * 과제 각각에 대해:
 *   - 완료로 판정된 과제 → done(agent) upsert.
 *   - 완료가 아닌 과제 → **미인증 자기체크(checkedBy:"student")인 done만 삭제**(자동 체크 해제).
 *     검증된 agent done·관리자 admin done·학생 미완료(not_done)는 절대 건드리지 않는다.
 *     (agent done을 보존해야 일부 클래스 스크랩 실패 시에도 검증된 완료가 오삭제되지 않음.)
 *
 * @param donePartSlugs 완료한 파트 슬러그 목록. 배열이면 partSlug 매칭으로 파트 단위 정밀 판정.
 *   null/undefined면 파트 구분 없이 serviceComplete 로 서비스 전체를 판정(기존 동작).
 * @param serviceComplete 서비스 전체 완료 여부(파트 없는 과제 및 파트-무관 판정에 사용).
 */
export async function reconcileAutoChecks(
  childId: string, serviceSlug: string, dateKst: string,
  donePartSlugs: string[] | null | undefined, serviceComplete: boolean,
): Promise<void> {
  const dow = dowMon0(dateKst);
  const snap = await db.collection("tasks")
    .where("childId", "==", childId).where("serviceSlug", "==", serviceSlug).where("status", "==", "confirmed").get();
  const scheduled = snap.docs.filter((d) => d.data().active !== false && Array.isArray(d.data().scheduleDays) && d.data().scheduleDays.includes(dow));
  const useFilter = Array.isArray(donePartSlugs);
  for (const t of scheduled) {
    const ps = t.data().partSlug;
    const partless = ps == null || ps === "";
    // 파트 목록이 있으면 파트 매칭(파트 없는 과제는 서비스 완료로), 없으면 서비스 완료로 판정
    const isDone = useFilter
      ? (partless ? serviceComplete : (donePartSlugs as string[]).includes(String(ps)))
      : serviceComplete;
    const existing = await db.collection("taskChecks").where("taskId", "==", t.id).where("date", "==", dateKst).limit(1).get();
    if (isDone) {
      if (existing.empty) {
        await db.collection("taskChecks").add({
          taskId: t.id, childId, date: dateKst, status: "done", detail: "자동인증",
          reason: null, reasonNote: null, checkedBy: "agent", checkedAt: FieldValue.serverTimestamp(),
        });
      } else if (existing.docs[0].data().status !== "done") {
        await existing.docs[0].ref.update({ status: "done", checkedBy: "agent", checkedAt: FieldValue.serverTimestamp(), reason: null, reasonNote: null });
      }
    } else if (!existing.empty) {
      const ex = existing.docs[0].data();
      // 미인증 자기체크만 자동 해제. 검증된 agent·관리자 admin·미완료(not_done)는 보존.
      if (ex.status === "done" && ex.checkedBy === "student") {
        await existing.docs[0].ref.delete();
      }
    }
  }

  // 만회(made_up): 오늘 학습이 확인된 파트에 대해, 제 날짜가 지난 미완료(not_done) 체크를
  // 만회 완료로 전환. 원래 날짜·6hdl 사유는 보존해 "제 날짜 완료(done)"와 구분한다.
  // (같은 파트를 하루 1회 학습으로 오늘 done + 과거 만회가 동시에 인정될 수 있음 — v1 허용, 성적표로 검증 가능)
  const notDoneSnap = await db.collection("taskChecks")
    .where("childId", "==", childId).where("status", "==", "not_done").get();
  if (!notDoneSnap.empty) {
    const taskById = new Map(snap.docs.map((d) => [d.id, d]));
    for (const c of notDoneSnap.docs) {
      const cd = c.data();
      if ((cd.date ?? "") >= dateKst) continue;           // 제 날짜가 지난 것만
      const t = taskById.get(cd.taskId ?? "");
      if (!t) continue;                                    // 같은 서비스의 확정 과제만
      const ps = t.data().partSlug;
      const partless = ps == null || ps === "";
      const madeUp = useFilter
        ? (partless ? serviceComplete : (donePartSlugs as string[]).includes(String(ps)))
        : serviceComplete;
      if (madeUp) {
        await c.ref.update({ status: "made_up", madeUpAt: FieldValue.serverTimestamp() });
      }
    }
  }
}

// ── 발송 유틸 (dedup + 알림톡/SMS) ───────────────────────────────────────────
/** notifications/{key} 를 트랜잭션으로 선점(중복 방지). true면 이번에 처음 선점. */
async function claim(key: string, data: Record<string, unknown>): Promise<boolean> {
  const ref = db.collection("notifications").doc(key);
  return db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) return false;
    tx.set(ref, { ...data, sentAt: FieldValue.serverTimestamp() });
    return true;
  });
}

async function sendKakaoOrSms(phone: string, templateId: string, vars: Record<string, string>, fallback: string): Promise<void> {
  const key = solapiApiKey.value(); const secret = solapiApiSecret.value();
  if (templateId) await sendAlimtalk(phone, templateId, vars, fallback, key, secret);
  else await sendSms(phone, fallback, key, secret);
}

// ── 완료 실시간 트리거 (부모 톡) ─────────────────────────────────────────────
export const onTaskCheckWritten = onDocumentWritten(
  { document: "taskChecks/{id}", secrets: SECRETS },
  async (event) => {
    const after = event.data?.after?.data();
    if (!after) return; // 삭제
    const childId = String(after.childId ?? ""); const date = String(after.date ?? "");
    if (!childId || !date || date !== todayKst()) return; // 오늘 것만
    if (after.status !== "done") return; // done 전환 때만 평가

    const cfg = await loadNotifyConfig();
    if (!cfg.enabled) return; // 스위치 OFF → 실발송 안 함

    const res = await evalCompletion(childId, date);
    if (res.total === 0 || !res.allDone) return;

    const contacts = await resolveContacts(childId);
    if (!contacts?.parentPhone) { functions.logger.warn("[notify] 부모 연락처 없음", { childId }); return; }
    const to = cfg.testPhone || contacts.parentPhone; // 테스트 모드면 사장님 폰으로
    const key = `${childId}_${date}_complete`;
    if (!(await claim(key, { type: "complete", childId, date, to }))) return; // 이미 발송(하루 1건)

    const subjects = serviceNames(res.doneServices);
    const fallback = `[플랜토] ${contacts.name} 학생이 오늘(${date}) 학습을 모두 완료했어요! 👏 (${subjects})`;
    try {
      await sendKakaoOrSms(to, KAKAO_TEMPLATES.TASK_COMPLETE_PARENT, { 학생명: contacts.name, 날짜: date, 과목: subjects }, fallback);
      functions.logger.info("[notify] 완료 톡 발송", { childId, to });
    } catch (e) {
      functions.logger.error("[notify] 완료 톡 실패", { childId, error: String(e) });
    }
  },
);

// ── 미완료 마감 (학생 톡) ─────────────────────────────────────────────
// 21시 자동인증 스크랩(autoVerifyScheduled)이 끝난 뒤 그 함수에서 직접 호출한다.
// → "스크랩(완료 마크 갱신) → 미완료 판정·알림"을 한 실행 안에서 순서 보장(경쟁/헛알림 방지).
export async function runIncompleteNotify(): Promise<void> {
  const cfg = await loadNotifyConfig();
  if (!cfg.enabled) { functions.logger.info("[notify] 미완료 배치 스킵 (OFF)"); return; }
  const date = todayKst();
  const dow = dowMon0(date);
  // 오늘 스케줄된 confirmed 과제가 있는 학생 집합
  const snap = await db.collection("tasks").where("status", "==", "confirmed").get();
  const childIds = new Set<string>();
  snap.docs.forEach((d) => {
    const data = d.data();
    if (data.active !== false && Array.isArray(data.scheduleDays) && data.scheduleDays.includes(dow)) childIds.add(String(data.childId));
  });

  let sent = 0; let skipNoPhone = 0;
  for (const childId of childIds) {
    try {
      const res = await evalCompletion(childId, date);
      if (res.total === 0 || res.allDone) continue; // 다 했으면 스킵
      const contacts = await resolveContacts(childId);
      const realTo = contacts?.studentPhone ?? "";
      if (!realTo) { skipNoPhone++; continue; } // 학생폰 없으면 스킵(가족 학생폰 미입력 등)
      const to = cfg.testPhone || realTo; // 테스트 모드면 사장님 폰으로
      const key = `${childId}_${date}_incomplete`;
      if (!(await claim(key, { type: "incomplete", childId, date, to }))) continue; // 하루 1건
      const remainStr = serviceNames(res.remaining.map((t) => t.serviceSlug));
      const fallback = `[플랜토] ${contacts!.name} 학생, 오늘(${date}) 아직 안 끝난 과제가 있어요: ${remainStr}. 오늘 안에 마무리해요! 💪`;
      await sendKakaoOrSms(to, KAKAO_TEMPLATES.TASK_INCOMPLETE_STUDENT, { 학생명: contacts!.name, 날짜: date, 남은과목: remainStr }, fallback);
      sent++;
    } catch (e) {
      functions.logger.error("[notify] 미완료 발송 실패", { childId, error: String(e) });
    }
  }
  functions.logger.info("[notify] 미완료 마감 배치 완료", { date, sent, skipNoPhone, candidates: childIds.size });
}
