# 캠퍼스 — 방문자 모드 · 꾸미기 실시간 미리보기 · 이미지 선택지

> 상태: **검토 대기** (승인 전 구현 없음)
> 대상 파일: `public/campus/lib/{avatar,customizer,map,store}.js`

---

## 0. 요청

1. 로그인 전 게스트는 **성별을 알 수 없는, 아무 커스텀도 안 된 캐릭터**가 **"방문자"** 라는 타이틀로 학원을 구경한다.
2. 꾸미기에 들어가면 **내 캐릭터가 어떻게 보이는지 실시간으로** 보인다.
3. 선택 항목이 텍스트만이 아니라 **이미지로** 보인다.

---

## 1. 리서치 — 지금 어떻게 되어 있나

### 게스트 경로
| 지점 | 현재 동작 | 근거 |
|---|---|---|
| 로그인 판정 | `ME = await whenReady()`, 비로그인이면 `null` | [map.js:282](public/campus/lib/map.js:282) |
| 꾸미기 버튼 | `dressBtn.hidden = !ME` — 게스트는 숨김 | [map.js:284](public/campus/lib/map.js:284) |
| 외형 | `loadCharacter()` → 게스트는 **localStorage** `mp.character.v1` 를 읽는다. 없으면 `DEFAULT_LOOK` | [store.js:62](public/campus/lib/store.js:62) |
| 이름표 | `nameTag(ME ? ME.name : '나')` — 게스트는 **"나"** | [map.js:324](public/campus/lib/map.js:324), [map.js:507](public/campus/lib/map.js:507) |
| 실시간 | `if (ME)` 안에서만 `joinCampus` — 게스트는 **아무와도 연결되지 않는다** | [map.js:376](public/campus/lib/map.js:376) |

`DEFAULT_LOOK` 은 `crop`(짧은 단정 머리) + `uniform`(교복, 칼라 + 자주색 넥타이) + 남색이다 ([avatar.js:232](public/campus/lib/avatar.js:232)). 넥타이·짧은 머리 조합이 남학생으로 읽힐 여지가 있고, 무엇보다 **"커스텀 안 된 상태"로 보이지 않는다** — 누군가 골라 놓은 옷차림처럼 보인다.

게스트 localStorage 경로는 사실상 **죽은 길**이다. 게스트는 꾸미기 버튼 자체가 없어 저장할 수단이 없다. 남는 건 이 기능이 게스트에게 열려 있던 시절의 잔재뿐인데, 그게 로드되면 "아무 커스텀도 안 된"이라는 요구를 정면으로 깬다.

### 꾸미기 모달
- 미리보기 = **맵에 서 있는 아바타 그 자체**. 렌더러를 하나만 돌리려는 의도적 결정이었다 ([customizer.js:4](public/campus/lib/customizer.js:4)).
- 실패하는 지점: 모달(`min(420px,100%)`, 최대 84vh)이 화면 중앙을 덮어 **정작 그 아바타를 가린다**. 카메라도 아이소메트릭 원거리(`CAM_R=21.8`)라 캐릭터가 손톱만 하다. 값을 바꿔도 뭐가 바뀌었는지 안 보인다.
- 헤어 10 / 상의 4 / 하의 3 = **17개가 전부 텍스트 칩**이다 ([customizer.js:140](public/campus/lib/customizer.js:140)). "투블럭"과 "짧은 단정"의 차이를 글자로는 알 수 없다.
- 색 스와치는 이미 색 사각형이라 문제 없다. 체형은 슬라이더 + 등신/키 숫자라 미리보기만 붙으면 해결된다.

### 실시간 접속 규칙 (중요)
```
"campus": { "rooms": { "$room": { ".read": "auth != null" } } }
```
[database.rules.json](database.rules.json) — **비로그인은 룸을 읽을 수 없다.** 그래서 게스트는 텅 빈 캠퍼스를 혼자 걷는다.

---

## 2. 결정과 그 이유

### 결정 ①  게스트 외형 = 무채색 "미설정" 룩 (신규 `GUEST_LOOK`)

`DEFAULT_LOOK` 을 건드리지 않고 게스트 전용 룩을 따로 둔다. 두 값의 역할이 다르기 때문이다 — `DEFAULT_LOOK` 은 *갓 가입한 계정의 출발점*(꾸밀 수 있는 사람의 기본값)이고, `GUEST_LOOK` 은 *아직 아무도 아닌 상태*의 표현이다.

