import { FAQS } from "@/data/site";

export function Faq() {
  return (
    <section className="bg-zinc-50 px-6 py-20 sm:py-28 dark:bg-zinc-950">
      <div className="mx-auto max-w-3xl">
        <div className="mb-12 text-center">
          <p className="mb-2 text-sm font-medium uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
            FAQ
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-white">
            자주 묻는 질문
          </h2>
        </div>
        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <details
              key={i}
              className="group rounded-2xl border border-zinc-200 bg-white p-5 open:shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-semibold text-zinc-900 dark:text-white">
                <span>{faq.q}</span>
                <span className="text-emerald-600 transition group-open:rotate-45 dark:text-emerald-400">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-7 text-zinc-600 dark:text-zinc-400">
                {faq.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
