import Link from "next/link";
import { T } from "@/lib/design-tokens";
import { SITE } from "@/data/site";

export function Footer() {
  return (
    <footer
      className="px-6 max-[600px]:px-4"
      style={{
        backgroundColor: T.white,
        borderTop: T.border,
        paddingTop: 32,
        paddingBottom: 32,
      }}
    >
      <div
        className="mx-auto max-w-[1000px] flex flex-wrap items-center justify-between gap-4 max-[600px]:flex-col max-[600px]:items-start max-[600px]:gap-3"
        style={{ fontSize: 13, color: T.textMuted }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src="/favicon.svg" alt="" width={18} height={18} style={{ display: "block" }} />
          <span style={{ fontWeight: 600, color: T.textSecondary }}>{SITE.brand}</span>
          <span>·</span>
          <span>{SITE.tagline}</span>
        </div>
        <div className="flex items-center gap-5 max-[600px]:flex-wrap max-[600px]:gap-x-4 max-[600px]:gap-y-2">
          <Link href="/community" className="nav-link" style={{ color: T.textMuted, textDecoration: "none" }}>커뮤니티</Link>
          <Link href="/about" className="nav-link" style={{ color: T.textMuted, textDecoration: "none" }}>소개</Link>
          <a
            href={SITE.kakaoOpenChat}
            target="_blank"
            rel="noopener noreferrer"
            className="nav-link"
            style={{ color: T.textMuted, textDecoration: "none" }}
          >
            카카오 오픈채팅
          </a>
          <a
            href={`mailto:${SITE.email}`}
            className="nav-link"
            style={{ color: T.textMuted, textDecoration: "none" }}
          >
            {SITE.email}
          </a>
        </div>
      </div>
    </footer>
  );
}
