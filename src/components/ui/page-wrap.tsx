import { T } from "@/lib/design-tokens";

export function PageWrap({
  children,
  paddingBottom = "80px",
}: {
  children: React.ReactNode;
  paddingBottom?: string;
}) {
  return (
    <div
      className="min-h-screen px-6 pt-12 max-[600px]:px-4 max-[600px]:pt-6"
      style={{ backgroundColor: T.bg, paddingBottom }}
    >
      {children}
    </div>
  );
}
