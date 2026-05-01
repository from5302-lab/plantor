import type { Metadata } from "next";
import { CommunityShell } from "@/components/community/community-shell";

export const metadata: Metadata = {
  title: "학습 피드 — Plantor",
  description: "플랜토 학생들의 오늘 학습 인증 피드",
};

export default function CommunityPage() {
  return <CommunityShell />;
}
