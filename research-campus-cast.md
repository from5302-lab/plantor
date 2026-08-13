# 리서치 — Kenney 리그 에셋 중 캠퍼스에 들일 것

작성 2026-08-12. 대상: kenney.nl 3D 카테고리 **전량 50팩**(사이트 4페이지 목록과
`assets/kenney/` 로컬 라이브러리가 정확히 일치함을 확인).

판정은 눈이 아니라 GLB JSON 청크를 직접 파싱해서 했다. `grep '"skins"'` 로는 못 잡는다.

## 1. 리그가 있는 GLB 전체

### A. 스킨 리그(본) — 8팩 26파일

| 팩 | 파일 | 뼈 | 클립 |
|---|---|---|---|
| mini-characters | female-a~f, male-a~f (12) | 7 | 32 |
| mini-arcade | character-gamer, character-employee | 7 | 32 |
| mini-dungeon | character-human, character-orc | 7 | 32 |
| mini-skate | character-skate-boy, -girl | 7 | 29 |
| mini-arena | character-soldier | 7 | 25 |
| mini-forest | character-archer | 7 | 32 |
| mini-market | character-employee | 7 | 32 |
| platformer-kit | character-oo{bi,di,li,pi,zi} (5) | 6 | 25 |

**mini-\* 9종은 지금 쓰는 12종과 뼈 이름이 글자 단위로 동일하다** —
`root / torso / head / arm-left / arm-right / leg-left / leg-right`, skins 2개.
`avatar-kenney.js` 가 male-a 에서 꺼내 전원에게 물리는 클립이 그대로 붙는다.

platformer-kit oo\* 는 **head 뼈가 없다**(6뼈). 클립은 붙지만 머리 트랙이 죽는다.
2등신 블롭이라 체형도 mini 계열과 다르다 → 캐릭터가 아니라 마스코트/펫 후보.

### B. 노드 계층 리그(본 없음) — 51파일

부위 노드에 TRS 애니가 걸린 방식. `AnimationMixer` 로 똑같이 돌고 오히려 가볍다.

- **cube-pets 24종** — 8클립(`idle/walk/run/eat/dance/gesture-±`), 팩 전체 3.2MB
- blocky-characters 18종 — 27클립. mini 계열과 아트 스타일이 다르다(각진 복셀)
- graveyard-kit 5종(ghost/keeper/skeleton/vampire/zombie) — 32클립
- prototype-kit figurine 4 + animal 3 — 텍스처 없는 회색 프로토타입

### C. 리그는 있으나 GLB 없음

Animated Characters 1/2/3 — FBX 전용(`characterMedium.fbx` + idle/run/jump).
세 팩의 모델 FBX 가 바이트 단위로 동일, 스킨 텍스처만 다르다. 직접 구워야 쓴다.

## 2. 지금 캠퍼스가 캐릭터를 다루는 방식

- `public/campus/lib/avatar-kenney.js` — `MODELS` 12개 배열, `DEFAULT_MODEL='male-a'`
  가 클립 공급원. `TARGET_H=1.30m` 로 정규화. `CLIP` 표가 동작 이름 ↔ Kenney 클립 이름.
- 색 커스텀은 칠하기가 아니라 **UV 이사**다. 어느 정점이 피부/머리/상의/하의인지는
  `public/campus/models/kenney/part-cells.json` 이 들고 있고,
  `scripts/campus-part-cells.py` 가 오프라인에서 뽑는다.
  → **새 캐릭터는 이 표에 항목이 없으면 색을 못 바꾼다.** 등장은 하지만 꾸미기가 죽는다.
  `bald`(민머리 정점) · `builtinGlasses`(안경이 메시에 그려진 모델) 도 같은 파일.
- 전처리 `scripts/campus-prep-kenney.py` — 애니를 기본 1종에만 남긴다.
  ⚠ `character-*.glb` 를 통째로 글롭하고 출력 이름이 `character-` 만 떼는 방식이라,
  **mini-arcade 와 mini-market 둘 다 `character-employee.glb` 라 이름이 충돌한다.**
