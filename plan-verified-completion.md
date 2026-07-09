# plan.md — "완료"는 자기체크가 아니라 **서버 인증**으로만 (자동 체크 해제)

> 상태: **기획 검토 중 — 승인 전 코딩 금지**
> 작성: 2026-07-09
> 관련: [[plan-auto-verify-realtime]], [[plan-completion-notify]] (§6 "완료 인증 엄격도"의 답)

## 0. 사용자가 원하는 것 (원문)
> "학생이 체크를 해도 완료인증이 안되면 자동으로 체크 해제 되길 바래. 완료인증은 우리 인증방식으로 각 사이트 서버에서 인증을 받아오고 그 정보를 확인해야 **완료 표시도 남고 문자도 발송**하는 거야."

즉, **자동인증 가능한 과목**은:
- 학생이 "완료"를 눌러도 → 그건 **인증 요청 트리거**일 뿐.
- 우리 스크래퍼가 각 사이트 서버에서 실제 진도를 확인해서 **"완료"일 때만** 체크가 남고 문자 발송.
- 인증이 "완료"가 아니면(진행중/시작전) → **체크 자동 해제**.

## 1. 현재 동작 (문제)
- `taskChecks.done` 하나가 완료 truth (부모 대시보드·완료문자·학생화면 공통).
- 이 done을 쓰는 경로가 **두 개**:
  1. **학생 클릭** → `checkedBy:"student"` 로 **즉시** 기록 (`task-checklist.tsx handleMarkDone`). ← **인증 없이 신뢰됨 = 버그**
  2. **자동인증 브리지** → 스크래퍼가 `autoStatus:"완료"`일 때 `bridgeAutoCompletion`이 `checkedBy:"agent"` done 기록.
- 클릭 시 자동인증(`verifyAutoProgress`)이 돌긴 하지만, **1번(student done)이 이미 기록돼 버려서** 인증 결과와 무관하게 완료로 남음.
- 완료 뒤 **되돌리기 UI도 없음** → 실수 클릭이 고정됨.

## 2. 목표 / 성공 기준
1. 자동인증 과목: 학생 클릭만으로는 **절대 done이 안 남는다**. 서버 스크래핑이 "완료"를 확인해야만 done.
2. 스크래핑이 "완료 아님"으로 확인되면, 기존에 잘못 남은 done을 **자동 해제**한다(단, 관리자 수동 done 제외).
3. 완료 문자는 **인증된 done**에서만 발송된다(이미 taskChecks 기준이라 2가 지켜지면 자동 충족).
4. 스크래핑 **에러(일시 장애)** 때는 기존 완료를 함부로 해제하지 않는다.

## 3. 설계

### 3.1 적용 범위 — 자동인증 과목만
`AUTO_VERIFIED_SLUGS = { autovoca, classcard-middle, dailykor }` 만 이 규칙 적용.
그 외(스크래퍼가 없는 과목)는 **검증할 사이트가 없으므로** 기존 자기체크/인증샷 유지.
→ **열린 질문 Q1**: 이 범위로 맞는지(비인증 과목은 자기체크 유지) 확인 필요.

### 3.2 클릭 = 인증 요청일 뿐 (프론트: `task-checklist.tsx`)
`handleMarkDone(task)` 변경:
- `AUTO_VERIFIED_SLUGS.has(task.serviceSlug)` 이면:
  1. **`taskChecks.done`를 쓰지 않는다.** (기존 즉시 write 제거)
  2. 체크 원을 **"인증 중" 스피너** 상태로 (낙관적 done 아님).
  3. `verifyAutoProgress({ serviceSlug })` 호출.
  4. 응답 처리:
     - `autoStatus === "완료"` → 서버 브리지가 이미 `agent` done 기록 → **스냅샷으로 체크가 자동으로 채워짐**. 성공 표시.
     - `autoStatus !== "완료"`(진행중/시작전) → done 안 생김. **"아직 완료로 확인되지 않았어요 (○○ 진행중)"** 안내. 체크 원은 빈 상태로 복귀.
     - 에러 → **"인증 실패, 잠시 후 다시"** 안내. done 안 생김.
