# Plan: Planote 학습 특수 블럭 + 슬래시 삽입 메뉴

> 작성일: 2026-06-02
> 상태: **구현 완료 (2026-06-02)** — 빌드 통과, 배포 대기
> 관련: [NOTE_PRD.md](./NOTE_PRD.md) M2·M4

## 목표
일반 블럭 외에 **학습 특수 블럭**(수식·분자식·그래프·영어 구문분석)을 노트에 입력할 수 있게 한다.
삽입은 **`/` 슬래시 메뉴**로 하고, 메뉴는 **노트 과목에 따라 필터링**한다.

---

## 현황 (리서치 완료)
- 에디터 [editor.tsx](../src/components/note/editor.tsx): StarterKit + math(KaTeX) + tasklist + details + callout + placeholder
- **삽입 UI가 전혀 없음** — 블럭은 마크다운 단축키로만 입력 (예: `::`+스페이스=콜아웃)
- **수식은 이미 설치·동작**: `@tiptap/extension-mathematics` + `katex`. 커맨드 `insertInlineMath`/`insertBlockMath` 제공, 노드명 `inlineMath`/`blockMath`
- 커스텀 노드 패턴은 [callout.ts](../src/lib/note/callout.ts)에 존재 (`Node.create`)
- `@tiptap/react`에 `ReactNodeViewRenderer` 있음 → 인터랙티브 블럭 가능
- `@tiptap/suggestion` **미설치** → 슬래시 메뉴용으로 추가 필요
- 노트 본문은 TipTap JSON으로 Firestore `notes/{id}.content`에 저장 → **새 노드는 JSON에 그대로 직렬화, 기존 노트 마이그레이션 불필요**

## 확정된 결정 (사용자)
1. 범위: **전부** — 슬래시 메뉴 + 수식(강화) + 분자식 + 그래프 + 구문분석
2. 구문분석: **수동 태깅** (서버/AI 호출 없음. 사용자가 직접 품사·역할 지정)
3. 슬래시 메뉴: **과목별 필터링**

---

## 추가 의존성 (설치 예정)
| 패키지 | 용도 | 비고 |
|---|---|---|
| `@tiptap/suggestion` | `/` 슬래시 트리거 | TipTap 공식, 버전 3.x 맞춤 |
| `smiles-drawer` | 분자식 SMILES → canvas | 순수 JS, WASM 없음, 경량 |
| `function-plot` | 함수식 → SVG 그래프 | d3 의존(번들 ↑). 동적 import로 로드 |

- 특수 블럭 라이브러리는 클라이언트 전용이므로 **동적 import**(`await import(...)`)로 NodeView 안에서만 로드 → 정적 export·초기 번들 영향 최소화.

---

## 과목 → 특수 블럭 매핑 (슬래시 필터)
| 과목 | 우선 노출 특수 블럭 |
|---|---|
| 수학 | 수식, 그래프 |
| 과학·화학 | 분자식, 수식, 그래프 |
| 영어 | 구문분석 |
| 그 외 / 과목 없음 | (특수 블럭은 "더보기"로, 일반 블럭만 우선) |

- 일반 블럭(제목·리스트·인용·코드·체크박스·토글·콜아웃)은 **항상** 노출.
- 과목과 무관하게 전체 블럭은 슬래시 메뉴 하단 "기타"에서 접근 가능 (강제 차단 아님, 강조/정렬만).

---

## 구현 단계

### Step 1. 슬래시 메뉴 토대 (`/`) — [완료]
- `@tiptap/suggestion` 설치
- `src/lib/note/slash-command.ts` — Suggestion 플러그인 기반 확장. `/` 입력 시 후보 목록 제공, 항목 선택 시 해당 블럭 삽입 커맨드 실행
- `src/components/note/slash-menu.tsx` — React 팝업(키보드 ↑↓↵ Esc 지원), 검색어 필터
- editor.tsx에서 현재 `meta.subject`를 슬래시 확장에 주입 → 과목별 정렬/필터
- 일반 블럭 항목부터 연결(제목1~3, 리스트, 체크박스, 인용, 코드, 토글, 콜아웃, 구분선)
- → **verify**: 빈 줄에서 `/` → 메뉴 표시, 항목 선택 시 해당 블럭 삽입, Esc로 닫힘

