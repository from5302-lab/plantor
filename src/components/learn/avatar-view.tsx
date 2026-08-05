"use client";

import { BG_STYLE, RARITY, SHOP_BY_ID } from "@/lib/rewards/catalog";

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
  const bg = BG_STYLE[String(equipped.background ?? "bg-plain")] ?? BG_STYLE["bg-plain"];
  const frame = equipped.frame ? SHOP_BY_ID.get(String(equipped.frame)) : undefined;
  const ring = frame ? RARITY[frame.rarity].ring : "rgba(0,0,0,0.08)";
  const effect = equipped.effect ? SHOP_BY_ID.get(String(equipped.effect)) : undefined;
  // 꾸미기는 CSS 클래스로 입힌다 (globals.css). 회전·발광은 여기서 살아난다.
  const deco = [frame?.cssClass, effect?.cssClass].filter(Boolean).join(" ");

  return (
    <div
      className={`frm ${deco}`}
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2.5px solid ${ring}`,
        // 이펙트가 아바타 밖으로 번져야 해서 overflow 를 막지 않는다
        flexShrink: 0,
      }}
    >
      {/*
        배경은 별도 레이어로 깐다.
        회전 무지개·홀로그램 테두리가 두 겹 그라데이션을 쓰느라 컨테이너의 background 를
        흰색으로 덮어버려서, 테두리에 배경이 먹히던 문제가 있었다.
      */}
      <span
        aria-hidden
        style={{ position: "absolute", inset: 0, borderRadius: "50%", background: bg, pointerEvents: "none" }}
      />
      {/* 식물 캐릭터 하나만 가운데 크게 — 겹쳐 붙이는 파츠는 전부 폐기했다 */}
      <Layer itemId={equipped.base ?? "base-sprout"} size={size} z={1} offset={{ scale: 0.6 }} />
    </div>
  );
}
