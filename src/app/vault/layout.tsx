import type { Metadata } from "next";
import { SwRegister } from "./sw-register";

export const metadata: Metadata = {
  title: "가계부",
  manifest: "/vault-manifest.json",
  robots: { index: false, follow: false },
};

export default function VaultLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh" style={{ background: "#f6f5f4", overscrollBehavior: "none", overflow: "auto", position: "fixed", inset: 0, width: "100%", maxWidth: "100vw" }}>
      {children}
      <SwRegister />
    </div>
  );
}
