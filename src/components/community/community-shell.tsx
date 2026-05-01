"use client";

import { useAuth } from "@/lib/auth-context";
import { FeedTab } from "./feed-tab";

export function CommunityShell() {
  const { user, role } = useAuth();
  return <FeedTab myUid={user?.uid ?? null} isAdmin={role === "admin"} />;
}
