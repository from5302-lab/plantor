import type { Metadata } from "next";
import { Hero } from "@/components/landing/hero";
import { FeedPeek } from "@/components/landing/feed-peek";
import { HowItWorks } from "@/components/landing/how-it-works";
import { RewardsShowcase } from "@/components/landing/rewards-showcase";
import { Scoring } from "@/components/landing/scoring";
import { Values } from "@/components/landing/values";
import { ServicesSection } from "@/components/landing/services-section";
import { SignupCtaBanner } from "@/components/landing/signup-cta-banner";
import { Faq } from "@/components/landing/faq";
import { Cta } from "@/components/landing/cta";

export const metadata: Metadata = {
  title: "소개 — Plantor",
  description:
    "학원이 쓰는 검증된 학습 프로그램을 집에서. 학습 결과는 플랜토가 자동으로 가져와 기록하고, 경험치·레벨·뱃지로 돌려줍니다.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "Plantor — 집에서 하는 공부가, 오늘도 이어지게",
    description:
      "학원이 쓰는 검증된 학습 프로그램을 집에서. 학습 결과는 플랜토가 자동으로 가져와 기록합니다.",
    url: "https://plantor.web.app/about",
    siteName: "Plantor",
    images: [{ url: "https://plantor.web.app/og.png", width: 1200, height: 630 }],
    locale: "ko_KR",
    type: "website",
  },
};

export default function AboutPage() {
  return (
    <>
      <Hero />
      <FeedPeek />
      <HowItWorks />
      <RewardsShowcase />
      <Scoring />
      <Values />
      <ServicesSection />
      <SignupCtaBanner />
      <Faq />
      <Cta />
    </>
  );
}
