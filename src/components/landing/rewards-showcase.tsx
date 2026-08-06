import { BADGES, BADGE_BY_CODE, RARITY, SHOP_ITEMS, TOTAL_BADGES, effectLabel, type Rarity } from "@/lib/rewards/catalog";

// 리워드가 어떻게 생겼는지 보여주는 섹션.
// 숫자는 전부 카탈로그에서 계산한다 — 손으로 적으면 뱃지가 늘어난 날 소개만 옛 숫자로 남는다.

/** 소개에 세울 장착 효과 — 뱃지의 의미와 효과가 붙어 있는 것들로 고른다. */
const SHOWCASE_EQUIP = ["x-early-bird", "x-weekend", "dk-true-reader", "x-catchup"];

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

  return (
    <section className="bg-p-bg px-5 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-[900px]">
        <div className="text-center">
          <h2
            className="text-[24px] font-bold text-black/95 sm:text-[32px]"
            style={{ letterSpacing: "-0.03em" }}
          >
            오늘 한 공부가 눈에 보이게
          </h2>
        </div>

        <div className="mt-9 grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
          {/* 장착 — 딴 뱃지가 장식으로 끝나지 않는다는 것이 이 리워드의 핵심이다 */}
          <div className="rounded-2xl border border-black/[0.08] bg-white px-5 py-6">
            <h3 className="text-[16px] font-bold text-black/90" style={{ letterSpacing: "-0.02em" }}>
              딴 뱃지는 끼워서 씁니다
            </h3>
            <p className="mt-1.5 text-[13.5px] leading-[1.6] text-p-secondary">
              효과가 <b className="font-semibold text-black/75">그 뱃지를 딴 행동</b>에 붙습니다.
              아침에 따낸 뱃지는 아침에 공부할 때 힘을 냅니다.
            </p>
            <div className="mt-4 flex flex-col gap-1.5">
              {SHOWCASE_EQUIP.map((code) => {
                const b = BADGE_BY_CODE.get(code);
                const label = effectLabel(code);
                if (!b || !label) return null;
                return (
                  <div key={code} className="flex items-center gap-2 rounded-lg bg-black/[0.03] px-2.5 py-1.5">
                    <span className="text-[16px] leading-none" aria-hidden>{b.emoji}</span>
                    <span className="text-[12px] font-bold text-black/75">{b.name}</span>
                    <span className="ml-auto text-[11.5px] font-semibold text-[#1f7a33]">{label}</span>
                  </div>
                );
              })}
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

        <p className="mt-6 text-center text-[13px] leading-[1.6] text-p-secondary">
          피드는 순위표가 아니라 시간순 기록입니다. 잘하는 몇 명이 화면을 독점하면 나머지가 위축되니까요.
        </p>
      </div>
    </section>
  );
}
