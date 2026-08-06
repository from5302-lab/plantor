"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AuthModal } from "@/components/auth/auth-modal";
import { ProfileModal } from "@/components/auth/profile-modal";

export function Navbar() {
  const { user, role, hasAiPackage, loading, signOut } = useAuth();
  const pathname = usePathname();
  const isWriting = pathname?.startsWith("/writing");
  const isNote = pathname?.startsWith("/note");
  const isVault = pathname?.startsWith("/vault");

  const [showAuth, setShowAuth] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const displayId = role === "admin" ? "" : (user?.displayName || user?.email?.replace("@plantor.app", "") || "");

  // 로고를 눌렀을 때 갈 곳.
  // "/" 에는 LoginRedirect 가 걸려 있어 학생·학부모가 열면 곧바로 되돌아간다.
  // 학생의 홈은 프로필(/me) 이고, 학부모는 리다이렉트가 없는 /community 를 준다.
  const feedHref = role === "student" ? "/me" : role === "parent" ? "/community" : "/";

  // 메뉴 열릴 때 body 스크롤 잠금
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [menuOpen]);

  // 금고는 자체 상단바를 쓴다.
  // 이 반환은 반드시 훅 **뒤에** 와야 한다 — 앞에 두면 /vault 를 드나들 때
  // 렌더마다 훅 개수가 달라져 React 가 상태를 어긋나게 읽는다.
  if (isVault) return null;

  return (
    <>
      <nav className="sticky top-0 z-50 bg-white border-b border-black/10" style={{ backdropFilter: "blur(8px)" }}>
        <div className="mx-auto max-w-[1200px] flex h-14 items-center justify-between px-6 max-[600px]:px-4">
          {/* 로고 */}
          {isWriting ? (
            <Link
              href="/writing"
              className="nav-link text-base font-bold text-black/95 no-underline"
              style={{ letterSpacing: "-0.3px" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/favicon.svg" alt="" width={20} height={20} className="mr-1.5 align-middle inline-block" />Writing Lab
            </Link>
          ) : isNote ? (
            <Link
              href="/note"
              className="nav-link text-base font-bold text-black/95 no-underline"
              style={{ letterSpacing: "-0.3px" }}
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("planote:home"));
                }
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/planote-icon.svg" alt="" width={20} height={20} className="mr-1.5 align-middle inline-block" />Planote
            </Link>
          ) : (
            <Link
              href={feedHref}
              className="nav-link text-base font-bold text-black/95 no-underline"
              style={{ letterSpacing: "-0.3px" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/favicon.svg" alt="" width={20} height={20} className="mr-1.5 align-middle inline-block" />Plantor
            </Link>
          )}

          {/* 데스크톱 네비게이션 */}
          <div className="hidden min-[601px]:flex items-center gap-5">
            {isWriting || isNote ? (
              <WritingDesktopLinks
                user={user}
                loading={loading}
                displayId={displayId}
                role={role}
                signOut={signOut}
                onLogin={() => setShowAuth(true)}
                onProfile={() => setShowProfile(true)}
              />
            ) : (
              <DesktopLinks
                user={user}
                role={role}
                loading={loading}
                hasAiPackage={hasAiPackage}
                displayId={displayId}
                signOut={signOut}
                onLogin={() => setShowAuth(true)}
                onProfile={() => setShowProfile(true)}
              />
            )}
          </div>

          {/* 모바일 상단바 — 갈 곳은 전부 여기 고정한다. 메뉴를 열어야 보이면 없는 것과 같다.
              역할마다 실제로 오가는 곳만 올리고, 계정 동작(내 정보·로그아웃)은 메뉴에 남긴다.
              소개는 아직 회원이 아닌 사람 몫이라 로그인하면 자리를 비운다. */}
          <div className="flex min-[601px]:hidden items-center gap-2.5">
            {!loading && !user && (
              <Link href="/about" className="nav-link text-[13px] font-medium text-p-secondary no-underline">
                소개
              </Link>
            )}

            {/* 학생은 계획·학습·뱃지·상점이 전부 프로필(/me) 안의 탭이라 상단바에 따로 두지 않는다.
                로고가 프로필로 간다. */}

            {!loading && user && role === "parent" && (
              <>
                {hasAiPackage && (
                  <Link href="/momsaipack" className="nav-link text-[13px] font-medium text-p-secondary no-underline">AI 패키지</Link>
                )}
                <Link href="/account" className="nav-link text-[13px] font-semibold text-p-teal no-underline">학습 홈</Link>
              </>
            )}

            {!loading && user && role === "admin" && (
              <>
                <Link href="/momsaipack" className="nav-link text-[13px] font-medium text-p-secondary no-underline">AI 패키지</Link>
                <Link href="/admin" className="nav-link text-[13px] font-semibold text-p-teal no-underline">관리</Link>
              </>
            )}

            {!loading && !user && (
              <button
                onClick={() => setShowAuth(true)}
                className="btn-primary rounded bg-p-green px-3.5 py-1.5 text-[13px] font-semibold text-white border-none"
              >
                로그인
              </button>
            )}
            {loading && <div className="h-7 w-14 rounded bg-black/[0.06]" />}
            {/* 로그아웃 상태에서는 메뉴에 남는 항목이 없다(피드=로고, 소개·로그인=상단바).
                빈 서랍을 열게 하느니 버튼을 감춘다. */}
            {(loading || user) && (
              <button
                className="flex items-center justify-center w-10 h-10 rounded-lg bg-transparent border-none cursor-pointer"
                onClick={() => setMenuOpen(true)}
                aria-label="메뉴 열기"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M3 5h14M3 10h14M3 15h14" stroke="rgba(0,0,0,0.75)" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* 모바일 메뉴 오버레이 */}
      {menuOpen && (
        isWriting || isNote ? (
          <WritingMobileMenu
            user={user}
            loading={loading}
            displayId={displayId}
            role={role}
            signOut={signOut}
            onLogin={() => { setMenuOpen(false); setShowAuth(true); }}
            onProfile={() => { setMenuOpen(false); setShowProfile(true); }}
            onClose={() => setMenuOpen(false)}
          />
        ) : (
          <MobileMenu
            user={user}
            role={role}
            loading={loading}
            displayId={displayId}
            signOut={signOut}
            onProfile={() => { setMenuOpen(false); setShowProfile(true); }}
            onClose={() => setMenuOpen(false)}
          />
        )
      )}

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      {showProfile && user && role && (
        <ProfileModal user={user} role={role} onClose={() => setShowProfile(false)} />
      )}
    </>
  );
}

/* ── 데스크톱 링크 (기존 로직 그대로) ─────────────────────────────────── */
function DesktopLinks({
  user, role, loading, hasAiPackage, displayId, signOut, onLogin, onProfile,
}: {
  user: ReturnType<typeof useAuth>["user"];
  role: string | null;
  loading: boolean;
  hasAiPackage: boolean;
  displayId: string;
  signOut: () => void;
  onLogin: () => void;
  onProfile: () => void;
}) {
  return (
    <>
      {/* 피드 링크는 두지 않는다 — 로고가 이미 피드로 간다(feedHref).
          소개는 아직 회원이 아닌 사람 몫이라 로그인하면 자리를 비운다(모바일과 동일). */}
      {!loading && !user && (
        <Link href="/about" className="nav-link text-sm font-medium text-p-secondary no-underline">소개</Link>
      )}

      {!loading && !user && (
        <button
          onClick={onLogin}
          className="btn-primary rounded bg-p-green px-4 py-1.5 text-[13px] font-semibold text-white border-none"
        >
          로그인
        </button>
      )}

      {loading && (
        <div className="h-8 w-16 rounded-full bg-black/[0.06]" />
      )}

      {!loading && user && role === "admin" && (
        <>
          <Link href="/momsaipack" className="nav-link text-sm font-medium text-p-secondary no-underline">AI 패키지</Link>
          <Link href="/admin" className="nav-link text-sm font-medium text-p-secondary no-underline">관리</Link>
          <UserChip label="운영자" id="" onSignOut={signOut} onProfile={onProfile} />
        </>
      )}

      {!loading && user && role === "parent" && (
        <>
          {hasAiPackage && (
            <Link href="/momsaipack" className="nav-link text-sm font-medium text-p-secondary no-underline">AI 패키지</Link>
          )}
          <Link href="/account" className="nav-link text-sm font-semibold text-p-teal no-underline">학습 홈</Link>
          <UserChip label="학부모" id={displayId} onSignOut={signOut} onProfile={onProfile} />
        </>
      )}

      {/* 학생은 계획·학습·뱃지·상점이 전부 프로필(/me) 안의 탭이다 */}
      {!loading && user && role === "student" && (
        <UserChip label="학생" id={displayId} onSignOut={signOut} onProfile={onProfile} />
      )}
    </>
  );
}

/* ── 모바일 메뉴 ──────────────────────────────────────────────────────── */
function MobileMenu({
  user, role, loading, displayId, signOut, onProfile, onClose,
}: {
  user: ReturnType<typeof useAuth>["user"];
  role: string | null;
  loading: boolean;
  displayId: string;
  signOut: () => void;
  onProfile: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100]">
      {/* 배경 딤 */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* 메뉴 패널 */}
      <div
        className="absolute top-0 right-0 h-full w-[280px] bg-white"
        style={{ boxShadow: "-4px 0 24px rgba(0,0,0,0.1)", animation: "slideIn 0.2s ease-out" }}
      >
        {/* 닫기 버튼 */}
        <div className="flex items-center justify-between h-14 px-5 border-b border-black/10">
          {!loading && user && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold px-1.5 py-px rounded-full bg-[#e8e6e3] text-p-secondary" style={{ letterSpacing: "0.04em" }}>
                {role === "admin" ? "운영자" : role === "parent" ? "학부모" : "학생"}
              </span>
              {displayId && <span className="text-[13px] font-medium text-black/75">{displayId}</span>}
            </div>
          )}
          {(loading || !user) && <div />}
          <button
            onClick={onClose}
            className="flex items-center justify-center w-10 h-10 bg-transparent border-none cursor-pointer"
            aria-label="메뉴 닫기"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 4l10 10M14 4L4 14" stroke="rgba(0,0,0,0.6)" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* 메뉴 항목 */}
        <div className="flex flex-col py-2">
          {/* 갈 곳(피드=로고, 역할별 링크·소개=상단바)은 전부 상단바에 고정했다.
              메뉴에는 계정 동작만 남긴다 — 자주 누르지 않고, 잘못 누르면 곤란한 것들이다. */}
          {!loading && user && (
            <>
              <button
                onClick={() => { onClose(); onProfile(); }}
                className="mx-0 px-5 py-3 text-left text-[14px] font-medium text-black/75 bg-transparent border-none cursor-pointer"
              >
                내 정보
              </button>
              <button
                onClick={() => { onClose(); signOut(); }}
                className="mx-0 px-5 py-3 text-left text-[14px] font-medium text-[#e04040] bg-transparent border-none cursor-pointer"
              >
                로그아웃
              </button>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

/* ── Writing 전용 데스크톱 링크 (로그인/유저칩만) ─────────────────────── */
function WritingDesktopLinks({
  user, loading, displayId, role, signOut, onLogin, onProfile,
}: {
  user: ReturnType<typeof useAuth>["user"];
  loading: boolean;
  displayId: string;
  role: string | null;
  signOut: () => void;
  onLogin: () => void;
  onProfile: () => void;
}) {
  if (loading) return <div className="h-8 w-16 rounded-full bg-black/[0.06]" />;
  if (!user) {
    return (
      <button
        onClick={onLogin}
        className="btn-primary rounded bg-p-green px-4 py-1.5 text-[13px] font-semibold text-white border-none"
      >
        로그인
      </button>
    );
  }
  const label = role === "admin" ? "운영자" : role === "parent" ? "학부모" : "학생";
  return <UserChip label={label} id={displayId} onSignOut={signOut} onProfile={onProfile} />;
}

/* ── Writing 전용 모바일 메뉴 (로그인/로그아웃만) ────────────────────── */
function WritingMobileMenu({
  user, loading, displayId, role, signOut, onLogin, onProfile, onClose,
}: {
  user: ReturnType<typeof useAuth>["user"];
  loading: boolean;
  displayId: string;
  role: string | null;
  signOut: () => void;
  onLogin: () => void;
  onProfile: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="absolute top-0 right-0 h-full w-[280px] bg-white"
        style={{ boxShadow: "-4px 0 24px rgba(0,0,0,0.1)", animation: "slideIn 0.2s ease-out" }}
      >
        <div className="flex items-center justify-between h-14 px-5 border-b border-black/10">
          {!loading && user && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold px-1.5 py-px rounded-full bg-[#e8e6e3] text-p-secondary" style={{ letterSpacing: "0.04em" }}>
                {role === "admin" ? "운영자" : role === "parent" ? "학부모" : "학생"}
              </span>
              {displayId && <span className="text-[13px] font-medium text-black/75">{displayId}</span>}
            </div>
          )}
          {(loading || !user) && <div />}
          <button
            onClick={onClose}
            className="flex items-center justify-center w-10 h-10 bg-transparent border-none cursor-pointer"
            aria-label="메뉴 닫기"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 4l10 10M14 4L4 14" stroke="rgba(0,0,0,0.6)" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className="flex flex-col py-2">
          {!loading && !user && (
            <button
              onClick={onLogin}
              className="mx-4 mt-3 rounded-lg bg-p-green px-4 py-3 text-[14px] font-semibold text-white border-none text-center cursor-pointer"
            >
              로그인
            </button>
          )}
          {!loading && user && (
            <>
              <button
                onClick={() => { onClose(); onProfile(); }}
                className="mx-0 px-5 py-3 text-left text-[14px] font-medium text-black/75 bg-transparent border-none cursor-pointer"
              >
                내 정보
              </button>
              <div className="mx-4 my-2 border-t border-black/[0.07]" />
              <button
                onClick={() => { onClose(); signOut(); }}
                className="mx-0 px-5 py-3 text-left text-[14px] font-medium text-[#e04040] bg-transparent border-none cursor-pointer"
              >
                로그아웃
              </button>
            </>
          )}
        </div>
      </div>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

/* ── 데스크톱 유저칩 ──────────────────────────────────────────────────── */
function UserChip({ label, id, onSignOut, onProfile }: { label: string; id: string; onSignOut: () => void; onProfile: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn-ghost flex items-center gap-1.5 bg-p-bg rounded-full py-1 pl-2 pr-2.5 border border-black/[0.07] outline-none"
      >
        <span className="text-[10px] font-bold px-1.5 py-px rounded-full bg-[#e8e6e3] text-p-secondary" style={{ letterSpacing: "0.04em" }}>
          {label}
        </span>
        {id && <span className="text-[13px] font-medium text-black/75">{id}</span>}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="ml-0.5 opacity-45">
          <path d="M2 3.5L5 6.5L8 3.5" stroke="#615d59" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+8px)] z-50 bg-white border border-black/[0.09] rounded-[10px] overflow-hidden whitespace-nowrap" style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.10)" }}>
            <button
              onClick={() => { setOpen(false); onProfile(); }}
              className="nav-link block w-full px-5 py-[9px] text-[13px] font-medium text-black/75 bg-transparent border-none border-b border-black/[0.06] text-center cursor-pointer"
            >
              내 정보
            </button>
            <button
              onClick={() => { setOpen(false); onSignOut(); }}
              className="btn-ghost block w-full px-5 py-[9px] text-[13px] font-medium text-[#e04040] bg-transparent border-none text-center cursor-pointer"
            >
              로그아웃
            </button>
          </div>
        </>
      )}
    </div>
  );
}
