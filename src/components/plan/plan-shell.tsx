"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { CenterMsg } from "@/components/ui/center-msg";
import { LoginPrompt } from "@/components/ui/login-prompt";
import { StudentPlan } from "./student-plan";

export function PlanShell() {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user || !role) return;
    if (role === "admin") router.replace("/admin");
    else if (role === "parent") router.replace("/account");
  }, [loading, user, role, router]);

  if (loading) return <CenterMsg>로딩 중…</CenterMsg>;
  if (!user) return <LoginPrompt message="학습 계획을 보려면 먼저 로그인해 주세요." />;
  if (role && role !== "student") return <CenterMsg>로딩 중…</CenterMsg>;
  return <StudentPlan userId={user.uid} userEmail={user.email} />;
}
