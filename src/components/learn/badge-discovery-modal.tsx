"use client";

import { useState } from "react";
import { ModalOverlay } from "@/components/ui/modal-overlay";
import { BADGE_BY_CODE, RARITY, type BadgeDef } from "@/lib/rewards/catalog";
import { T } from "@/lib/design-tokens";

// "그런 뱃지가 있는 줄도 몰랐는데 어느 날 뜬다" — 조건은 이 순간 처음 공개된다.
// 카드가 0.6초 뒤 뒤집히며 등장하고, 곧바로 자랑(공유)할 수 있다.

const SHARE_SIZE = 1080;

/** 뱃지 공유 카드 PNG 생성 — 피드와 같이 학년·실명을 넣는다(2026-08-05 사용자 확정). */
async function buildShareCard(badge: BadgeDef, opts: { name: string; grade: string; title: string; level: number }): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_SIZE;
  canvas.height = SHARE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const r = RARITY[badge.rarity];

  const grad = ctx.createLinearGradient(0, 0, SHARE_SIZE, SHARE_SIZE);
  grad.addColorStop(0, r.bg);
  grad.addColorStop(1, "#ffffff");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SHARE_SIZE, SHARE_SIZE);

  ctx.strokeStyle = r.ring;
  ctx.lineWidth = 14;
  ctx.strokeRect(48, 48, SHARE_SIZE - 96, SHARE_SIZE - 96);

  ctx.textAlign = "center";

  ctx.font = "700 34px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = r.fg;
  ctx.fillText(`${r.label} 뱃지 획득`, SHARE_SIZE / 2, 190);

  ctx.font = "300px system-ui, -apple-system, sans-serif";
  ctx.fillText(badge.emoji, SHARE_SIZE / 2, 520);

  ctx.font = "800 82px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "rgba(0,0,0,0.9)";
  ctx.fillText(badge.name, SHARE_SIZE / 2, 660);

  // 조건 문구 — 길면 줄바꿈
  ctx.font = "400 36px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#615d59";
  const words = badge.desc.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > SHARE_SIZE - 220) { lines.push(line); line = w; } else { line = next; }
  }
  if (line) lines.push(line);
  lines.slice(0, 3).forEach((t, i) => ctx.fillText(t, SHARE_SIZE / 2, 740 + i * 52));

  ctx.font = "700 44px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  const who = [opts.grade, opts.name].filter(Boolean).join(" ");
  ctx.fillText(`${who} · ${opts.title} Lv.${opts.level}`, SHARE_SIZE / 2, 940);

  ctx.font = "600 30px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#a39e98";
  ctx.fillText("plantor.web.app", SHARE_SIZE / 2, 1000);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

export function BadgeDiscoveryModal({
  codes, name, grade, title, level, onClose,
}: {
  codes: string[];
  name: string;
  grade: string;
  title: string;
  level: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const badge = BADGE_BY_CODE.get(codes[idx]);
  if (!badge) return null;

  return (
    <ModalOverlay onClose={onClose} zIndex={1200}>
      {/* key={idx} — 뱃지가 넘어갈 때 연출과 공유 상태를 처음부터 다시 (타이머 불필요) */}
      <DiscoveryCard
        key={idx}
        badge={badge}
        name={name}
        grade={grade}
        title={title}
        level={level}
        step={idx + 1}
        total={codes.length}
        onNext={() => (idx >= codes.length - 1 ? onClose() : setIdx((i) => i + 1))}
      />
    </ModalOverlay>
  );
}

function DiscoveryCard({ badge, name, grade, title, level, step, total, onNext }: {
  badge: BadgeDef;
  name: string;
  grade: string;
  title: string;
  level: number;
  step: number;
  total: number;
  onNext: () => void;
}) {
  const [shareState, setShareState] = useState<"idle" | "working" | "done" | "fallback">("idle");
  const r = RARITY[badge.rarity];
  const isLast = step >= total;

  async function share() {
    setShareState("working");
    const blob = await buildShareCard(badge, { name, grade, title, level });
    if (!blob) { setShareState("idle"); return; }
    const file = new File([blob], `plantor-${badge.code}.png`, { type: "image/png" });
    const text = `${badge.name} 뱃지를 땄어요! ${badge.desc}`;
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], text, title: "플랜토 뱃지" });
        setShareState("done");
        return;
      } catch {
        /* 사용자가 취소 → 다운로드로 폴백 */
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
    setShareState("fallback");
  }

  return (
    <div
      style={{
        width: "100%", maxWidth: 340, background: T.white, borderRadius: 20,
        padding: "28px 22px 22px", textAlign: "center", boxShadow: T.shadowFloat,
      }}
    >
      <div className="text-[11px] font-bold tracking-[0.12em]" style={{ color: r.fg }}>
        히든 뱃지 발견!
      </div>

      {/* 카드 — 0.6초 뒤 뒤집히며 뱃지가 드러난다 (CSS 애니메이션) */}
      <div
        className="badge-card"
        style={{
          position: "relative", margin: "16px auto 14px", width: 140, height: 140, borderRadius: 24,
          background: r.bg, border: `3px solid ${r.ring}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <span className="badge-face-back" style={{ position: "absolute", fontSize: 44 }}>❓</span>
        <span className="badge-face-front" style={{ fontSize: 68 }}>{badge.emoji}</span>
      </div>

      <div
        className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mb-1.5"
        style={{ background: r.bg, color: r.fg }}
      >
        {r.label}
      </div>
      <div className="text-[20px] font-bold text-black/90">{badge.name}</div>
      <div className="badge-desc mt-1.5 text-[13px] leading-snug text-p-secondary min-h-[36px]">
        {badge.desc}
      </div>

      <button
        onClick={share}
        disabled={shareState === "working"}
        className="mt-4 w-full py-3 rounded-xl text-[14px] font-bold text-white"
        style={{ background: T.teal, opacity: shareState === "working" ? 0.6 : 1 }}
      >
        {shareState === "working" ? "카드 만드는 중…"
          : shareState === "done" ? "자랑 완료!"
            : shareState === "fallback" ? "이미지 저장됨 — 다시 자랑하기"
              : "자랑하기"}
      </button>

      <button onClick={onNext} className="mt-2 w-full py-2.5 text-[13px] font-semibold text-p-secondary">
        {isLast ? "닫기" : `다음 뱃지 (${step}/${total})`}
      </button>
    </div>
  );
}
