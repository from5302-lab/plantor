# 플랜: 어드민 회원수정 — 아이디 반영 · 스케줄→플랜 자동생성 · 용어 "플랜"

> 상태: 코드 구현 [완료] · 타입체크/빌드 [완료] · **프로덕션 배포 [완료]** (functions:updateChildLoginId + hosting, plantor.web.app)

결정사항(사용자 확인 완료):
- 연동 = **스케줄→플랜(tasks) 자동생성/동기화** (플랜관리 탭·학생페이지에 그대로 노출)
- 스케줄의 **시각(time)을 학생에게 노출** → `Task`에 `time` 필드 추가
- 용어: "학습 스케줄" → **"플랜"**

대상: 일반 가족 `FamilyEditModal` (members-tab.tsx). 직강 학생(DirectClassEditModal)은 이번 범위 밖(§4 참고).

---

## Part 1. 로그인 아이디 변경 → DB + 학생 로그인/페이지 반영

### 1-1. 신규 콜러블 `updateChildLoginId` — functions/src/auth.ts
`updateChildName`(auth.ts:658) 패턴을 그대로 따른다.
```
export const updateChildLoginId = onCall(async (request) => {
  await assertAdmin(request.auth);
  const { childId, newLoginId } = request.data;
  const next = (newLoginId ?? "").trim().toLowerCase();
  if (!childId || next.length < 4) throw invalid-argument;

  const childSnap = children/{childId}.get(); 없으면 not-found
  const oldLoginId = childSnap.loginId?.toLowerCase();
  if (next === oldLoginId) return { success: true };            // 변경 없음

  // 중복검사 (checkIdAvailability child 규칙 복제)
  const dup = children where loginId==next limit1;  비어있지 않으면 already-exists 에러
  (선택) users where plantor_id==next 도 확인

  // Auth uid 해석: authUid 우선, 없으면 getUserByEmail(idToEmail(old))
  const uid = authUid ?? getUserByEmail(idToEmail(old)).uid.catch(null)
  if (uid) {
    await auth.updateUser(uid, { email: idToEmail(next) });      // Auth 이메일 전환
    await users/{uid}.update({ plantor_id: next });              // plantor_id 전환
  }
  await children/{childId}.update({ loginId: next });            // children 반영
  return { success: true };
});
```
- index.ts 에 export 추가.
- 엣지: uid 미존재(계정 미프로비저닝) → children.loginId 만 갱신하고 경고 로그(멈추지 않음).

### 1-2. 클라이언트 — members-tab.tsx `FamilyEditModal.handleSave` (1459)
- 현재 `updateDoc(children/{id}, { name, grade, loginId })` 에서 **loginId 제거** → name/grade 만 클라 업데이트.
- loginId 가 원본과 다르면(`cf.loginId.trim().toLowerCase() !== 원본`) 콜러블 호출:
  `httpsCallable(functions,"updateChildLoginId")({ childId: cf.id, newLoginId: cf.loginId })`
  - 원본 loginId 비교값은 `children` prop(c.loginId)에서 취득.
- 실패 시 기존 `error` state 로 표시(중복 아이디 등). 성공 후 onClose.

검증(Part1): 어드민에서 아이디 변경→저장→(a) children.loginId 갱신, (b) users.plantor_id 갱신, (c) 새 아이디@plantor.app 로 로그인 가능, (d) 학생페이지 정상 노출. 중복 아이디 입력 시 에러.

---

## Part 2. 스케줄 → 플랜(tasks) 자동생성/동기화 + 시각 노출

### 2-1. 타입 — src/lib/types.ts `Task` (204)
- `time: string | null;` 필드 추가 (HH:MM, 없으면 null).

