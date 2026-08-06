# 리서치: 첫 페이지 = 피드 / 소개 페이지 전면개편

작성: 2026-08-06

## 1. 현재 라우팅

| 경로 | 내용 | 비고 |
|---|---|---|
| `/` | 소개(랜딩) — Hero · ServicesSection · SignupCtaBanner · Values · Faq · Cta + `LoginRedirect` | `src/app/page.tsx` (21줄) |
| `/community` | 리워드 피드 — `CommunityShell` → `FeedList` | `src/app/community/page.tsx` (11줄) |

- `output: "export"` 정적 사이트 → **서버 리다이렉트 불가**. 경로 이동은 파일을 실제로 옮기거나 클라이언트 분기로만 가능.
- `LoginRedirect`: 로그인 상태로 `/`에 오면 학생→`/learn`, 학부모→`/account`. 운영자는 머무름.
- `/community` 를 가리키는 링크는 네비 2곳뿐 (`navbar.tsx:181` 데스크톱, `:272` 모바일). 로고는 `/`(`navbar.tsx:71`).

## 2. SEO 현황 (루트가 소개라는 전제로 짜여 있음)

- `layout.tsx`: `title "Plantor — Plan + Mentor"`, `description "학원이 쓰는 검증된 학습 프로그램을…"`, `alternates.canonical: "/"`, OG `url: https://plantor.web.app`
- `sitemap.ts`: `/` priority 1.0, `/signup` 0.8, `/momsaipack` 0.6
- `robots.ts`: 앱 화면(`/admin` `/parent` `/account` `/vault` `/learn` `/plan` `/note` `/writing`) 차단. `/community`는 허용 중.
- → 루트가 피드가 되면 **소개 문구·canonical·sitemap 우선순위를 새 경로로 옮겨야** 검색 유입이 소개로 떨어진다.

## 3. 랜딩 컴포넌트 실태

| 파일 | 크기 | 성격 |
|---|---|---|
| `services-section.tsx` | 30KB | **어드민 인라인 편집 + Firestore `serviceOverrides` + Storage 아이콘 업로드 + 지배색 추출**. 단순 표시 컴포넌트가 아님 → 건드리면 회귀 위험 큼 |
| `hero.tsx` | 2KB | 카피 하드코딩 ("학원이 쓰는 학습 프로그램 / 집에서 월 1.5만원부터") |
| `values.tsx` | 2.3KB | `CORE_VALUES` 4개 렌더 |
| `faq.tsx` | 2.4KB | `FAQS` 6개 렌더 |
| `signup-cta-banner.tsx` / `cta.tsx` | 1KB 내외 | 버튼 하나짜리 배너 |

- 스타일: 랜딩만 인라인 `style` + `design-tokens.T`. 나머지 앱은 Tailwind v4 + `--color-p-*` 토큰.
- `STATS`(`data/site.ts`)는 **어디서도 안 씀** — 이번 작업 이전부터 있던 죽은 데이터.

## 4. 최근 업데이트 자산 (소개에 실을 재료)

- **자동 수집**: `functions/src/scraper-{autovoca,classcard,class5,dailykor}.ts` (총 1,900줄). 교사 계정으로 학생 진도를 긁어 `learningLogs(method:"auto")` 기록. 학생·학부모가 직접 입력하는 것 없음.
- **XP 산식** (`rewards-config.ts`): 완료 60 / 진행 20 / 품질 최대 40 / 분량 보너스 최대 45, 서비스·일 상한 250, 학생·일 상한 600. 만회는 ×0.7. 연속 학습 배수 3일 ×1.1 → 30일 ×1.5.
- **품질 앵커**: 서비스별 실측 분포(2026-07-29 전 학생 스크래핑) 기준. 매일국어는 추천 독해속도 2배 초과 시 품질 절반 — "빨리 넘기기"가 점수가 안 됨.
- **레벨·칭호**: 9단계 (씨앗 → 새싹 → 떡잎 → 줄기 → 잎새 → 꽃봉오리 → 개화 → 열매 → 큰나무 Lv80).
- **뱃지**: 45종 / 희귀도 4단계(일반·희귀·영웅·전설) / 대부분 히든.
- **상점**: 캐릭터(식물) 26종 + 테두리·이름·이펙트·배경. 전부 CSS, 이미지 0장. 홀로그램류는 돈이 아니라 **특정 뱃지**로만 열림. 큰나무 캐릭터는 Lv30 이상.
- **피드**(`/community`): 시간순 스트림(랭킹 아님 — 상위 독점 방지가 설계 원칙). 상단 오늘 요약(공부한 인원 · 모은 XP · 최고 연속 · 아직 학습 중 인원). 이름은 가려서 저장하고 가족·운영자만 실명 복원.

## 5. 새 전략과 충돌하는 기존 문구

1. **`CORE_VALUES[0]` "학부모에게 교사 계정을 드립니다"** — 현재 제품과 어긋난다. 교사 계정은 **운영자가 스크래핑에 쓰는 자격**이고(`verify-auto.ts:15`, `auto-verify-batch.ts:109`), 학부모에게 발급하지 않는다. 학부모는 플랜토 화면에서 결과를 본다.
2. **FAQ "아이가 실제로 학습하고 있는지 확인할 수 있나요?"** — 답이 "각 프로그램의 기록이 표시된다" 수준. 지금은 자동 수집 + XP·레벨로 훨씬 강해졌는데 옛 설명에 머물러 있음.
3. **Hero "집에서 월 1.5만원부터"** — 사실이고 유효하지만, 단독 히어로로 두면 최근 1년의 핵심 자산(지속 장치)이 소개에서 통째로 빠진다.

나머지(등원시간 0분 · 학습 현황 확인 · 재구독률 93% · 서비스 라인업 · FAQ 5개)는 새 전략과 충돌하지 않음 → 내용 유지, 디자인만 신규.
