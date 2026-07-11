# Plan: 플랜 과제의 서비스/파트 목록을 웹에서 추가·편집

> 작성일: 2026-07-04
> 상태: 구현·배포 완료 (2026-07-04)

## 배경 / 현황 (리서치 완료)
- 과제 추가·편집 드롭다운의 **서비스 목록**(오토보카, 클래스카드…)과 **파트 목록**(듣기훈련, 문법훈련, 내신대비, 어휘암기…)은
  `src/data/site.ts`의 정적 `SERVICES` 배열에 하드코딩.
- 이미 절반은 구축돼 있음:
  - Firestore `serviceOverrides` 컬렉션 (누구나 읽기 / 어드민 쓰기, rules:254)
  - 정적 목록 위에 병합해주는 `ServicesProvider`/`useServices()` — 루트 layout에 이미 장착
  - 랜딩 페이지에 어드민용 서비스 추가/수정/숨김/순서변경 모달(`ServiceFormModal`) 존재
- 빠진 것:
  1. `ServiceFormModal`에 **파트 편집 기능 없음** (이름/가격/아이콘 등만)
  2. 과제 관련 컴포넌트들이 병합 목록이 아닌 **정적 SERVICES를 직접 import** →
     오버라이드/신규 서비스·파트가 플랜 화면에 반영 안 됨
     (add-task-form.tsx, admin/plan-tab.tsx, shared/student-learning-grid.tsx, parent/parent-dashboard.tsx, useChildData의 KNOWN_SLUGS)

## 작업 항목
1. [완료] ServiceFormModal에 "학습 파트" 편집 섹션 추가
   - 파트 추가 / 이름 수정 / 삭제 / 순서 변경, category 입력(선택)
   - progressLabel(파트 대신 진도 라벨 사용) 토글 노출
   - 저장 시 serviceOverrides/{slug}.parts 로 merge 저장
2. [완료] 과제 관련 컴포넌트를 useServices() 병합 목록으로 교체
   - add-task-form.tsx (SERVICES 참조 7곳: 폼, TaskRowEditor, EditableTaskCard)
   - admin/plan-tab.tsx (svcName 등), shared/student-learning-grid.tsx, parent/parent-dashboard.tsx
3. [완료] useChildData KNOWN_SLUGS 필터를 병합 목록 기준으로 변경 (신규 _extra 서비스가 직강 과목에서 안 걸러지게)
4. [완료] 타입체크/빌드 → hosting 배포

## 유의사항
- 과제 문서는 slug와 완성된 title 문자열로 저장되므로, 파트 이름을 바꿔도 기존 과제 표시는 깨지지 않음.
- 새 서비스가 특정 학생의 과제 드롭다운에 뜨려면 그 학생의 구독 또는 직강 수업 과목(serviceSlugs)에 해당 slug가 등록돼 있어야 함 (드롭다운은 구독 필터를 거침).
