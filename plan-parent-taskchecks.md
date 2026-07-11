# plan: /parent 부모 대시보드를 taskChecks 기반 완료로 통일  — [완료]

## 완료 요약
- parent-dashboard.tsx 를 taskChecks 기반으로 재작성 (tsc·eslint 통과)
- 복합 인덱스 회피: taskChecks/learningLogs 모두 `childId==` 단일 조회 후 주간/오늘 클라 파생
- 실데이터 검증: 정윤오 3/3 완료, 목요일 주간셀 초록, streak 반영 확인
- 구독 수 최적화: taskChecks 2건→1건

## 목표
`/parent`(ParentDashboard)의 완료 집계를 관리자·`/account` 자녀탭과 동일한
`tasks(confirmed) + taskChecks`로 맞춘다. 인증샷은 있으면 자동 표시(기존 유지).

## 현재 (문제)
- 완료를 `learningLogs`로 셈 → 자동인증/스크래퍼 안 돌면 비어서 부모 화면만 0으로 보임
- 서비스 행 = `subscriptions` 기준, done = 오늘 learningLog 존재 여부
- 주간 달력 초록 = 그날 learningLog 존재
- streak = learningLogs(allLogs) 기준

## 변경 대상
`src/components/parent/parent-dashboard.tsx` **단일 파일**

## 작업
1. **데이터 구독 교체**
   - 추가: 자녀별 `tasks` (status=confirmed) 실시간 구독
   - 추가: 자녀별 `taskChecks` (이번 주: date ∈ weekDates) 실시간 구독
   - 유지: `learningLogs`(오늘) — **인증샷 표시 용도로만** 남김
   - streak용: `taskChecks` 전체(자녀별) 구독으로 교체 (기존 allLogs 구독 대체)
   → verify: 정윤오 childId로 오늘 done 2건이 상태에 들어오는지 콘솔 확인

2. **오늘 완료 집계 (헤더 `N/M 완료`)**
   - todayTotal = 오늘 요일에 스케줄된 confirmed task 수
   - todayDoneCount = 그중 오늘 taskCheck.status==="done" 인 것
   → verify: 정윤오 헤더가 2/3(월~금 과제 3개 중 2 done) 로 표기

3. **서비스 행 → 오늘 과제 행으로 교체**
   - subs.map → todayTasks.map (오늘 스케줄된 과제)
   - done = 오늘 done 체크 존재. 라벨: 과제명(progressLabel/part/title)
   - checkedBy==="admin" → "선생님 확인" 배지
   - 인증샷: 해당 task.serviceSlug 의 오늘 learningLog 에 screenshotUrl 있으면 썸네일(기존 확대/오버레이 로직 재사용)
   → verify: 오늘의학습·480단어 done(✓), 문법훈련 미완료로 표기

4. **주간 달력**
   - hasDone(그날 초록 ✓) = 그날 done taskCheck ≥ 1건 (learningLogs → taskChecks)
   → verify: 목요일 셀 초록

5. **streak**
   - calcStreak 입력을 done taskCheck 날짜 집합으로 교체
   → verify: 타입/렌더 정상

6. **빌드·타입 체크**
   - `tsc --noEmit` 통과
   → verify: 0 errors

## 범위 밖 (건드리지 않음)
- `/account` 자녀탭, learn-dashboard, 관리자 탭 (이미 taskChecks 기반)
- 인증샷 캡처/업로드 로직, 자동인증 스크래퍼
- 보안규칙(firestore/storage) — 별도 사안

## 리스크
- 자녀 여러 명일 때 `where in` 30개 제한 → 가족당 자녀 수 적어 무관
- learningLogs는 인증샷 전용으로만 남으므로 완료판정에서 제외됨(의도)
