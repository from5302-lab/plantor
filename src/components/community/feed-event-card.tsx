"use client";

import { Flame, Sprout, TrendingUp } from "lucide-react";
import { AvatarView } from "@/components/learn/avatar-view";
import { ServiceIcon } from "@/components/ui/service-icon";
import { SERVICES } from "@/data/site";
import { BADGE_BY_CODE, RARITY, SHOP_BY_ID, type Rarity } from "@/lib/rewards/catalog";
import { ThumbsButton } from "./thumbs-button";

// 리워드 이벤트 한 장.
//
// 히든 뱃지의 **조건 문구는 절대 렌더하지 않는다**. 조건을 미리 공개하지 않는 게
// 뱃지 설계의 전제라서(plan-reward-system.md §5.0), 피드에 조건을 띄우면 46종이 며칠 만에 다 알려진다.
// 이름과 아트만 보여주면 "저건 뭘 해야 나오지?"가 오히려 동력이 된다.
// 공개 뱃지(연속 4종, hidden=false)만 예외로 조건을 함께 적는다.

export type StudyStat = { name: string; value: string };
export type StudyItem = {
  kind?: string | null;
  label: string;
  stats?: StudyStat[];
  /** 구버전 이벤트 호환 */
  note?: string | null;
};
export type StudyEntry = {
  slug: string;
  xp: number;
  items?: StudyItem[];
  /** 구버전 이벤트 호환 — items가 생기기 전 기록 */
  labels?: string[];
  note: string | null;
};

export type FeedEvent = {
  id: string;
  type: "badge" | "title" | "level" | "item" | "daily";
  name: string;
  grade: string;
  equipped: Record<string, string | null>;
  level: number;
  title: string;
  likeCount: number;
  createdAt: Date;
  badgeCode?: string;
  badgeName?: string;
  rarity?: Rarity;
  growth?: boolean;
  prevTitle?: string;
  itemId?: string;
  itemName?: string;
  exclusive?: boolean;
  serviceSlug?: string;
  /** 학습 날짜 "YYYY-MM-DD" — 상단 오늘 요약 집계에 쓴다 */
  date?: string;
  xp?: number;
  doneCount?: number;
  streak?: number;
  services?: StudyEntry[];
};

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return "방금 전";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function serviceName(slug?: string): string {
  return SERVICES.find((s) => s.slug === slug)?.name ?? slug ?? "";
}

/**
 * 그날 한 과목 하나 — 학습 세트가 여러 개면 세트별로 칸을 나눠 각자의 성적을 적는다
 * (평균 하나로 뭉치면 어느 세트를 잘했는지 안 보인다).
 * 세트 안의 단계(암기·리콜·스펠·테스트…)도 하나씩 따로 보여준다.
 */
