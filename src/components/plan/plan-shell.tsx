"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { CenterMsg } from "@/components/ui/center-msg";
import { LoginPrompt } from "@/components/ui/login-prompt";
import { StudentPlan } from "./student-plan";

export function PlanShell() {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  // 학습 화면과 같은 데모 경로(?demo=true). 로그인 없이 화면을 볼 수 있어야
  // 디자인을 손볼 때마다 실제 렌더를 확인할 수 있다.
  const isDemo = useSearchParams().get("demo") === "true";

  useEffect(() => {
    if (isDemo || loading || !user || !role) return;
    if (role === "admin") router.replace("/admin");
    else if (role === "parent") router.replace("/account");
  }, [isDemo, loading, user, role, router]);

  if (isDemo) return <StudentPlan userId="demo" isDemo />;
  if (loading) return <CenterMsg>로딩 중…</CenterMsg>;
  if (!user) return <LoginPrompt message="학습 계획을 보려면 먼저 로그인해 주세요." />;
  if (role && role !== "student") return <CenterMsg>로딩 중…</CenterMsg>;
  return <StudentPlan userId={user.uid} userEmail={user.email} />;
}
