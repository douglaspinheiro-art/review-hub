import Header from "@/components/landing/Header";
import Hero from "@/components/landing/Hero";
import ClientLogos from "@/components/landing/ClientLogos";
import About from "@/components/landing/About";
import Solutions from "@/components/landing/Solutions";
import Metrics from "@/components/landing/Metrics";
import Benefits from "@/components/landing/Benefits";
import CTASection from "@/components/landing/CTASection";
import Integrations from "@/components/landing/Integrations";
import Cases from "@/components/landing/Cases";
import Testimonials from "@/components/landing/Testimonials";
import Pricing from "@/components/landing/Pricing";
import FAQ from "@/components/landing/FAQ";
import FooterCTA from "@/components/landing/FooterCTA";
import Footer from "@/components/landing/Footer";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <Hero />
        <ClientLogos />
        <About />
        <Solutions />
        <Metrics />
        <Benefits />
        <CTASection />
        <Integrations />
        <Cases />
        <Testimonials />
        <Pricing />
        <FAQ />
        <FooterCTA />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
