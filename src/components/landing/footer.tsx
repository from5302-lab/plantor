import { SITE } from "@/data/site";

export function Footer() {
  return (
    <footer className="border-t border-zinc-200 bg-white px-6 py-10 dark:border-zinc-800 dark:bg-black">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 text-sm text-zinc-500 sm:flex-row dark:text-zinc-400">
        <div className="flex items-center gap-2">
          <span>🌱</span>
          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
            {SITE.brand}
          </span>
          <span>·</span>
          <span>{SITE.tagline}</span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href={SITE.kakaoOpenChat}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-emerald-600 dark:hover:text-emerald-400"
          >
            카카오 오픈채팅
          </a>
          <a
            href={`mailto:${SITE.email}`}
            className="hover:text-emerald-600 dark:hover:text-emerald-400"
          >
            {SITE.email}
          </a>
        </div>
      </div>
    </footer>
  );
}
