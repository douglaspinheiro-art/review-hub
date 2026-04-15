import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useInView } from "@/hooks/useInView";
import { cn } from "@/lib/utils";

export default function FooterCTA() {
  const { ref, inView } = useInView();

  return (
    <section ref={ref} className="py-24 md:py-32">
      <div className="container mx-auto px-4">
        <div className={cn(
          "relative max-w-4xl mx-auto rounded-3xl p-10 md:p-16 text-center overflow-hidden transition-all duration-700",
          inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        )}>
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/10 to-emerald-500/10 border border-primary/20 rounded-3xl" />
          <div className="absolute inset-0 bg-card/80 rounded-3xl" />
          
          <div className="relative z-10 space-y-6">
            <p className="text-primary font-semibold text-sm uppercase tracking-widest">Pronto para crescer?</p>
            <h2 className="text-3xl md:text-4xl font-display font-bold">
              Saia do modo campanha e entre no <span className="text-gradient">modo dominância</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Receba um plano para os próximos 90 dias com metas de retenção, distribuição e expansão de LTV.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button asChild size="lg" className="h-14 px-8 text-base font-bold shadow-xl shadow-primary/25 hover:scale-[1.02] transition-all gap-2">
                <a href="/signup">
                  Agendar Demo Gratuita <ArrowRight className="w-5 h-5" />
                </a>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-14 px-8 text-base border-border/50">
                <a href="#planos">Ver Planos</a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Trial de 14 dias grátis · Sem cartão de crédito · Setup em 5 minutos
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
