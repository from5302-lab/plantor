import Link from "next/link";
import { T } from "@/lib/design-tokens";
import type { Service } from "@/data/site";

const CATEGORY_LABEL: Record<string, string> = {
  subscription: "구독형",
  premium: "프리미엄",
  community: "커뮤니티",
};

export function ServiceCard({ service, onEdit, onMoveLeft, onMoveRight }: { service: Service; onEdit?: () => void; onMoveLeft?: () => void; onMoveRight?: () => void }) {
  const isComingSoon = service.status === "coming_soon" || (!service.status && service.slug.startsWith("coming-soon"));
  const isExternal = !!service.externalUrl;

  return (
    <div
      className={[
        isComingSoon ? "service-card" : "service-card card-hover",
        "relative flex flex-col rounded-xl p-[22px] shrink-0 w-[min(450px,100%)]",
        isComingSoon
          ? "bg-p-bg border-[1.5px] border-dashed border-black/[0.13] shadow-none opacity-85"
          : "bg-white border border-black/10",
      ].join(" ")}
      style={{ boxShadow: isComingSoon ? "none" : T.shadow }}
    >
      {/* 순서 이동 버튼 (어드민 전용) */}
      {(onMoveLeft !== undefined || onMoveRight !== undefined) && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 flex gap-1 z-[1]">
          <button
            onClick={onMoveLeft}
            disabled={!onMoveLeft}
            className="w-6 h-5 rounded-[3px] border border-black/10 bg-white text-[11px] flex items-center justify-center text-p-secondary"
            style={{ cursor: onMoveLeft ? "pointer" : "default", opacity: onMoveLeft ? 0.7 : 0.2 }}
          >←</button>
          <button
            onClick={onMoveRight}
            disabled={!onMoveRight}
            className="w-6 h-5 rounded-[3px] border border-black/10 bg-white text-[11px] flex items-center justify-center text-p-secondary"
            style={{ cursor: onMoveRight ? "pointer" : "default", opacity: onMoveRight ? 0.7 : 0.2 }}
          >→</button>
        </div>
      )}

      {/* 아이콘 + 카테고리 */}
      <div className="mb-3 flex items-start justify-between">
        {isExternal ? (
          <a href={service.externalUrl} target="_blank" rel="noopener noreferrer" className="flex items-center no-underline" title={`${service.name} 사이트 바로가기`}>
            {service.iconUrl
              ? <img src={service.iconUrl} alt={service.name} width={32} height={32} className="rounded-md object-contain" />
              : <span className="text-[28px]">{service.emoji}</span>
            }
          </a>
        ) : (
          service.iconUrl
            ? <img src={service.iconUrl} alt={service.name} width={32} height={32} className="rounded-md object-contain" />
            : <span className="text-[28px]">{service.emoji}</span>
        )}
        <div className="flex items-center gap-1">
          <span className="rounded-full bg-p-bg px-2 py-0.5 text-[11px] font-semibold text-p-secondary">
            {CATEGORY_LABEL[service.category]}
          </span>
          {onEdit && (
            <button onClick={onEdit} title="서비스 수정" className="bg-transparent border-none cursor-pointer text-[11px] p-0 leading-none">⚙️</button>
          )}
        </div>
      </div>

      {isExternal ? (
        <a href={service.externalUrl} target="_blank" rel="noopener noreferrer" className="no-underline">
          <h2 className="m-0 text-base font-bold text-black/95 tracking-[-0.2px]">
            {service.name}
          </h2>
        </a>
      ) : (
        <h2 className="m-0 text-base font-bold text-black/95 tracking-[-0.2px]">
          {service.name}
        </h2>
      )}
      <p className="mt-1 text-[13px] text-p-secondary leading-relaxed">
        {service.hook}
      </p>
      <div className="mt-3.5">
        <span className="text-[22px] font-bold text-black/95 tracking-[-0.5px]">
          {service.priceLabel}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-p-muted">대상: {service.targetGrades}</p>

      <ul className="mt-3.5 flex-1 p-0 list-none border-t border-black/[0.07] pt-3.5 flex flex-col gap-1.5">
        {service.bullets.map((b) => (
          <li key={b} className="flex items-center gap-2 text-xs text-p-secondary whitespace-nowrap">
            <span className="text-p-teal shrink-0">✓</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {/* 하단 버튼 */}
      {isComingSoon ? (
        <div className="mt-4 flex items-center justify-center h-10 rounded bg-black/[0.06] text-[13px] font-semibold text-p-muted">
          준비 중
        </div>
      ) : service.signupUrl ? (
        <a
          href={service.signupUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary mt-4 flex items-center justify-center h-10 rounded text-[13px] font-semibold text-white no-underline"
          style={{ backgroundColor: service.brandColor ?? "#38a848" }}
        >
          신청하기 →
        </a>
      ) : (
        <Link
          href="/signup"
          className="btn-primary mt-4 flex items-center justify-center h-10 rounded text-[13px] font-semibold text-white no-underline"
          style={{ backgroundColor: service.brandColor ?? "#38a848" }}
        >
          신청하기 →
        </Link>
      )}
    </div>
  );
}
