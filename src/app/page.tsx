import type { Metadata } from "next";
import { CommunityShell } from "@/components/community/community-shell";
import { LoginRedirect } from "@/components/auth/login-redirect";

// 첫 화면은 학습 피드다. 소개는 /about 이 맡는다.
// 로그인한 학생·학부모는 LoginRedirect 가 각자의 학습 홈으로 보낸다.
export const metadata: Metadata = {
  title: "학습 피드 — Plantor",
  description: "플랜토 학생들이 오늘 얻은 경험치·뱃지·레벨 피드",
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <>
      <LoginRedirect />
      <CommunityShell />
    </>
  );
}
