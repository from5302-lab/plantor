# plan — 이름 클릭 미리보기(전 계정) + 학부모 직강 수업일지 패널

> 작성일: 2026-06-01 / 상태: 검토 대기 (승인 전 구현 금지)

## 목표
1. 어드민 회원목록에서 **이름(학부모·학생)을 클릭하면 그 계정 페이지를 읽기전용 미리보기.** 계정이 있는 모든 회원(구독+직강).
2. 그게 의미있도록, **학부모 첫 페이지(/account)에 "직강 수업일지" 패널 추가** — 직강 전용 학부모(이지은 등)도 자기 자녀 수업일지가 보이게.

## 배경 (확인 완료)
- 학부모 실제 첫 페이지 = **/account (AccountDashboard)**. (/parent ParentDashboard는 현재 어드민 미리보기에만 씀)
- lessonLogs·directClasses는 **어드민 전용** → 학부모는 콜러블로만 읽음.
- 기존 `getStudentLessonLogs(childId)`는 **구독 가족 자녀만** 허용(소유권=family.userId). 직강 전용 자녀(이지은의 박하진)는 거부됨.
- 직강 카드 이름: 학부모 `parentLabel`(span), 학생 `student.name`(strong) — **둘 다 plain → 클릭화 쉬움**. 편집은 ⚙ 수정 모달.
- 직강 학생 매칭: `parentLoginId == 학부모 plantor_id` 또는 `studentLoginId ∈ 학부모 자녀 loginIds`.

## Part 1 — 학부모 직강 수업일지 패널
### 1-1. 새 콜러블 `getParentLessonLogs`
- 입력: `{ }` (호출자 인증), 선택 `weekStart/weekEnd`
- 로직: `users[uid].plantor_id` → 활성 directClasses 순회 →
  - `student.parentLoginId == plantor_id` 또는 `student.studentLoginId ∈ (내 가족 자녀 loginIds)` 인 학생 수집
  - 각 (classId, studentName) lessonLogs 조회 → 반환 `[{ studentName, grade, logs:[{date,attendance,checkInTime,content}] }]`
- 직강 전용 학부모도 동작(가족 문서 불필요).
### 1-2. AccountDashboard
- `getParentLessonLogs` 호출 → **독립 "직강 수업일지" 패널** 렌더 (구독 패널과 별도)
- 기존 weekOffset/주간 네비 공유, 그 주의 일지만 표시(1주일치)
- (기존 children-tab 자녀카드 내 수업일지 표시는 → 이 패널로 일원화)

## Part 2 — 이름 클릭 미리보기 (전 계정)
### 2-1. 미리보기 페이지 확장
- 학부모 미리보기를 **AccountDashboard로 렌더**(실제 학부모 화면과 일치). readOnly.
- `type=parent` 에 `loginId` 지원: 어드민이 `users where plantor_id==loginId`로 uid 해석 후 렌더. (직강 학부모는 uid를 모르고 loginId만 알기 때문)
### 2-2. DirectStudentCard 이름 클릭
- 학부모 이름(parentLabel) 클릭 → `type=parent&loginId=parentLoginId` (parentLoginId 계정 있을 때)
- 학생 이름(strong) 클릭 → `type=learn&loginId=studentLoginId` (childIdMap에 있을 때)
### 2-3. FamilyList 이름 클릭 (일관성)
- 학부모 이름: 이미 됨
- 자녀 이름: **클릭=미리보기로 변경**, 인라인 편집은 ⚙ 수정 모달로 이동. 기존 👁 버튼은 제거(중복).
  - (대안: 자녀는 👁 유지 — 아래 결정 D2)

## 계정 존재 게이팅
- 학부모: parentLoginId/userId 계정 존재 시만 클릭
- 학생: child 문서/계정 존재(childIdMap, child.id) 시만 클릭
- 없는 경우(진하율·삼쌍둥이·계정없는 직강생): 이름 클릭 비활성

## 결정 필요
- **D1. 학부모 미리보기를 /account(AccountDashboard)로 교체** (현재 /parent ParentDashboard) — 실제 학부모 화면과 일치시키려면 권장. (기본=교체)
- **D2. FamilyList 자녀 이름**: 클릭=미리보기로 통일(편집은 ⚙ 모달) vs 자녀는 👁 유지. (기본=이름 클릭 통일)
- **D3. 직강 수업일지**: 독립 패널로 일원화 vs 자녀카드 내 기존 표시도 유지. (기본=독립 패널로 일원화)

## 검증
- functions 빌드 + hosting 타입체크
- 이지은 미리보기 → 박하진 직강 수업일지(이번주) 보임
- 박하진 이름 클릭 → 학생 미리보기
- 구독 회원 이름 클릭도 정상
