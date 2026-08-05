import type { Metadata } from "next";
import { CommunityShell } from "@/components/community/community-shell";

export const metadata: Metadata = {
  title: "학습 피드 — Plantor",
  description: "플랜토 학생들이 오늘 얻은 뱃지·레벨·아이템 피드",
};

export default function CommunityPage() {
  return <CommunityShell />;
}
