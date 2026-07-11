# Plan: 매일국어 어휘력 센터 자동 수집·표시

## 목표
매일국어 자동인증 시 "오늘의 학습"에 이어 **어휘력 센터에서 무엇을 학습했는지**도 가져와 부모/학생 화면에 표시한다.

## 리서치 (라이브 확인 완료)
어휘력 센터는 매일국어 sreport 페이지의 탭(`#tab_3`)이고, 로그인 세션(이미 구현된 `dailykorLogin`)을 그대로 재사용한다.

| 용도 | 엔드포인트 | 실제 응답 |
|---|---|---|
| 월별 리포트(누가/언제) | `POST /academy/student/ajax_sreport_voca` (filter_sdate) | 학생행 + 일자칸 `td.btn_voca_date`(색=학습, `data-student_idx`·`data-study_date`), "보기" 버튼 `btn_voca_status` |
| **오늘 학습 상세** | `GET /academy/student/ajax_voca_date/{idx}/{date}` | 표: `어휘분류 \| 학습횟수 \| 성취도` — 예) 비문학 1/5, 문법 1/6 |
| 누적 진행도 | `GET /academy/student/ajax_voca_status/{idx}` | 표: `분류1 \| 분류2 \| 진행` — 개념어>문법 1/6, 주제별어휘>비문학 1/5, 과학 0/19 … (7분류) |
| 분류별 단어목록 | `ajax_voca_status_detail` (`data-cate_id=A0101…`) | 분류 안 세부(상세보기) |

## 데이터 모델 (제안)
매일국어 로그 하나(childId+dailykor+date)의 `scrapedData`에 `voca` 필드 추가 — 서비스당 로그 1개 유지.
```ts
type DailykorVoca = {
  today: Array<{ category: string; count: string }>;   // 오늘 학습: [{비문학, "1/5"}]
  status?: Array<{ group: string; name: string; progress: string }>; // 누적(선택): [{주제별어휘, 비문학, "1/5"}]
};
// AutoScrapedData 에 voca?: DailykorVoca | null 추가
```

## 스크래퍼 설계 (functions/src/scraper-dailykor.ts)
이미 만든 `dailykorLogin(session)` 재사용. 추가:
1. `vocaReportByName(session, ym)` — `ajax_sreport_voca` 파싱 → `{ 이름: { idx, studiedDates:Set } }` (이름→idx, 오늘 학습여부용)
2. `fetchVocaDaily(session, idx, date)` — `ajax_voca_date/{idx}/{date}` → `today[]` 파싱
3. `fetchVocaStatus(session, idx)` — `ajax_voca_status/{idx}` → `status[]` 파싱 (선택)
4. `scrapeDailykorForStudent` 확장: 리포트 매칭 후, voca 리포트에서 같은 이름의 idx로 오늘 학습했으면 위 상세 수집 → `result.voca` 반환
   - ⚠️ **어휘만 학습하고 "오늘의학습"은 안 한 경우**: 현재는 일일 리포트에 today셀이 없어 `시작전`으로 조기 반환됨 → voca 리포트도 별도로 이름 매칭해 idx를 얻어야 이 케이스를 잡음.

배치(`scrapeDailykorAll`)도 동일하게 voca 포함(스터디한 학생만).

## 표시 (auto-result-card.tsx · DailykorCompletion)
"오늘의 학습" 상세 표 아래 **"어휘력 센터"** 블록:
- **오늘 학습**: 분류 칩 — `비문학 1/5` `문법 1/6`
- (선택) **누적 진행**: 7분류 진행도 요약 or 접이식

## 결정 필요 (검토해줘)
1. **표시 범위**: ⓐ 오늘 학습한 분류만(권장, 가장 단순) / ⓑ + 누적 진행도(7분류) / ⓒ + 분류별 단어목록(상세보기)
2. **완료 판정**: 현재 `DAILYKOR_REPORT_PARTS=["daily"]` 로 "오늘의학습"만 자동완료. 어휘 학습을 **`vocab-center` 파트 자동완료로 인정**할까? (지금은 vocab-center 수동 체크)
   - ⓐ 표시만, 완료는 수동 유지(권장·안전) / ⓑ 어휘 학습 시 vocab-center 파트 자동 done
3. **범위**: 어휘력 센터는 중고등 sreport 탭 → **중고등만** 지원. 초등 어휘는 별도 확인 필요(아마 없음).

## 구현 태스크 (승인 후)
1. `scraper-dailykor.ts`: voca 파서 3종 + `scrapeDailykorForStudent`/`scrapeDailykorAll` 확장 → verify: tsc + 실제 HTML 파싱 테스트
2. `types.ts`·`verify-auto.ts`·`auto-verify-batch.ts`: `voca` 필드 배선 → verify: 빌드
3. `auto-result-card.tsx`: 어휘력 센터 블록 표시 → verify: next build/lint
4. (결정 2-ⓑ 시) `completion-notify.ts` reconcile에 vocab-center 파트 반영
5. 함수 + 호스팅 배포

## 미구현
아직 코드 작성 전 — 결정 1·2·3 및 승인 대기.
