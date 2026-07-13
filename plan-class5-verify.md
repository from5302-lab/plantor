# Plan: 클래스5 자동 학습 인증 + 지난 과제 현황 (어드민)

## 리서치 요약

### Class5 데이터 소스 (class5-homework-planner에서 확인)
- `../class5-homework-planner/lib/planner.mjs`의 `Class5Client`에 필요한 게 전부 있음:
  - **로그인**: `GET /login`에서 `sess_key` 파싱 → `POST /login/proc` (login_id/login_pwd), 쿠키 세션 유지
  - **일자별 전체 학생 과제**: `GET /movie/reportHomeworkDate/{YYYY-MM-DD}/0,1,2,3,4,5` → `hw_list` (JS 변수 파싱)
  - **재원생 명단**: `GET /academy/student` HTML 파싱 → `{studentId(std_user_idx), studentName}` (이름 앞 `[렉사일]` 접두어 제거)
- 과제 항목 핵심 필드: **`is_end`(0/1 완료)**, `progress`, `std_user_idx`, `book_title/title/subtitle`, `mv_view_cnt`, `last_ts`
- 카테고리 추론 로직(`inferCategory`) 존재 → **Phonics/Song/Movie/Reading/Writing** — plantor `class5` 서비스 파트(`site.ts:177`)와 1:1 일치
- 임의 과거 날짜 조회 가능 (reportHomeworkDate가 날짜 파라미터) → 과거 소급 조회도 기술적으로 가능

### plantor 현황
- 자동인증 파이프라인: `verify-auto.ts`(학생 클릭 실시간) + `auto-verify-batch.ts`(매일 9/13/17/21시 KST 배치) → `writeAutoLog`(learningLogs, method:"auto") + `reconcileAutoChecks`(taskChecks 정합)
- 지원 서비스: autovoca / classcard-middle / dailykor — **class5 없음**
- `class5` 서비스·파트·과제추가 UI·요금정산은 이미 존재. 인증만 빠짐
- 학생 매칭 관례: 교사 계정으로 전체 조회 → 학생 이름 매칭 → `children.{service}LoginId` 자동 저장(폴백)
- **지난 과제 현황**:
  - 학부모(`account/children-tab`): 주 이동(‹ ›) + 주간 learningLogs(`useFamilyData(familyId, weekOffset)`) + taskChecks 전체 구독 → **이미 지원됨**
  - 어드민(`members-tab`, `plan-tab`): `StudentLearningGrid`가 `weekOffset` prop을 받지만 **아무도 전달 안 함 → 이번 주 고정**
  - 그리드의 자동인증 결과 카드(`autoLogs`)는 `date == 오늘` 만 구독 → 과거 날짜 결과는 주를 이동해도 안 보임

---

## Part A. Class5 자동 학습 인증

### A-1. `functions/src/scraper-class5.ts` 신규 [완료]
- `Class5Client` 최소 이식 (~120줄): `login()` / `fetchDateHomework(date)` / `fetchAcademyRoster()` — planner.mjs에서 필요한 부분만
- `inferCategory` 간이 이식 (Phonics/Song/Movie/Reading/Writing 판정)
- 반환 타입은 기존 관례를 따름:
  ```ts
  type Class5Result = {
    autoStatus: "시작전" | "진행중" | "완료";   // done==total→완료, done>0→진행중
    units: Array<{ unitLabel; category; completed }>;  // 그날 배정 과제별
    totalStudyMinutes: 0;                       // Class5는 학습시간 미제공 → 0
    matchedStudentId?: string;                  // std_user_idx
  };
  ```
- `scrapeClass5ForStudent(creds, externalId, date, name)` — 실시간용 (이름 폴백 매칭)
- `scrapeClass5All(creds, date)` — 배치용 (로그인 1회, 전 학생 집계)
- `class5DonePartSlugs(units)` — 완료된 카테고리 → 파트 슬러그(`phonics`…) 배열
- **오늘 배정 과제가 0개인 학생**: autoStatus "시작전" + units [] (기존 관례와 동일하게 로그는 남김)

### A-2. 시크릿 등록 — 불필요 (확정) [완료]
- Class5 교사 계정 = 클래스카드 교사 계정과 동일 → 기존 `CLASSCARD_ID` + `TEACHER_PW` 재사용
- 새 시크릿 등록 없음. verify-auto/batch의 SECRETS 배열 변경 없음

### A-3. `verify-auto.ts` 분기 추가 [완료]
- 허용 serviceSlug에 `"class5"` 추가
- dailykor 분기와 동일 패턴: 스크래핑 → `writeAutoLog` → 확정 매칭 시에만 `reconcileAutoChecks`
- 매칭 성공 & `children.class5StudentId` 없으면 자동 저장 (classcard 패턴)

