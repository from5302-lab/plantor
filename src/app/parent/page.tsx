import type { Metadata } from "next";
import { Suspense } from "react";
import { ParentShell } from "@/components/parent/parent-shell";

export const metadata: Metadata = {
  title: "자녀 학습 현황 — Plantor",
  description: "자녀의 오늘 학습 결과와 인증샷을 확인하세요.",
};

export default function ParentPage() {
  return (
    <Suspense>
      <ParentShell />
    </Suspense>
  );
}
