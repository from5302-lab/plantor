import Link from "next/link";
import { SERVICES } from "@/data/site";
import { ServiceIcon } from "@/components/ui/service-icon";

// 소개 페이지의 첫 화면.
// 가격("월 1.5만원")은 문턱을 낮추지만 그것만으로는 "그래서 우리 애가 하겠냐"에 답하지 못한다.
// 그래서 헤드라인은 지속을, 서브라인은 가격을 맡는다.

/** 자동 수집이 도는 학습사이트 — 리워드 대상 4종(functions/src/rewards-config.ts REWARD_SLUGS). */
const AUTO_SLUGS = ["dailykor", "autovoca", "classcard-middle", "class5"];

export function Hero() {
  const autoServices = AUTO_SLUGS
    .map((slug) => SERVICES.find((s) => s.slug === slug))
    .filter((s): s is NonNullable<typeof s> => !!s);

  return (
    <section className="bg-white px-5 pt-16 pb-14 sm:px-6 sm:pt-24 sm:pb-20">
      <div className="mx-auto max-w-[760px] text-center">
        <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.14em] text-p-muted">
          Plan + Mentor
        </p>

        <h1
          className="text-[30px] font-bold leading-[1.2] text-black/95 sm:text-[46px]"
          style={{ letterSpacing: "-0.035em" }}
        >
          집에서 하는 공부가,
          <br />
          <span className="text-p-green">오늘도 이어지게</span>
        </h1>

        <p className="mx-auto mt-5 max-w-[520px] text-[15px] leading-[1.65] text-p-secondary sm:text-[17px]">
          학원이 쓰는 검증된 학습 프로그램을 <b className="font-semibold text-black/80">월 1.5만원부터</b>.
          {" "}학습 결과는 플랜토가 알아서 가져와 기록하고, 경험치와 레벨로 돌려줍니다.
        </p>

        <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Link
            href="/signup"
            className="btn-primary inline-flex h-12 items-center justify-center rounded-lg bg-p-green px-7 text-[15px] font-bold text-white no-underline sm:px-9"
          >
            신청하기
          </Link>
          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center rounded-lg border border-black/10 bg-white px-7 text-[15px] font-semibold text-black/75 no-underline sm:px-9"
          >
            오늘의 피드 보기
          </Link>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <span className="text-[12px] font-medium text-p-muted">자동으로 기록되는 학습사이트</span>
          {autoServices.map((s) => (
            <span key={s.slug} className="inline-flex items-center gap-1.5">
              <ServiceIcon service={s} size={18} />
              <span className="text-[12.5px] font-semibold text-black/70">{s.name}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