- 피부·머리·옷·신발을 전부 **연회색 계열**로. 성별 신호(넥타이·특징적 헤어)를 뺀다.
- 헤어는 `crop`(짧은 단정) 유지하되 회색. 긴 머리/단발은 여성으로, 스파이크는 남성으로 읽힌다.
- 상의는 `uniform` → **`longtee`**. 교복 칼라와 넥타이가 성별·소속 신호를 만든다.
- 볼터치를 끈다. 무채색 실루엣에 분홍 볼터치만 남으면 그것만 튄다.
  → `faceTexture()` 에 `blush:'none'` 분기 추가 ([avatar.js:59](public/campus/lib/avatar.js:59)). 기존 두 갈래(`hatch` / 기본)는 그대로 둔다.
- 체형은 `BODY_BASE` 그대로 — 조정되지 않은 표준값이라는 뜻이 정확히 담긴다.

부수 효과가 하나 있고, 그게 오히려 이득이다: 회색 캐릭터는 "로그인하면 내 모습이 된다"를 말없이 알려준다.

### 결정 ②  게스트는 localStorage 를 읽지 않는다

`map.js` 에서 `const SAVED = ME ? await loadCharacter() : null;` 로 바꾼다.
`store.js` 의 `guestRead/guestWrite/guestClear` 는 **지우지 않는다** — 요청 범위 밖이고, 로그인 시 계정 이관 경로가 아직 그 함수들을 참조한다. 호출만 끊는다.

### 결정 ③  게스트 실시간 접속은 이번에 손대지 않는다

"구경"을 다른 학생들이 돌아다니는 걸 보는 것까지로 넓히면 셋 중 하나를 해야 한다:

| 방법 | 대가 |
|---|---|
| `.read: true` 로 개방 | **학생 실명과 좌표가 비로그인 웹 전체에 공개된다.** 미성년자 대상 서비스에서 받을 수 없는 대가 |
| Firebase 익명 인증 | Firebase 콘솔에서 제공자를 켜야 하고, 무엇보다 `onAuthStateChanged` 가 익명 사용자를 넘기면 **plantor 본체 전체가 로그인 상태로 오인**한다(네비바·라우팅·`users/{uid}` 부재). 캠퍼스 하나 때문에 앱 인증을 흔드는 건 비용이 맞지 않는다 |
| 지금처럼 혼자 | 게스트가 빈 캠퍼스를 본다 |

세 번째를 유지한다. 요청은 "방문자 캐릭터로 구경"이지 "남들을 보며 구경"이 아니고, 앞의 둘은 각각 개인정보와 앱 전역 인증을 건드린다. **별건으로 다룰 사안**이라 판단해 이번 범위에서 뺀다.

### 결정 ④  꾸미기 모달에 전용 3D 렌더러를 넣는다

`customizer.js:4` 의 "렌더러를 두 개 돌리지 않는다"를 **뒤집는다**. 그 결정의 전제(모달이 아바타를 가리지 않는다)가 사실이 아니었다. 주석도 새 근거로 고쳐 쓴다.

교환 조건은 오히려 유리하다:
- 지금은 슬라이더를 움직일 때마다 `rebuildPlayer()` 로 **맵 아바타를 통째로 다시 만든다** ([map.js:501](public/campus/lib/map.js:501)). 보이지도 않는 걸 만드느라 드는 비용이다.
- 앞으로는 값이 바뀌면 **프리뷰만** 다시 만들고, 맵 아바타는 모달을 닫을 때 한 번만 만든다. 렌더러는 늘지만 재빌드는 준다.

### 결정 ⑤  썸네일은 3D 오프스크린 렌더

수작업 SVG 17개 대신, 프리뷰 렌더러를 재사용해 **실제 모델을 한 번씩 찍는다**. 그림과 실물이 어긋날 수 없고, 나중에 헤어를 추가해도 썸네일이 저절로 따라온다.

---

## 3. 구현 계획

### Task 1 — `avatar.js`: 게스트 룩과 무채색 얼굴
- [ ] `faceTexture()` 에 `look.blush === 'none'` 분기 추가 (볼터치 생략)
- [ ] `GUEST_LOOK` export 추가 — 연회색 피부/머리/옷/신발, `hairStyle:'crop'`, `topStyle:'longtee'`, `bottomStyle:'pants'`, `blush:'none'`, 회색 눈
- **검증**: `node --check public/campus/lib/avatar.js`

### Task 2 — `map.js`: 방문자
- [ ] `const SAVED = ME ? await loadCharacter() : null;`
- [ ] `ME` 없으면 `myLook = {...GUEST_LOOK}` (기존 `DEFAULT_LOOK` 폴백은 로그인 계정용으로 유지)
- [ ] 이름표 `'나'` → `'방문자'` (두 곳: [map.js:324](public/campus/lib/map.js:324), [map.js:507](public/campus/lib/map.js:507))
  → 문자열이 세 군데로 흩어지므로 `const MY_LABEL = ME ? ME.name : '방문자';` 하나로 모은다
