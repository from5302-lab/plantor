"use client";

import { ExternalLink } from "lucide-react";
import { useServices } from "@/lib/services-context";
import { ServiceIcon } from "@/components/ui/service-icon";

/**
 * 구독 서비스 학습 사이트 바로가기 버튼 목록 (주소는 노출하지 않음, 새 탭).
 * 학생/학부모 접속 주소가 다른 서비스(클래스5 등)는 role에 맞는 주소로 연다.
 */
export function ServiceQuickLinks({ slugs, role }: {
  slugs: string[];             // 구독 중인 serviceSlug 목록
  role: "student" | "parent";
}) {
  const { allServices } = useServices();
  const links = [...new Set(slugs)]
    .map((slug) => allServices.find((s) => s.slug === slug))
    .filter((svc): svc is NonNullable<typeof svc> => !!svc)
    .map((svc) => ({ svc, url: (role === "parent" ? svc.parentUrl : undefined) ?? svc.studentUrl }))
    .filter((l): l is { svc: NonNullable<typeof l.svc>; url: string } => !!l.url);

  if (links.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {links.map(({ svc, url }) => (
        <a key={svc.slug} href={url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] font-semibold text-black/80 no-underline hover:bg-p-bg"
          style={{ transition: "background-color 150ms cubic-bezier(.4,0,.2,1)" }}>
          <ServiceIcon service={svc} size={16} />
          {svc.name}
          <ExternalLink size={11} className="text-p-muted" />
        </a>
      ))}
    </div>
  );
}
