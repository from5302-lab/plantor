import { FAQS } from "@/data/site";

export function Faq() {
  return (
    <section className="bg-white px-5 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-[680px]">
        <div className="text-center">
          <h2
            className="text-[24px] font-bold text-black/95 sm:text-[32px]"
            style={{ letterSpacing: "-0.03em" }}
          >
            자주 묻는 질문
          </h2>
        </div>

        <div className="mt-8 flex flex-col gap-2">
          {FAQS.map((faq, i) => (
            <details
              key={i}
              className="faq-item rounded-xl border border-black/[0.08] bg-white px-5 py-4"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-[14.5px] font-semibold text-black/90">
                <span style={{ letterSpacing: "-0.01em" }}>{faq.q}</span>
                <span className="shrink-0 text-[18px] font-light text-p-green">+</span>
              </summary>
              <p className="mt-3 text-[13.5px] leading-[1.7] text-p-secondary">{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
