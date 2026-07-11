# Plan: 학생 플랜 수정 미반영 + 직강 학생 플랜 과목 누락 수정

> 작성일: 2026-07-04
> 상태: 사용자 구두 승인 (대화에서 "진행해")

## 배경
1. 학생이 플랜(과제)을 수정해도 화면에 반영 안 됨
   → firestore.rules `tasks`에 학생 `allow update`가 없어 updateDoc이 permission-denied.
   → 삭제 요청(`deleteRequested`)도 같은 이유로 실패. 에러 처리도 없어 조용히 실패.
2. 직강(1:1) 학생(오준영·오재영·오수영 등)은 구독이 없고 과목이 directClasses에서 오는데,
   directClasses는 어드민 전용 read → 학생 클라이언트 조회 거부 → 플랜 과목 목록이 비어 플랜 작성 불가.
   → 1:1 수업 아이들도 구독학습 플랜을 짜야 함 (사용자 확인).

## 작업 항목
1. [완료] firestore.rules — tasks에 학생 update 2종 허용
   - 본인 draft 내용 수정: 필드 제한 (serviceSlug, partSlug, title, scheduleDays, progressLabel, level, setName)
   - 본인 과제 삭제 요청: deleteRequested, deleteRequestedAt 필드만
2. [완료] functions/src/auth.ts — `getStudentDirectSlugs` callable 추가
   - 입력: loginId. 본인(users.plantor_id 또는 @plantor.app 이메일) 또는 어드민만 허용
   - 활성 directClasses에서 해당 학생의 serviceSlugs 수집해 반환 (만료 수업 제외)
   - 기존 getStudentLessonLogs/getParentLessonLogs 패턴 준수
3. [완료] src/lib/hooks/useChildData.ts — directClasses 직접 onSnapshot 제거, callable 호출로 교체
4. [완료] src/components/shared/add-task-form.tsx — handleSave/삭제요청에 catch + 실패 알림
5. [완료] 배포 — firestore rules, functions, hosting (next build + firebase deploy)

## 검증
- 타입 체크/빌드 통과
- 배포 후 직강 학생 loginId로 과목 슬러그가 반환되는지 확인 (스크립트/에뮬레이션)
