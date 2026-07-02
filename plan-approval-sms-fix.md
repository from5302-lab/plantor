# 가입 승인 문자(approveSignup SMS) 복구

## 문제 (현재 vs 운영 스냅샷 9d81aeb 비교)
현재 `approveSignup`의 승인 문자에 회귀 2건:
1. **학부모 비번이 `012345`로 하드코딩**(auth.ts:441) — 실제 계정은 신청폼에서 학부모가 정한 `password`로 생성됨(auth.ts:113) → 문자대로 넣으면 로그인 실패. (문미희 로그인 실패의 실제 원인)
2. **자녀 로그인 안내 블록 삭제됨** — `svcMap`(과목별 학생/학부모 접속 URL)을 계산(398~406)만 하고 문자에 안 붙임. 예전엔 자녀 아이디 + 과목별 접속 링크가 나갔음.

## 결정 (사용자 확정)
- **핵심: 자녀가 "어느 사이트에 가서 어떤 아이디로 로그인하는지" 문자로 안내 복원.** (최우선)
- 외부 과목 사이트 로그인 = 플랜토 발급 아이디(loginId) + 012345 (별도 외부계정 발급 없음).
- 학부모 비번 하드코딩(012345) 이슈는 이번 범위에서 보류 — 자녀 안내에 집중.

## 수정 (functions/src/auth.ts, `approveSignup`의 smsText만)

### 1. 학부모 비번 라인
```
아이디: ${parentId} / 비번: 012345
→ 아이디: ${parentId} / 비번: ${password}
```
(`password`는 이미 line 85에서 destructure된 지역 const라 batch에서 필드 삭제돼도 메모리에 있음)

### 2. 자녀 로그인 블록 복원 (smsText 조립부에 삽입)
`children`을 돌며 자녀별로:
```
📚 {자녀명} 로그인
아이디: {loginId} / 비번: 012345
· {과목명} 학생: {studentUrl}
· {과목명} 학부모: {parentUrl}   (parentUrl 있을 때만)
```
- URL은 기존 `svcMap`(DEFAULT_URLS + serviceOverrides 머지) 사용.
- URL 없는 과목은 링크 라인 생략(아이디/비번은 표시).
- 삽입 위치: "로그인 후 … 확인하실 수 있어요." 다음, extraLines(카톡 채널 등) 앞.

기존 유지: 👉 SITE_URL, class5 레벨테스트, AI패키지 블록, 카톡 '플랜토' 채널, 맘이랑 오픈톡방.

## 검증
1. `cd functions && npx tsc --noEmit` → 에러 0
2. 함수 배포: `firebase deploy --only functions:approveSignup --project plantor-from302`
3. (운영) 문미희는 이미 잘못된 문자 수신 → 어드민 🔑로 012345 초기화 후 재안내. ← 코드 아님, 운영 조치

## 범위 밖 (건드리지 않음)
- 신청폼(signup-form.tsx) 비번칸 — 유지
- 계정 생성 로직(getOrCreateAuthUser 등) — 유지
- 자녀 비번은 계속 012345
