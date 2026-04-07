import { useState } from "react";
import { useInView } from "@/hooks/useInView";
import { TrendingUp, Users, DollarSign, FileText, Sparkles, Quote } from "lucide-react";
import { cn } from "@/lib/utils";

const DOSSIERS = [
  {
    category: "FASHION & LIFESTYLE",
    segment: "Moda",
    revenue_range: "R$ 800k–1.2M/mês",
    date: "Fev 2025",
    title: "Como a ModaFit triplicou o LTV em 180 dias",
    description: "Automação de funil combinada com segmentação RFM identificou 847 clientes em risco. Sequência de reativação via WhatsApp com IA negociadora gerou R$ 2.4M em receita incremental nos primeiros 6 meses.",
    quote: "Eu duvidei que ia funcionar pra moda. Mas na primeira semana a gente já recuperou R$ 38k em carrinhos. Hoje o LTV Boost paga o salário de dois vendedores.",
    quote_author: "Lucas M., fundador da ModaFit",
    metrics: [
      { icon: DollarSign, value: "R$ 2.4M", label: "RECEITA EXTRA" },
      { icon: Users, value: "+340%", label: "RECORRÊNCIA" },
      { icon: TrendingUp, value: "18.4x", label: "ROI DIRETO" },
    ],
    tags: ["Segmentação RFM", "WhatsApp Automation", "Churn Prevention"]
  },
  {
    category: "BELEZA & COSMÉTICOS",
    segment: "Beleza",
    revenue_range: "R$ 200–400k/mês",
    date: "Jan 2025",
    title: "Glowskin recuperou R$ 890K em carrinhos abandonados",
    description: "Com 12.400 visitantes/mês e taxa de abandono de 74%, a IA identificou o pico de abandono no checkout de pagamento. Sequência de 3 mensagens com PIX automático recuperou 19.2% dos carrinhos perdidos.",
    quote: "A gente tentou e-mail por anos e não passava de 3% de recuperação. No WhatsApp com o LTV Boost chegamos a 19%. Foi um choque.",
    quote_author: "Ana P., CMO da Glowskin",
    metrics: [
      { icon: DollarSign, value: "R$ 890K", label: "RECUPERADO" },
      { icon: TrendingUp, value: "19.2%", label: "TAXA RECUPERAÇÃO" },
      { icon: Users, value: "4.200", label: "CLIENTES SALVOS" },
    ],
    tags: ["Carrinho Abandonado", "PIX Automático", "Funil de Pagamento"]
  },
  {
    category: "SUPLEMENTOS & NUTRIÇÃO",
    segment: "Suplementos",
    revenue_range: "R$ 150–300k/mês",
    date: "Mar 2025",
    title: "NutriMax 10x a frequência de recompra em 90 dias",
    description: "LTV predictor identificou janela ideal de recompra (28 dias) por proteína. Mensagem personalizada no dia certo com desconto progressivo aumentou frequência de 1.2x para 3.1x ao ano por cliente.",
    quote: "O LTV predictor sabe quando meu cliente vai acabar o whey antes dele mesmo. Os resultados em 90 dias superaram tudo que fizemos nos últimos 2 anos.",
    quote_author: "Rafael S., CEO da NutriMax",
    metrics: [
      { icon: TrendingUp, value: "+158%", label: "FREQUÊNCIA COMPRA" },
      { icon: DollarSign, value: "R$ 312", label: "LTV MÉDIO ↑" },
      { icon: Users, value: "92%", label: "RETENÇÃO 90 DIAS" },
    ],
    tags: ["LTV Predictor", "Smart Timing", "Recompra Automática"]
  },
  {
    category: "MULTI-CANAL · SHOPIFY + ML",
    segment: "Casa",
    revenue_range: "R$ 500k–900k/mês",
    date: "Dez 2024",
    title: "Casa&Cia unificou 23K clientes duplicados entre ML e loja própria",
    description: "Matching por CPF/telefone revelou que 38% dos clientes do Mercado Livre também compravam na loja própria sem qualquer comunicação unificada. Com visão 360°, taxa de cross-sell subiu 214%.",
    quote: "A gente não sabia que tinha um cliente comprando nos dois canais. Quando unificou, descobrimos que 38% do nosso público nunca tinha recebido uma mensagem da marca. Era dinheiro jogado fora.",
    quote_author: "Fernanda K., head de e-commerce, Casa&Cia",
    metrics: [
      { icon: Users, value: "23K", label: "CLIENTES UNIFICADOS" },
      { icon: TrendingUp, value: "+214%", label: "CROSS-SELL" },
      { icon: DollarSign, value: "R$ 1.1M", label: "RECEITA INCREMENTAL" },
    ],
    tags: ["Cross-Channel", "Mercado Livre", "Visão 360°"]
  },
  {
    category: "ELETRÔNICOS & TECNOLOGIA",
    segment: "Eletrônicos",
    revenue_range: "R$ 1M+/mês",
    date: "Nov 2024",
    title: "TechZone reduziu churn em 67% com prescrições automáticas",
    description: "IA detectou padrão: clientes que não abrem e-mails por 45 dias têm 81% de chance de churn. Protocolo de reativação via WhatsApp com oferta de garantia estendida converteu 34% desse segmento.",
    quote: "O modelo de churn nos deu 45 dias de antecedência antes de perder o cliente. Esse tempo foi suficiente para salvar 67% deles. Hoje é nosso KPI mais importante.",
    quote_author: "Gustavo R., diretor de operações, TechZone",
    metrics: [
      { icon: TrendingUp, value: "-67%", label: "CHURN MENSAL" },
      { icon: Users, value: "34%", label: "REATIVAÇÃO" },
      { icon: DollarSign, value: "R$ 4.800", label: "LTV SALVO/CLIENTE" },
    ],
    tags: ["Predição de Churn", "Win-back", "Prescrição Automática"]
  },
];

