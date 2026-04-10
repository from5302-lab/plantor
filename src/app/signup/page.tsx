import Link from "next/link";
import type { Metadata } from "next";
import { SignupForm } from "@/components/signup/signup-form";

export const metadata: Metadata = {
  title: "신청하기 — Plantor",
  description:
    "Plantor 학습 도구 신청 폼. 부모/자녀 정보와 원하는 서비스를 선택하면 카카오톡으로 안내드립니다.",
};

export default function SignupPage() {
  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-12 sm:py-20 dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400"
        >
          ← Plantor로 돌아가기
        </Link>
        <header className="mb-8 text-center">
          <div className="mb-4 text-5xl">🌱</div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-white">
            신청하기
          </h1>
          <p className="mt-3 text-base text-zinc-600 dark:text-zinc-400">
            아래 정보를 입력하시면
            <br className="sm:hidden" />
            카카오톡으로 입금 안내와 학습 도구를 발급해 드립니다.
          </p>
        </header>
        <SignupForm />
      </div>
    </main>
  );
}
