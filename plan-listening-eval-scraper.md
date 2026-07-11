# plan.md — 클래스카드 "듣기평가" 자동인증 수집 (근본 원인 확정 후)

## 확정된 근본 원인 (라이브 검증 완료, 2026-07-08)
- 오준영은 **실제로 학습함**: `4.듣기평가 - 중1`(g_class_idx **93468**, 초대코드 219778546)에서
  `2024년 중1 2회 영어듣기능력평가` 07/07 18:02~18:15, 테스트 85점·딕테이션 1.2회·오답 100.
- 그런데 `scrapeGClass`가 쓰는 **`/GClass/getReportToExcel`는 듣기평가 반에 대해 빈 엑셀(0행)** 을 반환.
  (문법 gClass는 정상: 65419에 오준영 문법 학습이 나옴. 듣기평가만 빈 응답.)
- 듣기평가 리포트는 **`/GClass/report/{idx}` 페이지에 서버렌더 HTML 테이블**(`table.report-table`)로만 존재.
  컬럼: `학생(이름+login_id) | 유닛명 | 학습일자(MM/DD HH:MM ~ MM/DD HH:MM) | 테스트 | 딕테이션 | 오답 테스트 | 선택`.
  기본 렌더 날짜창 = **today-7 ~ today** (당일 항상 포함).
- 결론: 현재 스크래퍼는 듣기평가를 **원천적으로 못 읽어** 항상 `시작전`. → HTML 테이블 파싱 경로 추가 필요.

## 성공 기준
- 오준영 loginId(jayaprvn1)로 실시간 자동인증 실행 시 클래스카드가 **완료**, `듣기(2024년 중1 2회 영어듣기능력평가)` 유닛이 scrapedData에 기록.
- 스케줄 배치도 동일하게 듣기평가 학습을 수집.
- 기존 문법/어휘/본문 수집은 회귀 없음.

## 작업 (구현·배포 완료 2026-07-08)

### 1. [완료] `functions/src/scraper-classcard.ts` — 듣기평가 HTML 리포트 파서 추가
- [완료] `ClasscardClient`에 `scrapeGClassListening(gClassIdx, dateKst)` 추가:
  - `GET /GClass/report/{gClassIdx}` HTML 취득 (로그인 쿠키 사용).
  - `table.report-table` 추출 → 각 `<tr>`의 `<td>` 파싱.
  - **login_id**: 학생 셀의 `.login-id` span (예: `sea_jayden`). name도 함께 확보.
  - **오늘 필터**: 학습일자 시작부 `MM/DD` 를 dateKst(월/일)와 비교 (scrapeClassMain과 동일 방식, 0-패딩 무시).
  - unit: `{ type:"듣기", unitLabel:유닛명, studyMinutes:(학습일자 범위에서 best-effort, 불확실하면 0),
    avgScore:null, completed:true, scores:{ 테스트, 딕테이션, 오답테스트 } }` — 값은 원본 문자열 보존(`"1.2회"`, `"85점"` 등, 이미 `number|string` 지원).
- [ ] `collectRoster` 디스패치 수정: `cls.type==="gClass" && cls.kind==="듣기"` → `scrapeGClassListening`, 그 외 gClass는 기존 `scrapeGClass` 유지. classMain은 그대로.

### 2. [완료] 설정 정합 — 듣기평가 7반 idx 전수 검증 (초대코드로 확정)
확정 매핑: 93468=중1 · 82592=중2 · 92730=중3 · 82439=고1(EBS) · 95899=고1모의 · 111208=고2모의 · 96356=예비고1.
- [완료] `CLASSCARD_DEFAULT_CONFIG`의 `kind:"듣기"` 반 목록 검증(전부 실제 듣기평가 반):
  각 후보 `/GClass/report/{idx}`에 듣기평가 `report-table`(딕테이션 컬럼)이 있는 반만 `kind:"듣기"`로 유지.
  - 확인됨(딕테이션 리포트): **93468(중1)·82592·111208**.
  - 재확인 필요: 82439·95899·96356·92730 (일부는 듣기평가 아님 — 92730은 실제 OMR). 잘못된 건 제외/교정.
  - 누락 가능성: `4.듣기평가` 카테고리 7반(고1EBS·고1모의·고2모의·예비고1·중1·중2·중3) 전부의 실제 idx를 매핑해 반영.
- [ ] 스테일 주석 정리(현재 config의 idx→이름 라벨이 다수 어긋나 있음 — 오해 방지).

### 3. 검증
- [ ] 로컬에서 교사 계정으로 `scrapeGClassListening(93468, "2026-07-07")` → 오준영 1건(85점) 확인.
- [ ] `scrapeClasscardForStudent`(jayaprvn1/sea_jayden, 07-07) → autoStatus "완료", units에 듣기 유닛.
- [ ] 배포 후 오준영 `/learn` 헤더가 `클래스카드 완료`로 바뀌는지 확인.
- [ ] 문법(65419) 회귀 없음 확인.

## 미결/판단 필요
- 듣기평가는 반 기반 리포트이므로 **자가학습(/Listen 세트)과는 별개** — 이번 수정은 "듣기평가 반" 학습만 커버(오준영 케이스가 여기 해당). 순수 /Listen 세트 자가학습은 여전히 별도 이슈(현재 대상 학생 없음).
- 딕테이션/오답 값 포맷은 원본 문자열 보존으로 처리(제네릭 렌더가 그대로 표시).

## 참고: 부수 발견(이번 범위 밖, 기록만)
- `/ClassScoreCard/get_data_set_list` = 학생별·날짜·타입 학습(어휘/본문/듣기세트)을 JSON으로 반환하는 깔끔한 엔드포인트.
  향후 어휘/본문 수집을 반별 엑셀 대신 이걸로 단순화 가능(단, gClass 문법·듣기평가는 미포함).
