import { Hero } from "@/components/landing/hero";
import { Values } from "@/components/landing/values";
import { ServicesSection } from "@/components/landing/services-section";
import { SignupCtaBanner } from "@/components/landing/signup-cta-banner";
import { Faq } from "@/components/landing/faq";
import { Cta } from "@/components/landing/cta";
import { LoginRedirect } from "@/components/auth/login-redirect";

export default function Home() {
  return (
    <>
      <LoginRedirect />
      <Hero />
      <ServicesSection />
      <SignupCtaBanner />
      <Values />
      <Faq />
      <Cta />
    </>
  );
}
