/**
 * 로그인 후 돌아갈 곳(next) 처리.
 *
 * 로그인 페이지가 따로 없고 모달만 있어서, 외부 화면(예: /campus)에서 로그인을
 * 요구할 때 돌아올 방법이 없었다. `/?login=1&next=/campus` 형태로 넘겨 받는다.
 *
 * ⚠ next 를 그대로 믿으면 오픈 리다이렉트가 된다(`next=https://evil.com`).
 *   같은 사이트의 절대경로만 통과시킨다.
 *
 * useSearchParams 대신 window.location 을 읽는다 — 정적 export(output:"export")에서
 * useSearchParams 는 Suspense 경계를 요구해 빌드가 까다로워진다.
 */

export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;   // 절대 URL·상대경로 모두 거부
  if (raw.startsWith("//")) return null;   // //evil.com 은 프로토콜 상대 URL 이다
  return raw;
}

export function readNextParam(): string | null {
  if (typeof window === "undefined") return null;
  return safeNextPath(new URLSearchParams(window.location.search).get("next"));
}

export function wantsLoginModal(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("login") === "1";
}
