# Plan: 가족 모달 "서비스 추가"에 1:1 학습 (과목·금액 수동 입력)

> 작성일: 2026-07-15
> 상태: 검토 대기 (승인 전 구현 금지)
> 리서치: `research-1on1-service.md`

## 목표
어드민 가족 편집 모달의 "서비스 추가"에서 자녀 대상 **1:1 학습**을 추가할 수 있다.
과목·월 금액은 어드민이 직접 입력. 저장 후 구독 목록·학부모 화면·연장 신청·입금 확인·예상 수입·만료 알림까지 기존 구독과 동일하게 흐른다.

## 데이터 모델 (신규 컬렉션 없음)
`subscriptions` doc을 그대로 사용:
```
serviceSlug:  "1on1-국어"        // "1on1-" + 과목 (자녀당 과목별 1개)
customName:   "1:1 국어"         // 표시용 이름 (신규 필드)
monthlyPrice: 200000             // 어드민 입력값
agencyFee:    0
discount:     0, status: "active", endDate: 다음 달 말일 (기존과 동일)
```

## 태스크

1. [완료] **타입** — `src/lib/types.ts` `Subscription`에 `customName?: string` 추가
   → verify: `npx tsc --noEmit` 통과

2. [완료] **서비스 추가 UI** — `members-tab.tsx` `ServiceAddSection`
   - 대상=자녀일 때 서비스 select 맨 아래 `1:1 학습 (직접 입력)` 옵션 추가
   - 선택 시 과목 텍스트 입력 + 월 금액 숫자 입력 노출, 둘 다 있어야 추가 버튼 활성
   - 추가 시 위 스키마로 sub 생성. 같은 자녀에 같은 과목이 이미 있으면 알럿
   → verify: build 통과 + 코드 리뷰로 doc 필드 확인

3. [완료] **표시 이름 fallback 보강** — `svc?.name ?? sub.customName ?? sub.serviceSlug` 한 줄 패턴
   - `members-tab.tsx` 구독 행 4곳 (+ MemberSub 로딩 매핑에 customName 추가)
   - `account/account-shell.tsx`(학부모 구독), `account/children-tab.tsx`(자녀 구독 행)
   - `learn/learn-dashboard.tsx` 완료 카드 1곳
   → verify: build 통과

4. [완료] **연장 모달 수정** — `account/renewal-modal.tsx` (버그 수정 포함)
   - 자녀 아코디언: 라인업(`childOnlyServices`)에 없는 slug의 기존 sub를 **추가 행으로 렌더**
     (이름 = customName, 가격 = `monthlyPrice - discount`, 체크박스 + MonthsPicker — 키 체계는 기존 `child:{id}:{slug}` 그대로)
   - 학부모 섹션도 같은 방식으로 라인업 외 sub 행 렌더 (동일 잠재 버그 해소)
   - 신청 doc의 `serviceName`에 customName 반영
   - `useFamilyData`(allSubs 소스)가 customName을 매핑하는지 확인, 없으면 추가
   → verify: build 통과. 1:1 sub가 있어도 `allMonthsSelected` 로직이 막히지 않음을 코드로 확인

5. [완료] **입금 확인(어드민)** — `admin-shell.tsx` `approveRenewalCore`
   - 기존 sub 연장 경로는 무수정으로 동작 ✓ (subscriptionId로 endDate 연장)
   - 안전망: 신규 sub 생성 경로에서 `1on1-` slug면 `customName: req.serviceName`, `monthlyPrice: req.amount / req.months` 유지
   → verify: build 통과

6. [완료] **예상 수입/청구** — `lib/vault/use-admin-billing.ts`
   - sub 매핑에 `customName` 추가, 라벨 `SERVICE_NAME[slug] || customName || slug`
   - 금액은 기존 로직이 monthlyPrice 기준이라 무수정 ✓
   → verify: build 통과

7. [완료] **만료 알림 SMS** — `functions/src/notifications.ts` 구독 만료 배치
   - sub doc 읽을 때 `customName` 포함, 이름 fallback `meta.get(slug)?.name ?? customName ?? slug`
   → verify: `cd functions && npm run build` 통과

8. [완료] **최종 검증** — `npm run build`(정적 export) + lint + functions build 모두 통과

## 하지 않는 것 (스코프 밖)
- directClasses(수업 관리)와의 통합/이관 — 별개 시스템 유지
- 학생 /learn에 1:1 노출 — 모르는 slug는 기존 코드가 자동으로 숨김 (오프라인 수업이므로 의도된 동작)
- 신규 가입 신청서(/signup)·입금 안내 문자(messages.ts) — 1:1은 어드민 수동 추가 전용
- firestore.rules — 새 컬렉션·새 권한 없음 (기존 subscriptions 규칙 그대로)

## 확정된 결정 (2026-07-15 사용자 확인)
1. **금액 단위**: 월 구독 — 기존 구독과 동일하게 개월 단위 연장.
2. **대상**: 자녀만 (학부모 1:1 없음).
3. **연장 모달**: 1:1 행 노출 — 학부모가 직접 개월수 선택해 연장 신청 가능.
