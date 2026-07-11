# plan.md — 클래스카드 문법·듣기 무인 스케줄 자동인증 (점수 무관, 했나/안했나)

> 상태: **기획 검토 중** — 사용자 승인 전 코딩 금지
> 작성: 2026-07-07

## 0. 한 줄 요약
학생 클릭도 운영자 북마클릿도 없이, **하루 4번 도는 스케줄 배치**([auto-verify-batch.ts](functions/src/auto-verify-batch.ts))에 클래스카드 **문법·듣기**를 끼워넣어, **점수와 무관하게 "오늘 했나/안했나"만** 자동 기록한다.

## 1. 현황
- ✅ 스크래퍼 이미 문법·듣기 파싱함 ([scraper-classcard.ts](functions/src/scraper-classcard.ts) `scrapeGClass`).
  - 문법: `item-status`에 `done` 클래스 → `completed` (이미 점수 무관, 했나/안했나)
  - 듣기: `report-table` 오늘 행 → **현재 `completed: testScore >= 80`** (점수 조건 걸림)
- ✅ 스케줄 배치 존재: `runBatch()`가 오토보카·매일국어를 09/13/17/21시 KST 무인 실행.
- ❌ 배치에 **클래스카드가 빠져 있음** — 사유 주석: "클래스카드는 클라우드 차단이라 제외".
- ⚠️ 단 `verifyAutoProgress`(배포됨)는 **클라우드 함수에서 클래스카드를 직접 스크래핑** 중 → "차단" 주장과 모순.

## 2. 선결 관문 (Step 0) — 검증 완료 (2026-07-07, 07-06 클라우드 로그 분석)

**결과: 클라우드 IP 하드 차단은 아님. 그러나 스크래퍼가 데이터를 한 번도 못 뽑았음.**

근거 (07-06T13:15 클라우드 실행 로그):
- 🟢 교사 로그인 성공 — 응답 `dataLayer`에 `user_id:5101739, user_grade:Max, billing_admin:true`.
- 🟢 문법/듣기 GClass 리포트 페이지 정상 로드 — 300KB HTML 수신. **네트워크 차단 아님.**
- 🔴 어휘/본문 API 소프트 차단 — `{"result":"fail","msg":"비정상적인 접근입니다."}` (범위 밖, 단 경고 신호).
- 🔴 문법/듣기 파싱 실패 — 파서가 찾는 `.sort-student-item`·`table.report-table`이 HTML에 **없음**(`hasReportTable:false`).
  → 클래스카드는 **SPA**. 리포트가 서버 HTML에 없고 **별도 XHR API로 로드**됨. 현재 "서버 HTML 파싱" 접근으론 못 뽑음.
- 🔴 클래스카드 스크래핑 클라우드 실행 이력 = **총 2회(07-06), 둘 다 roster 완전 비어 나옴**. 한 번도 성공한 적 없음.
- `scraper-classcard.ts`·`verify-auto.ts` = **미커밋 미완성 작업물**.

**→ 진짜 벽은 "클라우드 차단"이 아니라 "스크래퍼 미완성(문법/듣기 데이터 추출 불가)".**

## 2b. 진짜 원인 재확정 (2026-07-07, 로컬 실측)
로컬(집/사무실 IP)에서 원본 파이썬과 동일 방식으로 직접 실행 → **클라우드와 결과 동일**:
- 어휘/본문 API(`getClassUserSetReport_v2`): 로컬에서도 `비정상적인 접근입니다`.
- 문법/듣기 GClass HTML: 로컬에서도 `sort-student-item=0`, `report-table-rows=0`.

**→ IP 차단이 아니라, 클래스카드가 리포트를 SPA(JS 렌더)로 바꿔서 현재 스크래퍼의 HTML 선택자가 어느 IP에서도 안 맞음.** 이 스크래퍼는 사실상 한 번도 작동한 적 없음. (코드베이스 주석 "클라우드 차단"은 오진.)

## 2c. 해결 경로 발견 + 실측 성공 ✅ (핵심)
GClass 리포트 페이지의 "엑셀 저장" 기능이 쓰는 엔드포인트를 찾아 **로컬에서 실제 호출 성공**:
```
POST https://www.classcard.net/GClass/getReportToExcel
  form: g_class_idx, b_s_idx=19167, from_date, to_date, is_include_teacher=1
  → 200, content-type: application/vnd.ms-excel, 7.6KB 정상 .xls (OLE2)
```
- **전교생 문법/듣기 리포트를 엑셀 파일로 통째 반환** → SPA 렌더 우회, HTML 파싱 불필요.
- 로그인만 되면 되는 평범한 인증 POST → "비정상적인 접근" 차단 안 걸림.
- ⚠️ 남은 미확인 2가지(구현 시 확인): ① 엑셀 셀 컬럼 구조(학생 식별자·유닛·완료여부 위치) — 로컬 xls 파서 부재로 셀 미확인, 다운로드·형식만 확인됨. ② **클라우드에서도 동일하게 되는지**(로컬만 확인). 단 일반 인증 POST라 통과 가능성 높음.