### A-4. `auto-verify-batch.ts`에 class5 배치 추가 [완료]
- `scrapeClass5All` 1회 → 학생별 writeAutoLog + reconcile (classcard 블록과 동일 구조)
- summary에 `class5: { ok, miss }` 추가

### A-5. 클라이언트 배선 [완료]
- `student-learning-grid.tsx`: `AUTO_VERIFIED_SLUGS_GRID`에 `"class5"`, `AUTO_SLUG_NAME`에 `class5: "클래스5"`
- `task-checklist.tsx`(학생 완료 클릭 → 실시간 인증): 동일 세트에 `"class5"` 추가
- `auto-result-card.tsx`: Class5 성적표 표 추가 — 열: 카테고리 | 유닛(교재/제목) | 완료 뱃지
- `types.ts`: 기존 `AutoUnit`에 필드가 부족하면 최소 확장 (category 등)

### A-6. 검증 [ ]
- `npm run build` + lint 통과
- functions 배포 후 어드민 debug 호출(`loginId` override)로 실학생 1명 스크래핑 확인
- 배치 1회 수동 트리거로 전 학생 summary 확인

---

## Part B. 지난 과제 현황 (어드민 — 학부모는 이미 지원됨)

### B-1. 어드민 그리드에 주 이동 컨트롤 [완료]
- `members-tab.tsx` 학생 상세(2곳)와 `plan-tab.tsx`에서 쓰는 `StudentLearningGrid`에 주 이동 추가
- 방식: 그리드 내부에 ‹ 이번주 › 컨트롤 내장 (`showWeekNav?: boolean` prop, 어드민에서만 켬)
  — account children-tab의 라벨 관례 재사용: "이번 주" / "지난 주" / "N주 전", 미래 주 이동 불가
- `taskChecks`는 이미 childId 전체 구독 후 렌더 필터 → 주 이동 시 과거 체크 자동 표시 (변경 없음)

### B-2. 자동인증 결과 카드의 과거 날짜 지원 [완료]
- 현재: `learningLogs`를 `date == 오늘`로 구독 → `Record<serviceSlug, log>`
- 변경: `childId ==` 단일 조회로 전체 구독 후 클라에서 날짜 필터 (taskChecks와 동일한 인덱스-회피 관례, 파일 내 주석 관례 유지)
  → `Record<date, Record<serviceSlug, log>>` 로 보관, 선택 주의 날짜별 결과 카드 표시
- 학부모 쪽은 `useFamilyData`가 이미 주간 로그를 가져오므로 **변경 없음** — class5 로그가 쌓이면 자동 표시

## Part C. 과제 미등록에도 부모 페이지 학습결과 표시 (승인됨)

자동인증 로그는 과제 등록과 무관하게 쌓이므로 부모 화면에서 그대로 노출. 백엔드 변경 없음.

### C-1. `useFamilyData` weeklyLogs 파싱 확장 [완료]
- 쿼리는 그대로, `serviceSlug/method/autoStatus/scrapedData` 필드 추가 (WeeklyLog 타입 확장)

### C-2. `/account` 자녀 탭 — 자동인증 학습결과 섹션 [완료]
- "주간 학습 현황" 아래 선택 주의 날짜별 AutoResultCard (어드민 그리드와 동일 필터·정렬). 과제 0개여도 표시

### C-3. `/parent` 대시보드 — 오늘 자동인증 결과 카드 [완료]
- 기존 learningLogs 구독에서 method:"auto" 로그도 보관 → 체크리스트 아래 AutoResultCard. 과제 0개여도 표시

### B-3. (선택 — 기본 범위 제외) Class5 과거 소급 백필
- Class5만 과거 날짜 조회가 가능하므로, 어드민에서 "지난 7일 소급 인증" 버튼으로 과거 learningLogs 백필 가능
- 우선 제외하고, 운영해보고 필요하면 추가

---

## 사용자 확인 사항 (답변 완료)

1. **Class5 교사 계정**: 클래스카드 교사 계정과 동일 → `CLASSCARD_ID`/`TEACHER_PW` 재사용
2. **학생 이름 일치**: Class5 명단 이름과 plantor `children.name` 일치 (동명이인 이슈 없음)
3. **Part B 범위**: 어드민 주 이동 + 과거 결과 카드까지. 통계 뷰·B-3 백필은 범위 제외

## 작업 순서

```
1. A-1 스크래퍼 → verify: 로컬 tsc 통과 (functions)
2. A-2~A-4 백엔드 배선 → verify: npm --prefix functions run build
3. A-5 클라이언트 → verify: npm run build (정적 export)
4. 배포 → verify: 어드민 debug 스크래핑 실학생 확인
5. B-1~B-2 → verify: npm run build + 라이브에서 주 이동 확인
```
