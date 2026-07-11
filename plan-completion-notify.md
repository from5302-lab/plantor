# plan.md — 과제 완료/미완료 카카오 알림 (부모/학생)

> 상태: **설계 확정, 최종 승인 대기** — 코딩 전 승인 필요
> 작성/갱신: 2026-07-07

## 0. 원하는 것
- 학생이 오늘 과제를 **완료**하면 → **학부모**에게 카톡
- 과제가 **안 되면** → **학생**에게 카톡

## 0.1 확정된 결정 (2026-07-07)
1. 완료 톡 = **실시간**(완료되는 순간) / 미완료 톡 = **마감시각 1회**(실시간 불가)
2. 가족(비직강) 학생도 **전화번호 추가**
3. 발송 = **알림톡 템플릿**(완료-부모용 / 미완료-학생용 2종)
4. 완료 기준 = **오늘 전체 과제 완료 시 부모 1건**

## 1. 이미 있는 것 (재사용) ✅
- 카카오: `sms.ts` `sendAlimtalk`(템플릿+SMS폴백)
- 연락처: 직강 `studentPhone`+`parentPhone`, 가족 `family.phone`
- 스케줄: `onSchedule` 배치 인프라
- `TaskCheck` 타입에 **`checkedBy:"agent"`** 이미 존재(자동검사 설계됨)

## 2. 핵심 구조 발견 (설계의 축)
- 완료 truth = **오늘 스케줄된 confirmed `tasks` + 그날 `taskChecks.done`** (parent/admin/account 공통).
- taskChecks는 **클라이언트에서만** 기록됨(학생이 "완료" 클릭 시 `checkedBy:"student"`).
- ⚠️ **자동인증(classcard/autovoca 스크래퍼)은 `learningLogs`만 쓰고 `taskChecks`는 안 만듦.**
  → 무인 자동완료가 "완료"로 안 잡히고 알림도 못 울림.
- **해결(선결):** 자동인증 완료 시 **`taskChecks.done`(checkedBy:"agent")도 기록**하도록 브리지 추가.
  → 이러면 (무인/클릭 무관) 완료가 taskChecks 하나로 통일되고, 알림·부모대시보드가 모두 동작.

## 3. 아키텍처
```
[완료 경로]
 학생 클릭 완료 ─┐
 자동인증 완료 ──┤→ taskChecks.done 기록 (agent/student)
                 └→ (신규) Firestore 트리거 onWrite(taskChecks/{id})
                       → 그 학생 오늘 과제 전부 done? → 예: 부모 알림톡 1건(하루 1회 dedup)

[미완료 경로]
 (신규) onSchedule 마감시각(예 21:00 KST)
   → 오늘 과제 있는 전 학생 평가 → 미완료 학생에게 알림톡 (하루 1회 dedup)
```

## 4. 구현 단계 (승인 후)
1. **자동인증→taskCheck 브리지**: `verifyAutoProgress`(클릭) + `auto-verify-batch`(무인)에서 autoStatus="완료"일 때, 해당 학생의 그 서비스 **오늘 과제(Task)**를 찾아 `taskChecks.done`(checkedBy:"agent") upsert.
   - 서버 완료판정 유틸 신설: 학생별 오늘 confirmed·스케줄된 tasks 조회 + serviceSlug 매칭.
2. **완료 알림 트리거**: `onDocumentWritten("taskChecks/{id}")` → 해당 childId 오늘 과제 전부 done이면 부모 알림톡. `notifications` 문서로 하루 1회 dedup.
3. **미완료 알림 스케줄**: `onSchedule` 마감시각 → 오늘 과제 미완료 학생 → 학생 알림톡. dedup.
4. **연락처 매핑**: 직강=studentPhone/parentPhone, 가족=부모 family.phone + (신규) 가족 자녀 `studentPhone` 필드.
5. **가족 학생폰 입력**: `Child`(또는 children 문서)에 `studentPhone` 추가 + `/account` 자녀탭·어드민 입력 UI.
6. **카카오 템플릿 2종 등록**(사용자) + `KAKAO_TEMPLATES`에 ID 추가. 문구 변수: 학생명·날짜·완료(또는 남은)과목.
7. 온오프/대상 설정 + 발송 로깅.

## 5. 외부 의존(블로커)
- **카카오 알림톡 템플릿 2종 사전심사** — 카카오 채널 관리자에서 등록·승인(영업일 소요). 승인 전엔 SMS 폴백으로 임시 동작 가능.

## 6. 열린 질문
- 마감 시각 몇 시로? (기본 제안 21:00 KST)
- "완료 인증" 엄격도: 학생 클릭만으로 완료 인정 vs 자동인증(autoStatus=완료) 확인까지 요구? (권장: taskCheck 기준 통일, 자동인증은 보강)
- 알림 대상 범위: 전체 vs 옵트인?
