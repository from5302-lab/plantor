# 리서치: 가족 편집 모달에서 "1:1 학습" 서비스 추가

> 작성일: 2026-07-15
> 요청: 어드민 가족 편집 모달 "서비스 추가"에서 1:1 학습(과목·금액 수동 입력)을 추가할 수 있게 하고, DB·입금 등 연결 코드 동기화.

---

## 1. 현재 구조

### 서비스 추가 (어드민 가족 모달)
- `src/components/admin/members-tab.tsx` → `ServiceAddSection` (434~540행)
- 대상(자녀/학부모) select + 서비스 select + 추가 버튼.
- 서비스 목록은 정적 `SERVICES`(`src/data/site.ts`)에서 옴 — **가격이 slug별 고정**.
- 추가 시 `subscriptions` 컬렉션에 doc 생성: `{ familyId, childId, serviceSlug, monthlyPrice(정가), agencyFee, discount:0, status:"active", startDate:now, endDate:다음달 말일 }`.

### 기존 1:1 인프라 (directClasses) — 별개 시스템
- `directClasses` 컬렉션: 수업 단위(학생 배열, tuition, expiry). "수업 관리" UI에서 관리.
- 청구(`use-admin-billing.ts`)에서 kind:"1:1"로 별도 합산. 수업일지(lessonLogs)와 연동.
- **가족(families) 단위 구독과는 분리**되어 있어, 가족 모달의 구독 목록·연장 흐름에 안 뜸.

### 구독(subscription)이 흐르는 연결 코드 (= 동기화 대상)
| 영역 | 파일 | 현재 동작 |
|---|---|---|
| 구독 표시(어드민) | `members-tab.tsx` 1584, 1668, 2104, 2148, 2199행 | `SERVICES.find(slug)?.name ?? sub.serviceSlug` |
| 구독 표시(학부모) | `account/account-shell.tsx` 255, `account/children-tab.tsx` 192 | 동일 패턴 |
| 학생 완료 카드 | `learn/learn-dashboard.tsx` 403 | 동일 패턴 |
| 연장 신청(학부모) | `account/renewal-modal.tsx` | `signupServices` 라인업만 체크박스로 렌더. 가격은 기존 sub가 있으면 `sub.monthlyPrice - discount` 사용 ✓ |
| 입금 확인(어드민) | `admin-shell.tsx` `approveRenewalCore` | subscriptionId 있으면 endDate 연장 ✓. 없으면 SERVICES 정가로 신규 sub 생성. SMS 이름은 `svc?.name ?? req.serviceName` ✓ |
| 예상 수입/청구 | `lib/vault/use-admin-billing.ts` | sub는 `monthlyPrice - discount`로 합산 ✓. 라벨은 `SERVICE_NAME[slug] \|\| slug` |
| 만료 알림 SMS | `functions/src/notifications.ts` 543~600 | sub doc의 serviceSlug를 `SERVICE_META`(functions/config.ts)에서 이름 조회, 없으면 slug 그대로 발송 |
| 입금 안내 문자 | `lib/messages.ts` | **신규 가입 신청서 전용** — 1:1은 어드민이 직접 추가하므로 해당 없음 |

### 학생 /learn 쪽 안전성 (확인 완료)
- `useChildData`가 자녀의 모든 active sub를 내려줌.
- `ServiceQuickLinks`, `add-task-form`, `student-learning-grid`는 모두 `allServices.find(slug)`로 **모르는 slug를 조용히 버림** → 1:1 slug가 섞여도 깨지지 않음 (과제/바로가기에 안 뜸 = 오프라인 수업이므로 오히려 정답).
- 유일한 노출: learn-dashboard 완료 카드가 slug 원문을 표시 → 이름 fallback만 보강하면 됨.

## 2. 발견한 함정 (중요)

**renewal-modal의 체크맵 초기화 버그(잠재)**: 모달이 열릴 때 자녀의 *모든* sub slug를 체크된 상태로 초기화하는데, 화면에는 `signupServices` 라인업의 slug만 렌더된다. 라인업에 없는 slug의 sub가 있으면 → 체크는 돼 있는데 행이 안 보여 개월수를 선택할 수 없고 → `allMonthsSelected`가 영원히 false → **그 가족은 연장 신청 자체가 불가능**해진다. 1:1 학습 sub를 만들면 이 버그를 즉시 밟게 되므로 반드시 함께 수정해야 함. (학부모 서비스 쪽 `checkedParent`도 같은 패턴.)

## 3. 설계 판단

- **directClasses 재사용 대신 subscriptions에 저장**을 추천. 이유: 요청 지점이 가족 모달이고, 가족 단위 만료일·연장 신청·입금 확인·청구 합산이 전부 subscriptions 기준으로 이미 돌아감. directClasses는 수업(그룹) 단위라 가족 구독 흐름에 안 맞음.
- slug는 `1on1-<과목>` (예: `1on1-국어`) — 자녀 한 명이 과목별로 여러 1:1을 가질 수 있고, 기존 "이미 추가된 slug 제외" 로직·연장 모달의 slug 키가 그대로 동작.
- 표시 이름은 sub doc에 `customName`("1:1 국어") 필드로 저장 → 각 표시 지점의 fallback을 `svc?.name ?? sub.customName ?? sub.serviceSlug`로 한 줄씩 보강.
- 가격은 어드민 입력값을 `monthlyPrice`에 그대로 저장 → 연장·청구·입금 확인이 **추가 코드 없이** 그 가격을 따라감 (이미 sub.monthlyPrice 기준).
- `agencyFee: 0` (외부 벤더 없음) → 가맹비 집계에 안 잡힘 ✓.
