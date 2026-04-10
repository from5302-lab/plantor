import { SITE } from "@/data/site";

export function Hero() {
  return (
    <section className="relative flex flex-col items-center justify-center px-6 pt-24 pb-20 text-center sm:pt-32 sm:pb-28">
      <div className="mb-6 text-6xl sm:text-7xl">🌱</div>
      <p className="mb-3 text-sm font-medium uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
        {SITE.tagline}
      </p>
      <h1 className="max-w-3xl text-balance text-4xl font-bold leading-tight tracking-tight text-zinc-900 sm:text-5xl md:text-6xl dark:text-white">
        학원이 쓰는 학습 프로그램,
        <br className="hidden sm:block" />
        <span className="text-emerald-600 dark:text-emerald-400">
          {" "}
          집에서 월 1.5만원
        </span>
        부터.
      </h1>
      <p className="mt-6 max-w-xl text-balance text-base leading-7 text-zinc-600 sm:text-lg dark:text-zinc-300">
        Plantor는 학원에서 검증된 학습프로그램을 가정에 직접 연결하는
        <br className="hidden sm:block" />
        부모를 위한 에듀테크 큐레이션 플랫폼입니다.
      </p>
      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <a
          href="#services"
          className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-600 px-7 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 sm:text-base"
        >
          🌱 서비스 보기
        </a>
        <a
          href={SITE.kakaoOpenChat}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-12 items-center justify-center rounded-full border border-zinc-300 bg-white px-7 text-sm font-semibold text-zinc-900 transition hover:border-zinc-400 hover:bg-zinc-50 sm:text-base dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
        >
          🙋‍♀️ 무료 웨비나 신청
        </a>
      </div>
    </section>
  );
}
