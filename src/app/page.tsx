import { Hero } from "@/components/landing/hero";
import { Values } from "@/components/landing/values";
import { ServicesSection } from "@/components/landing/services-section";
import { Stats } from "@/components/landing/stats";
import { WebinarBanner } from "@/components/landing/webinar-banner";
import { Faq } from "@/components/landing/faq";
import { Cta } from "@/components/landing/cta";
import { Footer } from "@/components/landing/footer";

export default function Home() {
  return (
    <>
      <Hero />
      <Values />
      <ServicesSection />
      <Stats />
      <WebinarBanner />
      <Faq />
      <Cta />
      <Footer />
    </>
  );
}