- 소품은 `kit.js`(로더) + `decor.js`(카탈로그 35종) + `items.js`(상점) 3중 등록.
  텍스처는 `scripts/campus-prep-kit.py` 가 GLB 안에 embed 해 굽는다.

## 3. 그래서 뭐가 "어울리나"

플랜토 캠퍼스는 학원 마을이다. 판정 기준은 아트 톤(mini 계열 팔레트 공유) + 세계관.

**들인다**
- mini-\* 캐릭터 9종 — 뼈·팔레트가 같아 이물감이 0이다. 학생 선택지가 12 → 21종
- cube-pets 24종 — 아기자기한 동물. 마을에 생물이 도는 게 가장 큰 체감 변화
- platformer-kit oo\* 5종 — 마스코트/펫 확장분(선택)

**안 들인다**
- blocky-characters 18 — 각진 복셀. mini 치비 옆에 두면 두 게임이 섞인 꼴
- graveyard-kit 5 — 언데드. 학원 마을 세계관 밖
- prototype-kit — 회색 무텍스처
- mini-arena soldier — 군인. 초중고 대상 서비스에 굳이

## 4. 다른 벤더는 왜 안 쓰나 (2026-08-12 조사, 결론: Kenney 원툴)

무료 CC0 로 리그된 로우폴리를 주는 곳은 있다.

| 출처 | 라이선스 | 포맷 | 무료 물량 |
|---|---|---|---|
| **Kenney** | CC0 | GLB/GLTF/FBX/OBJ | 3D 50팩 **4,681 모델** (리그 77) |
| **KayKit** (kaylousberg.itch.io) | CC0 | GLTF/FBX | 21팩 약 1,500 (리그 캐릭터 9) |
| **Quaternius** (quaternius.com) | CC0 | GLTF/FBX/OBJ/Blend | 80팩+, Universal Animation Library 250애니 |
| **Poly Pizza** (poly.pizza) | 모델마다 다름 | GLB 직접 | 10,600+ (Kenney·Quaternius 포함 애그리게이터) |
| **Mixamo** | Adobe 계정 | **FBX 전용** | 애니메이션 수천 개 + 오토리깅 |

Kenney 4,681 은 로컬 50팩 실측. 단 **리컬러도 개별 파일로 세는 방식**이라
"고유 형태"만 따지면 이보다 훨씬 적다(KayKit 은 unique 와 recolour 를 나눠 표기).

**그래도 안 섞는 이유**는 물량이 아니라 결합도다. 지금 캠퍼스는
① 팩이 달라도 **뼈 7개 이름이 같아서** 클립 한 벌로 전원을 돌리고
② **512×512 팔레트 아틀라스 한 장**을 공유해서 색 커스텀을 UV 이사로 처리한다.
다른 벤더가 들어오면 둘 다 깨진다 — 리타게팅이 필요해지고 `part-cells.json`
방식이 그 캐릭터에는 안 통한다. 계열마다 이중 관리가 되는 값이 물량보다 비싸다.

(KayKit 이 유일하게 앞서는 건 캐릭터 **장비 부착 시스템**이다 — 액세서리 25종이
부착점 기준으로 갈아끼워진다. Kenney 는 안경 2개가 전부. 필요해지면 그때 재검토.)

## 5. 실측 수치

- mini-\* 캐릭터 원본 9개 = 1.8MB → 애니 제거 후 예상 **~360KB**
- cube-pets 24개 원본 3.2MB → 텍스처 embed(colormap 공유분이 파일마다 복제) 시
  오히려 **커질 수 있다**. 24종 전부 굽기 전에 3종으로 재 봐야 한다.
- 현재 `public/campus/models/kenney/` 캐릭터 12종 = 약 1.2MB
