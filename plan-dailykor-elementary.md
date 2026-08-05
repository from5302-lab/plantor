# 초등 매일국어 상세 수집 · 표시 — plan

작성: 2026-08-05
상태: **기획 검토 대기 (승인 전 본 구현 금지)**
사전 조사: 실측 데이터 확인 완료 (아래 §1)

## 0. 한 줄 요약
초등 매일국어는 지금 `등급:완료` + `점수:0|1` 두 값만 들어온다.
초등 리포트 상세를 새로 파싱해 **중등과 같은 수준의 학습 내용**을 확보하고,
피드 · 학생 · 학부모 · 어드민 **네 곳에 같은 컴포넌트로** 내보낸다.

## 1. 현황 (실측)

| | 중등 | 초등 |
|---|---|---|
| 수집 로그 | 82건 | 31건 |
| 지문 상세 있는 것 | 67건 | **0건** |
| 들어오는 값 | 지문별 유형·정답률·독해속도·단계별 경험치 | `등급:"완료"`, `점수:0또는1` |

- 원인: [scraper-dailykor.ts:453](functions/src/scraper-dailykor.ts:453) 이 `kind === "mh"`(중고등)일 때만 상세를 조회한다.
  초등 셀은 `btn_learning_modal` / `data-date_round`로 **다른 모달**을 쓴다.
- `점수` 값 분포: `1`이 19건, `0`이 6건 → 0~100 점수가 아니라 완료 표시로 보인다.
- 대상 학생: 초3~초6 **11명**

## 2. 엔드포인트 확정 (2026-08-05, 조사 완료)

```
GET https://www.dailykor.com/academy/elementary/ajax_dailyreport/{student_idx}/date/{YYYY-MM-DD}
    헤더: X-Requested-With: XMLHttpRequest
    인증: 기존 학원 관리자 세션 그대로 (별도 토큰 불필요)
  → { code, html }
```

- `student_idx` / `date` 는 초등 리포트 셀의 `data-student_idx` · `data-date_round`
- 근거: `www.dailykor.com/js/academy/elementary/sreport.js` 의 `.btn_learning_modal` 핸들러

### 응답 표 구조 (실측)
| 학습일자 | 회차 | 과목 | 단어 | 교과서 | 실전 | 최초점수 | 복습점수 | 복습일자 |
|---|---|---|---|---|---|---|---|---|
| 2026-08-02 | 33 | 국어 | ⭐3 | ⭐4 | ⭐5 | 91 | - | - |
| 2026-08-02 | 33 | 사회 | ⭐3 | ⭐5 | ⭐5 | 81 | 96 | 2026-08-02 |

- **별**: `<div class="main_stars"><i class="s3"></i></div>` → `s1`~`s5` 가 별 개수
- 별·복습점수·복습일자는 없을 수 있다(`-`) → 빈 값 처리 필요

### 참고: 앱 API 경로 (이번엔 안 씀)
`app.dailykor.com` SPA는 `GET https://dailykor.com/api/learning_history/academy/{...}/{grade}/{term}/{version}`
을 `Access-Token` 헤더로 부른다. 토큰은 학원 페이지가 `?token=`으로 넘긴다.
학원 엔드포인트로 충분해서 채택하지 않았다.

## ~~2-1. 막힌 것~~ (해결됨)
초등 모달이 어떤 ajax를 부르는지 코드에 근거가 없어 **파서를 미리 못 만든다.**

→ **조사 프로브 배포 완료** (`probeElementaryDetail`).
초등 학생 스크랩이 한 번 돌면 `debugDumps/dailykor-el` 에
초등 sreport 페이지의 ajax URL 후보 + 후보 4개의 실제 응답을 원문으로 남긴다.

**필요한 것**: 아래 중 하나
- 17:00 / 21:00 자동 배치를 기다린다 (자동)
- 어드민에서 **초등 학생 아무나 골라 "다시 확인"** 을 누른다 (즉시)

프로브는 읽기 전용이고 조사가 끝나면 제거한다.

## 3. 설계

### 3.1 수집 (functions)
- `fetchDailykorDetailElementary()` 추가 — 프로브 결과로 확정한 엔드포인트 파싱
- `scrapeDailykorForStudent` / 배치 양쪽에서 `kind === "el"` 이면 이걸 호출
- 결과는 기존 `DailykorDetail` 에 담되, 초등 전용 필드는 따로 둔다
  (중등 스키마를 억지로 맞추지 않는다 — 실제 응답 확인 후 확정)

### 3.2 통합 뷰 — **이미 통합돼 있다**
`학생 · 학부모 · 어드민`이 볼 학습현황은 이미 한 컴포넌트를 공유한다:

```
AutoResultSection / AutoResultCard   (auto-result-card.tsx)
├─ StudentLearningGrid ─┬─ 학생   /learn
│                       ├─ 어드민  members-tab · plan-tab
│                       └─ 학부모  /account 자녀탭
└─ parent-dashboard ───── 학부모  /parent
```

→ **`AutoResultCard`의 dailykor 분기에 초등 렌더를 추가하면 네 화면에 동시에 반영된다.**
새 컴포넌트를 만들지 않는다. 뷰 통일은 구조로 보장한다.

### 3.3 피드
`studySummary()`(rewards.ts)의 dailykor 분기에 초등 케이스 추가.
중등과 같은 모양(세트별 칸 + 단계별 칩)을 쓰되 초등 필드로 채운다.

### 3.4 XP·품질
`qualityDailykor`는 `xpGot/xpMax` 기준이다. 초등에 대응 값이 없으면
**품질 기본값(0.5) 유지** — 초등만 XP가 불리해지지 않게 한다.
대응 값이 있으면 앵커를 따로 잡는다(초등 분포를 먼저 본 뒤).

## 4. 작업 목록

| # | 작업 | 상태 |
|---|---|---|
| 0 | 조사 프로브 배포 | **[완료]** |
| 1 | 프로브 결과 확인 → 초등 상세 엔드포인트·필드 확정 | [대기 — 배치 또는 재확인 클릭 필요] |
| 2 | 초등 상세 파서 + 스크래퍼 연결 | [ ] |
| 3 | `AutoResultCard` 초등 분기 (→ 4개 화면 동시 반영) | [ ] |
| 4 | 피드 `studySummary` 초등 분기 | [ ] |
| 5 | 품질·XP 앵커 판단 (초등 분포 확인 후) | [ ] |
| 6 | 프로브 제거 · 빌드 · 배포 · 라이브 확인 | [ ] |

## 5. 확인 필요
- **초등에 "별 획득"이 실제로 있는지**는 프로브 결과를 봐야 안다.
  있으면 그대로 표시하고, 없으면 대신 무엇을 보여줄지 그때 정한다.