function ServiceRow({ entry, showXp = true }: { entry: StudyEntry; showXp?: boolean }) {
  const svc = SERVICES.find((s) => s.slug === entry.slug);
  const items: StudyItem[] = entry.items?.length
    ? entry.items
    : (entry.labels ?? []).map((label) => ({ label }));

  // 학습 시각은 과목 헤더로 끌어올린다 — "언제 공부했나"는 학부모가 가장 먼저 보는 정보다.
  // (칩 무더기에 섞여 있으면 눈에 안 들어온다)
  const timeChip = items.flatMap((it) => it.stats ?? []).find((st) => !st.name && /~/.test(st.value));
  const span = timeChip?.value ?? null;

  return (
    <div className="rounded-lg bg-black/[0.025] px-2 sm:px-2.5 py-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="shrink-0">
          {svc ? <ServiceIcon service={svc} size={16} /> : <span className="text-[14px]">📘</span>}
        </span>
        <span className="text-[12px] font-bold text-black/80">{svc?.name ?? entry.slug}</span>
        {entry.note && <span className="text-[11px] font-semibold text-p-teal">{entry.note}</span>}
        <span className="ml-auto flex items-center gap-2 shrink-0">
          {span && <span className="text-[11px] text-p-muted tabular-nums">{span}</span>}
          {showXp && <span className="text-[11px] font-semibold text-p-secondary tabular-nums">{entry.xp} XP</span>}
        </span>
      </div>

      {items.length > 0 && (
        <div className="flex flex-col gap-1 mt-1.5">
          {items.map((it, i) => {
            const stats = (it.stats?.length
              ? it.stats.filter((st) => st !== timeChip)
              : it.note ? [{ name: "", value: it.note }] : []);
            return (
              <div
                key={`${it.label}-${i}`}
                className="rounded-md bg-white px-2 sm:px-2.5 py-1.5"
                style={{ borderLeft: "3px solid rgba(56,168,72,0.28)" }}
              >
                {it.kind && (
                  <div className="text-[10.5px] font-bold text-p-muted">{it.kind}</div>
                )}
                <div className="text-[11.5px] text-p-secondary" style={{ lineHeight: 1.45 }}>
                  {it.label}
                </div>
                {stats.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {stats.map((st, j) => (
                      <span
                        key={`${st.name}-${j}`}
                        className="text-[10.5px] rounded px-1.5 py-0.5 bg-black/[0.04] whitespace-nowrap"
                      >
                        {st.name && <span className="text-p-muted">{st.name} </span>}
                        <b className="text-black/75">{st.value}</b>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 이벤트별 본문 — 색과 크기로 사건의 무게를 구분한다. */
function Body({ e }: { e: FeedEvent }) {
  if (e.type === "badge") {
    const def = e.badgeCode ? BADGE_BY_CODE.get(e.badgeCode) : undefined;
    const r = RARITY[e.rarity ?? def?.rarity ?? "common"];
    const big = (e.rarity ?? "common") === "legend" || (e.rarity ?? "common") === "epic";
    const size = big ? 52 : 38;
    const svc = SERVICES.find((s) => s.slug === e.serviceSlug);
    return (
      <div
        className="rounded-xl flex items-center gap-3.5"
        style={{
          background: r.bg,
          border: `1.5px solid ${r.ring}`,
          padding: big ? "16px 16px" : "12px 14px",
        }}
      >
        {/* 뱃지 아트 + 어느 학습사이트에서 딴 건지 파비콘으로 표시 */}
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <span
            className="leading-none absolute inset-0 flex items-center justify-center"
            style={{ fontSize: size }}
            aria-hidden
          >
            {def?.emoji ?? "🏅"}
          </span>
          {svc && (
            <span
              className="absolute -bottom-1 -right-1.5 rounded-md bg-white p-[2px] flex"
              style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.18)" }}
            >
              <ServiceIcon service={svc} size={15} />
            </span>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ color: r.fg, background: "rgba(255,255,255,0.7)" }}>
              {r.label}
            </span>
            {e.growth && (
              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-white/70 text-[#0f7a4e]">성장</span>
            )}
          </div>
          <div
            className="mt-1 font-bold truncate"
            style={{ color: r.fg, fontSize: big ? 19 : 16, letterSpacing: "-0.01em" }}
          >
            {e.badgeName ?? def?.name ?? "뱃지"}
          </div>
          {serviceName(e.serviceSlug) && (
            <div className="text-[11.5px] text-p-secondary mt-0.5">{serviceName(e.serviceSlug)}</div>
          )}
          {/* 공개 뱃지만 조건을 밝힌다 */}
          {def && !def.hidden && <div className="text-[12px] text-p-secondary mt-0.5">{def.desc}</div>}
        </div>
      </div>
    );
  }

  if (e.type === "title") {
    return (
      <div className="rounded-xl px-3.5 py-3.5 bg-gradient-to-r from-[#eafaf1] to-[#f4fbf7] border border-[rgba(20,140,90,0.22)]">
        <div className="flex items-center gap-2 text-[15px] font-bold text-[#0f7a4e]">
          <Sprout size={22} strokeWidth={2.25} className="shrink-0" aria-hidden />
          <span>
            {e.prevTitle && <span className="text-p-muted font-semibold">{e.prevTitle} → </span>}
            {e.title} 단계로 자랐어요
          </span>
        </div>
        <div className="mt-1 text-[12px] text-p-secondary">Lv.{e.level} 달성</div>
      </div>
    );
  }

  if (e.type === "level") {
    return (
      <div className="flex items-center gap-1.5 text-[13px] text-p-secondary">
        <TrendingUp size={15} strokeWidth={2.25} className="text-p-teal shrink-0" aria-hidden />
        레벨 <b className="text-black/85">{e.level}</b> 달성
      </div>
    );
  }

  if (e.type === "item") {
    const item = e.itemId ? SHOP_BY_ID.get(e.itemId) : undefined;
    const r = RARITY[item?.rarity ?? "common"];
    return (
      <div className="rounded-xl px-3.5 py-3 flex items-center gap-3" style={{ background: r.bg, border: `1.5px solid ${r.ring}` }}>
        <span className="leading-none" style={{ fontSize: 30 }} aria-hidden>{item?.emoji ?? "🎁"}</span>
        <div className="min-w-0">
          <div className="font-bold text-[14px] truncate" style={{ color: r.fg }}>
            {e.itemName ?? item?.name ?? "아이템"}
          </div>
          <div className="text-[12px] text-p-secondary mt-0.5">
            {e.exclusive ? "뱃지로만 얻을 수 있는 아이템이에요" : "상점에서 새로 꾸몄어요"}
          </div>
        </div>
      </div>
    );
  }

  // daily
  return (
    <div>
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <span className="flex items-baseline gap-1">
          <b className="text-[22px] font-bold text-p-teal tabular-nums" style={{ letterSpacing: "-0.02em" }}>
            {e.xp?.toLocaleString() ?? 0}
          </b>
          <span className="text-[12px] font-bold text-p-teal">XP</span>
        </span>
        {!!e.doneCount && (
          <span className="text-[12px] font-semibold text-p-secondary">{e.doneCount}과목 완주</span>
        )}
        {!!e.streak && e.streak >= 2 && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-[#fff6e5] px-2 py-1 text-[11px] font-bold text-[#b45309]">
            <Flame size={12} strokeWidth={2.5} aria-hidden />
            {e.streak}일 연속
          </span>
        )}
      </div>

      {(e.services?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-1.5 mt-2.5">
          {e.services!.map((s) => <ServiceRow key={s.slug} entry={s} showXp={(e.services?.length ?? 0) > 1} />)}
        </div>
      )}
    </div>
  );
}

export function FeedEventCard({ event, myUid }: { event: FeedEvent; myUid: string | null }) {
  return (
    <article className="bg-white border-b border-black/[0.07] px-4 sm:px-5 py-4">
      <div className="flex gap-3">
        <div className="shrink-0">
          <span className="sm:hidden"><AvatarView equipped={event.equipped} size={38} /></span>
          <span className="hidden sm:block"><AvatarView equipped={event.equipped} size={44} /></span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {event.grade && (
                <span className="text-[11px] font-bold text-p-teal bg-[#eafaf1] rounded px-1.5 py-0.5 shrink-0">
                  {event.grade}
                </span>
              )}
              <span className="text-[13px] font-bold text-black/90 truncate">{event.name}</span>
              <span className="text-[12px] text-p-muted shrink-0">Lv.{event.level}</span>
            </div>
            <span className="text-[11px] text-p-muted shrink-0">{timeAgo(event.createdAt)}</span>
          </div>

          <Body e={event} />

          <div className="mt-2.5">
            <ThumbsButton eventId={event.id} myUid={myUid} likeCount={event.likeCount} />
          </div>
        </div>
      </div>
    </article>
  );
}
