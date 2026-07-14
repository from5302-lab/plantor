# Plan: 학생 주도 만회(makeup) 플로우 — 6hdl 이후 "언제 다시 할지"

## 전제 (사용자 확정)

1. **과제가 없었어도 학습기록은 남는다** — 이미 충족: 배치가 과제와 무관하게 learningLogs를 기록하고, 어드민·학부모·학생 화면에 표시됨. 변경 없음.
2. **제 날짜에 못한 기록을 소급 완료로 바꾸지 않는다** — 대신 나중에 학습한 사실을 별도 상태("만회 완료")로 표기.
3. **6hdl 사유 체크 후, 학생이 주도적으로 만회 계획을 세우고 해결한다.**

## 리서치 요약

- 학생 미완료 플로우: [task-checklist.tsx:97](src/components/learn/task-checklist.tsx) `handleSubmitReason` — 6hdl 사유 선택 → `taskChecks`에 `not_done`+reason 기록. **여기서 끝** (후속 계획 없음).
- 자동인증→체크 동기화: [completion-notify.ts:105](functions/src/completion-notify.ts) `reconcileAutoChecks` — 스크랩 시점에 **오늘 스케줄 과제만** done 처리. 과거·만회 개념 없음.
- 학생 대시보드([learn-dashboard.tsx](src/components/learn/learn-dashboard.tsx))는 taskChecks를 `date == 오늘`로만 구독 → 만회 과제 표시하려면 구독 확장 필요 (childId 단일 조회 관례 패턴).
- 그리드 셀 상태: done(초록 채움 ✓) / 미완료(빨간 박스 X·6hdl 이모지) / 예정(빈 박스) — 3면 공용 `StudentLearningGrid`라 여기만 고치면 어드민·학부모 동시 반영.

## 설계

### 데이터 (types.ts + Firestore 무마이그레이션)
- `TaskCheckStatus`에 `"made_up"` 추가 (만회 완료)
- `TaskCheck`에 필드 2개:
  - `makeupDate: string | null` — 학생이 정한 만회 예정일 (6hdl 직후 저장)
  - `madeUpAt: Date | null` — 만회 완료 시각 (made_up 전환 시)
- 원래 `date`(제 날짜)·`reason`(6hdl)은 그대로 보존 → "제 날짜엔 못 했고, 사유는 X였고, 7/15에 만회함"이 한 문서에 남음

### D-1. 학생 — 6hdl 직후 만회 계획 스텝 [완료]
- task-checklist의 6hdl 사유 선택 → 저장 후 이어서 **"언제 다시 할까?"** 칩 선택:
  `내일 / 모레 / 이번 주말 / 나중에 정할게` (나중에 = makeupDate null)
- 선택 즉시 not_done 체크에 `makeupDate` 저장. 문구는 학생 주도 톤 ("네가 정한 날에 다시 도전!")

### D-2. 학생 — 만회 과제 섹션 [완료]
- learn-dashboard의 taskChecks 구독을 `childId ==` 전체로 확장 (인덱스-회피 관례, 오늘 필터는 렌더에서)
- 오늘 체크리스트 아래 **"만회 과제"** 섹션: `status == "not_done" && makeupDate != null && makeupDate <= 오늘` 인 체크의 과제 표시
  - 원래 날짜 + 6hdl 이모지 + "만회 예정 7/15" 뱃지 (예정일 지났으면 "밀림" 붉은 뱃지)
  - 완료 동작:
    - **자동인증 과목** → 기존 `verifyAutoProgress` 클릭 인증 그대로 (서버가 made_up 처리, D-3)
    - **수동 과목** → 클릭 시 원 체크를 `made_up`으로 업데이트 + `madeUpAt`
  - 만회 예정일 재설정(재계획) 버튼

### D-3. 서버 — reconcile 확장 [완료] (만회일과 무관하게 실제 학습 확인 시 전환 — 일찍 만회해도 인정)
- `reconcileAutoChecks` 마지막에 추가: 완료 판정된 파트에 대해
  `childId + serviceSlug`의 `status == "not_done" && makeupDate <= 오늘` 체크 중 파트 매칭되는 것 → `status: "made_up", madeUpAt: now`
- 배치(하루 4회)·학생 클릭 실시간 양쪽에서 같은 경로로 동작 → **만회일에 실제 학습이 스크랩으로 확인되면 자동으로 만회 완료 처리**

### D-4. 표시 — 3면 공용 그리드 셀 [완료]
- `made_up` 셀: **연초록 배경(#f0faf1) + 초록 1.5px 테두리 + 초록 ✓** — 제 날짜 완료(초록 채움)와 구분되는 아웃라인 스타일
  - 툴팁: "7/15 만회 완료 (사유: 💪 의지부족)"
- 만회 예정(아직 미완): 기존 빨간 박스(X/이모지) 유지 + 툴팁에 "만회 예정 7/15" 한 줄 추가 (셀 장식 추가 금지 — 과밀 방지)
- 완료율(N/M건)은 기존대로 **done만** 집계 — 만회는 제 날짜 완료가 아니므로 (아래 질문 2)

### D-5. 학습기록 (전제 1·2 확인) [완료] (변경 없음)
- learningLogs는 실제 학습일에 그대로 기록·표시 (현행) — 만회일 날짜를 클릭하면 그날 성적표가 보임. 변경 없음.

## 검증

```
1. 타입+클라(D-1·D-2·D-4) → npm run build
2. 서버(D-3) → functions build + 배포
3. 시나리오: 과제 미완료 → 6hdl+만회일 입력 → (만회일에) 클릭 인증 완료
   → 원 날짜 셀이 만회 ✓로, 학부모·어드민 그리드 동일 확인
```

## 질문 (답변: 전부 기본안대로 승인 — 써보고 수정 가능)

1. **만회일 선택지**: `내일 / 모레 / 이번 주말 / 나중에` 4개면 충분한가요? (달력 직접 선택까지?)
2. **완료율 집계**: 만회 완료를 주간 완료율(N/M건)에 포함할까요? 기본안은 미포함(제 날짜 완료만), 셀 표기로만 구분.
3. **만회도 안 한 경우**: 예정일이 지나면 만회 섹션에 "밀림" 표시로 계속 남고 재계획 가능 — 이 정도면 될까요? (몇 번 밀리면 학부모 알림 같은 건 스코프 제외)
