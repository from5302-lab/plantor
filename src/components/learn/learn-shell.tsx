"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { CenterMsg } from "@/components/ui/center-msg";
import { LoginPrompt } from "@/components/ui/login-prompt";
import { LearnDashboard } from "./learn-dashboard";

export function LearnShell() {
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "true";
  const { user, role, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user || !role) return;
    if (role === "admin") router.replace("/admin");
    else if (role === "parent") router.replace("/account");
  }, [loading, user, role, router]);

  if (isDemo) return <LearnDashboard userId="demo" userName="데모" isDemo />;
  if (loading) return <CenterMsg>로딩 중…</CenterMsg>;
  if (!user) return <LoginPrompt message="학습 홈을 보려면 먼저 로그인해 주세요." />;
  if (role && role !== "student") return <CenterMsg>로딩 중…</CenterMsg>;
  return <LearnDashboard userId={user.uid} userName={user.displayName} userEmail={user.email} />;
}
