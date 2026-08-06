import Link from "next/link";

export function Cta() {
  return (
    <section className="bg-p-bg px-5 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-[600px] text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/favicon.svg" alt="" width={52} height={52} className="mx-auto block" />
        <h2
          className="mt-5 text-[24px] font-bold leading-[1.25] text-black/95 sm:text-[32px]"
          style={{ letterSpacing: "-0.03em" }}
        >
          오늘부터 한 칸씩 자라게
        </h2>
        <p className="mt-3 text-[14px] leading-[1.65] text-p-secondary sm:text-[15px]">
          궁금한 점은 신청 전에 편하게 물어보세요.
        </p>
        <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Link
            href="/signup"
            className="btn-primary inline-flex h-12 items-center justify-center rounded-lg bg-p-green px-9 text-[15px] font-bold text-white no-underline"
          >
            지금 신청하기 →
          </Link>
          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center rounded-lg border border-black/10 bg-white px-9 text-[15px] font-semibold text-black/75 no-underline"
          >
            피드 먼저 둘러보기
          </Link>
        </div>
      </div>
    </section>
  );
}
