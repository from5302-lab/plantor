# Plan: Class5 루틴 → plantor 학생플랜 단방향 동기화

사용자 확정 사항: **단방향(class5→plantor) · 덮어쓰기 · 바로 confirmed · count는 트리거 분석 결과에 따름**

## 리서치 요약

### 루틴 데이터 (class5-homework-planner, Firebase 프로젝트 `class5-planner`)
- 저장 위치: Firestore `accounts/{loginId}` 문서의 `routines` 필드
  - 형태: `{ [std_user_idx]: { "월": [{category:"Movie", count:1}, …], … } }`
  - 카테고리: Phonics/Song/Movie/Reading/Writing
- 저장 경로는 단 하나: `POST /api/routines` (`functions/index.mjs:155`) — UI에서 루틴 저장 시 호출.
  Class5 로그인 검증 후 저장. **여기에 동기화를 후킹하면 저장 즉시 반영 가능**
- 로컬 서버(`server.mjs`)는 `local-routines.json` 사용 — 라이브와 무관, 동기화 제외

### plantor 학생플랜 (Firebase 프로젝트 `plantor-from302`)
- `tasks` 컬렉션 1건 = 과제 1개: `childId · serviceSlug · partSlug · title · scheduleDays(월=0…일=6) · status(draft/confirmed) · createdBy · active · order · …` (`add-task-form.tsx:325` 참고)
- 학생 화면(`student-plan.tsx`)은 `onSnapshot` 실시간 구독 → **Firestore에 써지면 즉시 화면 반영**
- class5 파트 슬러그(`src/data/site.ts:177`): phonics/song/movie/reading/writing — 루틴 카테고리 `.toLowerCase()`와 1:1
- 학생 매핑: `children.class5StudentId` = 루틴 키(std_user_idx). 자동인증 파이프라인이 이미 채우는 중
  (`verify-auto.ts:159`, `auto-verify-batch.ts:112`)

### 완료 트리거 분석 (count 결정 근거)
- `reconcileAutoChecks`(`completion-notify.ts:105`): 그날(`scheduleDays` 요일 매칭) confirmed 과제들을
  **partSlug 단위**로 `donePartSlugs` 포함 여부만 판정
- `class5DonePartSlugs`(`scraper-class5.ts:27`): 완료 유닛의 카테고리 집합 — **1유닛만 완료해도 그 파트 done**
- 결론:
  1. 같은 날 같은 파트 과제 2건 → 항상 동시에 체크됨 (개별 판정 불가)
  2. Movie 2개 중 1개만 해도 movie 파트 done → 과제 2건 다 체크됨
- → **count는 과제 분리가 아니라 제목 표기(`Movie ×2`)로.** 정밀 판정(2개 다 해야 done)이 필요하면
  Part B 옵션(파트 완료 = 그날 그 파트 유닛 전부 완료) 별도 결정

---

## Part A. class5-homework-planner 쪽 (동기화 발신)

### A-1. `functions/plantor-sync.mjs` 신규 [완료]
- Admin SDK 두 번째 앱: `initializeApp({ projectId: "plantor-from302" }, "plantor")` → `getFirestore(plantorApp)`
- `syncRoutinesToPlantor(routines)`:
  1. 루틴에 슬롯이 있는 studentId마다 plantor `children.where("class5StudentId","==",id)` 조회
     - 매칭 없으면 skip (결과에 `skipped` 로 집계 — 조용히 버리지 않음)
  2. 원하는 과제 목록 생성 — **(category, count) 그룹당 과제 1건**:
     - 예: Movie×1 월수금 + Movie×2 화목 → `Movie`(scheduleDays [0,2,4]) + `Movie ×2`(scheduleDays [1,3]) 2건
     - 요일 매핑: 월=0 … 일=6 (plantor `dowMon0` 관례)
     - 필드: `serviceSlug:"class5"`, `partSlug: category.toLowerCase()`, `title: 카테고리명 (+" ×N")`,
       `status:"confirmed"`, `createdBy:"admin"`, `active:true`, `source:"class5-routine"`,
       `order: 순번`, `createdAt/confirmedAt: serverTimestamp`, 나머지 null (add-task-form 스키마 준수)
  3. **덮어쓰기(사용자 확정)**: 해당 childId의 `serviceSlug=="class5"` 과제 중 원하는 목록과
     일치하는 건 유지(같은 과제 ID 보존 → 기존 taskChecks 이력 유지), 나머지 삭제 후 부족분 생성 (batch)
     - 수동으로 추가한 class5 과제도 삭제됨 — 루틴이 class5 과제의 단일 소스가 됨
     - 루틴에 **없는** 학생의 plantor 과제는 건드리지 않음
     - (구현 노트) 전부 삭제→재생성 대신 diff 방식으로 구현: 자동저장(500ms 디바운스)이 잦아도
       변경 없는 학생에겐 쓰기 0, 유지되는 과제의 체크 이력이 끊기지 않음
