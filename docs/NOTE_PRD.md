# NOTE_PRD.md — 타이핑 기반 학습 필기 앱

> 작성일: 2026-05-26
> 상태: 확정 (v1)
> 배포 위치: `plantor.web.app/note` (plantor 프로젝트 내부 모듈로 통합)

---

## 1. One-Liner

> 노션 스타일 블럭 에디터에 **학습 특화 블럭**(수식·분자식·그래프·영어 구문분석)을 더한, **타이핑 기반** 학습 필기 웹앱.

- 교사는 수업 시간 **디지털 칠판**으로 사용
- 학생은 복습 시 **본인 노트**를 직접 타이핑 (붙여넣기 차단)
- 결과물은 자동으로 모바일 친화 페이지로 공유

---

## 2. Problem

- 복사·붙여넣기 위주 학습은 기억에 남지 않는다 → **타이핑 강제**
- 디지털 칠판은 수업 끝나면 사라진다 → **세션 노트 자동 보존**
- 종이 필기는 검색·공유 불가 → **모바일 공유 링크**

---

## 3. 사용자

| 역할 | 행동 | 비고 |
|---|---|---|
| 교사 | 세션 코드 발급, 칠판 사용, 노트 공유 | 추후 유료화 대상 |
| 학생 | 칠판 보면서 본인 노트 작성, 모바일 복습 | 붙여넣기 차단 |

plantor 기존 사용자(parent/student)와 일부 겹치며, **외부 교사·학생**도 받는다.

---

## 4. MVP 범위 (v1)

