# 리서치: 같은 이름 자녀 박스 통합

## 현황
- `members-tab.tsx:2042` — `children.map((child) => ...)` 에서 각 child 문서마다 별도 박스 생성
- Firestore에 같은 가족 내 동일 이름(예: 임서주 중3 izapick)이 3개 child 문서로 존재
- 각 child 문서마다 서로 다른 구독(클래스카드, 오토보카, 매일국어)이 1개씩 연결
- 결과: 같은 학생인데 3개 박스로 분리되어 보임

## 타입 구조
```ts
// src/lib/types.ts:91
MemberChild = { id, familyId, name, grade, loginId, createdAt }
```

## 영향 범위 (members-tab.tsx의 children.map 루프 내부)
- 구독 필터: `allSubs.filter((s) => s.childId === child.id)` — childId 기준
- 자녀 이름 편집: `InlineNameEditor` — child.id 기준으로 updateChildName 호출
- 학년 편집: `EditableGrade` — child.id 기준
- 비번 초기화: `onResetByFamily` — child.loginId 기준
- SMS 전송: `SmsSendBtn` — child.name 기준
- 서비스 필터: `allChildSubs.some((s) => s.serviceSlug === svcFilter)` — childId 기준

## 핵심 포인트
- 같은 가족 내에서 `name`이 같으면 한 명으로 합쳐야 함
- 합칠 때 여러 child 문서의 구독을 모두 모아 하나의 박스에 표시
- grade, loginId는 첫 번째(또는 가장 최근) child 문서 기준
- 이름 편집/학년 편집 시 대표 child.id 사용
