import { Button } from "@/components/ui/button";
import { ArrowRight, MessageCircle } from "lucide-react";
import { useInView } from "@/hooks/useInView";

export default function FooterCTA() {
  const { ref, inView } = useInView();

  return (
    <section ref={ref} className="py-20 md:py-28">
      <div className="container mx-auto px-4">
        <div className={`relative max-w-4xl mx-auto bg-primary rounded-3xl p-8 md:p-16 text-center overflow-hidden transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <div className="absolute inset-0 bg-gradient-to-br from-primary to-emerald-600 opacity-90" />
          <div className="relative z-10 space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-primary-foreground/20 flex items-center justify-center mx-auto">
              <MessageCircle className="w-8 h-8 text-primary-foreground" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground">
              Comece agora a vender mais pelo WhatsApp
            </h2>
            <p className="text-primary-foreground/80 text-lg max-w-xl mx-auto">
              Junte-se a mais de 200 empresas que já transformaram seu marketing conversacional com a ConversaHub.
            </p>
            <Button size="lg" variant="secondary" className="gap-2 text-base">
              Agendar Demo Gratuita <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