### 포함
- 블럭 에디터 (텍스트, 제목, 리스트, 인용, 코드)
- 마크다운 단축키 (`#`, `-`, `>`, ` ``` ` 등)
- 학습 블럭 4종:
  - 수학 수식 (LaTeX → KaTeX)
  - 화학 분자식 (SMILES → SmilesDrawer)
  - 그래프 (함수식 → function-plot)
  - 영어 구문분석 (문장 + 태깅, 자체 트리)
- 교사 6자리 **세션 코드** 발급
- 교사 → 학생 **실시간 미러링** (Firestore onSnapshot, read-only)
- 학생 본인 노트 작성 + **붙여넣기 차단** (paste / drag&drop / contextmenu / Ctrl·Cmd+V)
- 모바일 공유 (읽기 전용 웹 링크, 반응형)
- 로그인: plantor 기존 Auth 재사용 + 외부 가입(teacher role 추가)

### 제외 (Phase 2+)
- 퀴즈·플래시카드 자동 생성
- 커뮤니티 (같은 범위 공유)
- 결제·교사 유료 플랜
- PDF / 이미지 내보내기
- 영구 클래스(반) 구조
- PWA 설치
- 자동 정리 폼 (요구사항 추가 정의 필요)

---

## 5. 핵심 기능 상세

### 5.1 에디터
- `/` 입력 시 블럭 종류 선택 메뉴
- 블럭 드래그 정렬
- 마크다운 단축키
- 라이브러리: **TipTap** (블럭 확장 유연성)

### 5.2 학습 특화 블럭

| 블럭 | 입력 | 렌더링 |
|---|---|---|
| math | LaTeX 소스 | KaTeX |
| chem | SMILES 문자열 | SmilesDrawer (클라이언트) |
| graph | `y = f(x)` 함수식 | function-plot |
| syntax | 문장 + 품사 태깅 | 자체 트리 컴포넌트 |

### 5.3 교사 모드
1. "수업 시작" → 6자리 세션 코드 생성 (24시간 유효)
2. 노트 작성 (모든 변경 Firestore 실시간 저장)
3. 학생이 코드 입력 → read-only 미러링
4. "수업 종료" → 학생에게 노트 링크 자동 공유

### 5.4 학생 모드
- 교사 칠판 실시간 보기
- 별도 탭에서 본인 노트 작성
- **붙여넣기 차단**:
  - `paste` 이벤트 preventDefault
  - drag & drop 차단
  - contextmenu 차단
  - 키보드 Ctrl·Cmd+V 차단
  - ※ devtools 우회 가능 — UI 레벨 마찰 만드는 게 목표

### 5.5 공유
- 노트 → "공유" → 읽기 전용 URL (`plantor.web.app/note/n/{slug}`)
- 비로그인 열람 가능 (링크만 있으면 OK)
- 모바일 최적화 뷰

---

## 6. 기술 스택 / 통합 방식

| 항목 | 내용 |
|---|---|
| 프레임워크 | plantor 기존 Next.js 16 (App Router, `output: "export"`) |
| 라우트 위치 | `src/app/note/` |
| 컴포넌트 | `src/components/note/` |
| 로직·훅 | `src/lib/note/` |
| 에디터 | TipTap |
| 수식 | KaTeX |
| 분자식 | SmilesDrawer |
| 그래프 | function-plot |
| 백엔드 | plantor 기존 Firebase (`plantor-from302`) |
| Auth | 기존 `auth-context.tsx` 재사용 + `teacher` role 추가 |
| 호스팅 | `plantor.web.app/note` |

### 정적 export 제약
- 서버 액션·API Route 불가 → 모든 동적 처리는 클라이언트 + Firestore
- 실시간 미러링은 `onSnapshot`으로 충분

---

## 7. 데이터 모델 (초안)

```
users/{uid}
  - role: "parent" | "student" | "teacher" | "admin"  ← "teacher" 추가
  - plantor_id, name, ...

noteSessions/{sessionId}        # 교사 수업 세션
  - code: string (6자리, unique)
  - teacherId
  - active: boolean
  - currentNoteId: string
  - createdAt, expiresAt (createdAt + 24h)

notes/{noteId}
  - ownerId
  - title
  - blocks: Block[]
  - sessionId?: string         # 교사 노트면 세션 연결
  - sharedSlug?: string        # 공유 URL용
  - createdAt, updatedAt

Block (in-array 또는 subcollection):
  - id: string
  - type: "text"|"heading"|"list"|"quote"|"code"|"math"|"chem"|"graph"|"syntax"
  - content: string
  - meta?: Record<string, unknown>
```

### Firestore 규칙 추가 (요약)
- `noteSessions`: 교사 본인 write, 코드로 read (active 세션만), 어드민 전체
- `notes`: 소유자 read·write, `sharedSlug` 있으면 누구나 read, 어드민 전체

---

## 8. 비기능 요건

- 교사 → 학생 미러링 지연 **1초 이내**
- 모바일 반응형 (읽기/필기 모두)
- 오프라인은 Phase 2 (PWA)

---

## 9. 마일스톤 (대략 9주 — 추정치, 작업 시 조정)

| M | 기간 | 내용 |
|---|---|---|
| M1 | 2w | `app/note/` 셋업 + TipTap 텍스트 블럭 에디터 |
| M2 | 2w | 마크다운 단축키 + 수식(math) 블럭 |
| M3 | 2w | 세션 코드 발급 + 실시간 미러링 |
| M4 | 1w | 분자식·그래프·영어 구문분석 블럭 |
| M5 | 1w | 학생 붙여넣기 차단 + 본인 노트 |
| M6 | 1w | 모바일 공유 링크 |

---

## 10. 미해결 (PRD 확정 후에도 결정 필요)

1. **영어 구문분석 입력 UX** — 사용자가 어떻게 태깅? (드래그 선택? 자동 파싱?)
2. **자동 정리 폼** — Phase 2의 "자동 정리"가 어떤 형태? (요약? 목차? AI 호출?)
3. **학생 본인 노트 ↔ 교사 노트 연결** — 수업별 자동 묶음?
4. **교사 외부 가입 플로우** — plantor 기존 signup 라우트와 분리할지, role 선택 추가할지