- 반환: `{ synced: [{studentId, childId, taskCount}], skipped: [studentId] }`

### A-2. `POST /api/routines` 후킹 (`functions/index.mjs`) [완료]
- 저장 성공 직후 `syncRoutinesToPlantor(routines)` 호출, 응답에 결과 포함:
  `{ ok:true, plantorSync: { synced: n, skipped: [...] } }`
- 가드: `accountId === SYNC_LOGIN_ID`(우리 학원 계정 상수)일 때만 동기화 — 타 계정 저장은 동기화 안 함
- 동기화 실패해도 루틴 저장 자체는 성공 응답 (에러는 결과에 표기)
- `server.mjs`(로컬)는 변경 없음

### A-3. 크로스 프로젝트 IAM [완료] — `116162077779-compute@developer.gserviceaccount.com` 에 `roles/datastore.user` 부여됨
- class5-planner 함수 SA에 plantor Firestore 쓰기 권한 부여:
  ```bash
  # 함수 SA 확인 후 (gen2 기본 = {projectNumber}-compute@developer.gserviceaccount.com)
  gcloud projects add-iam-policy-binding plantor-from302 \
    --member="serviceAccount:<class5-planner 함수 SA>" \
    --role="roles/datastore.user"
  ```
- 시크릿 추가 없음 (ADC + IAM만)

### A-4. 배포 + 초기 반영 [완료]
- `firebase deploy --only functions` (class5-planner) — 2026-07-15 배포됨
- 초기 백필: 로컬 ADC로 sync 1회 직접 실행 — 루틴 16명 중 10명 매칭·과제 20건 생성,
  6명 skipped(`children.class5StudentId` 미매칭: 99965, 158389, 158392, 158394, 158507, 163253)
  → 이후 자동인증이 매칭을 채우면 다음 루틴 저장 때 자동 편입

## Part B. plantor 쪽

### B-1. 코드 변경 없음 (기본)
- 동기화된 과제는 기존 자동인증·reconcile·학생/어드민/학부모 화면에 그대로 올라탐
- 학생이 synced 과제를 삭제할 수는 있음 → 다음 루틴 저장 때 복원됨 (v1 허용)

### B-2. (옵션 — 별도 결정) 파트 완료 판정 강화
- `class5DonePartSlugs`를 "그날 그 파트 유닛 **전부** 완료 시에만 done"으로 변경
- 효과: `Movie ×2` 과제가 2개 다 완료해야 체크됨
- 주의: 기존 class5 수동 과제의 자동체크 기준도 같이 엄격해짐 (현재: 1개만 해도 체크)

---

## 검증

```
1. A-1~A-2 → verify: cd class5-homework-planner && node --check functions/*.mjs
2. A-3 IAM → verify: gcloud 바인딩 조회
3. A-4 배포 후 플래너 UI에서 루틴 저장 → verify:
   - 응답의 plantorSync 결과 확인 (synced/skipped)
   - plantor 어드민/학생 /plan 에서 과제 목록 = 루틴과 일치 확인
4. 루틴 수정 후 재저장 → verify: plantor 화면에 수정 내용 즉시 반영 (덮어쓰기 동작)
5. 다음 자동인증 배치(9/13/17/21시) 후 → verify: synced 과제에 taskChecks 생성 확인
```