const FILTER_OPTIONS = ["Todos", "Moda", "Beleza", "Suplementos", "Casa", "Eletrônicos"];

export default function Cases() {
  const { ref, inView } = useInView();
  const [activeFilter, setActiveFilter] = useState("Todos");

  const filtered = activeFilter === "Todos"
    ? DOSSIERS
    : DOSSIERS.filter(d => d.segment === activeFilter);

  return (
    <section id="cases" ref={ref} className="py-20 md:py-32 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className={cn(
          "max-w-3xl mb-10 transition-all duration-1000",
          inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        )}>
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-[10px] font-black tracking-[0.2em] px-4 py-1.5 rounded-full mb-6 uppercase">
            <FileText className="w-3.5 h-3.5" />
            Dossiês de Performance
          </div>
          <h2 className="text-4xl md:text-5xl font-black font-syne tracking-tighter mb-6 leading-[1.1]">
            Resultados que ignoram a <br />
            <span className="text-primary italic">média do mercado.</span>
          </h2>
          <p className="text-muted-foreground text-xl max-w-2xl leading-relaxed">
            Relatórios detalhados de operações que escalaram a lucratividade através de inteligência de dados aplicada.
          </p>
        </div>

        {/* Segment Filter */}
        <div className={cn(
          "flex flex-wrap gap-2 mb-12 transition-all duration-700",
          inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        )}>
          {FILTER_OPTIONS.map(opt => (
            <button
              key={opt}
              onClick={() => setActiveFilter(opt)}
              className={cn(
                "text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full border transition-all duration-200",
                activeFilter === opt
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/50 text-muted-foreground border-border/50 hover:border-primary/40 hover:text-foreground"
              )}
            >
              {opt}
            </button>
          ))}
        </div>

        <div className="grid gap-8">
          {filtered.map((dossier, idx) => (
            <div
              key={idx}
              className={cn(
                "group relative bg-card/50 backdrop-blur-xl border border-border/50 rounded-[2rem] p-8 md:p-12 transition-all duration-700 hover:border-primary/30",
                inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              )}
            >
              <div className="flex flex-col lg:flex-row lg:items-start gap-12">
                <div className="flex-1 space-y-8">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-[10px] font-mono font-bold text-primary tracking-[0.3em] uppercase">
                        {dossier.category}
                      </span>
                      <span className="text-[9px] text-muted-foreground/50 font-mono border border-border/40 px-2 py-0.5 rounded-full">
                        {dossier.revenue_range}
                      </span>
                      <span className="text-[9px] text-muted-foreground/40 font-mono">
                        {dossier.date}
                      </span>
                    </div>
                    <h3 className="text-3xl md:text-4xl font-black font-syne tracking-tighter leading-tight">
                      {dossier.title}
                    </h3>
                    <p className="text-muted-foreground text-lg leading-relaxed max-w-xl">
                      {dossier.description}
                    </p>
                  </div>

                  {/* Quote */}
                  <div className="relative bg-primary/5 border border-primary/10 rounded-2xl p-5">
                    <Quote className="w-5 h-5 text-primary/30 mb-2" />
                    <p className="text-sm leading-relaxed text-foreground/80 italic mb-3">
                      "{dossier.quote}"
                    </p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                      — {dossier.quote_author}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {dossier.tags.map(tag => (
                      <span key={tag} className="text-[10px] font-bold bg-muted/50 border border-border/50 px-3 py-1 rounded-full text-muted-foreground uppercase tracking-wider">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 lg:flex lg:flex-col gap-6 lg:min-w-[240px]">
                  {dossier.metrics.map(({ icon: Icon, value, label }) => (
                    <div key={label} className="bg-background/40 border border-border/30 rounded-2xl p-5 group-hover:bg-primary/5 transition-colors duration-500">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <Icon className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-2xl font-black font-mono tracking-tighter text-primary">
                            {value}
                          </p>
                          <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">
                            {label}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Decorative AI Glow */}
              <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:opacity-100 transition-opacity duration-700">
                <Sparkles className="w-6 h-6 text-primary animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
