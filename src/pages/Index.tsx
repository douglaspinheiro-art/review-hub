import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import TickerBar from "@/components/landing/TickerBar";
import Header from "@/components/landing/Header";
import Hero from "@/components/landing/Hero";
import CategoryPositioning from "@/components/landing/CategoryPositioning";
import ClientLogos from "@/components/landing/ClientLogos";
import HowItWorks from "@/components/landing/HowItWorks";
import DiagnosticPreview from "@/components/landing/DiagnosticPreview";
import ClosedLoopProof from "@/components/landing/ClosedLoopProof";
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
import CompetitorComparison from "@/components/landing/CompetitorComparison";
import FAQ from "@/components/landing/FAQ";
import FooterCTA from "@/components/landing/FooterCTA";
import Footer from "@/components/landing/Footer";
import { useAuth } from "@/hooks/useAuth";
import { getPostLoginRoute } from "@/lib/post-login-route";

const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, loading } = useAuth();

  // Só redireciona quem chegou em `/` vindo de um fluxo de auth (login/signup)
  // ou pediu explicitamente via `?postLogin=1`. Visitas diretas à landing
  // (clique no logo, link externo, refresh) ficam na homepage mesmo logado.
  useEffect(() => {
    if (loading || !user?.id) return;
    const params = new URLSearchParams(location.search);
    const fromAuth =
      params.get("postLogin") === "1" ||
      ["/login", "/signup", "/onboarding", "/analisando"].some((p) =>
        (location.state as { from?: string } | null)?.from?.startsWith(p)
      );
    if (!fromAuth) return;

    let cancelled = false;
    (async () => {
      const next = await getPostLoginRoute(user.id, profile);
      if (cancelled) return;
      // Só redireciona se houver passo pendente (ex.: /resultado, /onboarding).
      // Assinantes ativos (/dashboard) também são levados, pois vieram de auth.
      navigate(next, { replace: true });
    })();
    return () => { cancelled = true; };
  }, [user?.id, profile, loading, navigate, location.search, location.state]);

  return (
    <div className="min-h-screen">
      <TickerBar />
      <Header />
      <main>
        <Hero />
        <CategoryPositioning />
        <ClientLogos />
        <HowItWorks />
        <ClosedLoopProof />
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
        <CompetitorComparison />
        <Pricing />
        <FAQ />
        <FooterCTA />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
