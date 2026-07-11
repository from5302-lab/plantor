# 핸드오프: 플랜토 구글 검색 노출 작업

> 이 문서는 코워크(실행 담당)가 **그대로 따라 하면 되는** 실행 지침서다.
> 목표: `https://plantor.web.app` 이 구글 검색에 노출되도록 robots·sitemap·metadata 를 넣고, Google Search Console 에 등록·인증·색인 요청까지 완료한다.

## 사전 확인 (이미 조사 완료)
- 스택: Next.js `output: "export"` 정적 사이트 + Firebase Hosting (`plantor` 사이트, `plantor-from302` 프로젝트)
- 배포 명령: `npm run deploy` (= `next build && firebase deploy --only hosting --project plantor-from302`)
- 현재 상태: 사이트 라이브(200), 랜딩 프리렌더 정상. **robots.txt·sitemap.xml 없음(404), Search Console 미등록.**
- 색인 대상 페이지: `/`, `/signup`, `/momsaipack` (앱 기능 화면은 크롤 차단)

---

## STEP 1. `src/app/robots.ts` 새로 만들기

아래 내용으로 **새 파일** `src/app/robots.ts` 생성:

```ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/parent",
        "/account",
        "/vault",
        "/learn",
        "/plan",
        "/note",
        "/writing",
      ],
    },
    sitemap: "https://plantor.web.app/sitemap.xml",
  };
}
```

---

## STEP 2. `src/app/sitemap.ts` 새로 만들기

아래 내용으로 **새 파일** `src/app/sitemap.ts` 생성:

```ts
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://plantor.web.app";
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/momsaipack`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
  ];
}
```

---

## STEP 3. `src/app/layout.tsx` metadata 보강

기존 `export const metadata: Metadata = { ... }` 객체를 수정한다.
아래 3가지를 추가하면 된다 (기존 title/description/openGraph 등은 그대로 유지):

1. 객체 **맨 위**에 `metadataBase` 추가
2. `alternates.canonical` 추가
3. `verification.google` 추가 — **STEP 5에서 발급받은 코드로 채운다** (지금은 빈 문자열로 두거나 STEP 5 후에 넣기)

수정 예시 (추가되는 줄만 표시, `...` 는 기존 값 유지):

```ts
export const metadata: Metadata = {
  metadataBase: new URL("https://plantor.web.app"),   // ← 추가
  title: "Plantor — Plan + Mentor",
  description:
    "학원이 쓰는 검증된 학습 프로그램을, 학원 없이 가정에 직접 연결합니다.",
  alternates: { canonical: "/" },                      // ← 추가
  verification: { google: "여기에_인증코드" },          // ← 추가 (STEP 5에서 받은 코드)
  formatDetection: { telephone: false },
  icons: { /* 기존 유지 */ },
  openGraph: { /* 기존 유지 */ },
  appleWebApp: { /* 기존 유지 */ },
};
```

> `verification.google` 값은 Search Console 이 주는 `content="..."` 안의 문자열만 넣는다 (예: `google-site-verification` 메타태그의 content 값).

---

## STEP 4. 빌드 & 배포 → 라이브 확인

```bash
cd /Users/from302/Vibe_coding/plantor
npm run deploy
```

배포 후 아래가 모두 통과해야 함:

```bash
curl -s -o /dev/null -w "robots:%{http_code}\n" https://plantor.web.app/robots.txt   # 200 기대
curl -s -o /dev/null -w "sitemap:%{http_code}\n" https://plantor.web.app/sitemap.xml # 200 기대
curl -s https://plantor.web.app/robots.txt      # Sitemap 라인 보이는지 눈으로 확인
curl -s https://plantor.web.app/sitemap.xml     # URL 3개 보이는지 확인
```

---

## STEP 5. Google Search Console 등록 (웹 브라우저 작업)

1. https://search.google.com/search-console 접속 (플랜토 운영 구글 계정으로 로그인)
2. 좌측 상단 속성 추가 → **"URL 접두어"** 선택 → `https://plantor.web.app` 입력 → 계속
3. 소유권 확인 방법에서 **"HTML 태그"** 펼치기
4. 나오는 메타태그에서 `content="..."` 안의 **코드 문자열만 복사**
   - 예: `<meta name="google-site-verification" content="AbCdEf123..." />` → `AbCdEf123...` 부분
5. 그 코드를 **STEP 3 의 `verification: { google: "..." }`** 에 붙여넣기
6. **STEP 4 재실행** (`npm run deploy`) 으로 재배포
7. 배포 완료 후 Search Console 창으로 돌아가 **"확인"** 클릭 → 소유권 인증 완료

---

## STEP 6. 사이트맵 제출 + 색인 요청

1. Search Console 좌측 메뉴 → **Sitemaps** → 새 사이트맵에 `sitemap.xml` 입력 → 제출
   - 상태가 "성공"으로 뜨는지 확인
2. 좌측 상단 **URL 검사** 창에 `https://plantor.web.app/` 입력 → Enter
3. **"색인 생성 요청"** 버튼 클릭
4. (선택) `https://plantor.web.app/signup`, `https://plantor.web.app/momsaipack` 도 같은 방식으로 색인 요청

---

## 완료 판정 체크리스트
- [ ] `robots.txt` 라이브 200 + Sitemap 라인 포함
- [ ] `sitemap.xml` 라이브 200 + URL 3개
- [ ] `layout.tsx` 에 metadataBase·canonical·google 인증코드 반영, 재배포됨
- [ ] Search Console 소유권 "확인됨"
- [ ] Sitemaps 상태 "성공"
- [ ] 홈 URL 색인 요청 완료

## 기대치 (사용자에게 안내할 것)
- 인증·색인 요청 후 실제 검색 노출까지 **수일~수주** 소요 (구글 크롤 주기).
- `site:plantor.web.app` 로 구글에 검색하면 색인 여부를 직접 확인할 수 있음.
- "플랜토" 브랜드명 검색은 비교적 빨리 잡히고, 일반 키워드 상위 노출은 콘텐츠·유입이 쌓여야 하는 별개 과제.
```
