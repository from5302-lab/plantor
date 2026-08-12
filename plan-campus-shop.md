# 기획 — 상점 내부: Kenney Mini Market 레퍼런스

목표: union 레벨 '매장'을 휴게실(소파·테이블·자판기)에서 **진짜 마트 내부**로 바꾼다.
레퍼런스 렌더의 구성 요소 — 계산대 줄, 중앙 곤돌라 진열대, 벽면 냉장 쇼케이스,
과일·빵 매대, 공병 수거기, 카트·장바구니 — 를 13×8m 방에 옮긴다.

방 구조(벽·바닥·문)와 상호작용(매점 존·매점쌤·openShop)은 **그대로 둔다.**
바뀌는 건 가구와 그 충돌 상자뿐이다.

## 1. 에셋 굽기 → 검증: kit/ 에 mm-*.glb 11개, 각각 텍스처 embed

`campus-prep-kit.py` 로 mini-market 11종을 **`mm-` 접두사**로 굽는다
(`wall`·`floor`·`fence` 가 기존 kit 파일과 이름이 겹치므로 접두사 필수):

| 소스 | 출력 |
|---|---|
| cash-register | kit/mm-register |
| shelf-boxes / shelf-bags / shelf-end | kit/mm-shelf-boxes · mm-shelf-bags · mm-shelf-end |
| freezers-standing / freezer | kit/mm-fridge · mm-freezer |
| display-fruit / display-bread | kit/mm-display-fruit · mm-display-bread |
| bottle-return | kit/mm-bottle-return |
| shopping-cart / shopping-basket | kit/mm-cart · mm-basket |

(character-employee 는 안 들인다 — 매점쌤이 이미 있고, 파일명 충돌 전례가 있는 팩이다)

## 2. map.js 배치 → 검증: node --check 통과

기존 union 가구 5개(`lounge-sofa-a/b`·`lounge-table`·`lounge-vending`·`shop-counter`)와
PROP_KIT 매핑을 지우고, 아래로 교체한다. 좌표는 방(x 1~14, z -3~5), 문(7.5, -3) 기준.

```
              z=-3 (문 x7.5)
  ┌────────────┬문┬─────────────┐
  │ 공병수거기        카트·바구니  │      · 문→계산대 큰길(x 7.5~9.5)은 비워 둔다
  │ ┌곤돌라 3칸┐            ┌쇼┐ │      · 곤돌라 2줄은 서쪽에 몰고
  │ └(z=-0.6)─┘            │케│ │        동쪽 벽은 냉장 쇼케이스 3대
  │ ┌곤돌라 3칸┐            │이│ │      · 계산대 2대는 기존 카운터 자리
  │ └(z= 1.6)─┘            └스┘ │        (매점 존 x9.6~13.6 z1.4~2.8 앞)
  │ 과일 빵  평대냉동×2 [계산대2] │      · 매점쌤(11.5, 4.4)은 계산대 뒤 그대로
  └──────────────────────────────┘
              z=5
```

- **계산대**: mm-register ×2 — (10.6, 3.5) · (12.3, 3.5), 손님 쪽(-z)을 본다.
  허리 높이(~0.9m, scale ≈1.5). 매점 존·매점쌤·스폰 방향과 그대로 맞물린다.
- **냉장 쇼케이스**: mm-fridge ×3 — 동쪽 벽 x≈13.3, z −1.8 / −0.3 / 1.2, 서향.
- **곤돌라**: mm-shelf-boxes·mm-shelf-bags 섞어 3칸씩 2줄 —
  z=−0.6 줄: x 3.5 / 4.6 / 5.7 · z=1.6 줄: 같은 x. 가슴 높이(~1.1m, scale ≈1.3).
  줄 사이·서쪽 벽과의 통로는 1.6m 이상.
- **과일·빵 매대**: mm-display-fruit (2.2, 3.9) · mm-display-bread (3.6, 3.9) — 남서 코너.
- **평대 냉동고**: mm-freezer ×2 — (6.6, 4.2) · (8.2, 4.2), 남쪽 벽.
- **공병 수거기**: mm-bottle-return (1.8, -2.3) — 입구 서쪽. 초록이 포인트 컬러.
- **카트·장바구니**: mm-cart ×2 (9.8, -2.2 근처 겹쳐 주차) · mm-basket (8.9, -2.5) — 입구 동쪽.
  작은 소품이라 충돌은 카트만 준다.

각 항목은 prop()(충돌 상자) + PROP_KIT(모델·scale·yaw) 한 쌍. yaw 와 스케일 미세값은
구현 중 실측으로 잡는다(레퍼런스 비율: 진열대=가슴, 계산대=허리, 쇼케이스=키 높이).

부팅 `loadKit([...])` 목록에 mm-* 11종을 추가한다.

## 3. 배포 → 검증: plantor.web.app/campus 라이브에서 상점 확인

1. 캠퍼스 변경만 커밋 (public/campus + 문서)
2. 격리 워크트리(`git worktree add <tmp> HEAD`)에서 빌드 — 다른 세션의 미커밋
   변경(signup·functions)이 딸려 나가지 않게
3. firebase 배포 후 라이브에서 상점 입장 — 배치·톤·매점 존 동작 확인

## 이번에 안 하는 것

- 방 바닥을 mm-floor 타일로 교체 (지금 흰 타일과 톤 차이가 크지 않다)
- 계산대 앞 대기줄 펜스(mm-fence) — 13×8m 방에는 과밀
- 꾸미기 팔레트(decor.js)에 마트 소품 추가 — 원하시면 다음 슬라이스로
- 매점쌤 캐릭터 교체(mini-market employee) — 파일명 충돌 + 지금 매점쌤 유지
