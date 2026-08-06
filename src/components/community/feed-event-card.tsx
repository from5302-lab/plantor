"use client";

import { Flame, Sprout, TrendingUp } from "lucide-react";
import { Timestamp } from "firebase/firestore";
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
  /** 가린 이름(임○주). 같은 가족이면 childId로 실명을 되살린다. */
  name: string;
  childId?: string;
  grade: string;
  equipped: Record<string, string | null>;
  /** 착용 중인 이름 스타일 아이템 id */
  nameStyle?: string | null;
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

const toDate = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : null);

/** Firestore 문서 → 피드 이벤트. 피드 목록과 소개 페이지 미리보기가 같은 변환을 쓴다. */
export function toFeedEvent(id: string, data: Record<string, unknown>): FeedEvent {
  return {
    id,
    type: (data.type ?? "daily") as FeedEvent["type"],
    name: String(data.name ?? ""),
    grade: String(data.grade ?? ""),
    equipped: (data.equipped ?? {}) as Record<string, string | null>,
    nameStyle: (data.nameStyle ?? null) as string | null,
    level: Number(data.level ?? 1),
    title: String(data.title ?? "씨앗"),
    likeCount: Number(data.likeCount ?? 0),
    // 정렬·표시 기준은 학습을 끝낸 시각(occurredAt). 스크랩 시각(createdAt)이 아니다.
    createdAt: toDate(data.occurredAt) ?? toDate(data.createdAt) ?? new Date(),
    badgeCode: data.badgeCode as string | undefined,
    badgeName: data.badgeName as string | undefined,
    rarity: data.rarity as Rarity | undefined,
    growth: data.growth === true,
    prevTitle: data.prevTitle as string | undefined,
    itemId: data.itemId as string | undefined,
    itemName: data.itemName as string | undefined,
    exclusive: data.exclusive === true,
    serviceSlug: (data.serviceSlug ?? undefined) as string | undefined,
    date: (data.date ?? undefined) as string | undefined,
    childId: String(data.childId ?? ""),
    xp: Number(data.xp ?? 0),
    doneCount: Number(data.doneCount ?? 0),
    streak: Number(data.streak ?? 0),
    services: Array.isArray(data.services) ? (data.services as StudyEntry[]) : [],
  };
}

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
 * 괄호 표기는 버리고 부르는 이름만 남긴다 (서버 feed-events.ts의 callName과 같은 규칙).
 * 가린 이름은 서버가 이미 처리해서 넘기고, 여기서는 가족에게 되살린 실명을 다듬는다.
 *   사랑이(박수현) → 사랑이
 */
function callName(name: string): string {
  const raw = (name ?? "").trim();
  return raw.replace(/\s*[(（][^)）]*[)）]\s*/g, " ").trim() || raw;
}

/** #rrggbb → rgba. 학습사이트 파비콘 색을 띠로 쓰되, 글자를 이기지 않게 흐린다. */
function tint(hex: string | undefined, alpha: number): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * 그날 한 과목 하나 — 학습 세트가 여러 개면 세트별로 칸을 나눠 각자의 성적을 적는다
 * (평균 하나로 뭉치면 어느 세트를 잘했는지 안 보인다).
 * 세트 안의 단계(암기·리콜·스펠·테스트…)도 하나씩 따로 보여준다.
 */
function ServiceRow({ entry, showXp = true }: { entry: StudyEntry; showXp?: boolean }) {
  const svc = SERVICES.find((s) => s.slug === entry.slug);
  // 학습 세트 왼쪽 띠 — 어느 학습사이트인지 색으로 바로 읽히게 파비콘 색을 쓴다.
  // 색이 없는 서비스는 기존 초록으로 돌아간다.
  const bar = tint(svc?.brandColor, 0.5) ?? "rgba(56,168,72,0.28)";
  const items: StudyItem[] = entry.items?.length
    ? entry.items
    : (entry.labels ?? []).map((label) => ({ label }));

  // 시각은 유닛마다 다르므로 유닛 줄에 그대로 둔다.
  // 예전엔 첫 유닛의 시각을 과목 헤더로 끌어올렸는데, 유닛이 둘 이상이면
  // 한 유닛의 시각이 과목 전체 시각처럼 읽혀 학부모가 잘못 이해한다.

  return (
    <div className="rounded-lg bg-black/[0.025] px-2 sm:px-2.5 py-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="shrink-0">
          {svc ? <ServiceIcon service={svc} size={16} /> : <span className="text-[14px]">📘</span>}
        </span>
        <span className="text-[12px] font-bold text-black/80">{svc?.name ?? entry.slug}</span>
        {entry.note && <span className="text-[11px] font-semibold text-p-teal">{entry.note}</span>}
        <span className="ml-auto flex items-center gap-2 shrink-0">
          {showXp && <span className="text-[11px] font-semibold text-p-secondary tabular-nums">{entry.xp} XP</span>}
        </span>
      </div>

      {items.length > 0 && (
        <div className="flex flex-col gap-1 mt-1.5">
          {items.map((it, i) => {
            const all = (it.stats?.length ? it.stats : it.note ? [{ name: "", value: it.note }] : []);
            // 학습 시각은 점수 칩 무더기에 섞지 않고 첫 줄에 [ ] 로 붙인다
            const timeChip = all.find((st) => !st.name && /(오전|오후) \d{1,2}:\d{2}/.test(st.value));
            const stats = all.filter((st) => st !== timeChip);
            return (
              <div
                key={`${it.label}-${i}`}
                className="rounded-md bg-white px-2 sm:px-2.5 py-1.5"
                style={{ borderLeft: `3px solid ${bar}` }}
              >
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  {it.kind && (
                    <span className="text-[10.5px] font-bold text-p-muted">{it.kind}</span>
                  )}
                  {timeChip && (
                    <span className="text-[10.5px] text-p-muted whitespace-nowrap">[{timeChip.value}]</span>
                  )}
                </div>
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
                        {/* 별점은 개인 학습현황 카드와 같은 노랑으로 — 두 화면이 달라 보이면 안 된다 */}
                        <b className={/^★+$/.test(st.value) ? "text-[#f0a500]" : "text-black/75"}>{st.value}</b>
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

export function FeedEventCard({ event, myUid, familyNames }: {
  event: FeedEvent;
  myUid: string | null;
  familyNames: Map<string, string>;
}) {
  // 본인·형제·자녀는 실명으로. 나머지는 가린 이름 그대로.
  const real = event.childId ? familyNames.get(event.childId) : undefined;
  const displayName = real ? callName(real) : event.name;
  // 꾸미기: 이름 색·그라데이션 (globals.css)
  const nameCls = (event.nameStyle && SHOP_BY_ID.get(event.nameStyle)?.cssClass) || "";
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
              <span className={`text-[13px] font-bold text-black/90 truncate ${nameCls}`}>{displayName}</span>
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
