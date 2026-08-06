import { T } from "@/lib/design-tokens";

export function PageWrap({
  children,
  paddingBottom = "80px",
  embedded = false,
}: {
  children: React.ReactNode;
  paddingBottom?: string;
  /**
   * 프로필 화면의 탭 안에서 쓸 때.
   * 배경(회색)·화면 높이·상단 여백은 바깥 화면이 이미 정했으므로 넘긴다.
   */
  embedded?: boolean;
}) {
  return (
    <div
      className={
        embedded
          ? "px-4 pt-4 sm:px-5"
          : "min-h-screen px-6 pt-12 max-[600px]:px-4 max-[600px]:pt-6"
      }
      // 탭 안에서는 아래 여백을 페이지 기준(96px)으로 두면 학습·계획 탭만 스크롤 끝이
      // 허전하게 비고, 뱃지·피드 탭(16px)과 어긋난다.
      style={{ backgroundColor: embedded ? "#ffffff" : T.bg, paddingBottom: embedded ? 24 : paddingBottom }}
    >
      {children}
    </div>
  );
}
