"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useMyFamilyNames } from "@/lib/hooks/useMyFamilyNames";
import { useRewards } from "@/lib/hooks/useRewards";
import { SHOP_BY_ID } from "@/lib/rewards/catalog";
import { CenterMsg } from "@/components/ui/center-msg";
import { LoginPrompt } from "@/components/ui/login-prompt";
import { LearnDashboard } from "@/components/learn/learn-dashboard";
import { StudentPlan } from "@/components/plan/student-plan";
import { BadgeVault, Shop } from "@/components/learn/reward-panels";
import { FeedList } from "@/components/community/feed-list";
import { FeedProfileCard } from "@/components/community/feed-profile-card";

// 학생의 프로필 화면 — 로그인 후 첫 화면.
// 위에는 내 카드, 아래는 탭으로 내용을 갈아 끼운다. 페이지를 옮기지 않으므로
// 탭을 오갈 때 카드가 그대로 남는다.

type Tab = "mine" | "learn" | "plan" | "badges" | "shop" | "all";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "mine", label: "내 기록" },
  { key: "learn", label: "학습하기" },
  { key: "plan", label: "계획하기" },
  { key: "badges", label: "뱃지" },
  { key: "shop", label: "상점" },
  { key: "all", label: "전체" },
];

export function ProfileShell({ previewChildId, previewName }: {
  /** 어드민 미리보기 — 이 학생의 프로필 화면을 읽기 전용으로 렌더한다 */
  previewChildId?: string;
  previewName?: string;
} = {}) {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  // 기본은 학습하기 — 학생이 여는 이유는 대부분 공부하러 오는 것이다
  const [tab, setTab] = useState<Tab>("learn");

  const isPreview = !!previewChildId;
  const family = useMyFamilyNames(user?.uid ?? null, isPreview, user?.email ?? null);
  const childId = previewChildId ?? family.myChildId;

  // 뱃지·상점 탭은 리워드 상태를 직접 쓴다 (카드와 같은 구독이라 값이 어긋나지 않는다)
  const rewards = useRewards(childId, !!childId);

  // 상점에서 입어보는 중인 조합. 무대를 따로 그리는 대신 위 프로필 카드가 그대로 비춘다.
  const [tryOn, setTryOn] = useState<Record<string, string>>({});
  const previewEquipped = { ...rewards.equipped, ...tryOn };
  const nameClass = SHOP_BY_ID.get(String(previewEquipped.nameStyle ?? ""))?.cssClass ?? "";

  useEffect(() => {
    if (isPreview || loading || !user || !role) return;
    if (role === "admin") router.replace("/admin");
    else if (role === "parent") router.replace("/account");
  }, [isPreview, loading, user, role, router]);

  if (loading) return <CenterMsg>로딩 중…</CenterMsg>;
  if (!user) return <LoginPrompt message="내 프로필을 보려면 먼저 로그인해 주세요." />;
  if (!isPreview && role && role !== "student") return <CenterMsg>로딩 중…</CenterMsg>;

  const name = previewName ?? (childId ? (family.names.get(childId) ?? "") : "");

  return (
    <div className="min-h-screen bg-p-bg">
      <div className="max-w-[600px] mx-auto bg-white min-h-[calc(100vh-56px)]">
        {/* 프로필 카드 — 탭을 오가도 그대로 */}
        {childId && (
          <div className="px-4 sm:px-5 pt-4">
            <FeedProfileCard
              childId={childId}
              name={name}
              readOnly={isPreview}
              previewEquipped={tab === "shop" ? previewEquipped : undefined}
              nameClass={nameClass}
            />
          </div>
        )}

        {/* 탭 — 좁은 화면에서는 가로로 밀린다 */}
        <div className="sticky top-14 z-40 bg-white border-b border-black/[0.07]">
          {/* 가운데 정렬 — 넘칠 때만 왼쪽부터 밀린다(justify-center 는 넘치면 앞이 잘린다) */}
          <div className="flex gap-1 overflow-x-auto no-scrollbar px-3 sm:px-4 justify-start sm:justify-center [&>*:first-child]:ml-auto [&>*:last-child]:mr-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                // 상점을 떠나면 입어보기는 벗는다 — 안 사고 나갔는데 카드가 그대로면 산 줄 안다
                onClick={() => { setTab(t.key); if (t.key !== "shop") setTryOn({}); }}
                className={`shrink-0 px-3 py-3 text-[13.5px] font-semibold bg-transparent border-none cursor-pointer ${
                  tab === t.key ? "text-black/90" : "text-p-muted"
                }`}
                style={{ borderBottom: tab === t.key ? "2px solid #38a848" : "2px solid transparent" }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <TabBody
          tab={tab}
          childId={childId}
          uid={user.uid}
          userName={previewName ?? user.displayName}
          userEmail={user.email}
          familyNames={family.names}
          rewards={rewards}
          isPreview={isPreview}
          tryOn={tryOn}
          onTryOn={setTryOn}
        />
      </div>
    </div>
  );
}

function TabBody({ tab, childId, uid, userName, userEmail, familyNames, rewards, isPreview, tryOn, onTryOn }: {
  tab: Tab;
  childId: string | null;
  uid: string;
  userName: string | null;
  userEmail: string | null;
  familyNames: Map<string, string>;
  rewards: ReturnType<typeof useRewards>;
  isPreview: boolean;
  tryOn: Record<string, string>;
  onTryOn: Dispatch<SetStateAction<Record<string, string>>>;
}) {
  // 피드 두 탭은 FeedList 를 그대로 쓴다. 카드·탭은 이 화면이 이미 그렸으므로
  // 목록만 받아 쓰고, 바깥 여백은 FeedList 쪽 컨테이너를 걷어낸 형태로 감싼다.
  if (tab === "mine" || tab === "all") {
    return (
      <FeedList
        // 미리보기에서는 운영자 계정으로 엄지척이 눌리지 않게 막는다
        myUid={isPreview ? null : uid}
        familyNames={familyNames}
        // childId 를 못 구했으면 빈 결과를 보여준다 — 필터 없이 전체가 뜨면 남의 기록이 내 것처럼 읽힌다
        childId={tab === "mine" ? (childId ?? "__none__") : undefined}
        showSummary={tab === "all"}
        bare
      />
    );
  }

  if (tab === "learn") {
    return (
      <LearnDashboard
        userId={isPreview ? (childId ?? "") : uid}
        userName={userName}
        userEmail={userEmail}
        embedded
        readOnly={isPreview}
        previewChildId={isPreview ? (childId ?? undefined) : undefined}
      />
    );
  }

  if (tab === "plan") {
    return (
      <StudentPlan
        userId={isPreview ? (childId ?? "") : uid}
        userEmail={userEmail}
        previewChildId={isPreview ? (childId ?? undefined) : undefined}
        embedded
      />
    );
  }

  if (!rewards.ready) return <CenterMsg>로딩 중…</CenterMsg>;

  // 상점은 모달용으로 만들어져 안쪽 목록만 스크롤한다(h-full 전제). 페이지에서는 높이를 정해 준다.
  // 미리보기에서도 둘러보기·입어보기는 열어 둔다 — 막히는 건 구매 버튼뿐이다.
  return (
    <div className={`px-4 sm:px-5 py-4 ${tab === "shop" ? "h-[calc(100vh-320px)] min-h-[440px]" : ""}`}>
      {tab === "badges"
        ? <BadgeVault state={rewards} />
        : <Shop state={rewards} readOnly={isPreview} hideStage tryOn={tryOn} onTryOn={onTryOn} />}
    </div>
  );
}
