"use client";

import { useAuth } from "@/lib/auth-context";
import { CenterMsg } from "@/components/ui/center-msg";
import { LoginPrompt } from "@/components/ui/login-prompt";
import { NoteWorkspace } from "./note-workspace";

export function NoteShell() {
  const { user, loading } = useAuth();

  if (loading) return <CenterMsg>로딩 중…</CenterMsg>;
  if (!user) return <LoginPrompt message="노트를 작성하려면 먼저 로그인해 주세요." />;

  return <NoteWorkspace userId={user.uid} />;
}
