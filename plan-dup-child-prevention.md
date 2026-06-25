# plan — 중복 child 문서 생성 방지

> 작성일: 2026-06-01 / 상태: 검토 대기 (승인 전 구현 금지)

## 목표
회원가입 승인·자녀 추가 시 **같은 학생의 child 문서가 두 번 생성되는 것**을 코드로 막는다.
(이승현 사례: 0.2초 간격 이중 제출 → authUid 동일한 중복 child 2개)

## 현재 데이터 상태
- children 25명, **남은 중복 0** (이승현 정리로 해결). → 데이터 추가 정리 불필요, 코드 예방만 필요.

## 원인 (코드 확인 완료)
child 문서 생성 경로 3곳 모두 **랜덤 문서 ID(`doc()`)** 사용 → 동시 호출이 충돌하지 않고 각각 새 문서를 만듦.
authUid는 `getOrCreateAuthUser`가 같은 loginId면 **항상 같은 값**을 반환 → 이게 멱등 키로 활용 가능.

| 함수 | 위치 | 멱등성 |
|---|---|---|
| `createChildAccount` (자녀 추가) | `functions/src/auth.ts:410` | ❌ **검사 전혀 없음 (주범)** |
| `approveSignup` (가입 승인) | `functions/src/auth.ts:174, 227` | △ 호출 1회 내 dedup은 있으나 **동시 이중 호출 방어 없음**, signup 상태 가드도 없음 |
| `ensureDirectClassAccounts` (직강) | `functions/src/auth.ts:715` | ✅ loginId 검사 있음 (update) |

## 변경안 (핵심)
**child 문서 ID를 랜덤 → 결정적(`childUid`)으로 변경** + 기존 문서 멱등 처리.
→ 동시 이중 호출이 같은 문서 ID에 써서 **중복이 원천 불가**.

### 1. `createChildAccount` (auth.ts:385~432) — 주 수정
- `getOrCreateAuthUser`로 `childUid` 확보 후, 같은 `(familyId, loginId)` child 존재 검사
- 있으면 그 문서 update 후 반환 (멱등), 없으면 `db.collection("children").doc(childUid)`로 생성
- 랜덤 `doc()` → `doc(childUid)` (결정적 ID)

### 2. `approveSignup` (auth.ts:174, 227) — 보강
- 두 생성 지점의 `db.collection("children").doc()` → `db.collection("children").doc(child.uid)`
- 호출 내 dedup 로직(`loginIdToChildRef`/`mergeCache`)은 그대로 — childDocId만 결정적 ID로
- 동시 이중 승인 시에도 같은 child 문서에 써서 중복 방지

### 검증
- `cd functions && npm run build` (타입 통과)
- 결정적 ID 사용이 기존 참조(subscriptions/tasks/studentProfiles 등 childId)와 충돌 없는지 확인 — 모두 child.id 값을 그대로 쓰므로 무관
- 배포 후 테스트 가입 1건 승인 → child 1개만 생성되는지 확인

## 선택 옵션 (원하면 포함)
- **A. signup 상태 가드**: `approveSignup` 시작에 이미 승인된 signup이면 중단 (이중 승인 시 가족·구독 중복까지 방지)
- **B. 구독 결정적 ID**: subscription ID를 `${childId}_${slug}`로 → 동시 호출 시 구독 중복도 방지
- **C. UI 버튼 방어**: 승인/추가 버튼 disabled 유지 강화 (방어심화, 서버 멱등이 본질 해결책이라 우선순위 낮음)
- **D. 상시 점검 스크립트**: children loginId 중복 정기 스캔 (지금은 0이지만 모니터링용)

## 권장
**1 + 2 (핵심)** 만으로 child 중복은 원천 차단됨. A/B는 가족·구독 중복까지 막는 추가 안전장치 — 필요시 함께.
C/D는 부가.

## 진행 현황 (2026-06-01) — 결정: 핵심 + A + B
- [완료] `createChildAccount`(auth.ts) — 존재검사 + 결정적 child ID(`doc(childUid)`) + merge
- [완료] `approveSignup` children — `doc()` → `doc(child.uid)` (2곳)
- [완료] `approveSignup` family(A보강) — `doc()` → `doc(parentUid)` (동시 이중승인 가족 중복 차단)
- [완료] `approveSignup` 시작 가드(A) — 이미 `confirmed`면 중단
- [완료] `approveSignup` subscriptions(B) — `doc()` → `doc(`${childDocId}_${slug}`)` (2곳)
- [완료] 추천보상 중복 방지 — couponWallet·referrals를 `doc(signupId)`로
- [완료] 데이터 확인: children 25명, 중복 0 (추가 정리 불필요)
- [완료] `cd functions && npm run build` 타입 통과
- [대기] `firebase deploy --only functions` 배포
- 보안규칙 확인: families는 userId 필드로 권한 체크 → 결정적 family ID 안전
- 기존 데이터 영향 없음(신규 생성부터 결정적 ID 적용)
