import { SITE } from "@/data/site";

export function WebinarBanner() {
  return (
    <section className="px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-700 p-8 text-white shadow-lg sm:p-12">
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-widest text-emerald-100">
                매주 금요일 · 무료
              </p>
              <h3 className="mt-2 text-2xl font-bold sm:text-3xl">
                🙋‍♀️ Mom& 맘이랑 금요웨비나
              </h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-emerald-50 sm:text-base">
                AI시대, 아이가 혼자 학습할 수 있는 시대가 올까요?
                <br />
                같은 고민을 하는 엄마들과 매주 만납니다.
              </p>
            </div>
            <a
              href={SITE.kakaoOpenChat}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-white px-7 text-sm font-bold text-emerald-700 shadow-sm transition hover:bg-emerald-50 sm:text-base"
            >
              무료로 참여하기 →
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
