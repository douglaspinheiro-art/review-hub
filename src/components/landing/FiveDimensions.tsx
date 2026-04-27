import { useInView } from "@/hooks/useInView";
import { cn } from "@/lib/utils";
import { ShoppingCart, RefreshCw, Moon, TrendingUp, Crown } from "lucide-react";

const DIMENSIONS = [
  {
    icon: ShoppingCart,
    number: "01",
    title: "Carrinho & Checkout",
    desc: "Visitantes que adicionaram produto, iniciaram checkout e abandonaram antes de pagar.",
    bullets: [
      "Recuperação multicanal por janela (1h, 4h, 24h)",
      "Copy decidida por IA com base em produto e segmento RFM",
    ],
    metric: "12-18%",
    metricLabel: "dos carrinhos abandonados recuperados",
  },
  {
    icon: RefreshCw,
    number: "02",
    title: "Recompra & Frequência",
    desc: "Clientes que compraram uma vez e estão no momento certo da segunda compra — antes de virarem dormentes.",
    bullets: [
      "Predição de janela ideal por categoria",
      "Trigger automático com cross-sell baseado no histórico",
    ],
    metric: "+22%",
    metricLabel: "na taxa de recompra em 90 dias",
  },
  {
    icon: Moon,
    number: "03",
    title: "Inatividade & Reativação",
    desc: "Base inteira de clientes que pararam de comprar há 60, 90, 180 dias — e ninguém mais conversa com eles.",
    bullets: [
      "Segmentação RFM automática (Em Risco, Hibernando, Perdidos)",
      "Sequência calibrada por valor histórico do cliente",
    ],
    metric: "8-14%",
    metricLabel: "da base dormente reativada por trimestre",
  },
  {
    icon: TrendingUp,
    number: "04",
    title: "Ticket Médio & Cross-sell",
    desc: "Clientes que compram, mas compram menos do que poderiam — produtos complementares nunca ofertados no momento certo.",
    bullets: [
      "Recomendação de bundle pós-compra (3 dias após entrega)",
      "Upsell em recompra com produtos de margem maior",
    ],
    metric: "+15%",
    metricLabel: "no ticket médio dos recorrentes",
  },
  {
    icon: Crown,
    number: "05",
    title: "LTV & Fidelização",
    desc: "A dimensão de longo prazo: quanto cada cliente vai gerar nos próximos 12 meses se nada mudar.",
    bullets: [
      "Score de propensão (probabilidade de churn vs. recompra)",
      "Programa de pontos integrado a campanhas de retenção",
    ],
    metric: "+35%",
    metricLabel: "no LTV dos top 20% em 6 meses",
  },
];

export default function FiveDimensions() {
  const { ref, inView } = useInView();

  return (
    <section ref={ref} className="py-24 md:py-28 bg-secondary/20">
      <div className="container mx-auto px-4">
        <div
          className={cn(
            "max-w-3xl mx-auto text-center mb-14 transition-all duration-700",
            inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          )}
        >
          <p className="text-primary font-semibold text-sm mb-3 uppercase tracking-widest">
            As 5 dimensões da perda invisível
          </p>
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            Toda receita que vaza da sua loja vaza por{" "}
            <span className="text-gradient">uma dessas 5 portas</span>.
          </h2>
          <p className="text-muted-foreground text-lg">
            A maioria das ferramentas olha para 1 ou 2 dimensões — geralmente carrinho e e-mail.{" "}
            <strong className="text-foreground">A LTV Boost é a única que mapeia as 5 simultaneamente</strong>,
            no mesmo loop, com IA cruzando os dados em tempo real.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4 max-w-7xl mx-auto">
          {DIMENSIONS.map((d, i) => (
            <div
              key={d.number}
              className={cn(
                "rounded-2xl border border-border/50 bg-card p-5 flex flex-col gap-4 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-500",
                inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              )}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <div className="flex items-start justify-between">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                  <d.icon className="w-5 h-5 text-primary" />
                </div>
                <span className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground">
                  {d.number}/05
                </span>
              </div>

              <div>
                <h3 className="font-display font-bold text-base leading-tight mb-2">{d.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{d.desc}</p>
              </div>

              <ul className="space-y-1.5 border-t border-border/40 pt-3">
                {d.bullets.map((b) => (
                  <li key={b} className="text-[11px] text-muted-foreground flex gap-1.5">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto rounded-lg bg-primary/5 border border-primary/20 p-3">
                <p className="text-xl font-display font-extrabold text-primary leading-none">{d.metric}</p>
                <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{d.metricLabel}</p>
              </div>
            </div>
          ))}
        </div>

        <div
          className={cn(
            "mt-12 max-w-3xl mx-auto rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center transition-all duration-700",
            inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          )}
        >
          <h3 className="font-display font-bold text-lg mb-2">Por que 5 e não 1?</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Receita não vaza por uma porta só. Carrinho abandonado é o mais visível — mas geralmente é só 20%
            da perda total. As outras 4 dimensões somam <strong className="text-foreground">80% da receita
            invisível</strong> que sua loja deixa na mesa todo mês.
          </p>
          <p className="text-sm text-primary font-semibold mt-3">
            Concorrente que faz 1 dimensão? Vários. Concorrente que faz as 5 conectadas + prova no GA4? Zero.
          </p>
        </div>
      </div>
    </section>
  );
}