# plan — 어드민 읽기전용 미리보기 (이름 클릭 → 새창)

> 작성일: 2026-06-01 / 상태: 검토 대기 (승인 전 구현 금지)

## 목표
어드민 회원목록에서 **학부모/자녀 이름을 클릭하면 새창**으로 그 사람의 페이지를
**읽기전용**으로 보여준다. (어드민 로그인 유지 — 세션 안 바뀜)

## 결정 사항
- 대상: **학부모 + 학생 둘 다**
- 방식: **읽기전용 미리보기** (대리 로그인 X)
- UX: **window.open 새창**

## 조사 결과 (확인 완료)
- 두 대시보드 모두 `userId`를 **prop으로 받음** → 어드민이 대상 uid 넘겨 렌더 가능
- **ParentDashboard**: 쓰기·callable·auth.currentUser 직접참조 **없음** → 그대로 읽기전용. (parent uid = `family.userId`, 회원목록에 이미 있음)
- **LearnDashboard / useChildData**: `userId`→`users[userId].plantor_id`→`loginId`로 자녀 찾음.
  쓰기 동작 3개: 학습로그 기록(`markDone`), 학습로그 삭제(`handleRedo`), 출석(`출석하기`) → **readOnly로 막아야 함**
- 어드민 회원목록 children에는 `authUid` 없음. 단 **childId(child.id)는 있음** → 이걸로 바로 조회 가능
- 이름 렌더: 학부모 `members-tab.tsx:2007`(span), 자녀 `members-tab.tsx:2110`(InlineNameEditor, 클릭=편집)

## 변경안

### 1. 새 라우트 `src/app/admin/preview/page.tsx`
- 쿼리 파라미터로 분기:
  - 학부모: `/admin/preview?type=parent&uid=<family.userId>&name=<parentName>`
  - 학생:   `/admin/preview?type=learn&childId=<child.id>&name=<childName>`
- 진입 시 `useAuth()`로 **role==="admin" 확인** (아니면 "권한 없음")
- 상단에 "🔍 미리보기 — 읽기전용 (OOO)" 배너 표시
- `type==="parent"` → `<ParentDashboard userId={uid} />`
- `type==="learn"`   → `<LearnDashboard userId={childId} previewChildId={childId} userName={name} readOnly />`

### 2. `useChildData` 훅 — preview 분기 추가
- 옵션 인자 `previewChildId?` 추가: 있으면 `users[userId]→loginId→childId` 해석을 **건너뛰고** 그 childId로 바로 subscriptions/learningLogs/attendanceSessions 조회
- (어드민은 childId를 이미 알고 있으니 가장 단순·정확)

### 3. `LearnDashboard` — `readOnly` prop 추가
- `readOnly===true`일 때 비활성/숨김:
  - 학습 완료 버튼(`markDone` 호출부)
  - 다시하기/삭제 버튼(`handleRedo` 호출부)
  - 출석하기 버튼
- 나머지(학습 현황·진도·로그 표시)는 그대로 보임

### 4. `members-tab.tsx` — 이름 클릭 → 새창
- **학부모 이름**(`:2007`): 클릭 가능하게(버튼/커서). `family.userId` 있을 때만.
  `window.open('/admin/preview?type=parent&uid='+userId+'&name='+enc(parentName), '_blank')`
- **자녀**(`:2110` 근처): 이름은 편집용이라 건드리지 말고, 옆에 작은 **👁 미리보기 버튼** 추가(학습 버튼 옆).
  `window.open('/admin/preview?type=learn&childId='+child.id+'&name='+enc(child.name), '_blank')`

## 읽기전용·보안
- ParentDashboard: 변경 불필요(이미 읽기전용)
- LearnDashboard: 위 3개 쓰기 동작만 차단
- preview 페이지: 어드민 role 아니면 차단. (Firestore 규칙상 데이터 읽기는 어드민 권한으로 됨)
- 어드민 세션 그대로 유지(custom token 미사용) → 새창이 깔끔하게 동작

## 한계 (합의됨)
- 읽기전용이라 **권한·로그인·동작(버튼) 에러는 재현 안 됨**. 데이터·표시 상태는 보임.

## 검증
- `npx tsc --noEmit` (hosting) 통과
- 어드민에서 학부모/자녀 이름 클릭 → 새창에 해당 화면 뜨고, 학생 화면의 기록/출석 버튼이 비활성인지 확인

## 진행 현황 (2026-06-01) — 구현 완료
- [완료] `useChildData` — `previewChildId` 옵션 추가 (childId 직접 조회)
- [완료] `LearnDashboard` — `readOnly`/`previewChildId` prop, markDone·handleRedo 가드, 출석 버튼 숨김, TaskChecklist에 readOnly 전달
- [완료] `TaskChecklist` — `readOnly` prop, 쓰기 가드 + 액션 버튼 숨김
- [완료] 새 라우트 `src/app/admin/preview/page.tsx` + `admin-preview-shell.tsx` (어드민 가드 + 배너)
- [완료] `members-tab` — 학부모 이름 클릭(새창), 자녀 옆 👁 버튼(새창)
- [완료] ParentDashboard 변경 없음(이미 읽기전용)
- [완료] 타입체크 + `next build` 통과 (/admin/preview 라우트 생성 확인)
- [대기] hosting 배포

## 미정/확인 필요
- 미리보기 UI에서 자녀가 여러 명인 학부모의 경우 ParentDashboard가 가족 전체를 보여주므로 OK
- `family.userId`가 없는 (구) 가족은 학부모 미리보기 비활성 처리
