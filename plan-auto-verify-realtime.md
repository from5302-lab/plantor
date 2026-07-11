# plan.md — 과제 완료 클릭 시 실시간 자동인증 (클래스카드 · 오토보카)

> 상태: **기획 검토 중** — 사용자 승인 전 코딩 금지
> 작성: 2026-07-06

## 0. 한 줄 요약
학생이 `/learn`에서 클래스카드/오토보카 과제를 **"완료" 클릭**하면, 저장된 **교사 계정**으로 해당 학생의 **오늘 진도를 실시간 스크래핑**해서 `learningLogs`(`method:"auto"`)에 기록한다. 기존 파이썬 스크래퍼 로직을 **Node(Cloud Functions)로 이식**한다.

## 0.1 적용 범위
**모든 플랜토 학생** 중 클래스카드/오토보카 **활성 구독자 전원**. 특정 학생 한정 아님. → 매핑·자격증명·트리거 전부 하드코딩 없이 동적으로 동작해야 함(개별 학생 추가 시 코드 배포 불필요).

---

## 1. 현황 (이미 있는 것 / 없는 것)

### 이미 구현됨 ✅
- **기록 엔드포인트**: `functions/src/auto-log.ts` — `autoLog`. childId·serviceSlug·date·autoStatus·scrapedData 받아 `learningLogs`에 `method:"auto"`로 create/update. (재사용)
- **스크래핑 로직(파이썬)**: `cowork/scrapers/classcard.py`, `autovoca.py` — 교사 계정 로그인 → 오늘 진도 파싱 → autoLog POST. (Node 이식 원본)
- **프론트 표시**: `learn-dashboard.tsx`가 `autoStatus`(시작전/진행중/완료) 읽어 표시. `AUTO_VERIFIED_SLUGS = {classcard-middle, autovoca, dailykor}`.

### 없음 / 문제 ❌
- 스크래퍼를 **실행하는 트리거가 전무** (스케줄러도, 클릭 연결도 없음).
- 학생 매핑이 **하드코딩 2명** (`STUDENT_MAP`).
- ⚠️ **교사 비밀번호·`COWORK_SECRET`·오토보카 HMAC_SECRET이 평문으로 커밋됨** → 유출 상태. 반드시 교체 + Secret화.
- PRD 기록: 외부툴 API가 요청을 거절한 이력 있음 → 서버 IP 스크래핑 차단 리스크.

---

## 2. 목표 / 성공 기준
1. 학생이 클래스카드/오토보카 "완료"를 누르면 → 몇 초 내 실제 진도가 `learningLogs`에 `method:"auto"`로 기록되고, 화면에 결과(완료/진행중/시작전 + 점수·학습시간)가 뜬다.
2. 교사 자격증명은 **코드/DB 평문에 없다** (Secret Manager).
3. 학생 매핑은 **하드코딩이 아니라** 각 학생 레코드 기반으로 동작한다.
4. 스크래핑 실패 시 **기존 인증샷(self) 플로우로 안전하게 폴백**한다.

---

## 3. 아키텍처 (승인된 방향: 클릭 즉시 실시간 · Node 이식)

```
[학생] "완료" 클릭 (classcard-middle | autovoca)
   └─> 프론트: callable  verifyAutoProgress({ serviceSlug })
        └─> Cloud Function (Node, functions/src/verify-auto.ts)
             1. auth.uid → 본인 childId + 외부 login_id 해석
             2. Secret에서 교사 자격증명 로드
             3. (세션 캐시 확인) 교사 로그인
             4. 외부 플랫폼에서 "오늘/이 학생" 진도 조회 + 파싱
             5. learningLogs 기록 (기존 auto-log 로직 재사용)
             6. { autoStatus, scores, studyMinutes } 반환
        └─> 프론트: 결과 표시 (실패 시 인증샷 폴백)
```

