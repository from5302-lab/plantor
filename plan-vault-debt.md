# Plan — 가계부 채무 섹션 추가 & 이월 기능 제거

> 작성일: 2026-06-16
> 대상: `plantor.web.app/vault` (가계부 탭)

## 확정 요구사항 (사용자 답변)
- **채무 섹션**: 별도 수동 목록 (이름 + 금액 직접 입력), 고정지출 패널 아래에 추가
- **누적 방식**: 계속 누적 합산 (월 무관, 전체 잔액 합)
- **이월 제거**: 전부 제거 (버튼 + 지난달 이월/연체 표시 + skipMonths/getCarriedOverdue 로직)

---

## A. 채무 패널 신규

### A-1. 데이터 모델 — Firestore `vault/debts`
```ts
// vault-shell.tsx 에 타입 추가
export type DebtItem = {
  id: string;
  name: string;    // 채권자/항목명 (예: "장신혜", "김지혜 2000")
  amount: number;  // 현재 잔액
};
// 저장 형태: doc(db,"vault","debts") = { items: DebtItem[] }
```
- **월에 종속되지 않음** (계속 누적). 월 네비게이션과 무관하게 동일 목록 표시.

### A-2. 신규 컴포넌트 `src/components/vault/debt-panel.tsx`
- 고정지출 패널과 동일한 비주얼(접이식 카드, 헤더 "채무 ₩<합계>", + 추가 버튼)
- `onSnapshot(doc(db,"vault","debts"))`로 자체 구독 (vault-shell 안 건드림 — 월 무관이라 props 불필요)
- 합계 = 모든 item.amount 합 (계속 누적)
- 각 행: 이름 · 금액 · (행 클릭 → 수정 모달)
- 추가/수정 모달: 이름 + 금액 입력, 삭제 버튼
- 스타일: 라운딩 사각형(6–8px), 알약버튼 금지 (메모리 규칙 준수)

### A-3. 배치 — `entries-tab.tsx`
RecurringPanel 아래에:
```jsx
<div style={{ marginBottom: "16px" }}>
  <DebtPanel />
</div>
```

> 참고: vault 패널들은 기존부터 한국어 하드코딩(미납/완료/분납 등) — i18n 미적용 서브시스템.
> 기존 스타일에 맞춰 채무 패널도 한국어 하드코딩으로 통일. (en.json 영향 없음)

---

## B. 이월 기능 전부 제거

### B-1. `recurring-panel.tsx`
- `Status` → `"unpaid" | "paid"`
- `getCarriedOverdue` import + `carried` useMemo 제거
- `statusOf`: `skipMonths → deferred` 분기 제거 (paid / unpaid 만)
- `pendingTotal`: `st === "deferred"` 체크 제거 (`st === "paid"`만)
- `saveSkip` 함수 제거
- `setStatus`: deferred/skip 처리 제거 (paid ↔ unpaid 만)
- `handlePartial`: skipMonths 정리 라인 제거
- 지난달 carried 렌더 블록(이월/연체 행) 제거
- `STATUS_OPTS`: `deferred(이월)` 항목 제거 → 미납/완료 2개
- `StatusSegment`: 변경 없음 (옵션 자동 2개)

### B-2. `dashboard-summary-panel.tsx`
- `getCarriedOverdue` import 제거
- `unpaidFixedVault`의 `.filter(!skipMonths)` 제거
- `carriedTotal` 제거
- `outgoing = unpaidAgency + unpaidFixedVault` (carriedTotal 제외)

### B-3. `vault-shell.tsx`
- `RecurringItem.skipMonths?` 필드 제거
- `startMonth` 필드는 유지 (목록 필터에 사용), 주석에서 "이월" 표현만 정리

### B-4. `src/lib/vault/recurring.ts`
- 파일 전체 삭제 (`getCarriedOverdue`·`shiftMonth` 다른 사용처 없음)

### B-5. 기존 데이터 영향
- Firestore에 남아있는 `skipMonths`(예: 원장님400의 이월 기록)는 **무시됨**.
  → 이월 표시였던 항목은 이제 일반 "미납"으로 보임. (의도된 동작, 별도 마이그레이션 불필요)

---

## 검증
1. `npx tsc --noEmit` 통과 → verify: 타입 에러 0
2. 가계부 탭: 고정지출 아래 "채무" 패널 표시, 추가/수정/삭제 동작, 합계 누적
3. 고정지출: 토글이 미납/완료 2개로 줄고, 지난달 이월/연체 행 사라짐
4. 이월 관련 import/심볼 잔존 0 → verify: `grep -rn "skipMonths\|getCarriedOverdue\|deferred\|이월" src/components/vault src/lib/vault`

---

## 미해결 / 확인 필요
- 채무 행에서 **부분 상환(잔액 차감)** 기능 필요 여부 → 1차는 금액 수정으로 갈음 (수정 모달에서 직접 잔액 변경). 필요 시 추후 분납식 추가.
- 채무 총액을 **대시보드 요약**(`dashboard-summary-panel`)에도 반영할지 → 1차 미반영 (요청 범위 밖). 필요하면 알려주세요.
