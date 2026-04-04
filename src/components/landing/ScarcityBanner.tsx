import { useInView } from "@/hooks/useInView";
import { Button } from "@/components/ui/button";
import { ArrowRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ScarcityBanner() {
  const { ref, inView } = useInView();
  const filled = 17;
  const total = 20;
  const pct = (filled / total) * 100;

  return (
    <section ref={ref} className="py-16">
      <div className="container mx-auto px-4">
        <div className={cn(
          "max-w-3xl mx-auto bg-card border border-primary/20 rounded-2xl p-8 text-center space-y-5 transition-all duration-700",
          inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        )}>
          <div className="inline-flex items-center gap-2 text-primary text-sm font-semibold">
            <Clock className="w-4 h-4" />
            Vagas limitadas este mês
          </div>
          <h3 className="text-2xl font-display font-bold">
            Aceitamos apenas <span className="text-primary">{total} novos clientes</span> por mês
          </h3>
          <p className="text-muted-foreground text-sm">
            Para garantir onboarding personalizado e resultados desde a primeira semana.
          </p>
          <div className="max-w-md mx-auto">
            <div className="flex justify-between text-xs text-muted-foreground mb-2">
              <span>{filled} vagas preenchidas</span>
              <span>{total - filled} restantes</span>
            </div>
            <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary to-emerald-400 rounded-full transition-all duration-1000" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <Button asChild size="lg" className="gap-2 shadow-lg shadow-primary/20">
            <a href="/signup">
              Garantir minha vaga <ArrowRight className="w-4 h-4" />
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
