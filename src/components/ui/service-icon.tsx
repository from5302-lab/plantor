import type { Service } from "@/data/site";

export function ServiceIcon({ service, size = 24 }: { service: Pick<Service, "emoji" | "iconUrl" | "name">; size?: number }) {
  if (service.iconUrl) {
    return (
      <img
        src={service.iconUrl}
        alt={service.name}
        width={size}
        height={size}
        style={{ borderRadius: Math.round(size * 0.2), objectFit: "contain", flexShrink: 0, display: "inline-block" }}
      />
    );
  }
  return <span style={{ fontSize: size * 0.85, lineHeight: 1, flexShrink: 0 }}>{service.emoji}</span>;
}
