import TickerBar from "@/components/landing/TickerBar";
import Header from "@/components/landing/Header";
import Hero from "@/components/landing/Hero";
import ClientLogos from "@/components/landing/ClientLogos";
import HowItWorks from "@/components/landing/HowItWorks";
import Solutions from "@/components/landing/Solutions";
import Metrics from "@/components/landing/Metrics";
import Benefits from "@/components/landing/Benefits";
import TrustBadges from "@/components/landing/TrustBadges";
import CTASection from "@/components/landing/CTASection";
import Integrations from "@/components/landing/Integrations";
import Cases from "@/components/landing/Cases";
import Testimonials from "@/components/landing/Testimonials";
import ScarcityBanner from "@/components/landing/ScarcityBanner";
import Pricing from "@/components/landing/Pricing";
import FAQ from "@/components/landing/FAQ";
import FooterCTA from "@/components/landing/FooterCTA";
import Footer from "@/components/landing/Footer";

const Index = () => {
  return (
    <div className="min-h-screen">
      <TickerBar />
      <Header />
      <main>
        <Hero />
        <ClientLogos />
        <HowItWorks />
        <Solutions />
        <Metrics />
        <Benefits />
        <TrustBadges />
        <CTASection />
        <Integrations />
        <Cases />
        <Testimonials />
        <ScarcityBanner />
        <Pricing />
        <FAQ />
        <FooterCTA />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
