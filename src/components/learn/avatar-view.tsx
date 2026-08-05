"use client";

import { BG_COLORS, RARITY, SHOP_BY_ID } from "@/lib/rewards/catalog";

// 아바타 렌더러 — 배경/캐릭터/헤어/의상/모자/소품/테두리/이펙트를 겹쳐 그린다.
// 아트 PNG(/avatar/{slot}/{id}.png)가 붙기 전에는 아이템 이모지로 대체 표시한다.
// PNG가 채워지면 <img>가 우선 렌더되고 실패 시 이모지로 자동 폴백된다.

type Equipped = Record<string, string | null | undefined>;

function Layer({ itemId, size, z, offset }: { itemId?: string | null; size: number; z: number; offset?: { x?: number; y?: number; scale?: number } }) {
  const item = itemId ? SHOP_BY_ID.get(itemId) : undefined;
  if (!item) return null;
  const scale = offset?.scale ?? 1;
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        left: `${50 + (offset?.x ?? 0)}%`,
        top: `${50 + (offset?.y ?? 0)}%`,
        transform: "translate(-50%, -50%)",
        fontSize: size * scale,
        lineHeight: 1,
        zIndex: z,
        pointerEvents: "none",
      }}
    >
      {item.emoji}
    </span>
  );
}

export function AvatarView({ equipped, size = 56 }: { equipped: Equipped; size?: number }) {
  const bg = BG_COLORS[String(equipped.background ?? "bg-plain")] ?? "#f3f4f6";
  const frame = equipped.frame ? SHOP_BY_ID.get(String(equipped.frame)) : undefined;
  const ring = frame ? RARITY[frame.rarity].ring : "rgba(0,0,0,0.08)";
  const effect = equipped.effect ? SHOP_BY_ID.get(String(equipped.effect)) : undefined;

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        border: `2.5px solid ${ring}`,
        boxShadow: frame?.rarity === "legend" ? `0 0 0 3px ${RARITY.legend.bg}` : undefined,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <Layer itemId={equipped.base ?? "base-sprout"} size={size} z={1} offset={{ scale: 0.62, y: 4 }} />
      <Layer itemId={equipped.outfit} size={size} z={2} offset={{ scale: 0.34, y: 18 }} />
      <Layer itemId={equipped.hair} size={size} z={3} offset={{ scale: 0.3, y: -16, x: -14 }} />
      <Layer itemId={equipped.hat} size={size} z={4} offset={{ scale: 0.34, y: -24 }} />
      <Layer itemId={equipped.prop} size={size} z={5} offset={{ scale: 0.3, x: 24, y: 14 }} />
      {effect && (
        <span aria-hidden style={{ position: "absolute", right: 1, top: 1, fontSize: size * 0.26, zIndex: 6 }}>
          {effect.emoji}
        </span>
      )}
    </div>
  );
}