## 2d. 두 엑셀 엔드포인트 실측 확정 (2026-07-07) ✅
로그인 1회로 두 경로 모두 로컬 실측 성공. **둘 다 "비정상적인 접근" 차단 안 걸림.**

**(A) 문법 — `POST /GClass/getReportToExcel`** (.xls / OLE2)
```
form: g_class_idx, b_s_idx=19167, from_date, to_date, is_include_teacher=1
컬럼: 아이디 | 학생이름 | 클래스명 | 유닛명 | 학습시작 | 학습종료 | 점수칸들…
실측: 문법164(g65419) 19행, 예) sueyeong 중1오수영 '감각동사+형용사' 학습시작 2026-07-05 00:00
오늘판정: 학습시작/학습종료가 오늘 날짜면 = 했음 (점수 무관)
```
> 교사 계정의 g_class 목록(문법 반 다수)은 `/GClass/report/{id}` 페이지 드롭다운에서 수집 가능. 실제 활동 반: g65419, g109586, g110249, g66998, g127033 등.

**(B) 어휘·본문·듣기 — `POST /ClassReports/userReportToExcel`** (save_scope=2면 .xlsx/PK)
```
form: class_idx, mem_sort=1, view_date=<기준일>, save_scope=2  # 2="모든 학습한 세트"
컬럼: 학생이름 | 아이디 | 세트명 | 학습일(MM/DD HH:MM) | 암기/리콜/스펠… | 완료여부 | 누적오답
실측: 중등기본(1708319) 등에서 실제 행 반환, 예) from302 '능률VOCA…' 학습일 12/22 22:14
오늘판정: 학습일이 오늘이면 = 했음. '완료여부' 컬럼도 존재(점수 무관 완료 표기)
```
> 클래스 목록(33개)은 `/ClassReports/{class_idx}` 페이지에서 수집. **듣기훈련(/Listen) 세트도 반에 담기면 이 리포트에 세트명으로 표기됨** → 같은 경로로 커버.
> ⚠️ save_scope=1(기본)은 "특정일 이후 학습중 세트"라 자주 빈 결과 → **save_scope=2 사용**.
> ⚠️ 응답이 .xls(OLE2)/.xlsx(ZIP) 혼재 → 파서는 두 포맷 모두 처리 필요.

## 2e. 유일한 잔여 미검증 = 클라우드 실행
로컬은 완전 검증. **Cloud Functions IP에서도 두 엑셀 엔드포인트가 되는지**만 배포 시 확인.
근거상 유력: 07-06 클라우드 로그에서 GClass 리포트 페이지 자체는 정상 로드(300KB)됨(차단은 JSON API 한정).

## 3. 구현 방향 (실측 확정 반영)
> 기존 §3의 "HTML 파싱" 접근은 폐기. 아래 엑셀 기반으로 대체.

### 3.1 스크래퍼 재작성 — 엑셀 리포트 기반
`scraper-classcard.ts` 문법/듣기 경로를 **엑셀 다운로드 + 파싱**으로 교체:
- 문법: g_class별 `getReportToExcel` → .xls 파싱 → 학습시작/종료로 오늘 판정.
- 어휘·본문·듣기: class별 `userReportToExcel`(save_scope=2) → .xlsx 파싱 → 학습일로 오늘 판정 + 완료여부.
- 판정: **오늘 학습 흔적 있으면 완료(점수 무관)** — 사용자 확정.
- Node 엑셀 파서 의존성 추가: .xls+.xlsx 모두 읽는 라이브러리(예: `xlsx`/SheetJS). functions/package.json.
- g_class·class 목록은 config(`config/autoVerify`) 또는 리포트 페이지에서 동적 수집(하드코딩 최소화).

### 3.2 무인 스케줄 연결
`auto-verify-batch.ts` `runBatch()`에 오토보카·매일국어와 동일 패턴으로 클래스카드 추가:
- `scrapeClasscardAll()`(엑셀 기반 전교생) → 매칭(`classcardLoginId`>이름) → `writeAutoLog("classcard-middle")`.
- 기존 스케줄(09/13/17/21시 KST)에 태움. **클릭·북마클릿 불필요.**
- summary에 classcard 추가, "클라우드 차단 제외" 주석 갱신.

### 3.3 검증
- 배포 후 `runAutoVerifyNow` 1회 → 로그에서 클라우드 엑셀 다운로드 성공 + `classcard.ok>0` 확인.
- 대상 학생 `/learn`에 문법/듣기 완료 라벨 표시 확인.

