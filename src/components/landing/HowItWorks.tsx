import { useInView } from "@/hooks/useInView";
import { BarChart3, Bot, MessageCircle, RefreshCw, ShoppingBag, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = [
  {
    icon: ShoppingBag,
    step: "00",
    title: "Conecta sua loja",
    desc: "Conectamos sua plataforma (Shopify, Nuvemshop, VTEX, WooCommerce, Yampi, Dizy) por OAuth em 1 clique. Sincronizamos contatos, pedidos, catálogo e eventos de carrinho via webhook oficial.",
  },
  {
    icon: BarChart3,
    step: "01",
    title: "Lê do GA4",
     desc: "Conectamos seu Google Analytics 4 em 2 cliques. Lemos sessões, eventos do funil e atribuição reais - não estimamos, não inventamos.",
  },
  {
    icon: Bot,
    step: "02",
    title: "IA decide",
    desc: "Claude Sonnet cruza RFM da sua plataforma com comportamento do GA4 e decide quem abordar, quando e com qual oferta.",
  },
  {
    icon: MessageCircle,
    step: "03",
    title: "Executa no canal",
    desc: "Dispara WhatsApp (Meta Cloud API oficial) e Email com copy gerada por IA, segmentada por RFM e janela de propensão.",
  },
  {
    icon: RefreshCw,
    step: "04",
    title: "Volta para o GA4",
    desc: "Cada conversão é atribuída no seu GA4 com UTMs próprias e validada pelo pedido pago na sua plataforma. O loop recalibra timing, copy e segmentação a cada ciclo.",
    exclusive: true,
  },
];

export default function HowItWorks() {
  const { ref, inView } = useInView();

  return (
    <section id="como-funciona" ref={ref} className="py-24 md:py-32">
      <div className="container mx-auto px-4">
        <div className={cn(
          "text-center max-w-2xl mx-auto mb-16 transition-all duration-700",
          inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        )}>
          <p className="text-primary font-semibold text-sm mb-3 uppercase tracking-widest">O método proprietário LTV Boost</p>
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            Closed-Loop Revenue Recovery: o único{" "}
            <span className="text-gradient">loop fechado de ponta a ponta</span> no Brasil
          </h2>
          <p className="text-muted-foreground text-lg">
            Cada uma das 5 etapas existe isoladamente em outras ferramentas.{" "}
            <strong className="text-foreground">A LTV Boost é a única que executa as 5 conectadas</strong>,
            no mesmo motor, com atribuição auditável.
          </p>
        </div>

        <div className="grid md:grid-cols-5 gap-4 max-w-6xl mx-auto relative">
          {/* Closed loop line: from step 0 through step 4 and back */}
          <div className="hidden md:block absolute top-12 left-[10%] right-[10%] h-px bg-gradient-to-r from-primary/30 via-primary/70 to-primary/30" />
          <div className="hidden md:block absolute top-12 left-[10%] right-[10%] h-8 border-t-0 border-l border-r border-b border-dashed border-primary/30 rounded-b-3xl translate-y-[-2.25rem]" aria-hidden />

          {steps.map((s, idx) => (
            <div
              key={s.step}
              className={cn(
                "relative text-center space-y-4 transition-all duration-700",
                inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              )}
              style={{ transitionDelay: `${idx * 150}ms` }}
            >
              <div className={cn(
                "w-20 h-20 rounded-2xl border flex items-center justify-center mx-auto relative group transition-all",
                s.exclusive
                  ? "bg-primary/10 border-primary/50 ring-2 ring-primary/30"
                  : "bg-secondary border-border/50 hover:border-primary/50 hover:bg-primary/5"
              )}>
                <s.icon className="w-8 h-8 text-primary" />
                <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  {s.step}
                </div>
                {s.exclusive && (
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 bg-primary text-primary-foreground text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-md uppercase tracking-wider">
                    <Lock className="w-2.5 h-2.5" />
                    Exclusivo
                  </div>
                )}
              </div>
              <h3 className="font-display font-bold text-lg">{s.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-12 max-w-3xl mx-auto">
          Nenhuma outra ferramenta no mercado brasileiro fecha esse ciclo nas 5 dimensões com atribuição no GA4 do cliente.
          É essa combinação que define nossa categoria.
        </p>
      </div>
    </section>
  );
}
