"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

/** 로그인된 상태로 홈에 있으면 역할에 맞는 페이지로 자동 이동 */
export function LoginRedirect() {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user || !role) return;
    if (role === "student") router.replace("/learn");
    else if (role === "parent") router.replace("/account");
  }, [loading, user, role, router]);

  return null;
}
