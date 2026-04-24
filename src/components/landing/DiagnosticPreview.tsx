import { useInView } from "@/hooks/useInView";
import { cn } from "@/lib/utils";
import { ArrowRight, Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

const problems = [
  {
    severity: "ALTO",
    severityClass: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    title: "Checkout com frete revelado tarde",
    desc: "73% dos abandonos no checkout ocorrem ao ver o custo do frete pela primeira vez.",
    impact: "R$ 20.429",
  },
  {
    severity: "ALTO",
    severityClass: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    title: "Base dormente sem reativação",
    desc: "1.240 clientes sem compra há mais de 90 dias e nenhuma automação ativa.",
    impact: "R$ 11.000",
  },
  {
    severity: "CRÍTICO",
    severityClass: "bg-destructive/15 text-destructive border-destructive/30",
    title: "Carrinho abandonado sem resgate",
    desc: "Apenas 8% dos carrinhos abandonados recebem mensagem. Benchmark: 65%.",
    impact: "R$ 7.857",
  },
];

export default function DiagnosticPreview() {
  const { ref, inView } = useInView();

  return (
    <section ref={ref} className="py-24 md:py-32 bg-background">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center max-w-6xl mx-auto">
          {/* Copy */}
          <div className={cn(
            "space-y-6 transition-all duration-700",
            inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          )}>
            <p className="text-primary font-semibold text-sm uppercase tracking-widest">
              Diagnóstico com IA
            </p>
             <h2 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold leading-[1.1]">
               A IA aponta onde está vazando - <span className="text-gradient">em reais, por mês.</span>
             </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Não é mais um dashboard bonito. É um raio-X que classifica cada problema por severidade e mostra o impacto financeiro mensal de cada um.
            </p>
            <ul className="space-y-3">
              {[
                "Severidade Crítico / Alto / Médio",
                "Impacto em R$/mês por problema",
                "Plano de ação priorizado por ROI",
              ].map(f => (
                <li key={f} className="flex items-center gap-3 text-sm">
                  <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                    <Sparkles className="w-3 h-3 text-primary" />
                  </div>
                  <span className="text-foreground/80">{f}</span>
                </li>
              ))}
            </ul>
            <Button asChild size="lg" className="h-12 px-6 rounded-xl font-bold">
              <a href="/signup">
                Ver meu diagnóstico grátis <ArrowRight className="ml-2 w-4 h-4" />
              </a>
            </Button>
          </div>

          {/* Problems preview */}
          <div className={cn(
            "space-y-3 transition-all duration-700 delay-150",
            inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          )}>
            <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                  <span className="text-xs font-bold tracking-[0.15em] uppercase text-muted-foreground">
                    Problemas prioritários
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground">3 de 7</span>
              </div>

              <div className="space-y-3">
                {problems.map((p, i) => (
                  <div
                    key={i}
                    className="bg-secondary/40 border border-border/30 rounded-xl p-4 hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wider",
                        p.severityClass
                      )}>
                        {p.severity}
                      </span>
                      <div className="text-right shrink-0">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Impacto</p>
                        <p className="text-sm font-display font-extrabold text-destructive leading-tight">
                          {p.impact}
                          <span className="text-[10px] text-muted-foreground font-normal">/mês</span>
                        </p>
                      </div>
                    </div>
                    <h4 className="text-sm font-semibold mb-1">{p.title}</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">{p.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