### 2-2. 생성/동기화 — members-tab.tsx `FamilyEditModal.handleSave`
자녀별로 `studentProfiles.schedule` 저장(현행 유지, 빌더 입력 원본)에 더해 tasks 동기화:
- 결정 태스크 집합 = `schedules[cf.id]` 중 **serviceSlug 있는 항목**마다 1건:
  - docId(결정적) = `sched_${cf.id}_${serviceSlug}_${day}`
  - 필드: `{ childId, serviceSlug, partSlug:null, title: 서비스명, scheduleDays:[day], time: entry.time||null, level:null, setName:null, progressLabel:null, externalUrl:null, deleteRequested:false, order:0, active:true, createdBy:"admin", status:"confirmed", adminComment:null, source:"schedule", createdAt: serverTimestamp(), confirmedAt: serverTimestamp() }`
  - 서비스명 = `SERVICES.find(slug)?.name ?? (slug==="online-class" ? "온라인 수업" : slug)`
- upsert: 결정 태스크들 `setDoc(merge:false)` (결정적 ID라 미변경 항목은 동일 ID 유지 → taskChecks 이력 보존).
- stale 삭제: `tasks where childId==cf.id AND source=="schedule"` 조회 → 결정 ID 목록에 없는 문서 삭제.
- (다중 equality 쿼리는 기본 인덱스로 동작, 별도 composite index 불필요.)

동작 결과: 확정(confirmed) 태스크이므로
- 학생 `오늘의 학습`(learn-dashboard, 오늘 요일 필터) · `학습계획`(student-plan) 에 즉시 노출.
- 어드민 `플랜 관리` 탭(admin-shell tasks 집계 → PlanTab) 에 반영.
- `notifyAdminOnPlanDraft` 는 draft+student 만 트리거하므로 메일 안 감(정상).

### 2-3. 시각(time) 표시 — Task 매핑 & 렌더
Task 를 Firestore 에서 구성하는 지점에 `time: d.data().time ?? null` 추가:
- learn-dashboard.tsx(104-121), student-plan.tsx(38-49), student-learning-grid.tsx(태스크 매핑)
렌더에 시각 뱃지 추가(있을 때만):
- `TaskChecklist`(learn/task-checklist.tsx) — 오늘의 학습 항목에 `HH:MM`
- `Editablen`(shared/add-task-form.tsx) — 학습계획 + 플랜관리 grid 공용 항목에 `HH:MM`

### 2-4. 삭제 정합성
- FamilyEditModal 의 "자녀 삭제"(1562) 배치에 `source==schedule` 태스크도 함께 삭제하도록 추가(현재 subscriptions+children+studentProfiles 만 삭제 → tasks 잔존 방지).

검증(Part2): 스케줄에 (월 클래스5 17:00) 입력·저장 → tasks 에 sched_ 문서 생성 → 학생 오늘의학습/학습계획에 "클래스5 17:00" 노출 → 플랜관리 탭 카운트 반영 → 스케줄 항목 삭제 후 저장 시 해당 태스크 사라짐.

---

## Part 3. 용어 통일 "학습 스케줄" → "플랜"
- members-tab.tsx `FamilyEditModal` 라벨 `학습 스케줄`(1601) → `플랜`.
- 동일 스케줄 빌더 라벨이 DirectClassEditModal 등에 있으면 함께 변경(grep 후 일괄) — 이 스케줄 개념 한정.

---

## 검증 총괄
1. 타입/빌드: `npm run build` (functions 는 `npm --prefix functions run build`) 에러 0.
2. Functions 배포 필요: `updateChildLoginId` (사용자에게 배포 시점 안내 — 로컬 코드만으로는 콜러블 미존재).
3. 수동 시나리오: Part1/Part2/Part3 각 검증 항목.

## 미결정 / 확인 필요
- **직강 학생 아이디 변경(§4)**: DirectClassEditModal 은 `directClasses.students[].studentLoginId` 만 갱신하고 Auth 미반영 — 동일 문제. 이번엔 범위 밖. 필요하면 별도 진행.
- `source` 필드 신설 대신 기존 필드 재사용 원하면 알려주세요(기본안: `source:"schedule"` 신설).
- 학생/부모가 스케줄 생성 태스크를 임의 삭제 시 재저장 때 복원됨(스케줄이 원본). 의도한 동작인지 확인.
