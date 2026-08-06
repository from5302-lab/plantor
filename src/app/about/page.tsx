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
  // 검색 결과 요약문 — 여기는 잘림이 덜해 한 문장 더 붙인다.
  description:
    "학원이 쓰는 검증된 프로그램을 집에서. 학습 결과는 자동으로 기록되고, 경험치와 레벨로 돌아옵니다.",
  alternates: { canonical: "/about" },
  openGraph: {
    // 공유 카드는 33자쯤에서 잘린다 — 설명은 한 호흡으로 끝낸다.
    title: "플랜토 — 집에서 하는 공부, 오늘도 이어지게",
    description: "오늘 뭘 했는지 묻지 않아도 알 수 있어요",
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
