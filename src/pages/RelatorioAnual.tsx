import { useState } from "react";
import { Link } from "react-router-dom";
import { MessageSquare, BarChart3, TrendingUp, Download, ArrowRight, CheckCircle2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const BENCHMARK_DATA = [
  {
    nicho: "Moda",
    emoji: "👗",
    cvr_p50: "2.8%",
    cvr_top: "5.1%",
    ticket_medio: "R$ 180",
    ltv_12m: "R$ 620",
    churn_mensal: "4.2%",
    melhor_horario: "19h–21h",
    insight: "Lojistas de moda que usam WhatsApp pós-compra têm 2.4x mais recompras em 60 dias.",
  },
  {
    nicho: "Beleza",
    emoji: "💄",
    cvr_p50: "3.1%",
    cvr_top: "6.8%",
    ticket_medio: "R$ 140",
    ltv_12m: "R$ 890",
    churn_mensal: "3.1%",
    melhor_horario: "8h–10h",
    insight: "Programas de recorrência (kits mensais) aumentam LTV em 3x no segmento de beleza.",
  },
  {
    nicho: "Suplementos",
    emoji: "💊",
    cvr_p50: "3.4%",
    cvr_top: "7.2%",
    ticket_medio: "R$ 220",
    ltv_12m: "R$ 1.450",
    churn_mensal: "2.8%",
    melhor_horario: "6h–8h",
    insight: "Recuperação de carrinho em suplementos tem taxa de conversão 68% maior que moda.",
  },
  {
    nicho: "Eletrônicos",
    emoji: "📱",
    cvr_p50: "1.9%",
    cvr_top: "3.8%",
    ticket_medio: "R$ 890",
    ltv_12m: "R$ 2.100",
    churn_mensal: "6.8%",
    melhor_horario: "12h–14h",
    insight: "Upsell de acessórios via WhatsApp 48h pós-compra recupera em média 18% do ticket principal.",
  },
  {
    nicho: "Casa & Deco",
    emoji: "🏠",
    cvr_p50: "2.2%",
    cvr_top: "4.5%",
    ticket_medio: "R$ 310",
    ltv_12m: "R$ 780",
    churn_mensal: "5.1%",
    melhor_horario: "10h–12h",
    insight: "Abandono de carrinho em casa & deco tem tempo médio de recuperação de 4h — mensagens acima disso convertem 3x menos.",
  },
];

const HIGHLIGHTS = [
  { label: "Lojas analisadas", value: "200+", sub: "dados anonimizados" },
  { label: "Período de análise", value: "12 meses", sub: "jan–dez 2025" },
  { label: "Mensagens enviadas", value: "4,8M+", sub: "via WhatsApp" },
  { label: "Recuperado em total", value: "R$ 38M+", sub: "por lojas da base" },
];

export default function RelatorioAnual() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
    }, 1200);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="border-b border-white/5 px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <Link to="/" className="flex items-center gap-2 font-black text-lg tracking-tighter">
          <MessageSquare className="w-6 h-6 fill-primary text-primary" />
          LTV Boost
        </Link>
        <Link to="/signup">
          <Button size="sm" className="font-bold">Teste Grátis</Button>
        </Link>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center space-y-6">
        <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full">
          <BarChart3 className="w-3.5 h-3.5" /> Edição 2025
        </div>
        <h1 className="text-5xl md:text-6xl font-black font-syne tracking-tighter leading-tight">
          Relatório Anual do<br />
          <span className="text-primary italic">E-commerce Brasileiro</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto font-medium">
          Benchmarks exclusivos por nicho, padrões de conversão, melhores horários de envio e as táticas que as lojas do top 10% usam — baseados em dados reais de 200+ e-commerces.
        </p>

        {/* Stats strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
          {HIGHLIGHTS.map((h) => (
            <div key={h.label} className="bg-card border rounded-2xl p-4 text-center">
              <p className="text-2xl font-black font-mono">{h.value}</p>
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">{h.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Teaser data */}
      <section className="max-w-5xl mx-auto px-6 pb-16 space-y-8">
        <div className="flex items-center gap-3 border-b border-border/30 pb-4">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h2 className="text-2xl font-black font-syne tracking-tighter">Benchmarks por Nicho — Prévia</h2>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {BENCHMARK_DATA.map((row, idx) => {
            const isBlurred = idx >= 2;
            return (
              <div
                key={row.nicho}
                className={cn(
                  "bg-card border rounded-2xl p-5 space-y-4 relative overflow-hidden",
                  isBlurred && "select-none"
                )}
              >
                {isBlurred && (
                  <div className="absolute inset-0 z-10 bg-background/70 backdrop-blur-[6px] flex flex-col items-center justify-center gap-3 p-6 text-center">
                    <Lock className="w-6 h-6 text-muted-foreground" />
                    <p className="text-sm font-bold">Disponível no relatório completo</p>
                    <p className="text-xs text-muted-foreground">Cadastre seu e-mail abaixo para receber o PDF gratuito</p>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{row.emoji}</span>
                  <div>
                    <p className="font-black">{row.nicho}</p>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">E-commerce Brasil 2025</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-muted/30 rounded-xl p-2.5">
                    <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">CVR Médio</p>
                    <p className="font-black font-mono">{row.cvr_p50}</p>
                  </div>
                  <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-2.5">
                    <p className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest">Top 10%</p>
                    <p className="font-black font-mono text-emerald-400">{row.cvr_top}</p>
                  </div>
                  <div className="bg-muted/30 rounded-xl p-2.5">
                    <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">Ticket Médio</p>
                    <p className="font-black font-mono">{row.ticket_medio}</p>
                  </div>
                  <div className="bg-muted/30 rounded-xl p-2.5">
                    <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">LTV 12m</p>
                    <p className="font-black font-mono">{row.ltv_12m}</p>
                  </div>
                </div>
                <div className="bg-primary/5 border border-primary/10 rounded-xl p-3">
                  <p className="text-[10px] text-primary font-bold leading-relaxed">💡 {row.insight}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Lead magnet gate */}
      <section id="pdf" className="max-w-2xl mx-auto px-6 pb-24">
        <div className="bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 rounded-3xl p-10 text-center space-y-6">
          {!submitted ? (
            <>
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <Download className="w-8 h-8 text-primary" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black font-syne tracking-tighter">Receba o relatório completo</h3>
                <p className="text-muted-foreground text-sm">PDF gratuito com todos os 5 nichos, análise sazonal, melhores horários por segmento e benchmarks de recuperação WhatsApp.</p>
              </div>
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto">
                <Input
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 bg-background/50 border-border/50 rounded-xl flex-1"
                />
                <Button type="submit" className="h-12 font-black px-6 rounded-xl gap-2" disabled={loading}>
                  {loading ? "Enviando..." : <>Receber PDF <ArrowRight className="w-4 h-4" /></>}
                </Button>
              </form>
              <p className="text-[10px] text-muted-foreground">Sem spam. Cancelamento com 1 clique.</p>
            </>
          ) : (
            <div className="space-y-4 py-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="text-2xl font-black font-syne tracking-tighter text-emerald-400">Pronto! Verifique seu e-mail.</h3>
              <p className="text-sm text-muted-foreground">O PDF completo está a caminho de <strong className="text-foreground">{email}</strong>. Enquanto isso, que tal testar o LTV Boost grátis?</p>
              <Link to="/signup">
                <Button className="font-black gap-2">
                  Começar Grátis <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
