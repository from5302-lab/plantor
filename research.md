# 캠퍼스 전면 재설계 — 3D 기술 리서치 (2026-08-10)

목표: 동물의 숲 수준의 웹 3D 캠퍼스. 마을(야외) ↔ 건물 내부 이동, 유저 꾸미기 구역,
캐릭터 최소 커스터마이징, 아이템 획득·조합·상점 거래. 전부 무료 기술/에셋만 사용.

## 0. 폐기 내역 (완료)

- 임시호스팅 프리뷰 채널 `campus-outdoor` 삭제
- 조사용 GLB 32MB(`assets/character-refs/`) 삭제 — 실측 결론은 §3에 흡수
- 폐기된 기획서 `plan-campus-avatar-redesign.md`, `plan-campus-outdoor.md` 삭제
- **유지**: 라이브 `/campus` 전체. ⚠ 라이브 배포본이 **커밋 안 된 작업본**과 일치함
  (map.js·avatar.js·customizer.js·page.tsx·avatar-glb.js·models/). 재설계 착수 전
  이 상태를 커밋해 라이브 소스를 고정할 것.

## 1. 검증 데모 (직접 플레이 가능)

**https://claude.ai/code/artifact/bafdbe10-ae09-477e-bbcc-c74882d0e53d**

three.js 단일 HTML(626KB, 외부 에셋 0)로 핵심 기술 전부를 실증. 헤드리스 브라우저로
전 기능 동작 확인 완료:

| 기술 | 데모에서 확인된 것 |
|---|---|
| 곡면(원통) 월드 셰이더 | 버텍스 셰이더 3줄(`y -= z²·k`)로 동숲 지평선. 실내에선 0으로 끔 |
| 툰 셰이딩 | MeshToonMaterial + 3단 gradientMap. 라이팅 강도가 룩의 80% |
| 3인칭 이동 | WASD/터치 조이스틱, 회전 보간, 걸음 바운스 |
| 아이템 획득 | 나무 흔들기 → 과일 낙하 → 근접 줍기 → 인벤토리 |
| 조합 | 사과×3 → 주스 |
| 실내 전환 | 문 근접 → 페이드 → 씬 교체 → 스폰. 별도 라우팅 불필요 |
| 상점 거래 | 카운터 근접 → 판매 → 벨 지급 |
| 가구 배치 | 레이캐스트 + 1m 그리드 스냅, 탭으로 설치/제거 |
| 캐릭터 꾸미기 | 몸 색 5종 × 모자 3종 런타임 스왑 |

교훈: ① 상호작용 반경은 넉넉하게(나무 2.8m) ② 툰 재질은 과노출되기 쉬움 —
Hemisphere 0.55 + Directional 0.65가 적정 ③ 프로시저럴 지오메트리만으로도
분위기는 나오지만, 진짜 퀄리티는 에셋(§3)에서 나온다.

## 2. 추천 스택 (엔진·기법)

**three.js 0.185 + @react-three/fiber v9 + drei + BVHEcctrl + MeshToonMaterial +
three-custom-shader-material(곡면) + 기존 Firebase(Firestore/Functions)**

- 엔진 비교: Babylon(★3, 무겁고 React 통합 비공식) · PlayCanvas(★2, 에디터가 SaaS) ·
  Godot 웹(★2, WASM 25MB+로 모바일 부적합) → **R3F ★5**. Next 정적 export와는
  `dynamic(..., {ssr:false})` 한 줄로 통합, 현 캠퍼스 three.js 노선의 자연 승격.
