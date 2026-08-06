"use client";

import { RewardHeader } from "@/components/learn/reward-header";

/**
 * 피드 맨 위의 내 프로필 카드.
 *
 * 카드 본체는 /learn 최상단 위젯(RewardHeader)을 그대로 쓴다.
 * 두 화면이 같은 것을 다르게 보여주면 그게 더 나쁘고, 레벨·연속·뱃지·포인트는
 * 이미 그 위젯이 실시간으로 들고 있다.
 *
 * readOnly = 학부모가 보는 자녀 카드. 상점·피드 공개설정은 콜러블이 호출자 본인의
 * 학생을 찾으므로(rewards-api.ts resolveChild) 학부모가 누르면 실패한다 → 잠근다.
 */
export function FeedProfileCard({ childId, name, readOnly = false, note }: {
  childId: string;
  name: string;
  readOnly?: boolean;
  /** 이름 옆 꼬리표 (학부모 화면의 "자녀" 등). 읽기전용 여부와 별개다 */
  note?: string;
}) {
  return (
    <div>
      {name && (
        <div className="mb-2 flex items-baseline gap-1.5">
          <span className="text-[13px] font-bold text-black/85">{name}</span>
          {note && <span className="text-[11px] text-p-muted">{note}</span>}
        </div>
      )}
      <RewardHeader childId={childId} childName={name} readOnly={readOnly} />
    </div>
  );
}
