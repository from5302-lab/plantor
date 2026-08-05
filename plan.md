# 1:1 수업 분류 통합 — plan

작성: 2026-07-29
상태: **① 분류 플래그 [완료·배포] / ② 데이터 이관 [스크립트 준비 완료 · 7/31 연장 처리 후 실행]**

## 목표 (사용자 확정)
> "신청서로 학부모가 신청하든, 내가 계정을 만들든 **같은 DB로** 정리하고 싶다"

## 확정된 결정
1. 그룹 수업(오씨 3남매 510,000원) → **3명에게 분할** (170,000×3)
2. 계정 없는 학생(정휘운·최가은) → **계정 만들고 이관**
3. 부모 등록명이 별칭("휘운맘"·"3쌍둥이") → **별칭 그대로 생성**
4. 실행 시점 → **7/31 연장 처리 후**
5. 1:1 붙은 강의는 분류 통일

## ① 분류 플래그 — [완료] 2026-07-29 배포
이호영 `vibe-coding`은 **슬러그를 바꾸지 않았다.** 이유:
- 아이콘·가격·수업 URL(`coken-vibe.web.app`)·계정발급 안내가 슬러그에 묶임
- 신청 폼에서 계속 `vibe-coding`으로 들어와 **바꿔도 또 분리됨**

→ 대신 `Service.isOneOnOne` 플래그 + `isOneOnOneService()` 헬퍼 도입 ([site.ts](src/data/site.ts)).
`members-tab`의 1:1 판정 4곳을 헬퍼로 교체 → 이호영 코딩이 🎓 필터·1:1 집계에 잡힘.
신청 폼으로 새로 들어와도 자동 분류됨.

## ② 데이터 이관 — 스크립트 준비 완료, 실행 대기
`scripts/migrate-direct-to-subscription.js` (`--dry-run` 지원)

**드라이런 검증 결과 (2026-07-29):**
- families 생성 5 · children 생성 2 · familyId 교정 5
- 구독 생성 8건 · 수업일지 73건 전부 childId 태깅
- **금액 2,270,000원 → 2,270,000원 ✅ 일치**

**조사 중 발견한 핵심 문제:**
`children.familyId`가 families가 아니라 **directClasses.id**를 가리키고 있었다(박하진·진하율·오씨 3남매).
→ 학부모 계정이 실제로 없어서, 이관 후 구독 알림(`families.phone` 조회)이 **끊길 뻔했다.** 스크립트에서 families 생성 + familyId 교정으로 해결.

**directClasses 처리 방식 (중요):**
- `status`는 **active 유지** — 바꾸면 수업일지·플랜탭이 `where(status==active)`라 사라짐
- 대신 `tuition=0`, `expiry=null` — 정산(`use-admin-billing`)은 status를 안 보고 expiry+tuition만 보므로 이렇게 해야 **이중 계산이 안 생김**. 알림도 expiry 매칭이라 제외됨
- 삭제하지 않음 → 수업일지 보존

**백업:** 스크래치패드에 `backup-directclasses-20260729-2121.json` (directClasses 6 + lessonLogs 73)

## 실행 순서 (7/31 연장 처리 후)
1. `node scripts/migrate-direct-to-subscription.js --dry-run` — 금액 일치 재확인
2. 백업 다시 한 번 (연장 처리로 데이터가 바뀌었을 수 있음)
3. `node scripts/migrate-direct-to-subscription.js` 실행
4. 검증: 1:1 총액(구독 기준) = 이관 전 총액, 🎓 필터에 8건 노출, 수업일지 정상
5. 필요 시 정휘운·최가은 로그인 계정(loginId/Auth) 별도 발급

## 남은 주의사항
- **정휘운은 부모 전화번호가 없다** — 학부모가 **중국 거주자**라 국내 번호가 없음(입력 누락 아님). 이관 후에도 만료 알림은 발송 불가하며, 연장 안내는 사용자가 별도 수단으로 처리. families.phone은 빈 값으로 두고 임의 값을 넣지 말 것
- 생성되는 children의 `loginId`는 빈 값 — 학습 기능을 쓰려면 별도 계정 발급 필요
- 이관 후 `notifyExpiringDirectClass*` 함수 3개는 대상이 0건이 되지만, 잔여 데이터 확인 전까지 **제거하지 말 것**
