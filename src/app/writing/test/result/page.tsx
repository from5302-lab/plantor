"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TestResultView } from "@/components/writing/test-result-view";
import { T } from "@/lib/design-tokens";
import type { TestResult } from "@/lib/writing/test-types";

export default function WritingTestResultPage() {
  const router = useRouter();
  const [result, setResult] = useState<TestResult | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("writing_test_result");
    if (stored) {
      try {
        setResult(JSON.parse(stored));
      } catch {
        router.replace("/writing");
      }
    } else {
      router.replace("/writing");
    }
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