## 구현 현황 (2026-07-07)
- [완료] SheetJS(xlsx 0.20.3, CDN 패치본) functions 의존성 추가.
- [완료] `scraper-classcard.ts` 엑셀 기반 재작성 (`getReportToExcel` + `userReportToExcel`, 두 포맷 파싱, 오늘판정, 점수무관 완료판정, `scrapeClasscardAll` 추가).
- [완료] `loadClasscardConfig` export, `auto-verify-batch.ts`에 클래스카드 블록 연결(byCc 매칭 + 자동 아이디 저장 + summary).
- [완료] `tsc` 빌드 통과.
- [완료] **로컬 실동작 검증**: 문법(07-05 오수영), 어휘/본문(06-17) 실데이터 추출 성공.
- [완료] **배포**: verifyAutoProgress·autoVerifyScheduled·runAutoVerifyNow 업데이트 (2026-07-07).
- [완료] **클라우드 실행 검증**: `runAutoVerifyNow?date=2026-07-05` → `classcard {ok:1, miss:0}`, `[batch] 완료` 로그 확인. 클라우드에서도 엑셀 다운로드·파싱·기록 정상(차단 없음).
- [완료] **config 반 목록 확정 + 재배포**(2026-07-07):
  - 문법(gClass) 7반: 65419 교실·109586 intro·110249 중2비상황·66998 중3비상김·127033 고등·116419 중1천재이·120840 중2YBM.
  - 듣기평가(gClass, "4.듣기평가" 그룹) 7반: 93468 중1·82592 중2·92730 중3·82439 고1EBS·95899 고1모의·111208 고2모의·96356 예비고1. (kind:"듣기" 라벨)
  - 어휘/본문(classMain) 8반.
  - 듣기 반은 gClass 타입 → `getReportToExcel` 동일 경로. 엔드포인트·컬럼(아이디|학생이름|유닛명|학습시작|학습종료) 유효 확인.
- [제약] 듣기 반은 **최근 180일 활동 0** → 실제 듣기 행으로 end-to-end 검증은 불가(파싱 로직은 문법과 동일하여 검증됨). 학생이 실제 듣기하면 동일 경로로 자동 수집.
- [미커밋] 변경분(functions/*) 배포는 됐으나 git 커밋 안 함.

## 3. 구현 (Step 0 🟢일 때만)

### 3.1 듣기 판정 완화 — 점수 → 했나/안했나
[scraper-classcard.ts:234](functions/src/scraper-classcard.ts)
```
completed: testScore != null && testScore >= 80   // 기존
completed: true                                   // 변경: 오늘 행이 존재 = 했음
```
(오늘 행은 `isToday` 통과해야만 생기므로, 행 존재 자체가 "했음". 문법은 변경 없음.)

### 3.2 배치용 전체 반환 함수 추가
`scrapeClasscardAll()` 신규 (기존 `scrapeClasscardForStudent`의 roster 수집부 재사용, 한 명 픽 대신 전체 반환):
```
export async function scrapeClasscardAll(creds, cfg, dateKst):
  Array<{ loginId, name, autoStatus, units }>
  // 로그인 1회 → 8개 클래스 순회 → roster(loginId→{name,units}) → 활동 있는 학생만 반환
```
- `scrapeDailykorAll`과 동일한 형태 → 배치가 균일하게 소비.

### 3.3 배치에 클래스카드 연결
[auto-verify-batch.ts](functions/src/auto-verify-batch.ts) `runBatch()`에 오토보카·매일국어와 같은 패턴으로 블록 추가:
- `loadClasscardConfig()`(현재 verify-auto.ts 내부 → 공용 위치로 이동/복제) 로 config 로드.
- `scrapeClasscardAll()` 호출 → 학생 매칭(외부아이디 `classcardLoginId` 우선, 없으면 이름) → `writeAutoLog(serviceSlug:"classcard-middle")`.
- 이름 매칭 성공 시 `classcardLoginId` 자동 저장(기존 패턴 동일).
- `summary`에 `classcard: {ok, miss}` 추가.
- 주석 "클래스카드는 클라우드 차단이라 제외" 갱신.

### 3.4 검증
- `runAutoVerifyNow` 1회 실행 → 로그 `summary.classcard.ok > 0` 확인.
- 대상 학생 1명 `/learn`에서 문법·듣기 완료 라벨 표시 확인.
- 점수 낮은 듣기 케이스도 "완료"로 뜨는지 확인(판정 완화 검증).

## 4. 성공 기준
1. 학생 클릭·운영자 개입 0 → 스케줄만으로 문법·듣기 완료 여부가 `learningLogs`(method:"auto")에 기록.
2. 듣기는 점수 무관, 오늘 활동만 있으면 완료.
3. 기존 오토보카·매일국어 배치 동작 불변(회귀 없음).

## 5. 리스크
- **[결정적] 클라우드 IP 차단** → Step 0에서 판정. 차단이면 무인 불가(대안 별도 논의).
- **[중] 반 단위 리포트 8개 순회 부하** → 배치는 하루 4번뿐이라 클릭 실시간보다 부담 적음. 로그인 1회 재사용.
- **[낮음] 이름 매칭 오탐** → 기존 오토보카·매일국어와 동일 로직, 외부아이디 저장되면 이후 정확.

## 6. 승인 필요 사항
1. **Step 0(클라우드 차단 검증)부터 진행** OK? (검증 방법 A/B 중 선호?)
2. 듣기 판정을 "오늘 활동 있으면 무조건 완료"로 완화 OK? (점수 표시는 scrapedData에 남김, 판정만 완화)
3. 클래스카드 배치 스케줄은 기존과 동일하게 **09/13/17/21시 KST** 태움 OK?
