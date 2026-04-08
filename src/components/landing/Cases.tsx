import { useState } from "react";
import { useInView } from "@/hooks/useInView";
import { TrendingUp, Users, DollarSign, ShoppingBag, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";

const cases = [
  {
    id: "modafit",
    company: "ModaFit",
    segment: "Moda Fitness",
    quote: "Com playbook de recompra e operacao diaria, triplicamos recorrencia. O setup se pagou na primeira semana.",
    author: "Carolina M., CEO",
    metrics: [
      { icon: DollarSign, value: "R$ 2.4M", label: "Receita via WhatsApp" },
      { icon: Users, value: "15K", label: "Clientes fidelizados" },
      { icon: TrendingUp, value: "18x", label: "ROI da plataforma" },
      { icon: Repeat, value: "11 dias", label: "Payback do setup" },
    ],
  },
  {
    id: "techstore",
    company: "TechStore",
    segment: "Eletrônicos",
    quote: "Unificamos atendimento + campanhas. O time ganhou velocidade e o WhatsApp virou canal previsivel de receita.",
    author: "Ricardo O., Head de Marketing",
    metrics: [
      { icon: DollarSign, value: "R$ 1.8M", label: "Vendas incrementais" },
      { icon: ShoppingBag, value: "3.2K", label: "Carrinhos recuperados" },
      { icon: TrendingUp, value: "250%", label: "Crescimento em vendas" },
      { icon: Repeat, value: "-27%", label: "Redução no CAC de recompra" },
    ],
  },
  {
    id: "belezapura",
    company: "BelezaPura",
    segment: "Cosméticos",
    quote: "Com segmentacao RFM acionavel, paramos de enviar no escuro e elevamos recompra com margem.",
    author: "Juliana S., Diretora",
    metrics: [
      { icon: DollarSign, value: "R$ 890K", label: "Receita de recompra" },
      { icon: Repeat, value: "67%", label: "Taxa de retenção" },
      { icon: TrendingUp, value: "340%", label: "Aumento no LTV" },
      { icon: Users, value: "+19pts", label: "Evolução no CHS" },
    ],
  },
];

export default function Cases() {
  const { ref, inView } = useInView();
  const [active, setActive] = useState("modafit");
  const c = cases.find(c => c.id === active)!;

  return (
    <section id="cases" ref={ref} className="py-24 md:py-32">
      <div className="container mx-auto px-4">
        <div className={cn(
          "text-center max-w-2xl mx-auto mb-12 transition-all duration-700",
          inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        )}>
          <p className="text-primary font-semibold text-sm mb-3 uppercase tracking-widest">Resultados reais</p>
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            Cases de <span className="text-gradient">Sucesso</span>
          </h2>
          <p className="text-muted-foreground">
            Provas por vertical com impacto em margem, payback e recompra.
          </p>
        </div>

        {/* Tabs */}
        <div className={cn(
          "flex justify-center gap-2 mb-10 transition-all duration-700",
          inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        )}>
          {cases.map(cs => (
            <button
              key={cs.id}
              onClick={() => setActive(cs.id)}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-semibold transition-all",
                active === cs.id
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              {cs.company}
            </button>
          ))}
        </div>

        <div className={cn(
          "max-w-4xl mx-auto bg-card border border-border/50 rounded-2xl p-8 md:p-12 shadow-xl transition-all duration-500",
          inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        )}>
          <div className="flex flex-col md:flex-row md:items-center gap-8">
            <div className="flex-1 space-y-4">
              <div className="inline-flex items-center gap-2">
                <span className="bg-primary/10 text-primary text-sm font-semibold px-3 py-1 rounded-full">{c.segment}</span>
                <span className="text-sm text-muted-foreground">{c.company}</span>
              </div>
              <blockquote className="text-lg font-medium leading-relaxed italic text-foreground/90">
                "{c.quote}"
              </blockquote>
              <p className="text-sm text-muted-foreground">— {c.author}</p>
            </div>
            <div className="flex md:flex-col gap-6 md:gap-8">
              {c.metrics.map(({ icon: Icon, value, label }) => (
                <div key={label} className="text-center">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <p className="text-xl font-display font-bold text-primary">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
