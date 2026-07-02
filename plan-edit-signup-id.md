# 신규신청 아이디 수정 기능

## 목표
어드민 "신규 신청" 카드에서 **계정 생성(`approveSignup`) 전에** 학부모/자녀 로그인 아이디를 수정한다.

## 배경 (조사 결과)
- `approveSignup`(functions/src/auth.ts:71)은 서버에서 `signups/{id}` 문서를 읽어
  `parentId` → 학부모 계정, `children[].loginId` → 자녀 계정을 생성한다.
- 즉 계정 생성 전이라면 **`signups/{id}` 문서의 `parentId` / `children[].loginId` 필드만 고치면** 된다.
  (이미 생성된 Auth/Firestore 계정은 건드리지 않음 → "계정 생성 전" 조건과 일치)
- 어드민 클라이언트는 이미 `updateDoc(doc(db,"signups",id), …)`으로 쓰기 중(admin-shell.tsx:218) → 권한 OK.
- 중복 검사용 `checkIdAvailability`(auth.ts:914) 콜러블이 이미 존재(parent/child 타입 지원).

## 수정 범위
편집 대상: **학부모 ID(`parentId`)** 와 **각 자녀 ID(`child.loginId`)** — 화면의 두 ID 필 모두.
편집 가능 조건: `!signup.convertedFamilyId` (아직 가족 등록 전). 등록완료 건은 편집 버튼 숨김.

## 구현

### 1. `signup-row.tsx` — 인라인 편집 UI
- ID 필 옆에 ✏️(연필) 버튼 추가 → 클릭 시 텍스트 input + [저장]/[취소]로 전환.
- 저장 시:
  1. 소문자 trim, 길이 ≥ 4 검증 (checkIdAvailability와 동일 기준). 미달 시 에러 표시.
  2. `checkIdAvailability`({type:"parent"|"child", id})로 중복 확인. 사용 중이면 에러 표시.
  3. 통과하면 부모 콜백 호출해 Firestore 반영. 성공 시 편집모드 종료.
- 값이 기존과 동일하면 그냥 편집모드만 종료(중복검사 스킵).
- 로컬 상태: `editingParent`, `editingChildIdx`, input 값, 에러, 저장중 플래그.

### 2. `admin-shell.tsx` — 저장 핸들러 2개, `SignupRow`에 전달
```ts
async function editParentId(signupId: string, newId: string) {
  await updateDoc(doc(db, "signups", signupId), { parentId: newId.trim().toLowerCase() });
}
async function editChildId(signup: Signup, childIdx: number, newId: string) {
  const children = signup.children.map((c, i) =>
    i === childIdx ? { ...c, loginId: newId.trim().toLowerCase() } : c);
  await updateDoc(doc(db, "signups", signup.id), { children });
}
```
- `<SignupRow … onEditParentId={editParentId} onEditChildId={editChildId} />`
- onSnapshot 구독 중이므로 저장 후 화면 자동 갱신(별도 로컬 업데이트 불필요).

## 검증
1. 빌드/타입: `npm run build` (또는 lint) 통과 → 확인: 에러 0
2. 수동: 어드민에서 신규신청 ID 편집 → 저장 → 카드에 새 ID 반영 → 계정 생성 시 새 ID로 로그인 계정 생성되는지 확인
3. 중복 ID 입력 시 에러 메시지 표시되고 저장 안 됨 → 확인

## 미결정 / 확인 필요
- **자녀 ID도 편집 대상에 포함할지?** (기본안: 포함) — 스샷상 학부모/자녀 ID가 동일값이라
  둘 다 수정 필요할 수 있음. 학부모 ID만 원하면 자녀 부분 제외.
- ID 형식 제약(영문/숫자만 등) 추가 규칙 있는지? (기본안: 길이 ≥4 + 중복검사만, 기존 가입폼과 동일)
