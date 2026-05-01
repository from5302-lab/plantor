import { T } from "@/lib/design-tokens";

const STEPS = [
  {
    number: "01",
    title: "신청서 작성",
    description: "신청 양식에 자녀 정보와 원하는 서비스를 선택해 제출해 주세요.",
  },
  {
    number: "02",
    title: "입금 확인",
    description: "문자로 계좌 정보를 안내해 드려요. 입금 확인까지 보통 1 영업일 이내입니다.",
  },
  {
    number: "03",
    title: "학습계정 발급 · 학습안내",
    description: "입금 확인 즉시 멤버십톡방 초대링크와 함께 학습계정(ID/PW)을 전달드립니다. 학습은 다음 달 1일부터 시작됩니다.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="section-pad bg-p-bg px-6">
      <div className="mx-auto max-w-[860px]">
        {/* 헤더 */}
        <div className="mb-10 text-center">
          <p className="overline mb-2">How it works</p>
          <h2 className="m-0 font-bold text-black/95" style={{ fontSize: "clamp(26px, 4vw, 36px)", letterSpacing: "-0.75px" }}>
            신청부터 시작까지 3단계
          </h2>
        </div>

        {/* 진행 바 */}
        <div className="relative mb-6">
          {/* 연결선 */}
          <div className="absolute top-1/2 left-3.5 right-3.5 h-[3px] bg-p-green rounded-full -translate-y-1/2" />
          {/* 도트 */}
          <div className="flex justify-around relative">
            {STEPS.map((step) => (
              <div
                key={step.number}
                className="w-7 h-7 rounded-full bg-p-green text-white text-[11px] font-bold flex items-center justify-center"
              >
                {step.number}
              </div>
            ))}
          </div>
        </div>

        {/* 카드 3열 */}
        <div className="how-steps grid grid-cols-3 gap-4">
          {STEPS.map((step) => (
            <div
              key={step.number}
              className="bg-white border border-black/10 rounded-xl p-6 flex flex-col gap-2.5"
              style={{ boxShadow: T.shadow }}
            >
              <span className="text-[28px] font-bold text-p-green leading-none" style={{ letterSpacing: "-1px" }}>
                {step.number}
              </span>
              <h3 className="m-0 text-base font-bold text-black/95" style={{ letterSpacing: "-0.2px", lineHeight: 1.35 }}>
                {step.title}
              </h3>
              <p className="m-0 text-[13px] text-p-secondary" style={{ lineHeight: 1.65 }}>
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
