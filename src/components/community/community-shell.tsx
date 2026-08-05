"use client";

import { useAuth } from "@/lib/auth-context";
import { useMyFamilyNames } from "@/lib/hooks/useMyFamilyNames";
import { FeedList } from "./feed-list";

export function CommunityShell() {
  const { user, role } = useAuth();
  // 피드에는 가린 이름만 저장된다. 같은 가족(본인·형제·자녀)과 운영자만 실명으로 되살린다.
  const familyNames = useMyFamilyNames(user?.uid ?? null, role === "admin");
  // 읽기는 누구나, 엄지척은 로그인한 경우만
  return <FeedList myUid={user?.uid ?? null} familyNames={familyNames} />;
}
