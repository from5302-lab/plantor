import { BADGES, RARITY, SHOP_ITEMS, TOTAL_BADGES, titleOf, type Rarity } from "@/lib/rewards/catalog";

// 리워드가 어떻게 생겼는지 보여주는 섹션.
// 숫자는 전부 카탈로그에서 계산한다 — 손으로 적으면 뱃지가 늘어난 날 소개만 옛 숫자로 남는다.

/** 칭호가 바뀌는 레벨 (catalog.ts TITLES 의 min 값). */
const TITLE_LEVELS = [1, 5, 10, 20, 30, 40, 50, 60, 80];

/** 연속 학습일 배수 — functions/src/rewards-config.ts streakMultiplier 와 같은 값. */
const STREAKS = [
  { days: 3, mult: "×1.1" },
  { days: 7, mult: "×1.2" },
  { days: 14, mult: "×1.3" },
  { days: 30, mult: "×1.5" },
];

const RARITY_ORDER: Rarity[] = ["common", "rare", "epic", "legend"];

export function RewardsShowcase() {
  const hidden = BADGES.filter((b) => b.hidden).length;
  const characters = SHOP_ITEMS.filter((i) => i.slot === "base").length;
  const titles = TITLE_LEVELS.map((lv) => ({ lv, ...titleOf(lv) }));

  return (
    <section className="bg-p-bg px-5 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-[900px]">
        <div className="text-center">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-p-muted">Rewards</p>
          <h2
            className="text-[24px] font-bold text-black/95 sm:text-[32px]"
            style={{ letterSpacing: "-0.03em" }}
          >
            오늘 한 공부가 눈에 보이게
          </h2>
        </div>

        <div className="mt-9 grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
          {/* 레벨 — 씨앗에서 큰나무까지 */}
          <div className="rounded-2xl border border-black/[0.08] bg-white px-5 py-6">
            <h3 className="text-[16px] font-bold text-black/90" style={{ letterSpacing: "-0.02em" }}>
              씨앗에서 큰나무까지
            </h3>
            <p className="mt-1.5 text-[13.5px] leading-[1.6] text-p-secondary">
              경험치가 쌓이면 레벨이 오르고, 레벨을 따라 칭호가 자랍니다.
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {titles.map((t) => (
                <span
                  key={t.lv}
                  className="rounded-full bg-black/[0.035] px-2.5 py-1 text-[12px] font-bold"
                  style={{ color: t.color }}
                >
                  {t.name}
                  <span className="ml-1 text-[10.5px] font-semibold text-p-muted tabular-nums">Lv.{t.lv}</span>
                </span>
              ))}
            </div>
          </div>

          {/* 뱃지 */}
          <div className="rounded-2xl border border-black/[0.08] bg-white px-5 py-6">
            <h3 className="text-[16px] font-bold text-black/90" style={{ letterSpacing: "-0.02em" }}>
              뱃지 {TOTAL_BADGES}종, 그중 {hidden}종은 숨겨져 있어요
            </h3>
            <p className="mt-1.5 text-[13.5px] leading-[1.6] text-p-secondary">
              조건을 미리 알려주지 않습니다. &ldquo;저건 뭘 해야 나오지?&rdquo;가 다음 학습의 이유가 되니까요.
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {RARITY_ORDER.map((r) => (
                <span
                  key={r}
                  className="rounded-md px-2.5 py-1 text-[12px] font-bold"
                  style={{ color: RARITY[r].fg, background: RARITY[r].bg, border: `1px solid ${RARITY[r].ring}` }}
                >
                  {RARITY[r].label}
                </span>
              ))}
            </div>
          </div>

          {/* 연속 학습 */}
          <div className="rounded-2xl border border-black/[0.08] bg-white px-5 py-6">
            <h3 className="text-[16px] font-bold text-black/90" style={{ letterSpacing: "-0.02em" }}>
              이어서 할수록 더 받습니다
            </h3>
            <p className="mt-1.5 text-[13.5px] leading-[1.6] text-p-secondary">
              연속 학습일이 늘면 그날 경험치에 배수가 붙습니다. 하루 빠지면 처음부터.
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {STREAKS.map((s) => (
                <span
                  key={s.days}
                  className="rounded-lg bg-[#fff6e5] px-2.5 py-1 text-[12px] font-bold text-[#b45309] tabular-nums"
                >
                  {s.days}일 {s.mult}
                </span>
              ))}
            </div>
          </div>

          {/* 상점 */}
          <div className="rounded-2xl border border-black/[0.08] bg-white px-5 py-6">
            <h3 className="text-[16px] font-bold text-black/90" style={{ letterSpacing: "-0.02em" }}>
              모은 포인트로 내 캐릭터를 꾸며요
            </h3>
            <p className="mt-1.5 text-[13.5px] leading-[1.6] text-p-secondary">
              식물 캐릭터 {characters}종에 테두리·이름·배경·이펙트까지. 일부는 <b className="font-semibold text-black/75">특정 뱃지로만</b> 열립니다.
            </p>
            <div className="mt-4 flex flex-wrap gap-1">
              {SHOP_ITEMS.filter((i) => i.slot === "base").slice(0, 14).map((i) => (
                <span key={i.id} className="text-[20px] leading-none" aria-hidden>{i.emoji}</span>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-[13px] leading-[1.6] text-p-muted">
          피드는 순위표가 아니라 시간순 기록입니다. 잘하는 몇 명이 화면을 독점하면 나머지가 위축되니까요.
        </p>
      </div>
    </section>
  );
}
