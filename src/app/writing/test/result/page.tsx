"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { TestResultView } from "@/components/writing/test-result-view";
import { T } from "@/lib/design-tokens";
import type { TestResult } from "@/lib/writing/test-types";

const STORAGE_KEY = "writing_test_result";
/** 저장된 값은 이 페이지가 떠 있는 동안 바뀌지 않는다 — 구독할 게 없다. */
const noSubscribe = () => () => {};

export default function WritingTestResultPage() {
  const router = useRouter();

  // localStorage 는 React 밖의 저장소다. 이펙트에서 읽어 setState 하면
  // 빈 화면으로 한 번 그려진 뒤 다시 그려진다.
  // 정적 export 라 프리렌더에는 값이 없으므로 서버 스냅샷은 null 로 맞춘다(하이드레이션 불일치 방지).
  const raw = useSyncExternalStore(
    noSubscribe,
    () => localStorage.getItem(STORAGE_KEY),
    () => null,
  );

  const result = useMemo<TestResult | null>(() => {
    if (!raw) return null;
    try { return JSON.parse(raw) as TestResult; } catch { return null; }
  }, [raw]);

  // 결과가 없거나 깨졌으면 시험 화면으로 돌려보낸다 (라우팅은 외부 시스템이라 이펙트가 맞다).
  // 판단은 저장소를 직접 읽어서 한다 — 하이드레이션 첫 렌더에서는 raw 가 아직 서버 스냅샷(null)이라,
  // 그 값을 보고 판단하면 결과가 있는데도 되돌려보내게 된다.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { JSON.parse(stored); return; } catch { /* 깨진 값 → 아래에서 이동 */ }
    }
    router.replace("/writing");
  }, [router]);

  if (!result) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <p style={{ fontSize: 15, color: T.textMuted }}>Loading...</p>
      </div>
    );
  }

  return <TestResultView result={result} />;
}
