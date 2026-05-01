import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";

export const metadata: Metadata = {
  title: "내 대시보드 — Plantor",
  description: "자녀 학습 현황과 구독 정보를 확인하세요.",
};

export default function AccountPage() {
  return <AccountShell />;
}