### 3.1 신규/변경 파일
- `functions/src/verify-auto.ts` (신규) — callable `verifyAutoProgress`
- `functions/src/scrapers/classcard.ts` (신규) — 파이썬 이식
- `functions/src/scrapers/autovoca.ts` (신규) — 파이썬 이식
- `functions/src/lib/autolog-core.ts` (신규) — `auto-log.ts`의 기록 로직을 공용 함수로 추출(엔드포인트/콜러블 공유)
- `functions/src/index.ts` — export 추가
- `functions/package.json` — HTML 파서 의존성 추가(`node-html-parser`) — cheerio보다 경량
- `src/components/learn/learn-dashboard.tsx` / `task-checklist.tsx` — 완료 클릭 시 콜러블 호출 + 로딩/결과/폴백 UI
- `src/lib/hooks/useChildData.ts` — 학생의 외부 login_id 노출(아래 3.3)

### 3.2 자격증명 · 계정 설정 (Secret Manager)
Secret로 이전:
- `CLASSCARD_ID`, `CLASSCARD_PW`
- `AUTOVOCA_ID`, `AUTOVOCA_PW`, `AUTOVOCA_HMAC_SECRET`

계정 고정 설정(교사 계정 종속 값)은 Firestore `config/autoVerify` 문서로:
- 클래스카드: `login_user_idx`(예 5101739), `b_s_idx`(예 19167), `classes[]`(class_idx/g_class_idx 목록)
- → 코드 하드코딩 대신 문서로 관리(반/클래스 추가 시 코드 배포 불필요)

### 3.3 학생 매핑 (하드코딩 제거) — **핵심 선결 과제**
플랜토 loginId ≠ 외부 플랫폼 login_id (예: 플랜토 `jih36450` vs 클래스카드 `sogmi79`).
→ **각 학생마다 외부 플랫폼 아이디를 저장**해야 함.

제안: `children` 문서에 필드 추가
```
children/{childId}:
  classcardLoginId?: string   // 클래스카드 login_id
  autovocaLoginId?:  string   // 오토보카 login_id
```
- 어드민 "수업 수정"/학생 편집 UI에 입력란 추가 (별도 소규모 작업).
- 콜러블은 본인 childId → 위 필드로 외부 login_id를 얻어 스크래핑.

**전체 학생 대상 → 대량 매핑이 최대 운영 부담.** 수기 입력 최소화를 위해 **어드민 "외부 명단 동기화" 도구** 제안:
- 오토보카 `/academy/student/list`(전체 학생 login_id·이름), 클래스카드 리포트의 login_id 목록을 서버에서 가져옴.
- 플랜토 구독자와 **이름으로 자동 매칭 제안** → 운영자가 확인/수정 후 일괄 저장.
- 미매칭 학생만 수기 처리 → 자동인증 대상에서 제외(인증샷 폴백).

> ⚠️ **선결**: 각 학생의 클래스카드/오토보카 아이디를 채워야 매핑 동작. 위 동기화 도구로 대량 처리, 나머지는 폴백.

### 3.4 성능 · 안정성 설계 (플랫폼 특성 반영)
- **오토보카**: user_idx로 학생 개별 조회 → 클릭당 1명만 조회, 가벼움. HMAC-SHA256+crc32는 Node `crypto`로 이식.
- **클래스카드**: 반 전체 리포트만 제공 → 클릭당 교사 로그인 + 8개 클래스 조회는 무겁고 차단 위험. 완화책:
  - **세션 캐시**: 교사 로그인 세션/토큰을 warm 인스턴스 메모리 + Firestore(단기 TTL)에 캐시 → 클릭마다 재로그인 방지.
  - **스로틀/디듑**: 같은 학생·서비스·오늘 auto 로그가 **최근 N분 내** 있으면 재스크래핑 없이 그 값 반환.
  - **반 단위 캐시 재활용**: 클래스카드는 어차피 반 전체를 받으므로, 한 명 클릭 시 조회한 반 데이터로 **같은 반 다른 학생들 로그도 함께 갱신**(추가 클릭 비용 절감).