- 캐릭터 컨트롤러: [pmndrs/ecctrl](https://github.com/pmndrs/ecctrl)(773★, 터치 조이스틱 내장,
  데모 https://ecctrl.app) 또는 물리엔진 없이 가벼운
  [pmndrs/BVHEcctrl](https://github.com/pmndrs/BVHEcctrl)(데모 https://bvhecctrl.vercel.app/) —
  Rapier WASM을 빼면 3D 코어 ~250KB gzip 유지 가능. 모바일 우선이면 BVHEcctrl 1차.
- 곡면 월드: 완성형 레포는 없음. [three-custom-shader-material](https://github.com/FarazzShaikh/THREE-CustomShaderMaterial)(1.3k★)로
  toon 라이팅 유지한 채 `csm_Position`에 `d²/r` 주입 — 데모에서 원리 검증 끝.
  주의: 굽힌 뒤 바운딩이 어긋나 프러스텀 컬링과 간섭 가능 → `frustumCulled=false` 보수 세팅.
- 툰 룩: 공식 예제 https://threejs.org/examples/webgl_materials_toon.html ·
  아웃라인은 OutlineEffect(모바일에서 포스트프로세싱보다 저렴) · 동숲 실물은 아웃라인보다
  HemisphereLight 파스텔이 핵심.
- 물: [thaslle/stylized-water](https://github.com/thaslle/stylized-water)(R3F용 카툰 워터).
- 가구 배치: 공식 voxelpainter 예제 패턴(레이캐스트→그리드 스냅)이 로직 전부 —
  https://threejs.org/examples/webgl_interactive_voxelpainter.html
- 게임 구조 교과서: [pmndrs/racing-game](https://github.com/pmndrs/racing-game)(2.2k★, 데모 https://racing.pmnd.rs/).
- 동숲 클론 완성품은 GitHub에 **없음** — 조각 조립이 정답.
- 경제(싱글+Firebase): 스폰은 `hash(uid+date+spotId)` 시드로 클라 결정론 계산(쓰기 0),
  인벤토리는 `users/{uid}/inventory`, 화폐가 걸리는 획득·조합·구매는 callable Function
  트랜잭션으로 일원화(이미 Blaze — 추가 비용 0). 유저 간 거래는 에스크로 문서 +
  Function 트랜잭션 원자 교환. 캠퍼스 게스트 혼자 정책과 충돌 없음.

## 3. 무료 에셋 최소 조합 (전부 생존 확인, 2026-08-10)

| 역할 | 팩 | 라이선스 | 비고 |
|---|---|---|---|
| 플레이어/학생 | **Kenney Mini Characters** (kenney.nl/assets/mini-characters) | CC0 | 치비 25종 + **캐릭터당 애니 32개 내장**. 단색 텍스처라 교복(네이비) 리컬러 쉬움 |
| 커스터마이징 파츠 | Quaternius Universal Base Characters | CC0 | 헤어 20종 믹스매치, 피부색 시스템. 비율은 틴~레귤러 |
| 동물 주민 | Gobkit Free Animal Pack (itch.io) | CC0 | 리깅+애니 동물 10종 GLB, three.js 명시 |
| 자연 | Kenney Nature Kit (330개) + Quaternius Stylized Nature | CC0 | |
| 건물 외관 | Kenney Fantasy Town Kit(동숲 감성) 또는 City Kit Suburban(현대) | CC0 | |
| 인테리어/가구 | Kenney Furniture Kit(140개) + Quaternius House Interior(GLB는 poly.pizza 번들) + KayKit Restaurant Bits | CC0 | 교실·상점 커버 |
| 아이템 3D | Kenney Food Kit + KayKit Resource Bits | CC0 | |
| 아이템 아이콘 | game-icons.net (4,180종) | CC-BY | 크레딧 1줄 필요 |
| UI 사운드 | Kenney Interface Sounds / UI Audio | CC0 | |
| BGM | OpenGameArt CC0 Calm 컬렉션 (FreePD는 2025 폐쇄됨) | CC0 | 부족하면 incompetech(CC-BY) |
| GLB 변환 허브 | poly.pizza | 모델별 | Quaternius FBX팩을 GLB로 받는 우회로 |

- 한국 교복 로우폴리 CC0 기성품은 **존재하지 않음** → Mini Characters 리컬러가 현실 경로.
  VRoid는 30~73k tris로 무겁고 애니메 비율이라 NPC 다수엔 부적합.
- 기존 조사 실측(폐기된 assets/ README에서 승계): Quaternius 모듈러 캐릭터는 21종 전부
  동일 62뼈 스켈레톤·바인드포즈 일치로 파츠 믹스 가능, 텍스처 0장(머티리얼 색만이라
  런타임 색 변경 공짜), 1구 6.2k tris/1.4MB, 애니 24종(Sit 없음). 애니는 1파일에서만
  뽑고 나머지는 메시만 추출하는 전처리 필요.
- Mixamo: 무료·상업 OK지만 raw FBX 재배포 금지 — 리타게팅 결과물만 번들할 것.

## 4. 신규 도구

- **Blender MCP 연결됨** (`uvx blender-mcp`, user 스코프) + Blender 5.2 애드온 설치·활성화
  완료. 에셋 리컬러·파츠 병합·GLB 최적화(애니 중복 제거) 전처리를 대화로 지시 가능.
  사용 시 Blender를 열고 3D뷰 사이드바(N) → BlenderMCP 탭 → **Connect to Claude** 버튼으로
  소켓 서버를 켜야 하며, MCP 도구는 새 Claude 세션부터 잡힌다.

## 다음 단계

1. 라이브 상태 커밋(소스 고정) — 승인 필요
2. plan.md 작성: 마을 레이아웃, 씬 구조(야외/실내), 데이터 모델(인벤토리·배치 저장),
   에셋 파이프라인(Blender 전처리), 단계별 마일스톤 — **승인 전 코딩 금지**
