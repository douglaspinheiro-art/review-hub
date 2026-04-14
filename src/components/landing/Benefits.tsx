import { useInView } from "@/hooks/useInView";
import { Repeat, Heart, Rocket, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

const benefits = [
  {
    icon: Repeat,
    title: "Automação que Vende",
    desc: "Carrinho abandonado, win-back, pós-venda e cross-sell rodando 24/7 no piloto automático.",
    metric: "+340%",
    metricLabel: "em vendas recorrentes",
  },
  {
    icon: Heart,
    title: "Fidelização Real",
    desc: "Programas de recompra inteligentes que transformam compradores únicos em clientes fiéis.",
    metric: "67%",
    metricLabel: "taxa de retenção",
  },
  {
    icon: Rocket,
    title: "Campanhas que Convertem",
    desc: "Segmentação RFM + IA para enviar a mensagem certa, na hora certa, pelo canal certo.",
    metric: "94%",
    metricLabel: "taxa de abertura",
  },
  {
    icon: Eye,
    title: "Insights Acionáveis",
    desc: "Dashboards de LTV, cohorts e funil que mostram exatamente onde você está perdendo dinheiro.",
    metric: "12x",
    metricLabel: "ROI médio",
  },
];

export default function Benefits() {
  const { ref, inView } = useInView();

  return (
    <section ref={ref} className="py-24 md:py-32">
      <div className="container mx-auto px-4">
        <div className={cn(
          "text-center max-w-2xl mx-auto mb-16 transition-all duration-700",
          inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        )}>
          <p className="text-primary font-semibold text-sm mb-3 uppercase tracking-widest">Resultados comprovados</p>
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            Por que líderes de e-commerce <span className="text-gradient">escolhem a LTV Boost</span>
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 gap-5 max-w-4xl mx-auto">
          {benefits.map(({ icon: Icon, title, desc, metric, metricLabel }, idx) => (
            <div
              key={title}
              className={cn(
                "group p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/30 transition-all duration-500",
                inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              )}
              style={{ transitionDelay: `${idx * 100}ms` }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <div className="text-right">
                  <p className="text-xl font-display font-bold text-primary">{metric}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{metricLabel}</p>
                </div>
              </div>
              <h3 className="font-display font-bold text-lg mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
