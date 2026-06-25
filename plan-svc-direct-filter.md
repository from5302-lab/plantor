# plan — 서비스 필터에 직강 학생 포함

> 작성일: 2026-06-01 / 상태: 검토 대기 (승인 전 구현 금지)

## 목표
서비스 아이콘 필터(예: 클래스카드)를 누르면 **그 서비스를 쓰는 모든 학생**이 목록에 뜨게 한다.
현재는 구독 가족만 뜨고 직강(direct class) 학생이 빠져서 아이콘 카운트(9)와 목록(2)이 불일치.

예: 클래스카드 = 구독 가족 2 + 직강 학생 7 = **9명 전원 표시**

## 현재 구조 (확인 완료)
- 회원 목록 렌더: `members-tab.tsx:1010~1031`
  - 구독 가족 → `FamilyList` (서비스 필터 정상 동작, 클래스카드 누르면 2가족)
  - 직강 학생 → `DirectStudentList` (`:1022`)
- 문제 라인 `members-tab.tsx:1022`:
  ```
  statusFilter === "active" && !isPlantor && !isSvcSlug && directClasses.length > 0
  ```
  `!isSvcSlug` 때문에 **특정 서비스를 고르면 직강 목록이 통째로 사라짐**.
- `DirectStudentList` (`:1945`)는 검색어 필터만 있고 serviceSlug 필터 없음.
- 직강 학생의 서비스 보유 판단: `student.serviceSlugs`(없으면 `cls.serviceSlugs`) (`:1830`).

## 변경안 (3곳)
1. **`members-tab.tsx:1022` 렌더 조건 수정**
   - `!isSvcSlug` 제거 → 서비스 선택 시에도 직강 목록 렌더, `serviceSlug={isSvcSlug ? svcFilter : undefined}` 전달.
   - momsaipack(AI패키지)은 직강과 무관하므로 제외.
   - svcFilter 없을 때(전체) = 기존처럼 전체 직강 표시(serviceSlug=undefined).
2. **`DirectStudentList`에 `serviceSlug?` prop 추가**
   - serviceSlug 있으면 **해당 slug 학생이 있는 active 클래스만** 필터.
3. **`DirectStudentCard`에 `serviceSlug?` prop 추가**
   - 다중 학생 클래스에서 해당 서비스 학생만 렌더(결정 C에 따라).

## 검증 기준
- 클래스카드 필터 → 구독 2 + 직강 7 = **9명** 표시
- class5 필터 → 구독 14 + 직강 1(박하진) = 15 표시
- 필터 해제(전체) → 기존과 동일하게 전부 표시
- (가능하면) 어드민에서 실제 확인

## 확정된 결정 (A/B/C)
- **A. 직강 카드 매출**: ✅ 필터 중엔 숨김 (`!serviceSlug && cls.tuition > 0`)
- **B. 대상 범위**: ✅ active 직강만 (카운트와 일치)
- **C. 다중 학생 클래스**: ✅ 해당 서비스 학생만 (학생 단위 필터)

## 진행 현황 (2026-06-01)
- [완료] `members-tab.tsx` 5곳 수정:
  - `:1022` 렌더 조건 `!isSvcSlug` 제거 + `serviceSlug={svcFilter ?? undefined}` 전달, momsaipack 제외
  - `DirectStudentList` serviceSlug prop + active·해당slug 클래스 필터
  - `DirectStudentCard` serviceSlug prop + 학생단위 필터 + 매출 숨김
- [완료] 타입체크 통과
- [완료] 데이터 검증: 클래스카드 2+7=9, class5 16+1=17 → 아이콘 카운트와 일치
- [대기] 어드민 UI 실제 확인 (배포/로그인 필요 — 사용자 확인)

## 별건 — 이전 `??`→`||` 수정 (`members-tab.tsx:795`)
- 현재 데이터엔 영향 없음(구독 37건 모두 familyId 보유). 무해한 방어 코드.
- **유지 / 되돌리기** 중 택해 주세요.
