import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, BarChart3, Bot, MessageCircle, ArrowDown, RefreshCw, ShoppingBag, Lock } from "lucide-react";

export default function Hero() {
  return (
    <section className="pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden relative">
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />

      <div className="container mx-auto px-4 relative">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Coluna esquerda - copy */}
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-sm font-semibold px-4 py-2 rounded-full border border-primary/20">
              <Lock className="w-3.5 h-3.5" />
              <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />
              A única plataforma de Closed-Loop Revenue Recovery do Brasil
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-extrabold leading-[1.05] tracking-tight">
              Recupere a receita que sua loja já gerou —{" "}
              <span className="text-gradient">mas nunca capturou.</span>
            </h1>

             <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
               Conectamos na sua loja e no seu GA4, identificamos perda em <strong className="text-foreground">5 dimensões críticas</strong>{" "}
               e executamos as campanhas que trazem essa receita de volta — com cada real recuperado{" "}
               <strong className="text-foreground">medido e atribuído no seu próprio Analytics</strong>.
             </p>

            <div className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5">
              <Lock className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-xs font-bold text-primary">
                Único modelo do mercado: Lê → Decide → Executa → Prova no GA4
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                "Para operadores D2C R$ 80k–3M/mês",
                "Shopify · Nuvemshop · VTEX · WooCommerce · Yampi · Tray",
              ].map((proof) => (
                <span
                  key={proof}
                  className="px-3 py-1 rounded-full text-xs font-semibold bg-secondary border border-border/50"
                >
                  {proof}
                </span>
              ))}
            </div>

            <div className="space-y-2">
              <Button
                asChild
                size="lg"
                className="h-14 px-8 text-base font-bold bg-primary hover:bg-primary/90 rounded-xl shadow-xl shadow-primary/25 hover:shadow-primary/40 transition-all"
              >
                <a href="/signup">
                  Solicitar diagnóstico gratuito <ArrowRight className="ml-2 w-5 h-5" />
                </a>
              </Button>
              <p className="text-[11px] text-muted-foreground">
               • Sem cartão • Sem instalação • Diagnóstico entregue em 5 minutos
              </p>
            </div>
          </div>

          {/* Coluna direita - diagrama do loop fechado */}
          <div className="relative">
            <div className="absolute -inset-8 bg-primary/10 blur-[80px] rounded-full opacity-40" />

            <div className="relative bg-card border border-border/50 rounded-2xl p-6 md:p-8 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  Loop fechado em produção
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-primary">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  Ao vivo
                </div>
              </div>

              <div className="space-y-2.5">
                {/* Nó 0: Conecta loja */}
                <LoopNode
                  icon={ShoppingBag}
                  label="00 - Conecta sua loja"
                  title="Shopify · Nuvemshop · VTEX · WooCommerce · Yampi · Dizy"
                  meta="OAuth oficial · pedidos, contatos e catálogo sincronizados"
                />
                <LoopArrow />
                {/* Nó 1: GA4 lê */}
                <LoopNode
                  icon={BarChart3}
                  label="01 - Lê do GA4"
                  title="3.472 sessões abandonaram checkout"
                  meta="Fonte: seu GA4 · últimas 24h"
                />
                <LoopArrow />
                {/* Nó 2: IA decide */}
                <LoopNode
                  icon={Bot}
                  label="02 - IA decide"
                   title="847 contatos do segmento Em Risco priorizados"
                   meta="AI + RFM da plataforma + comportamento do GA4"
                 />
                <LoopArrow />
                {/* Nó 3: Executa */}
                <LoopNode
                  icon={MessageCircle}
                  label="03 - Executa no canal"
                  title="WhatsApp + Email disparados"
                  meta="Meta Cloud API oficial · UTM ltvboost_winback"
                />
                <LoopArrow />
                {/* Nó 4: Volta para GA4 */}
                <LoopNode
                  icon={RefreshCw}
                  label="04 - Mensura no GA4"
                  title="R$ 5.840 atribuídos no seu Analytics"
                  meta="GA4 + pedido `paid` na sua plataforma · sem dupla contagem"
                  highlight
                />
              </div>

              <div className="mt-5 bg-primary/5 border border-primary/20 rounded-xl p-3 flex items-center justify-between">
                <span className="text-[11px] font-bold text-primary uppercase tracking-wider">
                  Loop recalibra automaticamente
                </span>
                <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin-slow" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function LoopNode({
  icon: Icon,
  label,
  title,
  meta,
  highlight,
}: {
  icon: typeof BarChart3;
  label: string;
  title: string;
  meta: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border p-2.5 ${
        highlight ? "border-primary/40 bg-primary/5" : "border-border/50 bg-secondary/30"
      }`}
    >
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
          highlight ? "bg-primary/20" : "bg-primary/10"
        }`}
      >
        <Icon className="w-3.5 h-3.5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-bold tracking-[0.18em] uppercase text-muted-foreground mb-0.5">
          {label}
        </p>
        <p className="text-[13px] font-bold leading-tight">{title}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{meta}</p>
      </div>
    </div>
  );
}

function LoopArrow() {
  return (
    <div className="flex justify-center">
      <ArrowDown className="w-3.5 h-3.5 text-primary/50" />
    </div>
  );
}
