# Plan: 플랜토 구글 검색 노출 (SEO 색인)

## 목표
`plantor.web.app` 이 구글 검색 결과에 노출되도록 색인 기반을 만든다.
성공 기준: (1) `/robots.txt`·`/sitemap.xml` 이 라이브에서 200, (2) Google Search Console 에 사이트 등록·소유권 인증 완료, (3) 사이트맵 제출 + 홈 색인 요청 완료.

## 현황 (리서치 완료)
- 배포: Firebase Hosting, Next.js `output: "export"` 정적 사이트 → https://plantor.web.app (라이브 200)
- 랜딩(`/`)은 정적 프리렌더로 한글 본문·`<title>`·`description` 모두 HTML에 포함 → **크롤 가능** (양호)
- `robots.txt` 없음(현재 404), `sitemap.xml` 없음, `metadataBase` 없음, Search Console 미등록

## 결정 사항
- 색인 범위: **공개 마케팅 페이지만** — `/`, `/signup`, `/momsaipack`
  - 앱 기능 화면(`/admin` `/parent` `/account` `/vault` `/learn` `/plan` `/note` `/writing`)은 robots 로 크롤 차단
- 소유권 인증: **HTML 메타태그 방식** (Search Console 발급 코드를 metadata 에 삽입)

## 작업

### 1. robots 생성 → verify: `curl .../robots.txt` 200 + sitemap 라인 포함
- `src/app/robots.ts` 추가 (Next 메타데이터 라우트, 정적 export 시 `out/robots.txt` 로 생성됨)
- 내용: 전체 Allow, 앱 기능 경로 Disallow, `Sitemap: https://plantor.web.app/sitemap.xml`

### 2. sitemap 생성 → verify: `curl .../sitemap.xml` 200 + URL 3개
- `src/app/sitemap.ts` 추가
- URL: `/`, `/signup`, `/momsaipack` (lastModified/우선순위 포함)

### 3. metadata 보강 → verify: 빌드 후 `out/index.html` 에 canonical·verification 태그 존재
- `src/app/layout.tsx` metadata 에 추가:
  - `metadataBase: new URL("https://plantor.web.app")`
  - `alternates: { canonical: "/" }`
  - `verification: { google: "<코드>" }` — Search Console 발급 코드 (사용자 제공 시 삽입)

### 4. 빌드 & 배포 → verify: 라이브 robots/sitemap 200
- `npm run deploy` (next build + firebase deploy --only hosting)

### 5. Search Console 등록 안내 (사용자 작업)
- search.google.com/search-console → URL 접두어 `https://plantor.web.app` 추가
- HTML 태그 방식 선택 → 발급된 `content` 코드를 나에게 전달 → 3번에 삽입·재배포 → 인증
- Sitemaps 메뉴에서 `sitemap.xml` 제출
- URL 검사 → 홈 "색인 생성 요청"

## 참고 (기대치)
- 인증·색인 요청 후 실제 검색 노출까지 보통 수일~수주 소요 (구글 크롤 주기)
- "플랜토" 브랜드 검색은 비교적 빨리, 일반 키워드 상위 노출은 별개(콘텐츠/피드백 필요)

## 미구현
아직 코드 작성 전 — 승인 대기 중.
