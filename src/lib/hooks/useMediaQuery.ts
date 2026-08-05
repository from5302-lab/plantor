"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * 미디어 쿼리 일치 여부를 구독한다.
 *
 * 이펙트에서 matchMedia 를 읽어 setState 하면, 데스크톱 기준으로 한 번 그려진 뒤
 * 모바일 화면으로 다시 그려진다(내용이 한 번 튄다).
 *
 * 정적 export 라 프리렌더 시점엔 window 가 없으므로 서버 스냅샷은 false 로 둔다
 * — 하이드레이션 불일치를 피하려면 서버가 낸 값과 첫 클라이언트 값이 같아야 한다.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
