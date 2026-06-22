# 24시간 미입금 → 신청취소 고지 + 솔라피 문자 + 어드민 알림

## 결정 사항 (사용자 확인 완료)
- **취소 처리**: 자동취소 스케줄러는 만들지 않음. "고지 + 문자 안내"만. 단, **어드민에 24시간 경과 미입금 건을 알려주는 창**을 추가해서 운영자가 직접 정리할 수 있게 함.
- **문자 범위**: **신규 입금안내 문자(`buildPaymentGuide`)에만** 24시간 문구 추가. 연장은 화면 고지로만 안내(신청 시점 문자 추가 안 함).
- **톤**: 정중하고 친절하게.

## ⚠️ 중요 발견 (알림톡 템플릿)
스크린샷의 입금안내 메시지는 신청 시 자동 발송되는 `notifyNewSignup`(`functions/src/notifications.ts`)가 보낸 **알림톡(카카오 템플릿 `SIGNUP_PAYMENT`)**. 알림톡 본문은 카카오 등록 템플릿이라 **코드로 변경 불가** → 솔라피/카카오 콘솔에서 템플릿 수정 후 재검수 필요. 코드로 바꿀 수 있는 건 (1) 알림톡 실패 시 SMS 대체문구 `smsText`, (2) 어드민 수동발송 `buildPaymentGuide`.

## 현황 (리서치 결과)
- 신규 신청: `signups` 저장(status `pending`) → **자동**으로 `notifyNewSignup`가 알림톡(SMS fallback) 발송. 어드민 "💬 카톡 발송"은 `buildPaymentGuide`로 수동 SMS 발송도 가능. 입금 확인 시 `accountPending`.
- 연장 신청: `renewalRequests` 저장(status `pending`) → 화면에 계좌만 표시, 신청 시점 문자 없음. 입금 확인 후 완료 알림 발송.
- 솔라피 연동(`functions/src/sms.ts`)은 이미 완비 — 추가 인프라 불필요.

## 변경 작업

### 1. 사이트내 고지 (신규 + 연장, 둘 다)
- **(a)** `src/components/signup/signup-form.tsx` — 신청 완료(`done`) 화면 하단에 24시간 고지 한 줄 추가.
- **(b)** `src/components/account/renewal-modal.tsx` (~512행) — "입금 확인 후 1~2영업일 내 연장" 문구 옆/아래에 24시간 고지 추가.
- **(c)** `src/data/site.ts` (~287행) — FAQ "결제는 어떻게 진행되나요?" 답변에 24시간 정책 문장 추가.

### 2. 솔라피 문자 (신규 입금안내만)
- `src/lib/messages.ts` `buildPaymentGuide()` — 메시지 끝에 24시간 고지 문구 추가.

### 3. 어드민 24시간 미입금 알림 창
- `src/components/admin/admin-shell.tsx` — 24시간 경과 & 미확인 건 계산 후 상단 배너 표시.
  - 신규: `status === "pending"` && `createdAt < now - 24h`
  - 연장: `pendingRenewals` 중 `createdAt < now - 24h` (연장 pending = 전부 미확인)
  - 배너 클릭 시 해당 드로어(신청/연장) 열기.

## 제안 문구 (수정 환영)
- **사이트 고지(신규/연장 공통)**:
  > "신청 후 24시간 이내에 입금이 확인되지 않으면 신청이 자동으로 취소될 수 있어요. 입금이 어려우시면 편하게 말씀해 주세요 🌱"
- **문자(`buildPaymentGuide` 끝)**:
  > "※ 신청 후 24시간 이내에 입금이 확인되지 않으면 신청이 취소될 수 있어요. 입금이 어려우시면 편하게 알려주세요 🌱"
- **어드민 배너**:
  > "⏰ 24시간 경과 미입금 N건 (신규 X · 연장 Y) — 입금 안 된 신청을 정리해 주세요"

## 검증
- `npm run build` 통과
- 신청 완료 화면 / 연장 모달 / FAQ에 고지 노출 확인
- `buildPaymentGuide` 미리보기(어드민 카톡 발송 모달)에 문구 포함 확인
- 어드민에서 24h 경과 미입금 배너 노출(데이터 있을 때) 확인
