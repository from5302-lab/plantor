import { FirebaseProbe } from "@/components/firebase-probe";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-24 text-center">
      <div className="text-6xl">🌱</div>
      <div className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Plantor
        </h1>
        <p className="text-lg text-zinc-500 dark:text-zinc-400">
          Plan + Mentor
        </p>
      </div>
      <p className="max-w-md text-balance text-base leading-7 text-zinc-600 dark:text-zinc-300">
        학원이 쓰는 검증된 학습 도구를,
        <br />
        학원 없이 가정에 직접 연결합니다.
      </p>
      <FirebaseProbe />
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        🚧 Day 1 — 토대 작업 중
      </p>
    </main>
  );
}
