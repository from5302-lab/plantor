import type { Metadata } from "next";
import { SignupForm } from "@/components/signup/signup-form";

export const metadata: Metadata = {
  title: "신청하기 — Plantor",
  description:
    "Plantor 학습 프로그램 신청 폼. 부모/자녀 정보와 원하는 서비스를 선택하면 카카오톡으로 안내드립니다.",
};

export default function SignupPage() {
  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-8 sm:py-12 max-[600px]:px-4">
      <div className="mx-auto max-w-2xl">
        <SignupForm />
      </div>
    </main>
  );
}
