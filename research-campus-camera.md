# 캠퍼스 카메라 기본각 — research

작성: 2026-08-11
목적: 기본 카메라 앵글을 동물의 숲(ACNH) 레퍼런스에 맞춰 조정하기 전, 현재 값과
레퍼런스의 실제 특성을 확인한다.

## 1. 지금 값 (map.js 실측)

| 항목 | 값 | 위치 |
|---|---|---|
| 렌즈 | `PerspectiveCamera(30, …, 0.5, 200)` — 수직 화각 30° | [map.js:94](public/campus/lib/map.js:94) |
| 기본 수평각 `camYaw` | **π/4 = 45°** (대각선 아이소메트릭) | [map.js:998](public/campus/lib/map.js:998) |
| 회전 | J/K · 터치 버튼, **45° 단위** 자유 회전 | [map.js:1255](public/campus/lib/map.js:1255) |
| 야외 반경·높이 | `camR 21.0`, `camH 18.0` → **부감 40.6°**, 거리 27.7m | [map.js:157](public/campus/lib/map.js:157) |
| 실내 반경·높이 | `camR 16.0`, `camH 11.0` → 부감 34.5°, 거리 19.4m | [map.js:158](public/campus/lib/map.js:158) |
| 줌 | 거리 배율 0.18–1.65 (각도는 안 변함 = 달리) | [map.js:1002](public/campus/lib/map.js:1002) |
| 세로화면 보정 | `fit = min(1.7, 1.35/aspect)` 로 거리만 늘림 | [map.js:1847](public/campus/lib/map.js:1847) |
| 곡률 | 야외만 `CURVE_K 0.0015`, 실내 0 | [curve.js](public/campus/lib/curve.js) |
| 바닥·안개 | 흙판 400×400, fog [46,105], 배경 `#f4f8f5` | [map.js:365](public/campus/lib/map.js:365) |

주: [map.js:997](public/campus/lib/map.js:997) 의 `21.8 / 14.2 (부감 33°)` 는 초기값일 뿐
`loadLevel` 이 레벨 값으로 덮어쓴다. 야외의 실제 부감은 **40.6°** 다.

## 2. ACNH 레퍼런스에서 확인된 것

1. **수평 회전이 아예 없다.** 섬에서 카메라를 좌우로 돌릴 수 없다 — 카메라는 월드
   축에 정렬돼 있고, 집은 정면을, 길은 화면 세로·가로를 따라 흐른다. 대각선 구도는
   우편함 같은 편법으로만 나온다. ([Game8](https://game8.co/games/Animal-Crossing-New-Horizons/archives/284301),
   [Animal Crossing World](https://animalcrossingworld.com/2020/05/how-to-take-neat-diagonal-camera-screenshots-in-animal-crossing-new-horizons/))
2. **부감은 3단계**, 오른쪽 스틱을 눌러 전환한다. 기본은 낮은 쪽이고 지평선이 보인다.
   ([TheGamer](https://www.thegamer.com/animal-crossing-new-horizons-bringing-back-gamecube-camera-tilt/))
3. **월드 곡률은 각도를 위해 존재한다.** 각을 낮추면 곡률을 키워 남는 지형을 지평선
   뒤로 감춘다 — 어느 각도에서도 보이는 정보량이 비슷하게 유지되고, 시선이 가까운
   물건에 머문다. ([skylarbeaty/curved-world](https://github.com/skylarbeaty/curved-world),
   [Alastair Aitchison](https://alastaira.wordpress.com/2013/10/25/animal-crossing-curved-world-shader/))
4. **긴 렌즈**로 원근을 죽여 디오라마처럼 보이게 한다. 플랜토도 이미 30°를 쓴다.

## 3. 라이브에서 직접 돌려 본 결과 (plantor.web.app/campus)

`J` 를 한 번 눌러 45° → 0° 로 돌리고 같은 자리에서 비교했다.

- **45°(현재 기본)**: 건물 세 채가 전부 모서리를 앞으로 내민다. 벤치는 대각선으로
  눕고 울타리도 사선이다. 아이소메트릭 전략 게임의 구도다.
- **0°**: 건물이 정면을 보이고, 벤치는 가로로, 울타리는 화면 가장자리와 나란해진다.
  분수는 정원(正圓)에 가깝게 선다. **ACNH 의 구도가 여기다.**

즉 지금 캠퍼스가 동숲과 다르게 보이는 가장 큰 이유는 부감 각도가 아니라
**수평각 45°** 다. 에셋·곡률·렌즈는 이미 동숲 쪽으로 맞춰져 있다.

## 4. 그 다음으로 큰 차이 — 부감 40.6°

ACNH 기본은 지평선이 보이는 낮은 각인데, 캠퍼스 야외는 40.6° 라 하늘이 안 보이고
땅만 보인다. 곡률 셰이더를 이미 넣어 뒀는데(§2-3 이 그 용도다) 각이 높아 효과가
거의 드러나지 않는다.

낮춰도 안전한 근거:
- 바닥이 400×400 이라 각을 낮춰도 판 끝이 안 나온다.
- 안개 색과 배경색이 같아(`#f4f8f5`) 지평선이 흰 하늘로 자연스럽게 녹는다.
- 건물이 시야를 막으면 이미 `fadeOccluders` 가 비춰 준다.

## 5. 건드리면 같이 봐야 하는 것

- **스폰 방향**: 캐릭터 뒷모습이 보이도록 `spawn.yaw` 가 기본 카메라각의 반대로
  맞춰져 있다([map.js:155](public/campus/lib/map.js:155) 주석). 기본각을 바꾸면 야외
  `-3π/4` 는 `π` 가 돼야 한다. 실내 셋(`main` π, `study` 0, `union` 0)은 보이는
  얼굴/뒷모습이 달라지므로 배포 후 확인이 필요하다.
- **이동축**: `syncAxes()` 가 카메라 기준이라 자동으로 따라온다. 손댈 필요 없다.
- **회전 기능 자체**: ACNH 엔 없지만 캠퍼스엔 이미 있다. 없애자는 게 아니라
  **기본값**만 옮기는 문제다.
