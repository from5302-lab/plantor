import { CORE_VALUES } from "@/data/site";

export function Values() {
  return (
    <section className="px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 text-center">
          <p className="mb-2 text-sm font-medium uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
            THiNK
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-white">
            Plantor는 이렇게 생각합니다
          </h2>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {CORE_VALUES.map((value) => (
            <div
              key={value.key}
              className="rounded-2xl border border-zinc-200 bg-white p-7 transition hover:border-emerald-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-emerald-700"
            >
              <div className="mb-4 text-3xl">{value.emoji}</div>
              <h3 className="mb-2 text-lg font-semibold leading-snug text-zinc-900 dark:text-white">
                {value.title}
              </h3>
              <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                {value.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
