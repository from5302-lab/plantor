# Plan: 메시지 발송 "알림톡 우선" 통일

> 작성일: 2026-05-31
> 상태: 검토 대기 (승인 전 구현 금지)

## 목표
고객이 "어떤 땐 문자, 어떤 땐 알림톡"으로 혼란 → **모든 고객 메시지를 알림톡 우선**으로
통일. 알림톡 불가(카톡 미설치·채널차단·발송실패) 시에만 문자 fallback.
→ 카톡 받는 고객은 항상 카톡, 못 받는 고객은 항상 문자 = **고객별 일관성** 확보.

## 현재 상태 (분석 완료)
- 이미 알림톡: 가입입금·구독만료·직강만료·학습완료·연장확인 (5종, KAKAO_TEMPLATES 등록됨)
- 아직 문자(sendSms): **3종** ← 이걸 알림톡으로 전환
  1. 비밀번호 초기화 [auth.ts:502]
  2. AI 패키지 입금확인 [auth.ts:637]
  3. 가입 승인 안내 [auth.ts:356] ← 동적 블록 많아 까다로움(아래 참고)
- fallback 구조([sms.ts:71])는 그대로 유지(불가피). 단 이제 "기본=알림톡"으로 통일.

---

## 선행(필수) — 카카오 알림톡 템플릿 신규 등록 ※ 사용자 작업
코드로 불가. Solapi 콘솔에서 템플릿 등록 → 카카오 심사 통과 → 템플릿ID 발급받아야 함.
아래 초안으로 등록 후, 발급된 ID를 `KAKAO_TEMPLATES`에 넣으면 코드가 연결됨.

> ✅ 템플릿 유형 = **기본형(텍스트)** 로 등록. 이미지형 X (이미지 제작·심사 부담만 큼, 정보성 알림엔 불필요).

### 템플릿 A — PASSWORD_RESET (비밀번호 초기화)
```
[플랜토] #{parentName}님, 비밀번호가 초기화됐어요.

새 비밀번호: #{newPassword}

로그인 후 비밀번호를 변경해 주세요.
```
- 변수: `#{parentName}`, `#{newPassword}`  / 버튼: 웹링크 "로그인하기" → plantor.web.app
- 비고: 정보성 알림톡이라 계정/비번 안내 허용. 이모지 없이 등록(심사 안전).

### 템플릿 B — AI_PACKAGE_CONFIRM (AI 패키지 입금확인)
```
[플랜토] #{parentName}님, Mom& AI 패키지 입금이 확인되었어요.

ChatGPT · 제미나이 · 캔바 공유 계정을 이용하실 수 있습니다.

이용 기간: ~#{expiry}
학부모 계정으로 로그인하면 상단 [AI 패키지] 탭이 생성됩니다.
```
- 변수: `#{parentName}`, `#{expiry}` / 버튼: 웹링크 "바로가기" → plantor.web.app

### 템플릿 C — SIGNUP_APPROVED (가입 승인 안내) ※ 리스크 있음
```
[플랜토] #{parentName}님, 가입이 승인됐어요!

아이디: #{parentId} / 초기비밀번호: 012345
로그인 후 학습 사이트 접속과 자녀 학습 현황을 확인하실 수 있어요.
#{extra}
```
- 변수: `#{parentName}`, `#{parentId}`, `#{extra}`(조건부 안내/링크 묶음)
- 버튼: 웹링크 "로그인하기" → plantor.web.app
- ⚠️ 리스크: 현재 가입안내엔 **오픈톡방·레벨테스트 외부 링크**가 본문에 들어감.
  알림톡 본문 내 URL·오픈채팅 홍보링크는 심사 거절 가능. 옵션:
  - (C-1) `#{extra}`에서 링크 제거하고 안내문만 → 링크는 별도 버튼/문자로
  - (C-2) 가입 승인만 **문자 유지** (가장 안전, 통일성은 약간 양보)
  - ✅ **결정: C-2 (가입안내는 문자 유지)**. 단, 그 문자에 **카카오톡 채널 추가 안내 한 줄 추가**
    → 고객이 채널을 친구추가하면 이후 알림톡 도달률↑. (필요 입력: 채널 추가 링크/검색ID — 코드에 없음)

---

## 코드 작업 (템플릿 ID 발급 후)

### Step 1. config.ts — KAKAO_TEMPLATES 에 신규 ID 추가
- `PASSWORD_RESET`, `AI_PACKAGE_CONFIRM` (+ 채택 시 `SIGNUP_APPROVED`)

### Step 2. sendSms → sendAlimtalk 전환
- [auth.ts:502] 비번초기화: `sendAlimtalk(phone, PASSWORD_RESET, {parentName, newPassword}, smsText(=기존문구 fallback), ...)`
- [auth.ts:637] AI패키지: `sendAlimtalk(phone, AI_PACKAGE_CONFIRM, {parentName, expiry}, smsText, ...)`
- (C-1 채택 시) [auth.ts:356] 가입안내도 동일 패턴 + `#{extra}`
- 기존 `smsText`는 그대로 **fallbackText**로 재사용 → fallback 시 문구 동일.
- → verify: 함수 빌드 통과, 알림톡 실패 시 문자로 동일 내용 발송

### Step 3. 배포 + 검증
- `firebase deploy --only functions`
- 테스트 발송(어드민 테스트 기능/실제 1건)으로 알림톡 수신 확인
- → verify: 카톡으로 수신, 미수신 번호는 문자 fallback

---

## 확정된 결정
1. ✅ 가입 승인 안내 = **문자 유지** + 채널 추가 안내문 추가
2. 비번초기화·AI패키지 = **알림톡 전환** (템플릿 A·B)
3. 이미 알림톡인 5종 그대로

## 진행 현황 (2026-05-31)
- [완료] 가입 문자에 채널 추가 안내 + 링크(https://pf.kakao.com/_xlxgxdTX), approveSignup 배포
- [완료] 템플릿 2개 이미 등록·심사중(INSPECTING, 텍스트 기본형) 확인 — CLI(`scripts/solapi-template.mjs list/status`)
  - 비밀번호 초기화 `KA01TP260518085232857UYCxn63ljYJ` (변수 #{parentName} #{password}, securityFlag)
  - AI 패키지 입금확인 `KA01TP260518085232905tujFnlMrDoP` (변수 #{parentName} #{endDate})
- [완료] config KAKAO_TEMPLATES 연결 + auth.ts sendSms→sendAlimtalk(비번·AI패키지) 전환, 배포
  - 심사 통과 전: 미승인 템플릿 → Solapi 거절 → smsText 문자 fallback(= 현행). 통과 시 자동 알림톡.
- [대기] **카카오 심사 통과(APPROVED)** — 영업일 1~3일, 우리가 앞당길 수 없음
- [확인예정] 승인되면 `solapi-template.mjs list`로 APPROVED 확인 후 실제 1건 테스트 발송 검증

## 참고 — "이미지" 템플릿 (사용자 질문)
화면의 결제완료/인증번호/가입환영 (이미지)는 2023~2024 등록된 **옛 샘플 템플릿**. 우리 발송과 무관, 무시.

## 하지 않을 것
- fallback 로직 제거 (불가피한 안전장치)
- 이미 알림톡인 5종 변경
