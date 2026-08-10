# 가족 상호작용(부모↔학생) — 리서치 (2026-08-10)

목표: 커뮤니티에 부모와 학생이 서로 주고받을 "거리"를 만든다.
사용자 확정: **우편함(동숲식 편지)을 1차, 매칭 적립(Greenlight식)을 그 첨부물로.**

## 1. 외부 레퍼런스

| 사례 | 가져올 것 | 버릴 것 |
|---|---|---|
| [Animal Crossing 편지](https://nookipedia.com/wiki/Letter) · [편지 채점](https://www.gamedeveloper.com/design/here-s-how-the-furry-denizens-of-i-animal-crossing-i-read-player-mail) | 편지 + 선물 첨부, 비동기 수령(우체통), 성의 있는 글에 답례 | 7종 점수 채점기(과설계) |
| [Greenlight matched savings](https://www.lifehubeducation.com/blog/greenlight-vs-gohenry) | 부모가 **아이가 번 것에 얹는다** — 감독자가 아니라 투자자가 된다 | 실제 화폐·카드 연동 |
| [Strava kudos](https://www.marathons.com/en/featured-stories/strava-chasing-kudos-and-social-recognition/) · NRC cheers | 인정 한 번이 다음 기록을 부른다 | 세그먼트 순위(경쟁) |
| [Apple Watch 활동 공유](https://support.apple.com/guide/watch/share-your-activity-apd68a69f5c7/watchos) | 공유 자체만으로 동기가 생김(대결은 선택) | 7일 대결 점수 |
| [Habitica 파티](https://habitica.fandom.com/wiki/Party) | 공동 목표 | **연대책임 데미지** — 못 한 아이가 가족에게 피해를 주는 구조 |
| [하이클래스 포인트 지급](https://www.hiclass.net/) | 어른이 조건을 걸고 아이가 채운다 | 교사가 사후 채점하는 형태 |

### 설계를 가른 근거
부모 개입은 방식에 따라 부호가 갈린다. 자율성을 지지하는 개입은 아이가 스스로 더 열지만,
통제·감시형은 숨기는 행동을 늘리고 관계를 상하게 한다
([Nuffield](https://www.nuffieldfoundation.org/evidence-and-impact/our-programmes/grown-up/the-monitored-generation),
[arXiv 2503.22995](https://arxiv.org/html/2503.22995)).
→ **부모가 관찰하는 기능은 만들지 않는다. 주고받는 기능만 만든다.**

## 2. 코드베이스 현황 (실측)

### 화폐가 둘이고, 성질이 다르다
| | 위치 | 권위 |
|---|---|---|
| **포인트** | `children/{childId}.points` | **서버만** 씀(`rewards.ts:885`, `rewards-api.ts:67`). XP×0.2(`POINT_RATE`) + 뱃지·레벨업 보너스. `/learn` 아바타 상점에서 200~1500에 쓴다 |
| **벨** | `users/{uid}.campus.bells` | **클라이언트가 씀**. 규칙은 `campus` 필드 자기쓰기만 보고 값은 검증하지 않는다(`firestore.rules:64`) |

→ 부모 선물을 **벨로 주면 값어치가 0**이다(아이가 콘솔로 얼마든 늘릴 수 있다).
선물은 **포인트**여야 한다. 캠퍼스 경제가 클라 신뢰인 건 이번 슬라이스에서 고치지 않는다(기존 상태).

### 읽기 권한이 저장 위치를 결정한다
- `users/{uid}` — **본인만** 읽는다. 부모·자녀가 서로 못 읽는다 → 편지함을 여기 두면 안 된다.
- `children/{childId}/{sub=**}` — **가족 전체** 읽기 + 서버만 쓰기. 편지를 여기 두면 **형제도 읽는다.**
  규칙의 allow 는 덧셈이라 더 좁은 경로를 아래에 써도 좁혀지지 않는다 → 이 와일드카드 안에서는 형제를 못 뺀다.
- 결론: **최상위 `familyMail/{mailId}`** 에 두고, 문서에 `parentUid`·`childUid`를 박아
  `request.auth.uid` 와 직접 비교한다. `get()` 0회, 형제 제외.

### 자녀 계정 해석
`rewards-api.ts:resolveChild()` 가 이미 표준 경로다 — `users/{uid}.plantor_id`(없으면
`@plantor.app` 이메일 폴백) → `children.loginId` 조회. 부모는 `families.userId == uid`.
편지 보낼 때 서버가 이 경로로 `childUid`를 확정해 문서에 넣는다.

### 붙일 자리
- 부모: `src/components/parent/parent-dashboard.tsx` (자녀별 카드가 이미 있다)
- 학생: `src/components/learn/reward-header.tsx` / `reward-panels.tsx` (리워드 영역)
- 캠퍼스 3D 우체통: `public/campus/lib/map.js` — **v1에서는 안 만든다**(아래)

### 전달 보장 문제
캠퍼스 우체통만 입구로 두면, 캠퍼스에 안 들어가는 아이에게는 편지가 영원히 안 닿는다.
→ v1은 plantor 본체(React)에 편지함을 만들고, 캠퍼스 우체통은 **같은 데이터의 두 번째 입구**로 v2에 붙인다.

## 3. 미결 → 기획서에서 확정한 것
- 공개 피드 노출 여부 → **안 한다**(편지 없는 아이가 드러난다)
- 형제 열람 → **막는다**
- 알림 → 앱 내 안 읽음 표시만. SMS·푸시 안 씀(비용·소음)
