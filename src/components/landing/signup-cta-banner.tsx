import Link from "next/link";

export function SignupCtaBanner() {
  return (
    <section className="border-y border-black/[0.08] bg-white px-5 py-14 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-[600px] text-center">
        <p className="text-[15px] font-semibold text-black/85 sm:text-[17px]" style={{ letterSpacing: "-0.02em" }}>
          신규·연장 신청은 매달 25일까지 받습니다.
        </p>
        <Link
          href="/signup"
          className="btn-primary mt-5 inline-flex h-[52px] items-center justify-center rounded-lg bg-p-green px-10 text-[16px] font-bold text-white no-underline"
        >
          지금 신청하기 →
        </Link>
      </div>
    </section>
  );
}
