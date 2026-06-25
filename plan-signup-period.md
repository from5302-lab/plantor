# 신청(signup)에 1/3/6/12개월 기간 선택 추가

> **[완료]** 6개 파일 + 공용 months-picker 구현. functions tsc / app tsc / next build 모두 통과.
> 미배포 상태 (배포는 사용자 요청 시).


## 목표
연장 모달처럼 **신청 폼에서도 서비스별로 1/3/6/12개월을 선택**하고, 선택한 개월수만큼
입금액과 구독 종료일(endDate)에 반영한다.

## 결정 사항 (확정)
- **기간 단위: 서비스별** (연장 모달과 동일, 자녀 서비스마다 / 학부모 서비스마다 인라인 picker)
- **개월수만큼 실제 반영**: 입금액 = 월요금 × 개월수, 승인 시 endDate를 개월수만큼 연장

## 핵심 발견 (설계 근거)
1. 현재 `approveSignup`의 자녀 구독 endDate는 `다음달 말일`로 하드코딩 →
   이는 연장의 `calcNewEndDate(now, 1)`과 **정확히 동일**.
   → 기간 디폴트를 비워두고 1개월을 고르면 기존 동작이 그대로 보존됨. (회귀 없음)
2. **학부모 서비스도 개월수만큼 endDate에 반영한다 (사용자 요청 반영).**
   연장 승인(`approveRenewalCore`)의 학부모 처리 패턴을 그대로 따른다:
   - `momsaipack`: 구독 doc 없음. `aiPackageEndDate`(families/users 필드)로 관리 →
     승인 시 endDate = `calcNewEndDate(now, months)`로 계산해 설정.
   - 그 외 학부모 서비스(`great-books` 등): `subscriptions` doc 생성,
     `childId: null`, endDate = `calcNewEndDate(now, months)`.
     (`SERVICE_PRICING`에 `great-books` 11000 이미 존재 → 가격/수수료 조회 가능)

## 데이터 모델 변경 (`signups` 문서)
- 자녀: `children[].serviceMonths: { [slug]: number }` 추가 (기존 `selectedServices: string[]` 유지)
- 학부모: `parentServiceMonths: { [slug]: number }` 추가 (기존 `parentServices: string[]` 유지)
- 상단: `estimatedMonthly`(월 합계, 기존 유지) + `depositTotal`(= Σ 월요금×개월수) 신규 추가
  - `finalMonthly`는 기존대로 두되, 의미상 월 금액이므로 그대로 유지

## 변경 파일

### 1. `src/components/signup/child-input-row.tsx`
- `ChildEntry`에 `serviceMonths: Record<string, number>` 추가
- 체크된 서비스 아래에 `InlineMonthsPicker`(1/3/6/12) 렌더
  - 연장 모달의 picker를 공용 컴포넌트로 추출 → `src/components/ui/months-picker.tsx` 신설,
    renewal-modal.tsx도 이걸 import (중복 제거). **단 renewal 동작/스타일은 100% 동일 유지.**
- props에 `onChangeMonths(slug, months)` 추가

### 2. `src/components/signup/hooks/useSignupForm.ts`
- `emptyChild()`에 `serviceMonths: {}` 추가
- `FormState`에 `parentServiceMonths: Record<string, number>` 추가
- `toggleChildService`/`toggleParentService`: 체크 해제 시 해당 slug의 months도 제거
- `setChildServiceMonths`, `setParentServiceMonths` setter 추가
- `estimatedTotal` → 월 합계는 유지하되, **`depositTotal`**(월×개월) 계산 추가
- `handleSubmit` 검증: 체크된 모든 서비스(자녀+학부모)에 개월수가 선택됐는지 확인,
  미선택 시 "기간을 선택해 주세요" 에러
- `addDoc` payload에 `serviceMonths`/`parentServiceMonths`/`depositTotal` 포함

### 3. `src/components/signup/signup-form.tsx`
- 학부모 서비스 체크박스 아래 `InlineMonthsPicker` 렌더
- 하단 요약: "예상 월 결제액 합계" → **"총 입금액"(depositTotal)** 으로 표기 변경
  (월 합계도 부가 표기 가능)
- 제출 버튼 라벨: 기간 미선택 시 "기간을 선택해 주세요" 처리

### 4. `functions/src/auth.ts` (`approveSignup`)
- `children[].serviceMonths`, `parentServiceMonths` 수신 (signup doc에서)
- 공용 헬퍼 `calcNewEndDate(base, months)` (renewal/bulk-renewal과 동일 로직) 추가
- **자녀 구독** 생성/머지 시 endDate를 개월수 기반으로:
  - 신규: `calcNewEndDate(now, months ?? 1)` (months 없으면 1 → 기존과 동일)
  - 머지(기존 sub 존재): 현재 endDate 기준 +months개월 말일 (현재 +30일 하드코딩 → 개월수로 교체)
- **학부모 구독** (신규 + 머지 케이스 모두):
  - `momsaipack`: `momsaipackEndDate`가 넘어오면 그걸 사용(admin이 months로 계산해 전달),
    없으면 `calcNewEndDate(now, parentServiceMonths.momsaipack ?? 1)`로 fallback.
  - 그 외(`great-books` 등): `subscriptions` doc `set`/`update`,
    `childId: null`, `monthlyPrice`/`agencyFee`는 `SERVICE_PRICING[slug]`,
    endDate = `calcNewEndDate(now, months ?? 1)`. 머지 시 기존 학부모 sub(childId=null,
    같은 slug) 있으면 그 sub 연장.

### 5. `src/components/admin/admin-shell.tsx` (`approveAsFamily`)
- momsaipack `aiEndDate`를 고정 "다음달 말일"이 아니라
  `calcNewEndDate(null, signup.parentServiceMonths?.momsaipack ?? 1)`로 계산해 전달

### 6. `src/components/admin/signup-row.tsx` (표시만)
- 자녀/학부모 서비스 항목에 개월수 뱃지(예: "3개월") 표시
- "예상 월" 옆에 총 입금액(depositTotal) 표시

## 검증 (success criteria)
1. 신청 폼: 서비스 체크 → 1/3/6/12 picker 노출, 미선택 시 제출 차단 → 확인
2. 제출 → `signups` 문서에 `serviceMonths`/`parentServiceMonths`/`depositTotal` 저장 → 확인
3. 1개월 선택 시 승인 결과 endDate가 기존(다음달 말일)과 동일 → 회귀 없음 확인
4. 3/6/12개월 선택 시 endDate가 개월수만큼 연장 → 확인
5. 입금액 = Σ(월요금×개월수)로 폼·admin 동일하게 표시 → 확인
6. i18n: 신규 문자열 ko/en 동시 (해당 시) — 단, signup 폼은 현재 하드코딩 한국어라 기존 패턴 유지

## 미해결/확인 필요
- `depositTotal` 필드명/요약 라벨 "총 입금액" 문구 OK인지 (아니면 그대로 진행)
