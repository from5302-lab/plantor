import { SITE } from "@/data/site";

export function Cta() {
  return (
    <section className="px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl text-center">
        <div className="mb-6 text-5xl">🌱</div>
        <h2 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-white">
          좋은 도구를, 좋은 부모에게,
          <br />
          좋은 가격으로.
        </h2>
        <p className="mt-5 text-base text-zinc-600 sm:text-lg dark:text-zinc-400">
          카카오 오픈채팅으로 들어오시면 안내드립니다.
          <br />
          입금 확인 후 즉시 학습 도구를 발급해 드립니다.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <a
            href={SITE.kakaoOpenChat}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-13 items-center justify-center rounded-full bg-emerald-600 px-9 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-emerald-700"
          >
            지금 신청하기 →
          </a>
        </div>
      </div>
    </section>
  );
}
