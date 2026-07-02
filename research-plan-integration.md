# 리서치: 어드민 회원수정 — 아이디 반영 · 학습스케줄↔플랜관리 연동 · 용어 통일

대상 화면: 어드민 `회원 수정` 모달 = `FamilyEditModal`
(`src/components/admin/members-tab.tsx:1427`). 스샷의 오미영/최도윤 = 일반 가족(families).

## 현재 구조 (조사 결과)

### A. 로그인 아이디 편집 — `children`만 바뀌고 로그인 계정은 안 바뀜 (버그성)
- `FamilyEditModal.handleSave` (members-tab.tsx:1459)
  - `updateDoc(children/{id}, { name, grade, loginId })` — children.loginId 는 저장됨.
  - `setDoc(studentProfiles/{childId}, { schedule }, {merge})` — 스케줄 저장.
- **학생 로그인 모델** (functions/src/auth.ts, useChildData.ts):
  - 학생은 이메일 `{loginId}@plantor.app` 로 로그인 (`idToEmail`).
  - `users/{authUid}.plantor_id = loginId`.
  - `useChildData` 는 `plantor_id`(또는 이메일 prefix) → `children where loginId==plantor_id` 로 학생을 찾음.
- ⚠️ 문제: 아이디를 바꾸면 `children.loginId` 만 바뀌고 **Auth 이메일 · `users.plantor_id` 는 그대로**.
  - → 학생은 여전히 옛 아이디로 로그인하는데, `plantor_id`(옛값) ≠ `children.loginId`(새값) → **학생 페이지가 빈 화면**.
  - Auth 이메일 변경은 클라이언트 불가 → **Admin SDK 콜러블 필요**.
- 기존 콜러블 참고: `resetPassword`, `updateChildName`(authUid 우선, 없으면 loginId 이메일로 uid 조회), `createChildAccount`, `approveSignup`. **loginId(이메일) 변경 콜러블은 없음.** `checkIdAvailability`(중복검사, parent/child) 존재.
- firestore.rules: children/users/studentProfiles/tasks/directClasses 모두 `isAdmin` 이면 클라 쓰기 허용. (Auth 이메일만 콜러블 필요)

### B. "학습 스케줄" 빌더 — 고아 데이터 (`studentProfiles.schedule`)
- UI: `ScheduleEditor` (members-tab.tsx:1066). 항목 = `DaySchedule = { day, time, serviceSlug? }` (types.ts:181).
- 저장처: `studentProfiles/{childId}.schedule` (types.ts:158 `StudentProfile.schedule`).
- **이 스케줄을 읽는 곳**: `FamilyEditModal` 자기 자신뿐. 학생 페이지·플랜관리 탭 어디서도 안 읽음 → 사실상 고아 데이터.

### C. "플랜 관리" 탭 / 학생 페이지 — `tasks` 컬렉션 기반 (스케줄과 별개 세계)
- 플랜관리 탭 `PlanTab` (src/components/admin/plan-tab.tsx). admin-shell 이 `tasks` 를 onSnapshot:
  - draft 개수(`draftByChild`), 오늘 요일(`scheduleDays` 포함) 확정 태스크 + `taskChecks` 완료 여부(`todayByChild`).
- 학생 페이지:
  - `student-plan.tsx` (나의 학습계획: draft/confirmed 태스크, `AddTaskFormBatch` 로 추가)
  - `learn-dashboard.tsx` (오늘의 학습: 오늘 요일 `scheduleDays` 태스크만 필터).
- 데이터 모델 `Task` (types.ts:204): `childId, serviceSlug, partSlug, title, scheduleDays:number[](0=월~6=일), level, setName, progressLabel, status:"draft"|"confirmed", createdBy, ...`
  - ⚠️ **시각(time) 필드 없음.** 요일 배열만 있음.
- 태스크 생성: `add-task-form.tsx` `AddTaskFormBatch` (admin=confirmed 즉시, student=draft). 확정/반려: `student-learning-grid.tsx` `updateDoc(tasks/{id}, {status})`.
- 알림: `notifyAdminOnPlanDraft` (functions/src/notifications.ts) — 학생 draft 생성 시 운영자 메일.

## 핵심 격차 (= 사용자 3대 요구의 실체)
1. **아이디 반영/학생페이지**: children.loginId 만 바뀌고 Auth·plantor_id 미반영 → 학생페이지 깨짐. → loginId 변경 콜러블 신설 필요.
2. **학습스케줄↔플랜관리 연동**: `studentProfiles.schedule`(요일+시각+서비스) 와 `tasks`(요일배열, 시각없음) 가 **완전히 분리**. 모델이 1:1 대응 안 됨(스케줄엔 시각 있음/태스크엔 title·part·level 있음).
3. **용어 통일**: 라벨 "학습 스케줄" → "플랜 관리"(또는 "플랜") 로 변경.

## 미결정 (사용자 확인 필요) — 아래 질문으로 확인
- 연동의 의미(표시만 vs 태스크 생성/동기화 vs 편집기 통합).
- 스케줄의 "시각(time)" 을 플랜/학생페이지에서 쓸지.
- 용어 최종 문구.
