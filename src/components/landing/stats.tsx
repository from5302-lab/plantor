import { STATS } from "@/data/site";

export function Stats() {
  return (
    <section className="px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-4xl">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl font-bold text-emerald-600 sm:text-4xl dark:text-emerald-400">
                {stat.value}
              </div>
              <div className="mt-2 text-xs font-medium text-zinc-500 sm:text-sm dark:text-zinc-400">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
