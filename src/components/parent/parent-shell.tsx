"use client";

import { useAuth } from "@/lib/auth-context";
import { CenterMsg } from "@/components/ui/center-msg";
import { LoginPrompt } from "@/components/ui/login-prompt";
import { ParentDashboard } from "./parent-dashboard";

export function ParentShell() {
  const { user, role, loading } = useAuth();

  if (loading) return <CenterMsg>로딩 중…</CenterMsg>;
  if (!user) return <LoginPrompt message="자녀 학습 현황을 보려면 로그인해 주세요." />;
  if (role === "student") return <CenterMsg>학부모 계정으로 로그인해 주세요.</CenterMsg>;

  return <ParentDashboard userId={user.uid} />;
}
