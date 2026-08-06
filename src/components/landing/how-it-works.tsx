// 플랜토가 무엇을 하는 곳인지 한 화면에 답하는 섹션.
// 핵심은 2단계다 — 학생도 학부모도 아무것도 입력하지 않는다는 것.

const STEPS = [
  {
    no: "01",
    title: "검증된 프로그램에서 공부합니다",
    body: "매일국어·오토보카·클래스카드·클래스5. 학원이 실제로 쓰는 프로그램을 집에서 그대로 씁니다.",
  },
  {
    no: "02",
    title: "결과는 플랜토가 가져옵니다",
    body: "무엇을 몇 시에 얼마나 했는지, 점수와 정답률까지 자동으로 수집합니다. 학생도 학부모도 입력할 게 없습니다.",
  },
  {
    no: "03",
    title: "경험치·레벨·뱃지로 돌아옵니다",
    body: "오늘의 학습이 그날 바로 숫자와 뱃지로 바뀝니다. 아이가 내일 또 여는 이유가 여기서 생깁니다.",
  },
];

export function HowItWorks() {
  return (
    <section className="bg-white px-5 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-[900px]">
        <div className="text-center">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-p-muted">How it works</p>
          <h2
            className="text-[24px] font-bold text-black/95 sm:text-[32px]"
            style={{ letterSpacing: "-0.03em" }}
          >
            공부만 하면, 나머지는 알아서
          </h2>
        </div>

        <ol className="mt-9 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-3 sm:gap-4">
          {STEPS.map((s) => (
            <li
              key={s.no}
              className="rounded-2xl border border-black/[0.08] bg-p-bg px-5 py-6"
            >
              <span className="text-[12px] font-bold tracking-[0.08em] text-p-green">{s.no}</span>
              <h3
                className="mt-2.5 text-[16px] font-bold leading-[1.4] text-black/90"
                style={{ letterSpacing: "-0.02em" }}
              >
                {s.title}
              </h3>
              <p className="mt-2 text-[13.5px] leading-[1.65] text-p-secondary">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
