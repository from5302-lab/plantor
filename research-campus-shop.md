# 리서치 — 상점 내부를 Kenney Mini Market 으로

2026-08-12. 레퍼런스: https://kenney.nl/assets/mini-market (CC0)

## 현재 상점 내부 (union 레벨)

- 방은 하나뿐이다: `ROOMS`의 `lounge`(이름 '매장', x 7.5 z 1, **13×8m**, 문 북쪽 z=-3).
  현관(`HALLS.union`)은 z -6~-3, 출구는 북쪽 z=-6. ([map.js:195](public/campus/lib/map.js:195))
- 고정 가구는 5개가 전부고, 이름부터 **휴게실**이다 ([map.js:251-258](public/campus/lib/map.js:251)):
  - `lounge-sofa-a/b`(loungeSofa), `lounge-table`(table), `lounge-vending`(kitchenFridgeLarge),
    `shop-counter`(kitchenBar, 11.5/3.2)
  - 전부 Furniture Kit 모델 — 상점이 아니라 거실처럼 보이는 원인.
- 상호작용은 좌표 기반이라 가구와 독립적이다:
  - 매점 존: x 9.6~13.6, z 1.4~2.8 (카운터 앞) → Space로 `openShop()` ([map.js:666](public/campus/lib/map.js:666))
  - 매점쌤 NPC: (11.5, 4.4) 카운터 뒤, yaw π ([map.js:789](public/campus/lib/map.js:789))
  - 스폰: (7.5, -4.6) yaw 0 — 매점쌤을 마주 보게 되어 있다.
- 벽·바닥은 buildIndoor 가 공통으로 깐다(Furniture Kit `wall` 인스턴싱 + `floorFull` 타일).
  방 지오메트리는 건드릴 필요 없음.

## Mini Market 팩 현황

- `assets/kenney/mini-market/` 에 **이미 받아져 있다** (GLB 20종 + colormap).
- mini-* 계열이라 캐릭터(mini-characters)와 같은 팔레트 문법 — 톤이 맞는다.
  레퍼런스 렌더의 보라·회색 톤이 그대로 온다.
- 실측 크기(Blender bbox, 단위 유닛):

  | 모델 | W×D×H | 용도 |
  |---|---|---|
  | cash-register | 0.85×0.85×0.59 | **계산대**(카운터+금전등록기 일체) |
  | shelf-boxes / shelf-bags | 0.8×0.7×0.85 | 양면 곤돌라 진열대(과자/봉지) |
  | shelf-end | 0.8×0.4×1.05 | 벽붙이 엔드 진열대 |
  | freezer | 0.8×0.6×0.35 | 평대 냉동고 |
  | freezers-standing | 1.0×0.5×0.9 | 벽면 냉장 쇼케이스 |
  | display-bread / display-fruit | 0.7×0.6×0.5 | 빵·과일 매대 |
  | bottle-return | 0.45×0.48×1.09 | 공병 수거기(초록 포인트 컬러) |
  | shopping-cart / basket | 0.3~0.35 | 카트·장바구니(소품) |
  | column, wall\*, floor, fence\* | — | 구조물(우리 방 구조와 중복) |
  | character-employee | — | 점원 캐릭터(매점쌤이 이미 있음, **이름 충돌** 주의) |

## 파이프라인 (기존 그대로 재사용)

- 굽기: `scripts/campus-prep-kit.py` (blender, 텍스처 embed) →
  `public/campus/models/kenney/kit/*.glb`. KIT_LIST 로 출력 이름을 지정한다.
- ⚠ **이름 충돌**: mini-market 의 `wall.glb`·`floor.glb`·`fence*.glb` 가 kit/ 의 기존
  파일과 겹친다 → 기존 관례(ft-, fu-, pf-)대로 **`mm-` 접두사**로 굽는다.
- 로드: [map.js:70](public/campus/lib/map.js:70) 부팅 `loadKit([...])` 목록에 추가
  (mini GLB는 개당 수십 KB, 부담 없음).
- 배치: `PROPS`(충돌 상자) + `PROP_KIT`(모델·스케일·방향) 매핑. 기존 패턴 그대로.
- 스케일 감: 캐릭터 키 1.3m 기준. mini 팩 원본 1유닛 ≈ 캐릭터 어깨 높이.
  진열대(0.85)를 가슴 높이 ~1.1m 로 두려면 **scale ≈ 1.3**, 계산대는 허리(~0.9m)로
  scale ≈ 1.5. 구현 때 렌더 보며 미세조정.

## 검증 방법

- 로컬 서버 금지(사용자 규칙) → `node --check` 문법 확인 + 배포 후 라이브 확인.
- 작업트리에 다른 세션 미커밋 변경이 섞여 있음 → 배포 시 **격리 워크트리**에서
  빌드·배포(campus-state 메모리의 절차).
