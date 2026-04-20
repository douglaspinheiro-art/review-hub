import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import TickerBar from "@/components/landing/TickerBar";
import Header from "@/components/landing/Header";
import Hero from "@/components/landing/Hero";
import CategoryPositioning from "@/components/landing/CategoryPositioning";
import ClientLogos from "@/components/landing/ClientLogos";
import HowItWorks from "@/components/landing/HowItWorks";
import DiagnosticPreview from "@/components/landing/DiagnosticPreview";
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
import { useAuth } from "@/hooks/useAuth";
import { getPostLoginRoute } from "@/lib/post-login-route";

const Index = () => {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();

  // Logged-in users with a pending diagnostic (no active subscription) should
  // land on /resultado, not the marketing site. Anonymous users see the landing.
  useEffect(() => {
    if (loading || !user?.id) return;
    let cancelled = false;
    (async () => {
      const next = await getPostLoginRoute(user.id, profile);
      if (!cancelled && next !== "/dashboard") {
        // /dashboard means active subscriber — let them stay if they explicitly
        // visit `/`. Other states (/resultado, /onboarding, /analisando) are
        // pending steps and should redirect.
        navigate(next, { replace: true });
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, profile, loading, navigate]);

  return (
    <div className="min-h-screen">
      <TickerBar />
      <Header />
      <main>
        <Hero />
        <CategoryPositioning />
        <ClientLogos />
        <HowItWorks />
        <DiagnosticPreview />
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
