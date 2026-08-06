"use client";

import { useAuth } from "@/lib/auth-context";
import { useMyFamilyNames } from "@/lib/hooks/useMyFamilyNames";
import { FeedList } from "./feed-list";

export function CommunityShell() {
  const { user, role, loading } = useAuth();
  // 피드에는 가린 이름만 저장된다. 같은 가족(본인·형제·자녀)과 운영자만 실명으로 되살린다.
  const familyNames = useMyFamilyNames(user?.uid ?? null, role === "admin");
  // 읽기는 누구나, 엄지척은 로그인한 경우만.
  // 피드가 첫 화면이라 처음 온 사람은 맥락 없이 카드부터 본다 → 소개로 가는 줄을 하나 얹는다.
  // 판정이 끝나기 전(loading)에는 띄우지 않는다 — 로그인 사용자 화면에 깜빡이며 나타났다 사라진다.
  return (
    <FeedList
      myUid={user?.uid ?? null}
      familyNames={familyNames}
      showIntroLink={!loading && !user}
    />
  );
}
