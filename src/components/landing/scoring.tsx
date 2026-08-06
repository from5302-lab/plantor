// "게임 요소를 붙였다"에 학부모가 갖는 의심 — 대충 눌러도 오르는 거 아니냐 — 에 답하는 섹션.
// 근거는 실제 산식(functions/src/rewards-config.ts)에 있다.

const RULES = [
  {
    title: "빨리 넘기면 점수가 깎입니다",
    body: "매일국어는 추천 독해속도의 2배보다 빠르게 지문을 넘기면 읽지 않은 것으로 보고 품질 점수를 절반으로 매깁니다.",
  },
  {
    title: "기준은 실제 학생들의 분포",
    body: "품질 점수의 만점선은 임의로 정하지 않았습니다. 전 학생 학습 기록을 실측해 중간쯤 하는 학생이 절반을 받도록 맞췄습니다.",
  },
  {
    title: "하루에 몰아쳐도 상한이 있습니다",
    body: "한 과목 하루 250, 한 학생 하루 600에서 멈춥니다. 하루 몰아치기보다 매일 조금이 유리하게 설계했습니다.",
  },
  {
    title: "밀린 걸 만회하면 70%",
    body: "지난 과제를 뒤늦게 끝내도 인정합니다. 다만 제날짜에 한 학습보다는 적게 받습니다.",
  },
];

export function Scoring() {
  return (
    <section className="bg-white px-5 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-[760px]">
        <div className="text-center">
          <h2
            className="text-[24px] font-bold text-black/95 sm:text-[32px]"
            style={{ letterSpacing: "-0.03em" }}
          >
            대충 하면 오르지 않습니다
          </h2>
          <p className="mt-3 text-[14px] leading-[1.6] text-p-secondary sm:text-[15px]">
            아이를 붙잡아 두는 장치가 아니라, 제대로 한 학습을 가려내는 장치입니다.
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-2.5">
          {RULES.map((r) => (
            <div
              key={r.title}
              className="rounded-xl bg-p-bg px-5 py-4"
              style={{ borderLeft: "3px solid rgba(56,168,72,0.45)" }}
            >
              <h3 className="text-[15px] font-bold text-black/90" style={{ letterSpacing: "-0.02em" }}>
                {r.title}
              </h3>
              <p className="mt-1.5 text-[13.5px] leading-[1.65] text-p-secondary">{r.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
