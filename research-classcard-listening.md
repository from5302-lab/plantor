# research.md — 클래스카드 "듣기훈련" 자동인증 미작동 원인 규명

## 증상
학생 `/learn` 상단 자동인증 배지: **"오토보카 완료 · 클래스카드 시작전"**.
오준영(오늘 듣기훈련·오토보카 수행, 둘 다 수동 완료 체크)인데 클래스카드만 `시작전`.

## 확인된 사실 (프로덕션 데이터 · 라이브 스크래핑, 2026-07-07)

### 1. 오준영 데이터
- `children/swNdw9M4lNEKGbRcqTre` · loginId=`jayaprvn1` · classcardLoginId=`sea_jayden`
- 과제 3개: **듣기훈련**(classcard-middle, partSlug=`listening`), 문법훈련(grammar), [5권]480단어(autovoca)
- 오늘 taskChecks: 듣기훈련=done, 480단어=done (둘 다 checkedBy=student 수동)
- 오늘 learningLogs(auto): classcard-middle `시작전 units=0`, autovoca `완료`

### 2. 자동인증 파이프라인 자체는 정상
- learningLogs 히스토리: **07-06 3명 완료, 07-05 1명 완료** (units 정상, 전부 `문법`)
- 라이브 다운로드 테스트(오늘): gClass/classMain `getReportToExcel`·`userReportToExcel` 모두 200 EXCEL 정상. **차단·로그인만료 아님.**
- 로그가 `시작전`으로 남았다는 것 = 로그인 성공 후 roster에서 sea_jayden 결과만 빈 것. (스크래핑 실패면 로그 안 남고 throw)

### 3. 근본 원인 — 듣기훈련은 "반(class)"이 아니라 "세트" 기능
교사 계정(from302) 라이브 조사 결과:
- 스크래퍼가 훑는 리포트는 전부 **반 단위**: `GClass/getReportToExcel`(문법·듣기평가), `ClassReports/userReportToExcel`(어휘·본문), `Pro/ReportAllToExcel`(반 선택 통합).
- `/Pro/ReportAll`의 전체 반 목록 **44개**를 추출 → 카테고리: 능률보카/문법164/모의고사/**듣기평가**/OMR/내신대비/리더스뱅크/리딩튜터/수능딥독/천일문.
  - **"듣기훈련" 반은 존재하지 않음.** `4.듣기평가`는 듣기훈련이 아니라 듣기**평가**(gClass, 이미 config에 있음).
- 듣기훈련은 `/Listen`(클래스카드 **Max 상품**) 아래 **"듣기 세트"** 로, 세트 생성(`/CreateListen` data-type=7)·자가학습 방식. 학습 로그는 세트/유저 단위(`/ViewSetAsync/saveActivityLog`)로 쌓임.
- **결론: 듣기훈련 자가학습은 어떤 반 리포트에도 안 잡힘.** 반 기반 스크래퍼로는 원천적으로 수집 불가. (scraper-classcard.ts:19 오늘자 주석과 일치)

### 4. 부수 발견 (별도 이슈, 이번 범위 아님)
- `CLASSCARD_DEFAULT_CONFIG`의 idx→이름 **주석 라벨이 실제와 어긋남** (예: 92730은 "듣기 중3"이 아니라 실제 "OMR-고1 능률민"; 93468은 듣기평가 중2 등). idx 자체는 유효 반이라 스크랩은 되지만 주석이 오해를 부름.
- 실제 듣기평가 반 `1817980(고1 EBS)`은 config 누락.

## 수집 가능 경로 후보
- **A. 듣기 세트를 반에 편입** — `/ViewSet/add_set_in_class`로 듣기 세트를 특정 반에 넣으면, 학생 학습이 그 반 `userReportToExcel`에 세트명으로 잡힐 가능성. → **기존 스크래퍼 재사용, 코드 최소**. 단 교사 운영 방식 변경 필요 + 실제 잡히는지 검증 필요.
- **B. 듣기훈련 전용 학습로그 엔드포인트 리버스 엔지니어링** — 세트/학생 단위 study-log read API를 찾아야 함. 깔끔한 엑셀 export는 못 찾음(있는지 불확실). 프래질·고비용.
- **C. 듣기훈련 자동인증 제외** — 못 잡는 항목이므로 헤더 `시작전` 표기를 빼고 수동 체크 존중(모순 표시 제거).

## 열린 질문 (사용자 확인 필요)
1. 오준영은 듣기훈련을 **어떻게** 하나? `/Listen` 자가학습(세트 직접) vs 특정 듣기 반 배정?
2. A안처럼 **듣기 세트를 반에 넣는 운영 방식**을 받아들일 수 있나? (그럼 기존 파이프라인으로 해결)
3. 아니면 B(전용 스크래퍼) 감수 vs C(자동인증 제외)?
