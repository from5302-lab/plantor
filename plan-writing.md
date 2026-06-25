# Writing Service — Phase 1: 레벨테스트 + 결과

## 개요
`/writing` 경로에 한국 학생 대상 영어 에세이 레벨테스트 서비스 구축.
15분 내외, 4개 섹션, AI 채점, 결과 + 레벨 분류 + 약점 분석.

## 라우트 구조
```
/writing              → 랜딩 (서비스 소개 + "테스트 시작" CTA)
/writing/test         → 레벨테스트 (4 섹션, 타이머)
/writing/test/result  → 결과 페이지 (레벨 + 6축 점수 + 약점 + 목표 설정)
```

---

## 파일 구조

```
src/app/writing/
├── page.tsx                    → 랜딩 페이지
├── layout.tsx                  → writing 전용 레이아웃 (Navbar 숨김, 집중 모드)
├── test/
│   ├── page.tsx                → 테스트 진행 페이지
│   └── result/
│       └── page.tsx            → 결과 페이지

src/components/writing/
├── writing-landing.tsx         → 랜딩 컨텐츠 (소개 + CTA)
├── level-test.tsx              → 테스트 메인 컨트롤러 (섹션 전환, 타이머)
├── test-section-sentence.tsx   → Section 1: Sentence Building (객관식)
├── test-section-paragraph.tsx  → Section 2: Paragraph Organization (순서배열+객관식)
├── test-section-short.tsx      → Section 3: Short Response (서술)
├── test-section-essay.tsx      → Section 4: Essay Intro (서술)
├── test-progress-bar.tsx       → 상단 진행률 + 타이머
├── test-result-view.tsx        → 결과 표시 (점수 막대, 레벨, 약점)
└── score-bar.tsx               → 개별 점수 막대 컴포넌트

src/lib/writing/
├── test-data.ts                → 테스트 문제 데이터 (섹션별)
├── test-scoring.ts             → 클라이언트 채점 로직 (Section 1, 2)
├── test-types.ts               → 타입 정의
└── writing-utils.ts            → 공용 유틸

functions/src/
└── writing.ts                  → Cloud Function: AI 채점 (Section 3, 4)
```

---

## 섹션별 설계

### Section 1: Sentence Building (3분, 객관식 8문제)
- **5문제: 오류 수정** — 4지선다, 한국인 특유 오류 중심
  - 관사 (a/the), 전치사 (in/on/at), 시제, Because+so 이중접속, 수일치
- **3문제: 문장 결합** — 두 문장 → 한 문장 (4지선다)
- **채점**: 클라이언트 즉시 (정답 비교, 맞으면 1점)

### Section 2: Paragraph Organization (3분)
- **1문제: 문장 5개 순서 배열** — 번호 클릭으로 순서 지정
- **3문제: Topic sentence 고르기** — 4지선다
- **채점**: 클라이언트 즉시

### Section 3: Short Response (4분, 서술)
- 간단한 주제에 4~5문장 문단 작성
- **채점**: Cloud Function → Claude API → Grammar, Vocabulary, Sentence Complexity (각 10점)

### Section 4: Essay Introduction (5분, 서술)
- 에세이 서론 작성 (hook + background + thesis)
- **채점**: Cloud Function → Claude API → Organization, Argument, Voice & Style (각 10점)

---

## AI 채점 Cloud Function

```typescript
// onCall: gradeWriting
Input: { section: 3|4, prompt: string, response: string }
Output: {
  scores: Record<string, number>,
  feedback: Record<string, string>,
  errorPatterns: string[],
  strengths: string[],
  overallComment: string
}
```

- `@anthropic-ai/sdk` 추가 (functions/)
- ANTHROPIC_API_KEY를 Firebase Secret으로 관리
- 한국어 화자 특유 오류 패턴 감지 시스템 프롬프트

---

## 결과 페이지

### 표시 항목
1. **종합 레벨** (1~5)
   - Level 1: Emerging (0-20) / Level 2: Developing (21-35)
   - Level 3: Expanding (36-45) / Level 4: Bridging (46-55)
   - Level 5: Commanding (56-60)
2. **6축 점수 막대** (각 10점, 수평 막대 그래프)
3. **강점 / 약점 요약** (AI 코멘트)
4. **"트레이닝 시작" CTA** (Phase 2 연결, 현재는 coming soon)

### 데이터 저장
- 로그인 시: Firestore `users/{uid}/writingTests/{testId}`
- 비로그인: localStorage → 로그인 후 이관 유도

---

## 스타일
- DESIGN.md 준수, `T.*` 토큰 사용
- writing 레이아웃: Navbar 숨기고 상단에 로고 + 타이머만
- 모바일 우선

## 의존성 추가
- 프론트: 없음
- Functions: `@anthropic-ai/sdk`

---

## 구현 순서
1. [ ] 타입 + 문제 데이터 (`test-types.ts`, `test-data.ts`)
2. [ ] writing 레이아웃 + 랜딩 페이지
3. [ ] 테스트 UI (progress bar + 4개 섹션 컴포넌트)
4. [ ] 테스트 컨트롤러 (`level-test.tsx`)
5. [ ] 클라이언트 채점 (`test-scoring.ts`)
6. [ ] Cloud Function: AI 채점
7. [ ] 결과 페이지
8. [ ] Firestore 저장 + localStorage 폴백
9. [ ] 빌드 + 배포 테스트
