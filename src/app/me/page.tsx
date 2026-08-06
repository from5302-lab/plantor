import type { Metadata } from "next";
import { ProfileShell } from "@/components/profile/profile-shell";

export const metadata: Metadata = {
  title: "내 프로필 — Plantor",
  description: "내 레벨·뱃지·학습 기록",
};

export default function MePage() {
  return <ProfileShell />;
}
