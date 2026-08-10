# 가족 편지함 + 매칭 선물 — plan

작성: 2026-08-10
상태: **검토 대기 — 승인 전 코딩 없음**
근거: `research-community-family.md`

## 0. 한 줄 요약
부모가 자녀에게 짧은 편지를 쓰고, 자녀가 이번 주 번 XP에 부모가 **포인트를 얹어** 함께 보낸다.
자녀는 편지를 열어 선물을 받고 답장한다. **가족 안에서만** 오간다 — 공개 피드에 흔적을 남기지 않는다.

## 1. 설계 결정

| 결정 | 이유 |
|---|---|
| 공개 피드에 안 올린다 | 편지 받은 아이가 자랑이 되는 순간, **편지 없는 아이가 드러난다**. 랭킹을 뺀 이유와 같다 |
| 저장은 최상위 `familyMail/{mailId}` | `users/{uid}`는 본인만 읽어 부모·자녀가 서로 못 본다. `children/{childId}/{sub=**}`는 형제까지 읽는다(규칙 allow 는 덧셈이라 좁힐 수 없다) |
| 읽기 = `parentUid`/`childUid` 직접 비교 | 문서에 uid 를 박아 두면 규칙에서 `get()` 0회. 형제 자동 제외 |
| 쓰기는 콜러블만 | 선물이 포인트라 클라이언트를 믿을 수 없다. 기존 `rewards-api.ts` 와 같은 원칙 |
| 선물은 **포인트**, 벨 아님 | 벨은 `users/{uid}.campus` 자기쓰기라 아이가 마음대로 늘린다 → 부모 선물의 값어치가 0 |
| 부모 임의 지급 없음, **매칭만** | 아이가 번 만큼에 얹는 구조라야 "감독"이 아니라 "투자"가 된다(Greenlight). 임의 지급은 학습 기반 경제를 무너뜨린다 |
| 주 1회 · 상한 200포인트 | 상점가가 200~1500이다. 주간 XP 상한(600/일)이면 매칭 ×1 이 최대 840까지 튈 수 있어 경제가 망가진다 |
| 선물은 **열어야** 받는다 | 편지를 여는 순간이 이 기능의 전부다. 보낼 때 자동 입금하면 아이가 눈치도 못 챈다 |
| 알림은 앱 내 안 읽음 표시만 | SMS·푸시는 비용과 소음. 편지는 급한 정보가 아니다 |
| v1 입구는 plantor 본체 | 캠퍼스 우체통만 두면 캠퍼스에 안 들어가는 아이에게 편지가 안 닿는다 |

## 2. 데이터 모델

```
familyMail/{mailId}
  familyId, childId
  parentUid, childUid          ← 규칙이 읽는 두 값. 서버가 발송 시 확정
  dir: 'toChild' | 'toParent'
  fromName                     ← '엄마' / '승원' 표시용
  text                         ← ≤200자, 서버에서 trim·길이 검증
  gift: null | { kind:'match', weekKey, weekXp, mult, points }
  giftClaimed: boolean         ← toChild + gift 있을 때만 의미
  readAt: Timestamp | null
  createdAt
```

- 멱등 키: 매칭은 `familyMail` 안에 `childId_weekKey` 가 이미 있으면 거절(주 1회).
- `weekKey` = 월요일 기준 `YYYY-Www`.

## 3. 규칙 (`firestore.rules`)

```
match /familyMail/{mailId} {
  allow read: if isAdmin()
    || (request.auth != null && (request.auth.uid == resource.data.parentUid
                              || request.auth.uid == resource.data.childUid));
  allow write: if isAdmin();     // 발송·수령은 콜러블(admin SDK)만
}
```
- 조회 제약: 부모 `where parentUid == uid`, 학생 `where childUid == uid` + `orderBy createdAt desc`.
  → `firestore.indexes.json` 에 복합 인덱스 2개 추가.
- 부모는 자녀 여럿의 편지를 한 번에 받아 클라이언트에서 `childId` 로 나눈다(양이 적다).

## 4. 서버 (`functions/src/family-mail.ts`, 신규)

**`sendFamilyMail({ childId?, text, mult? })`**
1. 호출자 판별 — `families.userId == uid` 면 부모, 아니면 `resolveChild()`(rewards-api 의 것을 export 해 재사용)로 학생.
2. 부모: `childId` 필수 + 그 아이가 내 가족인지 확인. 학생: `childId` = 본인, `mult` 무시.
3. `childUid` 해석 — `children.loginId` → `users` 에서 `plantor_id` 조회. 없으면
   `failed-precondition`("자녀 계정이 아직 없어요").