- **검증**: `node --check`, 배포 후 로그아웃 상태로 `/campus` 확인

### Task 3 — `customizer.js`: 실시간 3D 미리보기
- [ ] `three.js` · `buildAvatar` · `disposeAvatar` · `poseAvatar` · `topY`/`heightM` import
- [ ] `<canvas class="cz-pv">` 추가. `WebGLRenderer({alpha:true, antialias:true})`, DPR 상한 2
- [ ] 조명은 맵과 같은 톤(반구광 + 방향광 1)으로 맞춘다 — 프리뷰와 실제가 다른 색으로 보이면 안 된다
- [ ] `PerspectiveCamera` 프레이밍을 `topY(body) * 0.75 * body.height` 로 계산 — 키를 바꿔도 전신이 화면에 꽉 찬다
- [ ] `poseAvatar(rig,'idle','none',t)` 유휴 애니메이션
- [ ] 드래그(포인터)로 좌우 회전. 기본 각도는 정면에서 살짝 튼 15°
- [ ] `onChange` → 프리뷰 아바타만 rebuild (dispose 후 재생성)
- [ ] rAF 루프는 **모달이 열려 있을 때만** 돈다. 닫히면 정지
- [ ] `close()` 에서 렌더러·아바타 정리 (컨텍스트 누수 방지)
- [ ] 파일 상단 주석의 "렌더러를 두 개 돌리지 않아도 되고" 를 새 근거로 교체

### Task 4 — `customizer.js`: 이미지 선택지
- [ ] `thumb(kind, id, look, body)` — 프리뷰 렌더러를 빌려 1프레임 렌더 후 `toDataURL()`
  - 헤어 10 → 머리 클로즈업 / 상의 4 → 상반신 / 하의 3 → 하반신
  - `buildAvatar(..., {outline:false})` 로 굽는다. 96px 썸네일에 아웃라인은 안 보이는데 메시만 두 배가 된다
- [ ] 캐시 키에 **색을 포함**한다 (`hair:{id}:{hairColor}:{skin}`). 색 탭에서 머리색을 바꾸면 헤어 썸네일 10장만 다시 굽고, 옷 썸네일은 건드리지 않는다
- [ ] 모달을 열 때 한 번에 다 굽지 않는다 — 텍스트 라벨만 있는 칩을 먼저 그리고, `setTimeout(0)` 으로 몇 개씩 나눠 채운다. 17개 전신 빌드를 한 프레임에 몰면 모달이 열리다 멈춘다
- [ ] 칩 CSS: 이미지 위 / 이름 아래, 3~4열 그리드. 선택 상태(`.on`)는 지금의 초록 배경 유지

### Task 5 — 레이아웃
- [ ] `.cz` 폭 `min(420px,100%)` → `min(720px,100%)`
- [ ] ≥560px: 좌 프리뷰(고정) | 우 컨트롤(스크롤) 2단
- [ ] <560px: 상단 프리뷰(약 32vh 고정) + 하단 탭·컨트롤 스크롤
- [ ] 기존 미디어쿼리(`max-width:520px`) 와 겹치지 않게 정리

### Task 6 — 검증
로컬 서버는 쓰지 않는다.
- [ ] `node --check` — `avatar.js` `customizer.js` `map.js`
- [ ] `npx eslint` · `npm run build` — 앱 라우트 쪽 회귀 없음 확인
- [ ] 배포 후 `https://plantor.web.app/campus` 에서:
  - 로그아웃 상태 → 회색 캐릭터 + "방문자" 이름표 + 꾸미기 버튼 없음
  - 로그인 상태 → 꾸미기 모달에서 프리뷰가 즉시 반응, 썸네일 17개가 실제 모델과 일치
  - 모달을 닫으면 맵 아바타에 반영, 콘솔에 WebGL 경고 없음

---

## 4. 범위 밖으로 남기는 것

- 게스트에게 다른 접속자 보여주기 (결정 ③ — 개인정보/앱 인증 사안, 별건)
- 게스트용 "로그인하면 꾸밀 수 있어요" 유도 배너 — 요청에 없다. 원하시면 한 줄로 추가 가능
- `store.js` 의 게스트 localStorage 함수 제거 — 호출만 끊고 코드는 남긴다

---

## 5. 검토해 주실 것

1. **게스트 외형** — 무채색 "미설정" 룩(결정 ①)이 맞습니까, 아니면 그냥 지금 `DEFAULT_LOOK` 을 성중립으로만 손볼까요?
2. **게스트 실시간** — 결정 ③처럼 이번엔 빼는 게 맞습니까?
3. **썸네일에 내 색 반영** — 계획대로 현재 색을 반영할지, 아니면 고정 중립색으로 구워 재렌더를 아예 없앨지
