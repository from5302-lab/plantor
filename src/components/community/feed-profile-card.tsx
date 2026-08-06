"use client";

import { RewardHeader } from "@/components/learn/reward-header";

/**
 * 피드·프로필 맨 위의 프로필 카드 — 한 장의 명함.
 *
 * 카드 본체는 /learn 최상단 위젯(RewardHeader)을 그대로 쓴다.
 * 두 화면이 같은 것을 다르게 보여주면 그게 더 나쁘고, 레벨·연속·뱃지·포인트는
 * 이미 그 위젯이 실시간으로 들고 있다.
 *
 * 이름은 카드 **안**에 있다. 전에는 카드 밖에서 한 줄을 따로 차지했는데,
 * 명함이라면 이름이 명함 안에 있어야 하고 그 한 줄은 순수한 낭비였다.
 *
 * readOnly = 학부모가 보는 자녀 카드. 상점·피드 공개설정은 콜러블이 호출자 본인의
 * 학생을 찾으므로(rewards-api.ts resolveChild) 학부모가 누르면 실패한다 → 잠근다.
 */
export function FeedProfileCard({ childId, name, readOnly = false, note, previewEquipped, nameClass = "", onPanel, activePanel = null }: {
  childId: string;
  name: string;
  readOnly?: boolean;
  /** 이름 옆 꼬리표 (학부모 화면의 "자녀" 등). 읽기전용 여부와 별개다 */
  note?: string;
  /** 상점에서 입어보는 중인 조합 — 카드가 그대로 비춘다 */
  previewEquipped?: Record<string, string | null | undefined>;
  /** 이름 스타일 아이템의 CSS 클래스. 이름을 사는 슬롯이라 여기서 보여야 한다 */
  nameClass?: string;
  /** 주면 뱃지·상점을 모달 대신 바깥 프레임에서 전환한다 */
  onPanel?: (p: "badges" | "shop") => void;
  activePanel?: "badges" | "shop" | null;
}) {
  return (
    <RewardHeader
      childId={childId}
      childName={name}
      readOnly={readOnly}
      previewEquipped={previewEquipped}
      onPanel={onPanel}
      activePanel={activePanel}
      showIdentity
      note={note}
      nameClass={nameClass}
    />
  );
}
