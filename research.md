# 리서치: 노트 앱 (`plantor.web.app/note`) plantor 통합

> 작업명: 노트 앱 v1 (MVP — 에디터 + 모바일 공유까지)
> PRD: `docs/NOTE_PRD.md`
> 작성일: 2026-05-26

---

## 1. 통합 결정 사항

- 새 Firebase 프로젝트 만들지 않고 **plantor 안에 `/note` 라우트로 통합**
- 호스팅: `plantor.web.app/note`
- Firebase 프로젝트: `plantor-from302` (기존 그대로)
- Auth: plantor 기존 `auth-context.tsx` 재사용
- 빌드: plantor와 통합 (`npm run build` 한 방)

---

## 2. plantor 현황 (관련된 부분만)

### 2.1 스택
- Next.js **16.2.3** + React 19 + TypeScript + Tailwind 4
- `output: "export"` → **정적 export 모드**
- Firebase 12.x (Auth, Firestore, Storage, Functions)
- Functions: `class5Library` 하나만 (us-central1)

### 2.2 라우팅 / 코드 컨벤션 (writing 모듈 기준)
```
src/app/writing/        # 라우트 (page.tsx, layout.tsx, test/)
src/components/writing/ # UI 컴포넌트
src/lib/writing/        # 로직·타입 (test-data.ts, test-scoring.ts, test-types.ts)
```
→ 노트 앱은 `src/app/note/`, `src/components/note/`, `src/lib/note/` 로 동일하게 격리.

### 2.3 Auth (`src/lib/auth-context.tsx`)
- ID 기반 (영문 소문자+숫자, 6~15자) → 내부적으로 `{id}@plantor.app` 이메일로 변환
- Role: `"parent" | "student" | "admin"` + Firestore `users/{uid}.role`
- 어드민: hardcoded email (`from5302@gmail.com`, `from302@plantor.app`) + role 필드
- 학생 ↔ 자녀 연결: `users/{uid}.plantor_id == children/{childId}.loginId`

### 2.4 Firebase 클라이언트 (`src/lib/firebase.ts`)
- `auth`, `db`, `storage`, `functions` 4개 export
- 환경변수 `NEXT_PUBLIC_FIREBASE_*` 사용

### 2.5 Firestore 규칙 패턴 (`firestore.rules`)
- 컬렉션별 명시적 규칙, 끝에 `match /{document=**}` 명시적 거부
- `isAdmin()` 헬퍼: custom claim + hardcoded email + `users.role == 'admin'`
- 본인 데이터 접근은 `plantor_id ↔ loginId` 매칭 패턴 자주 사용

---

## 3. Next.js 16 + 정적 export 제약

- **Server Actions 사용 불가** → 모든 mutation 클라이언트에서 Firestore SDK로
- **API Route 사용 불가** (필요하면 Firebase Functions 별도 추가, 현재는 불필요)
- 동적 라우트는 `generateStaticParams` 또는 SPA 라우팅으로 처리
- `AGENTS.md`: "이 Next.js는 네가 아는 그 Next.js가 아님" — 구현 단계에서 `node_modules/next/dist/docs/01-app/` 의 해당 가이드를 읽고 작업할 것

> 핵심 영향: 실시간 미러링은 **`onSnapshot`** 으로 충분히 가능. 정적 export 제약은 노트 앱 MVP에 큰 장애 없음.

---

## 4. 노트 앱 통합 시 필요한 변경

### 4.1 Auth 확장
- `Role` 타입에 `"teacher"` 추가: `"parent" | "student" | "teacher" | "admin"`
- signup 페이지에서 teacher 선택지 추가할지 vs 별도 진입점(`/note/signup`)은 **미정 (PRD 미해결 #4)**

### 4.2 Firestore 규칙 추가 (요약)
```
match /noteSessions/{sessionId} {
  allow read: if request.auth != null;             // 코드로 들어온 학생도 read 필요
  allow create, update: if request.auth != null    // 교사만 (role 체크)
    && get(...users/$(uid)).data.role in ['teacher','admin'];
  allow read, write: if isAdmin();
}
match /notes/{noteId} {
  allow read: if resource.data.sharedSlug != null; // 공유 노트는 누구나
  allow read, write: if request.auth.uid == resource.data.ownerId;
  allow read, write: if isAdmin();
}
```
→ 규칙은 plan 단계에서 정밀화.

### 4.3 컬렉션 추가
- `noteSessions/{sessionId}` (6자리 code, teacherId, active, currentNoteId, createdAt, expiresAt)
- `notes/{noteId}` (ownerId, title, blocks[], sessionId?, sharedSlug?, createdAt, updatedAt)

### 4.4 의존성 추가 (Phase별로 분할 설치)
- M1: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`
- M2: `katex`
- M4: `smiles-drawer`, `function-plot`

---

## 5. 위험 / 주의

1. **빌드 결합** — 노트 앱 빌드 실패 시 plantor 본체 배포도 막힘. 라우트·코드 폴더 격리 필수.
2. **TipTap 번들 크기** — 정적 export라 코드 스플리팅 신경 써야 함. `app/note/` 라우트로만 임포트.
3. **6자리 코드 충돌** — Firestore transaction으로 unique 보장 필요 (간단한 retry 충분).
4. **붙여넣기 차단 한계** — devtools 우회 가능, UI 마찰만 만든다는 점 PRD에 명시.
5. **공유 링크 = 비로그인 read** — `sharedSlug` 가진 노트는 누구나 읽음. 민감 데이터 없음을 가정.

---

## 6. PRD 미해결 (구현 전 결정 필요한 항목)

1. 영어 구문분석 입력 UX
2. "자동 정리 폼" 구체 형식 (Phase 2)
3. 학생 본인 노트 ↔ 교사 노트 자동 연결 방식
4. 교사 외부 가입 플로우

→ M1~M2 동안은 1·4번이 영향 없음. M3 시점에 4번 필요. 1·2·3번은 Phase 2 항목이라 후순위.
