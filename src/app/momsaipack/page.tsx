import type { Metadata } from "next";
import { MomsAiPackContent } from "./momsaipack-content";

export const metadata: Metadata = {
  title: "AI 패키지 안내 — Plantor",
  robots: "noindex, nofollow",
};

export default function MomsAiPackPage() {
  return <MomsAiPackContent />;
}