- **실패 폴백**: 로그인 차단/구조 변경/학생 미발견 시 명확한 에러 반환 → 프론트는 **기존 인증샷 제출 UI로 전환**.

### 3.5 보안 · 권한
- 콜러블은 **호출자 = 본인 학생** 검증(auth.uid ↔ childId). 남의 진도 스크래핑 트리거 불가.
- 노출된 비밀번호/시크릿 **즉시 교체(로테이션)** — git 히스토리에 남아 있음.
- `autoLog` 엔드포인트는 유지하되 콜러블 경로가 주 트리거.

---

## 4. 데이터 양식(scrapedData)

### 4.1 오토보카 — 확정 (사용자 캡쳐 기준 2026-07-06)
캡쳐(성적표 "오늘" 행): 유닛 `4권 유닛 9` · 학습시간 `10분` · 테스트 `평균 92점` · 누적오답복습 `3개` · 포인트 `+35P`

```
learningLogs (autovoca):
  autoStatus: "시작전" | "진행중" | "완료"
  scrapedData:
    unitLabel:        string   // "4권 유닛 9"  (오늘 학습 유닛)
    unitCount:        number   // 1   (오늘 완료 유닛 수)
    studyMinutes:     number   // 10
    testScore:        number   // 92  (평균 점수)
    wrongReviewCount: number   // 3   (누적오답복습 개수)
    points:           number   // 35  (오늘 획득 포인트, +35P → 35)
```

**표시(우리 양식)** — 학습완료 목록 아래, 가독성 위주 요약. 예:
> 오토보카 · 완료 ✓
> 📘 4권 유닛 9 · ⏱ 10분 · 📝 테스트 92점 · 🔁 오답복습 3개 · ⭐ +35P

> 스타일은 1차 구현 후 조정(사용자: "일단 보고 수정"). **정보 캡쳐가 우선.**

**필드 출처 주의**: 기존 `autovoca.py`는 `weekly_report_data`에서 유닛/학습시간/테스트만 접근. **누적오답복습·포인트·유닛 라벨**은 API 응답에서 추가 매핑 필요 → 구현 시 실제 `get_user_weekly_report` JSON 확인 후 정확한 경로 확정(해당 필드가 없으면 별도 엔드포인트 검토).

### 4.2 클래스카드 — 문법훈련 확정 (사용자 캡쳐 2026-07-06)
캡쳐: 유닛명 `감각동사+형용사` · 시작~제출 `07/05 00:00~00:11`(11분) · 평균 `97점` · 완료 `✓`
세부: 개념톡 `100` · 연습A `100` · 연습B `NA` · 서술형 `90` · 실전 `NA` · 누적오답 `100` · Scramble `-`

```
learningLogs (classcard-middle, 문법훈련 유닛 1건):
  unitLabel:    "감각동사+형용사"
  studyMinutes: 11            // 시작~제출 시간차
  avgScore:     97
  completed:    true
  scores: { 개념톡:100, 연습A:100, 서술형:90, 누적오답:100 }  // NA/미실시 컬럼은 생략
```

**표시(우리 양식)**:
> 클래스카드 문법 · 완료 ✓
> 📘 감각동사+형용사 · ⏱ 11분 · 평균 97점
> 개념톡 100 · 연습A 100 · 서술형 90 · 누적오답 100

