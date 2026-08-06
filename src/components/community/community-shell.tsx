"use client";

import { useAuth } from "@/lib/auth-context";
import { useMyFamilyNames } from "@/lib/hooks/useMyFamilyNames";
import { FeedList } from "./feed-list";
import { FeedProfileCard } from "./feed-profile-card";

export function CommunityShell() {
  const { user, role } = useAuth();
  // 피드에는 가린 이름만 저장된다. 같은 가족(본인·형제·자녀)과 운영자만 실명으로 되살린다.
  const family = useMyFamilyNames(user?.uid ?? null, role === "admin", user?.email ?? null);

  // 프로필 카드 대상 — 학생은 본인 하나, 학부모는 자녀 전부(이름순), 운영자·비로그인은 없음.
  // 조립을 여기서 하는 이유: 나중에 상단 탭이 생기면 카드만 프로필 탭으로 옮기면 된다.
  const cardIds = role === "student"
    ? (family.myChildId ? [family.myChildId] : [])
    : role === "parent" ? family.childIds
    : [];

  const header = cardIds.length > 0 ? (
    <div className="flex flex-col gap-1">
      {cardIds.map((id) => (
        <FeedProfileCard
          key={id}
          childId={id}
          name={family.names.get(id) ?? ""}
          readOnly={role !== "student"}
        />
      ))}
    </div>
  ) : null;

  // 읽기는 누구나, 엄지척은 로그인한 경우만.
  // 소개로 가는 길은 상단바가 맡는다 — 피드 안에 안내 줄을 얹으면 매번 카드를 밀어낸다.
  return <FeedList myUid={user?.uid ?? null} familyNames={family.names} header={header} />;
}