- 비인증 과목이면 기존대로 `student` done 기록(변경 없음).

> UI는 이미 `taskChecks` 스냅샷 구독 기반이라, done 생성/삭제가 화면에 자동 반영됨.

### 3.3 서버가 완료의 유일한 권위 — reconcile (핵심)
현재 `bridgeAutoCompletion(childId, serviceSlug, date, donePartSlugs)`은 **완료 파트만 done 기록**한다.
여기에 **미완료 파트 자동 해제**를 추가해 `reconcileAutoChecks`로 확장:

`verifyAutoProgress` / `auto-verify-batch` 에서 스크래핑 **성공** 후:
- 오늘 그 서비스의 confirmed·스케줄된 과제 각각에 대해:
  - `partSlug`가 완료 파트(`donePartSlugs`)에 속하거나 `autoStatus:"완료"`&파트없음 → **done 보장**(agent).
  - 그 외(오늘 스케줄됐지만 미완료) → **기존 done 해제**:
    - `checkedBy`가 `"agent"` 또는 `"student"`인 done만 삭제(체크 원 비움).
    - `checkedBy:"admin"`(관리자 수동)·`status:"not_done"`(학생이 사유 제출) 은 **건드리지 않음**.
- **스크래핑 에러 시엔 reconcile 자체를 실행하지 않음** → 완료 오삭제 방지.
  - `verifyAutoProgress`: 에러는 이미 throw → 도달 안 함. ✅
  - `auto-verify-batch`: 서비스별 try/catch 안이라, catch로 빠지면 그 서비스 reconcile 스킵. ✅

호출부 수정:
- `verify-auto.ts`: 3곳(autovoca/dailykor/classcard) 모두 `if (autoStatus==="완료") bridge...` → **성공 시 항상 `reconcileAutoChecks(...)` 호출**(완료/미완료 판정은 함수 내부에서).
- `auto-verify-batch.ts`: 각 학생 루프에서 동일하게 교체.

### 3.4 스로틀 상호작용
`verifyAutoProgress`는 2분 내 재클릭 시 `"cached"`로 재스크래핑 없이 반환. 이때도 직전 스크랩의 done/해제 상태가 이미 반영돼 있어 문제 없음. (cached 응답에도 `autoStatus` 포함 → 프론트가 안내 문구 판단 가능)

### 3.5 기존 잘못된 student-done 정리
현재 남아있는 `checkedBy:"student"` + 자동인증 과목 done 들은 새 배치(하루 4회) 첫 실행 때 reconcile로 **자동 정리**됨(미완료면 해제, 완료면 agent로 유지). 별도 마이그레이션 불필요.

## 4. 변경 파일 (승인 후)
- `functions/src/completion-notify.ts` — `bridgeAutoCompletion` → `reconcileAutoChecks`로 확장(미완료 해제 + admin/not_done 보호). 시그니처: `(childId, serviceSlug, date, donePartSlugs, autoStatus)`.
- `functions/src/verify-auto.ts` — 3개 서비스 분기에서 성공 시 항상 reconcile 호출.
- `functions/src/auto-verify-batch.ts` — 학생 루프 3곳 동일 교체.
- `src/components/learn/task-checklist.tsx` — `handleMarkDone`: 자동인증 과목은 done write 제거 + 인증중/실패 UI. (완료된 항목엔 별도 되돌리기 버튼 불필요 — 인증이 authority)
- (표시) 인증 실패/미완료 안내 문구 — `AutoResultCard` 재활용 또는 소형 인라인 메시지.

## 5. 열린 질문 (승인 시 함께 결정)
- **Q1 범위**: 비인증 과목(스크래퍼 없음)은 기존 자기체크 유지 — 맞나요? (권장: 유지)
- **Q2 해제 방식**: 미완료 done을 **삭제**(체크 원 빈 상태로) vs `not_done`으로 변경. (권장: **삭제** — 학생이 다시 인증 시도 가능, 사유 미입력 상태로 자연스러움)
- **Q3 에러 시**: 스크래핑 실패 때 기존 완료 **유지**(해제 안 함) — 맞나요? (권장: 유지)
- **Q4 관리자 수동 done**: 인증과 무관하게 **보존** — 맞나요? (권장: 보존)

