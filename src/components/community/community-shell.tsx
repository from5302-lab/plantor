"use client";

import { useAuth } from "@/lib/auth-context";
import { FeedList } from "./feed-list";

export function CommunityShell() {
  const { user } = useAuth();
  // 읽기는 누구나, 엄지척은 로그인한 경우만
  return <FeedList myUid={user?.uid ?? null} />;
}
