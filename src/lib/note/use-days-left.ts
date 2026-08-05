"use client";

import { useState } from "react";
import { TRASH_RETENTION_MS } from "./firestore";

/**
 * 휴지통 항목이 영구 삭제되기까지 남은 일수를 계산하는 함수를 돌려준다.
 *
 * 기준 시각은 마운트할 때 한 번만 잡는다. 렌더 중에 Date.now() 를 부르면
 * 다시 그릴 때마다 값이 달라질 수 있어(React 순수성 규칙 위반) 화면이 흔들린다.
 * 어차피 '일' 단위 표시라 화면을 보는 동안 기준이 고정돼도 문제가 없다.
 */
export function useDaysLeft(): (deletedAt?: number) => number {
  const [now] = useState(() => Date.now());
  return (deletedAt?: number) => {
    if (!deletedAt) return 0;
    const left = TRASH_RETENTION_MS - (now - deletedAt);
    return Math.max(0, Math.ceil(left / (24 * 60 * 60 * 1000)));
  };
}
