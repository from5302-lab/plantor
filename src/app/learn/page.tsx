import type { Metadata } from "next";
import { Suspense } from "react";
import { LearnShell } from "@/components/learn/learn-shell";

export const metadata: Metadata = {
  title: "오늘 학습 — Plantor",
  description: "오늘 할 학습을 확인하고 완료를 기록하세요.",
};

export default function LearnPage() {
  return (
    <Suspense>
      <LearnShell />
    </Suspense>
  );
}
