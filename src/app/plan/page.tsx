import type { Metadata } from "next";
import { PlanShell } from "@/components/plan/plan-shell";

export const metadata: Metadata = {
  title: "학습 계획 — Plantor",
  description: "나만의 주간 학습 계획을 세워보세요.",
};

export default function PlanPage() {
  return <PlanShell />;
}