4. `text` 1~200자. 하루 5통 제한(같은 발신자 `createdAt >= 오늘` count).
5. `mult ∈ {0.5, 1}` 이면 매칭 계산:
   `weekXp` = `children/{childId}/xpLedger` 중 이번 주(월~일) 문서 `xp` 합
   → `points = min(200, round(weekXp * 0.2 * mult))` (`0.2` = `XP.POINT_RATE`)
   → 같은 `childId_weekKey` 매칭이 이미 있으면 `failed-precondition`.
6. 문서 생성. **포인트는 여기서 지급하지 않는다.**

**`openFamilyMail({ mailId })`**
- 호출자 uid == `childUid` 확인 → 트랜잭션으로 `readAt` 기록,
  `gift && !giftClaimed` 면 `giftClaimed=true` + `children/{childId}.points` increment.
- 이미 `giftClaimed` 면 조용히 성공(중복 수령 없음).

**`previewMatch({ childId })`** — 부모 UI 가 보낼 금액을 미리 보여주기 위한 읽기 전용 계산.
(별도 콜러블 대신 `sendFamilyMail` 의 계산 함수를 공유. 부모는 `xpLedger` 를 가족 권한으로 직접 읽을 수 있으므로
**클라이언트에서 합산해 미리보기만** 하고, 확정 금액은 서버가 다시 계산한다 → 콜러블 추가 없음.)

## 5. 프론트

**부모 — `src/components/parent/parent-dashboard.tsx`**
- 자녀 카드에 `편지 쓰기` 버튼 + 자녀 답장 안 읽음 점.
- 모달(`family-mail-compose.tsx`): 200자 입력 · 이번 주 자녀 XP 표시 ·
  매칭 선택(안 얹기 / ×0.5 / ×1) · "승원이가 이번 주 모은 1,240 XP → **124포인트** 얹어 보내기" ·
  이미 이번 주에 보냈으면 매칭 선택지 비활성 + 사유 표기.
- 주고받은 편지 목록(최근 10통).

**학생 — `src/components/learn/reward-header.tsx` 옆**
- 편지 아이콘 + 안 읽은 수 배지 → 패널(`family-mail-panel.tsx`):
  목록 → 열기(봉투 여는 짧은 모션) → 선물 있으면 "+124포인트" 카운트업 → 답장 입력(200자).

**공용** — `src/lib/hooks/useFamilyMail.ts`: uid 기준 구독 + 안 읽음 수.

## 6. 하지 않는 것 (다음 슬라이스)
- 캠퍼스 3D 우체통(v2 — 같은 데이터의 두 번째 입구)
- 벨·아이템 첨부, 부모 임의 포인트 지급
- SMS·푸시 알림, 공개 피드 노출
- 형제 간 편지, 편지 성의 채점(동숲식)

## 7. 검증 → 배포
1. `scripts/test-firestore-rules.mjs` 에 `familyMail` 케이스 추가 —
   부모 읽힘 / 수신 자녀 읽힘 / **형제 막힘** / 남의 가족 막힘 / 클라 직접 쓰기 막힘
2. `npx tsc --noEmit` · `npm run lint` · `npm run build`
3. 인덱스 → 규칙 → 함수 순 배포.
   함수는 고아 함수(`updateChildLoginId`) 때문에 전체 배포가 abort 되므로
   `--only functions:sendFamilyMail,functions:openFamilyMail` 로 좁힌다(`plan-community-feed.md §6` 기록)
4. 라이브 `https://plantor.web.app` 에서 부모 계정 → 학생 계정 왕복 1회 확인

## 8. 태스크
- [완료] `functions/src/family-mail.ts` — 발송·열기 콜러블, 매칭 계산
- [완료] `rewards-api.ts` 의 `resolveChild` export 로 전환(중복 구현 금지)
- [완료] `firestore.rules` + `firestore.indexes.json`
- [완료] `useFamilyMail` 훅
- [완료] 부모 작성 모달 + 대시보드 버튼·안 읽음 점
- [완료] 학생 편지함 패널(`family-mail-box.tsx`) + `/learn` 진입점
- [완료] 규칙 테스트 15/15 통과(형제 차단 포함) · 타입체크 · lint · 정적 빌드
- [ ] 배포 · 라이브 왕복 확인 — **승인 대기**

### 구현하며 정한 것
- 하루 발송 제한은 `senderDay`(=`uid_YYYY-MM-DD`) 한 필드 동등 조건으로 센다 —
  `fromUid` + `createdAt` 범위로 하면 복합 인덱스가 하나 더 필요하다.
- 매칭 주 1회는 `matchKey`(=`childId_그주월요일`) 동등 조회로 막는다.
- 자녀 uid 해석은 `users.plantor_id` → 없으면 `auth.getUserByEmail(loginId@plantor.app)` 폴백.
- 부모가 모달을 열면 자녀 답장은 자동으로 읽음 처리된다(안 읽음 점을 끄는 별도 버튼을 두지 않는다).
