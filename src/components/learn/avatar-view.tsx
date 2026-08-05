"use client";

import { BG_STYLE, RARITY, SHOP_BY_ID } from "@/lib/rewards/catalog";

// 아바타 렌더러 — 배경 위에 식물 캐릭터(이모지) 하나를 얹고, 테두리·이펙트를 CSS로 입힌다.
// 이미지 파일은 쓰지 않는다: 헤어·의상 같은 겹치는 파츠를 폐기하면서 아트가 필요 없어졌다.

type Equipped = Record<string, string | null | undefined>;

export function AvatarView({ equipped, size = 56 }: { equipped: Equipped; size?: number }) {
  const bg = BG_STYLE[String(equipped.background ?? "bg-plain")] ?? BG_STYLE["bg-plain"];
  const frame = equipped.frame ? SHOP_BY_ID.get(String(equipped.frame)) : undefined;
  const ring = frame ? RARITY[frame.rarity].ring : "rgba(0,0,0,0.08)";
  const effect = equipped.effect ? SHOP_BY_ID.get(String(equipped.effect)) : undefined;
  // 꾸미기는 CSS 클래스로 입힌다 (globals.css). 회전·발광은 여기서 살아난다.
  const deco = [frame?.cssClass, effect?.cssClass].filter(Boolean).join(" ");
  const base = SHOP_BY_ID.get(String(equipped.base ?? "base-sprout"));

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
      {base && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: size * 0.6,
            lineHeight: 1,
            pointerEvents: "none",
          }}
        >
          {base.emoji}
        </span>
      )}
    </div>
  );
}
