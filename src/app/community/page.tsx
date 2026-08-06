import type { Metadata } from "next";
import { CommunityShell } from "@/components/community/community-shell";

// 피드의 정식 주소는 "/" 다. 이 경로는 예전 링크·북마크를 위해 남겨 두고,
// canonical 로 "/" 를 가리켜 같은 내용이 두 번 색인되지 않게 한다.
export const metadata: Metadata = {
  title: "학습 피드 — Plantor",
  description: "플랜토 학생들이 오늘 얻은 뱃지·레벨·아이템 피드",
  alternates: { canonical: "/" },
};

export default function CommunityPage() {
  return <CommunityShell />;
}