### 4.2b 클래스카드 — 듣기훈련 확정 (사용자 캡쳐 2026-07-06)
캡쳐: 유닛명 `2012년 중2 1회 영어듣기능력평가 (20문항)` · 학습일자 `07/04 20:15~07/05 20:33` · 테스트 `80점` · 딕테이션 `1.1회` · 오답테스트 `95 → 100`
```
units 항목 (듣기):
  type:"듣기", unitLabel:"2012년 중2 1회 영어듣기능력평가 (20문항)",
  dateRangeRaw:"07/04 20:15 ~ 07/05 20:33",   // 날짜 넘어감 → 분 계산 불안정, 원본 보존
  scores: { 테스트:"80점", 딕테이션:"1.1회", 오답테스트:"95 → 100" }
```
**핵심**: 듣기 값은 정수가 아님(`1.1회`, `95 → 100`). → `scores` 값 타입을 **`number | string`** 로 확장해 **원본 문자열 그대로** 저장(제네릭 렌더가 그대로 표시). 분 계산은 학습일자가 자정을 넘길 수 있어 best-effort, 불확실하면 생략하고 `dateRangeRaw` 보존.

### 4.2c 클래스카드 — 내신본문/어휘 확정 (사용자 캡쳐 2026-07-06)
캡쳐: 암기 `1/12·100%` · 리콜 `1/12·100%` · 스펠 `2/2·200%` · 스피킹 `1/14·17%`
```
units 항목 (본문/어휘):
  type:"본문", unitLabel:"<세트명>",
  scores: { 암기:"1/12 (100%)", 리콜:"1/12 (100%)", 스펠:"2/2 (200%)", 스피킹:"1/14 (17%)" }
```
**주의**: 값이 `분수 (%)` 형태(스펠 200%처럼 100% 초과 가능) → 문자열 원본 보존. 화면에 "학습 기록이 없습니다"가 함께 보이는 걸로 보아 하단 수치는 **누적(오늘 아님)**일 가능성 → 구현 시 API에서 "오늘 활동" 판별 로직을 별도 확인(autoStatus 오탐 방지).

### 4.3 scrapedData 최종 shape — **유닛 배열** (정보 손실 방지)
하루에 여러 유닛(문법+어휘+듣기, 오토보카 여러 권 등) 가능 → 단일 flatten 대신 배열로 보존.
```
scrapedData:
  units: [
    // 클래스카드 예
    { type:"문법", unitLabel:"감각동사+형용사", studyMinutes:11, avgScore:97,
      completed:true, scores:{개념톡:100,연습A:100,서술형:90,누적오답:100} },
    // 클래스카드 듣기 예 (값이 문자열)
    { type:"듣기", unitLabel:"...영어듣기능력평가 (20문항)", dateRangeRaw:"07/04 20:15 ~ 07/05 20:33",
      scores:{테스트:"80점", 딕테이션:"1.1회", 오답테스트:"95 → 100"} },
    // 오토보카 예
    { unitLabel:"4권 유닛 9", studyMinutes:10, testScore:92, wrongReviewCount:3, points:35, completed:true }
  ]
  // scores 값 타입: number | string (원본 보존 — "1.1회", "95 → 100" 등)
  totalStudyMinutes: number   // 합계(계산 가능한 유닛만)
autoStatus: 유닛 중 하나라도 완료 → "완료", 진행 흔적만 → "진행중", 없음 → "시작전"
```
> §4.1 오토보카도 이 배열 shape로 통일(값은 4.1 필드 그대로).

### 4.4 표시 렌더링 방침 — 제네릭
클래스카드 하위 타입마다 점수 컬럼이 다름(문법: 개념톡/연습/서술형…, 어휘·본문: 암기/리콜/스펠/테스트, 듣기: 테스트). 매 타입 캡쳐를 다 받지 않아도 되게 **`scores{}`에 존재하는 항목만 그대로 나열**하는 제네릭 카드로 렌더 → 어떤 타입이 와도 깨지지 않음. (사용자 "일단 보고 수정" 방침에 부합)

> 어휘/본문/듣기 등 **다른 클래스카드 타입 캡쳐가 더 있으면** 주세요. 없으면 제네릭 렌더로 처리.

---