### Step 2. 수식 블럭 강화 — [완료]
- 슬래시 항목 "수식(블럭)" → `insertBlockMath`, "수식(인라인)" → `insertInlineMath`
- 기존 `$...$` 입력 방식은 유지
- → **verify**: 슬래시로 수식 삽입 → LaTeX 입력 → KaTeX 렌더, 새로고침 후에도 보존(Firestore 저장 확인)

### Step 3. 분자식 블럭 (chem) — [완료]
- `smiles-drawer` 설치
- `src/lib/note/chem-node.ts` — `Node.create({ name: "chem" })`, attr `smiles`, `ReactNodeViewRenderer`
- `src/components/note/chem-view.tsx` — SMILES 입력창 + canvas 렌더(동적 import). 잘못된 SMILES는 에러 표시
- 슬래시 항목 "분자식" 추가
- → **verify**: 슬래시로 분자식 삽입 → `CCO` 입력 → 에탄올 구조 렌더, 저장/복원 확인

### Step 4. 그래프 블럭 (graph) — [완료]
- `function-plot` 설치
- `src/lib/note/graph-node.ts` — `Node.create({ name: "graph" })`, attr `fn`(+선택: 범위), `ReactNodeViewRenderer`
- `src/components/note/graph-view.tsx` — 함수식 입력 + SVG 렌더(동적 import)
- 슬래시 항목 "그래프" 추가
- → **verify**: 슬래시로 그래프 삽입 → `x^2` 입력 → 곡선 렌더, 저장/복원 확인

### Step 5. 구문분석 블럭 (syntax) — 수동 태깅 — [완료]
> 라벨 세트: 문장성분 5종(주어·동사·목적어·보어·수식어) + 품사 5종(명사·형용사·부사·전치사·접속사). 조정 가능.

- 라이브러리 없음(자체 구현)
- `src/lib/note/syntax-node.ts` — `Node.create({ name: "syntax" })`, attr `tokens`(예: `[{text, pos?, role?}]`) + `sentence`
- `src/components/note/syntax-view.tsx`:
  - 문장 입력 → 단어/구 토큰화(공백 기준 + 수동 병합)
  - 토큰 클릭 → 품사/구문역할 팔레트에서 라벨 지정
  - 라벨된 결과를 색/밑줄/트리로 렌더
- 슬래시 항목 "구문분석"(영어) 추가
- → **verify**: 영어 문장 입력 → 토큰 태깅 → 시각 렌더, 저장/복원 확인
- ※ 팔레트 라벨 세트(품사·문장성분 범위)는 Step 5 진입 시 사용자와 1차 확정

### Step 6. 마무리 — [완료]
- 모바일 반응형 확인(슬래시 메뉴·각 블럭)
- `next build` 통과 확인
- → **verify**: 빌드 0 에러, 주요 블럭 동작

---

## 데이터 모델 영향
- 새 노드는 TipTap JSON 노드로 `content`에 저장 (예: `{ type: "chem", attrs: { smiles: "CCO" } }`)
- **기존 노트·스키마 변경 없음**, Firestore 규칙 변경 없음
- NoteMeta 변경 없음

## 미해결 / 리스크
1. **구문분석 라벨 세트** — 품사(N/V/Adj…)와 문장성분(S/V/O/C…) 어디까지? → Step 5에서 확정
2. **function-plot의 d3 의존** — 번들 증가. 동적 import로 완화하되 용량 체크
3. **모바일 슬래시 메뉴** — 가상 키보드와 팝업 위치 충돌 가능 → Step 1에서 확인
4. 구문/분자식 블럭의 **편집 vs 읽기 모드** 전환 UX (탭 시 입력창, 외부 클릭 시 렌더) — 각 Step에서 통일

## 하지 않을 것 (이번 범위 외)
- AI 자동 구문 파싱 / 자동 정리
- 교사 세션·미러링·공유 링크 (PRD M3·M6)
- 붙여넣기 차단 (M5)
