import { SERVICES, SITE } from "@/data/site";

const CATEGORY_LABEL: Record<string, string> = {
  subscription: "구독형",
  premium: "프리미엄",
  community: "커뮤니티",
};

export function ServicesSection() {
  return (
    <section
      id="services"
      className="bg-zinc-50 px-6 py-20 sm:py-28 dark:bg-zinc-950"
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 text-center">
          <p className="mb-2 text-sm font-medium uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
            Lineup
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-white">
            지금 연결되는 학습 도구
          </h2>
          <p className="mt-3 text-base text-zinc-600 dark:text-zinc-400">
            엄마들이 검증한 5가지 라인업.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((service) => (
            <div
              key={service.slug}
              className={`relative flex flex-col rounded-2xl border bg-white p-6 transition hover:shadow-md dark:bg-zinc-900 ${
                service.highlight
                  ? "border-emerald-400 shadow-sm dark:border-emerald-600"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              {service.highlight && (
                <div className="absolute -top-3 left-6 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                  가장 인기
                </div>
              )}
              <div className="mb-3 flex items-start justify-between">
                <span className="text-3xl">{service.emoji}</span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {CATEGORY_LABEL[service.category]}
                </span>
              </div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                {service.name}
              </h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {service.hook}
              </p>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {service.priceLabel}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                대상: {service.targetGrades}
              </p>
              <ul className="mt-4 flex-1 space-y-1.5 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                {service.bullets.map((b) => (
                  <li
                    key={b}
                    className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300"
                  >
                    <span className="mt-0.5 text-emerald-500">✓</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <a
                href={SITE.kakaoOpenChat}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex h-10 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {service.category === "community" ? "참여하기" : "신청하기"}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