## 6. 리스크
- **[중] 클래스카드 지연/차단**: 클릭마다 스크래핑 → 스로틀(2분)·세션캐시로 완화(기존 설계). reconcile은 추가 쿼리뿐이라 부담 작음.
- **[중] 완료 후 배치 재실행 시 오해제**: 학생이 오전에 완료(정상 done) 했는데 오후 배치가 그날 데이터를 못 읽어 "미완료"로 보면 잘못 해제될 수 있음 → **에러/빈응답과 "확정적 미완료"를 구분**해야 함. 스크래퍼가 학생 행 자체를 못 찾은 경우(계정 미매칭 등)는 "미완료"가 아니라 "판정 불가"로 취급해 **해제 스킵**하도록 방어 필요. → 구현 시 `reconcileAutoChecks`에 "학생 데이터 존재 여부" 신호를 넘겨 판정 불가면 스킵.
- **[낮음] 완료 문자 타이밍**: done이 인증 시점에 생기므로 문자도 그때 발송 → 의도대로.

## 7. 승인 요청
위 3.1~3.5 설계 + Q1~Q4 권장안대로 진행할까요? 수정할 부분 있으면 이 문서에 메모 주세요.

---

## 8. 구현 완료 (2026-07-09) — 승인 후 반영

### 안전성 보강 (구현 중 확정)
클래스카드 roster는 **클래스별 스크랩이 하나라도 실패하면 부분적**(collectRoster의 per-class try/catch)이라, `agent`(검증됨) done까지 해제하면 **검증된 완료가 일시 장애로 오삭제**될 수 있음을 확인.
→ **자동 해제 대상을 `checkedBy:"student"`(미인증 자기체크)로만 한정**. `agent`(검증됨)·`admin`(수동)·`not_done`(사유 제출)은 절대 건드리지 않음. 새 플로우에선 클릭이 student done을 아예 안 만들므로, 이 해제는 **레거시 자기체크 정리**용. (Q2=삭제, Q3=에러 시 유지, Q4=admin 보존 — 모두 반영)

### 판정 불가 가드 (오삭제 방지)
- 클릭 경로(`verify-auto`): 스크래퍼가 학생을 **확정 매칭했을 때만** 정합 호출 — 오토보카 `matchedLoginId`, 매일국어 `matchedName`, 클래스카드 `matchedLoginId`. 미발견/에러(throw)면 정합 스킵 → 기존 체크 보존.
- 배치(`auto-verify-batch`): 리포트에 나온 학생만 루프 → 확정 판정. 각 서비스 try/catch 안이라 스크랩 실패 서비스는 정합 스킵.

### 변경 파일 [완료]
- [완료] `functions/src/completion-notify.ts` — `bridgeAutoCompletion` → `reconcileAutoChecks(childId, serviceSlug, date, donePartSlugs, serviceComplete)`. 완료 파트 done(agent) + 미완료 과제의 미인증 자기체크 삭제.
- [완료] `functions/src/verify-auto.ts` — 3개 서비스 분기: 성공+확정매칭 시 `reconcileAutoChecks` 호출.
- [완료] `functions/src/auto-verify-batch.ts` — 학생 루프 3곳 동일 교체.
- [완료] `src/components/learn/task-checklist.tsx` — 자동인증 과목 클릭은 done write 없이 `runAutoVerify`만. "인증 중…" 상태 + "아직 완료로 확인되지 않았어요(진행중/시작전)" 안내.

### 배포 필요
- 함수: `verifyAutoProgress`, `autoVerifyScheduled`, `onTaskCheckWritten`, `notifyIncompleteScheduled`, `runAutoVerifyNow` (reconcile 로직 공유) + 호스팅.