## 5. 구현 단계 (승인 후)
1. [완료] `auto-log.ts`에 `writeAutoLog` 추출 + 엔드포인트 리팩터(동작 동일).
2. [완료] `scraper-autovoca.ts` 이식(HMAC 서명·오늘 유닛 추출). ⚠️ 필드명 3개 실제응답 확정 필요(§4.1).
3. [보류] `scraper-classcard.ts` 이식 — Phase B (html 파서 + 4개 타입).
4. [완료] `verifyAutoProgress` 콜러블 + 본인 검증(어드민만 override) + Secret 로딩 + 스로틀(2분).
5. [완료] `children.classcardLoginId/autovocaLoginId` 필드 + 어드민 입력 UI(가족/직강 모달) + `ensureDirectClassAccounts` 전파.
6. [완료] 프론트 완료 클릭 → 콜러블 호출, `AutoResultCard` 제네릭 표시(완료 목록 아래), 실패 시 폴백 문구.
7. [사용자] Secret 등록 + 노출 자격증명 로테이션 + `cowork/*.py` 평문 제거.

### 현재 상태 (2026-07-06) — 배포 완료 ✅
- 오토보카 + **클래스카드**(문법/듣기/본문·어휘) 스크래퍼 Node 이식 완료.
- **Secret 등록 완료**: TEACHER_PW(공유 비번), AUTOVOCA_HMAC_SECRET, AUTOVOCA_ID, CLASSCARD_ID.
- **배포 완료**: `verifyAutoProgress`(신규) + `ensureDirectClassAccounts`·`autoLog`(갱신) + 호스팅. 콜러블 스모크 테스트 통과(인증 가드 동작).
- **다음(실검증)**: ① 학생에 외부 아이디 매핑(어드민 새 입력란) ② 그 학생이 "완료" 클릭 → 카드 확인 ③ 오토보카 필드명 3개(unitLabel/wrongReviewCount/points) 실제 응답으로 확정 ④ 노출 자격증명 로테이션 + cowork/*.py 평문 제거.

---

## 6. 리스크 / 열린 질문 (전체 학생 규모 반영)
- **[높음] 서버 IP 차단 (규모로 악화)**: 전체 학생이 매일 클릭 → 교사 계정으로의 요청량 급증. 클라우드 IP는 로컬보다 빨리 차단될 수 있음(PRD 이력). → 오토보카 선검증, 클래스카드는 강한 스로틀 + 반 단위 캐시 재활용 필수.
- **[높음] 클릭당 지연**: 클래스카드 수초 소요 → 로딩 UI + 스로틀로 반복 클릭 방지.
- **[높음] 대량 외부 아이디 매핑**: 전체 학생분 수집이 최대 부담 → §3.3 "외부 명단 동기화" 도구로 완화.
- **[중] 동시성/비용**: 클릭 몰릴 때 콜러블 동시 실행 → 세션 캐시 공유, 스로틀로 중복 스크래핑 차단.
- **[중] 오토보카 HMAC 재현**: crc32/서명 Node 이식 정확도 — 초기 테스트 필요.
- **[낮음] 데일리코어**: 이번 범위 제외. 동일 패턴으로 추후 확장.

### 롤아웃 (단계적 확대 권장)
1단계: 오토보카, 소수 학생 대상 **피처 플래그**로 검증(차단·정확도 모니터링) → 2단계: 오토보카 전체 학생 → 3단계: 클래스카드(스로틀/캐시 검증 후) 전체.

---

## 7. 승인 필요 사항
1. 이 아키텍처(콜러블 실시간 + Node 이식 + Secret + children 매핑 필드 + 명단 동기화 도구)로 진행 OK?
2. **대량 매핑 방식**: "외부 명단 동기화 + 이름 자동매칭" 도구를 만들지, 아니면 운영자 수기 입력만으로 갈지?
3. 우선순위: **오토보카 먼저 → 클래스카드**, 피처 플래그로 소수 검증 후 전체 확대 OK?
4. 데이터 표시 양식 **캡쳐** 공유.
