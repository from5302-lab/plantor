import { CORE_VALUES } from "@/data/site";

// 학부모가 얻는 것. 아이 쪽 이야기(리워드)를 앞에서 했으니 여기서는 보호자 관점으로 붙인다.
export function Values() {
  return (
    <section className="bg-p-bg px-5 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-[900px]">
        <div className="text-center">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-p-muted">For parents</p>
          <h2
            className="text-[24px] font-bold text-black/95 sm:text-[32px]"
            style={{ letterSpacing: "-0.03em" }}
          >
            매일 묻지 않아도 알 수 있게
          </h2>
        </div>

        <div className="mt-9 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          {CORE_VALUES.map((value) => (
            <div
              key={value.key}
              className="rounded-2xl border border-black/[0.08] bg-white px-5 py-6"
            >
              <div className="text-[26px] leading-none" aria-hidden>{value.emoji}</div>
              <h3
                className="mt-3.5 text-[16px] font-bold leading-[1.4] text-black/90"
                style={{ letterSpacing: "-0.02em" }}
              >
                {value.title}
              </h3>
              <p className="mt-2 text-[13.5px] leading-[1.65] text-p-secondary">{value.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
