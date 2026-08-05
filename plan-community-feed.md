# 리워드 자랑 피드 (`/community`) — plan

작성: 2026-08-01
상태: **승인됨 · 구현 중**
전제: `plan-reward-system.md` 1~6단계 완료(미배포)

## 0. 한 줄 요약
`/community`를 **인증샷 피드 → 리워드 이벤트 스트림으로 전면 교체**한다.
학생이 쓰는 글은 없다. 뱃지·레벨·칭호·아이템이 **서버에서 자동으로 기록**되고,
읽기는 누구나, **엄지척만** 로그인 회원이 누른다.

## 1. 왜 (a) 전면 교체인가
- 인증샷 서비스는 애초에 XP·뱃지 대상이 아니다 (`plan-reward-system.md §8`)
- `learningLogs`가 `allow read: if true` 라서 **비로그인 상태로 전 학생 상세 점수(`scrapedData`)가 읽힌다** → 이번에 닫는다
- 인증샷에는 학습 사이트 실명이 찍힐 수 있다. 리워드 이벤트는 닉네임+아바타만 담는다

## 2. 설계 결정

| 결정 | 이유 |
|---|---|
| **히든 뱃지 조건은 피드에 절대 노출 안 함** | `plan-reward-system.md §5.0`이 무너진다. 이름+아트+희귀도만. 공개 뱃지(연속 4종)만 조건 표기 |
| **XP 낱개는 이벤트로 안 만듦** | 배치 4회+클릭으로 하루 최대 20회 재계산 → 소음. 대신 `daily` 요약 1건을 갱신 |
| **랭킹 없음, 시간순만** | 상위 독점 시 하위 학생 위축 (`§1` 원칙과 충돌) |
| **엄지척에 포인트 보상 없음** | 품앗이 방지 |
| **엄지척은 `likes/{uid}` 문서 ID 고정** | 1인 1회가 rules로 구조적으로 강제됨 |
| ~~표시명은 닉네임만~~ → **실명 + 학년 공개** | 2026-08-05 사용자 확정으로 변경 (아래 참고) |
| **학습 내용 공개** | 어느 사이트에서 무엇을 했는지(교재·유닛명·점수)를 하루 요약 카드에 표시 |

### 표시명 정책 변경 (2026-08-05)
`plan-reward-system.md §5.7`은 "실명은 어떤 경우에도 넣지 않는다"였으나,
**사용자가 공개 범위를 확인한 뒤 "완전 공개 유지 + 실명·학년"으로 재확정**했다.
- 피드 카드: `중2 정승원` (학년 뱃지 + 실명), 닉네임 미표시
- 닉네임(`새싹310`)은 뱃지함·상점·공유 카드에서 계속 쓴다
- **미결**: 뱃지 공유 카드(PNG)는 아직 `§5.7`대로 닉네임만 쓴다. 피드와 정책이 갈린 상태

### 이벤트 종류
| type | 멱등 키 | 내용 |
|---|---|---|
| `badge` | `{childId}_badge_{code}` | 뱃지 획득 (조건 문구 제외) |
| `title` | `{childId}_title_{name}` | 칭호 승급 — 9번뿐이라 가장 큰 카드 |
| `level` | `{childId}_level_{n}` | 레벨업 (칭호도 바뀐 레벨업은 `title`만) |
| `item` | `{childId}_item_{itemId}` | 아이템 구매 |
| `daily` | `{childId}_daily_{date}` | 그날 XP·완주 과목수·연속. 재계산 시 **내용만 갱신, `createdAt` 고정** |

## 3. 데이터 모델
```
feedEvents/{eventId}
  type, childId, nickname, equipped{}, level, title,
  badgeCode·badgeName·emoji·rarity·growth   (type=badge)
  itemId·itemName·emoji·rarity              (type=item)
  date·xp·doneCount·streak                  (type=daily)
  likeCount, createdAt

feedEvents/{eventId}/likes/{uid}    ← 문서 ID = uid (중복 불가)
  createdAt
```

## 4. 발생 지점
- `awardRewards()` — 트랜잭션 **밖**에서 `recordRewardFeed()` 호출. 실패해도 적립은 성공 상태로 둔다
- `purchaseShopItem()` — 구매 성공 후. 착용(equip)은 너무 잦아 이벤트로 만들지 않는다
- `children.feedOptOut === true` 면 전부 건너뛴다

## 5. 작업 목록

| # | 작업 | 상태 |
|---|---|---|
| 1 | `functions/src/feed-events.ts` — 이벤트 기록 + 엄지척 카운터 2종 | [완료] |
| 2 | `rewards.ts` — 트랜잭션이 피드 입력값을 함께 반환, 밖에서 기록 | [완료] |
| 3 | `rewards-api.ts` — 구매 이벤트 + `setFeedOptOut` 콜러블 | [완료] |
| 4 | `firestore.rules` — `feedEvents` 공개 읽기 / `likes` uid 고정 / `learningLogs` 공개 읽기 폐쇄 | [완료] |
| 5 | 프론트 교체 — `feed-list` · `feed-event-card` · `thumbs-button` | [완료] |
| 6 | 인증샷 피드 제거 — `feed-tab`·`feed-card`·`report-button`·`functions/src/feed.ts` | [완료] |
| 7 | `/learn` 리워드 패널에 피드 공개 토글 | [완료] |
| 8 | 타입체크 · lint · 정적 빌드 | [완료] |

## 6. 배포 — **완료 (2026-08-01)**
- firestore:rules released / hosting released / functions 배포
- 신규 함수: `onFeedLike` · `onFeedUnlike` · `setFeedOptOut`
- 갱신: `purchaseShopItem` · `verifyAutoProgress` · `autoVerifyScheduled` · `runAutoVerifyNow`
- 삭제: `onFeedReport` (인증샷 신고 트리거 — 신고 기능 폐지로 고아)
- 라이브 확인: `/community` 비로그인 상태에서 헤더 + 빈 상태 정상 렌더, 콘솔 에러 없음

### 걸린 것
- 1차 배포에서 **hosting이 upload까지만 되고 release 전에 중단**됐다. functions 단계의 고아 함수 검사가
  non-interactive 모드에서 배포 전체를 abort시켰기 때문. `--only hosting`으로 재배포해 해결
- **`updateChildLoginId`가 프로젝트에 남은 고아 함수**(이번 작업과 무관, 이전부터 소스에 없음).
  이게 남아 있는 한 `--only functions` 전체 배포는 계속 abort된다 → 삭제 여부 확인 필요

## 7. 코드정리 (2026-08-01)
인증샷 피드를 걷어내며 write-only가 된 `learningLogs` 필드를 제거했다.
- `displayId` · `grade` — 옛 공개 피드가 `학년 + pln_xxxx`를 띄우려 넣던 값. 읽는 곳 0
- `reportCount` — 신고 기능 폐지로 읽는 곳 0
- `flagged`는 **유지** — `learn-dashboard`가 완료 집계에서 제외하는 데 아직 읽는다.
  다만 `true`로 바꾸던 `onFeedReport`가 삭제돼 실질적으로 항상 false다(박제 개념 폐지 여부는 미결)
