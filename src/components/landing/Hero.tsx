import { Button } from "@/components/ui/button";
import { ArrowRight, Star, Bell, TrendingUp, ShoppingCart, CheckCircle2 } from "lucide-react";

export default function Hero() {
  return (
    <section className="pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden relative">
      {/* Background glow */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />

      <div className="container mx-auto px-4 relative">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-sm font-semibold px-4 py-2 rounded-full border border-primary/20">
              <div className="flex items-center gap-1">
                {[1,2,3,4,5].map(s => <Star key={s} className="w-3 h-3 fill-primary" />)}
              </div>
              Avaliado 4.9/5 por 200+ lojistas
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-extrabold leading-[1.05] tracking-tight">
              Transforme cada conversa em{" "}
              <span className="text-gradient">receita previsível</span>
            </h1>

            <p className="text-lg text-muted-foreground max-w-lg leading-relaxed">
              A plataforma de marketing conversacional que já gerou{" "}
              <span className="text-foreground font-semibold">R$47M em vendas</span>{" "}
              para mais de 200 e-commerces brasileiros.
            </p>

            <div className="flex flex-wrap gap-4 items-center">
              <Button asChild size="lg" className="h-14 px-8 text-base font-bold bg-primary hover:bg-primary/90 rounded-xl shadow-xl shadow-primary/25 hover:shadow-primary/40 hover:scale-[1.02] transition-all">
                <a href="/signup">
                  Agendar Demo Gratuita <ArrowRight className="ml-2 w-5 h-5" />
                </a>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-14 px-8 text-base rounded-xl border-border/50 hover:bg-secondary">
                <a href="#cases">Ver Cases de Sucesso</a>
              </Button>
            </div>

            {/* Social proof avatars */}
            <div className="flex items-center gap-4 pt-2">
              <div className="flex -space-x-3">
                {[
                  { initials: "CM", bg: "from-violet-500 to-purple-600" },
                  { initials: "RO", bg: "from-blue-500 to-cyan-500" },
                  { initials: "JS", bg: "from-rose-500 to-pink-500" },
                  { initials: "AL", bg: "from-amber-500 to-orange-500" },
                  { initials: "MF", bg: "from-primary to-emerald-400" },
                ].map((a, i) => (
                  <div key={i} className={`w-10 h-10 rounded-full border-2 border-background bg-gradient-to-br ${a.bg} flex items-center justify-center text-[11px] font-bold text-primary-foreground`}>
                    {a.initials}
                  </div>
                ))}
              </div>
              <div>
                <p className="text-sm font-semibold">+200 e-commerces</p>
                <p className="text-xs text-muted-foreground">já confiam na plataforma</p>
              </div>
            </div>
          </div>

          {/* Dashboard mockup */}
          <div className="relative">
            <div className="absolute -inset-8 bg-primary/10 blur-[80px] rounded-full opacity-40" />
            
            {/* Main dashboard card */}
            <div className="relative bg-card border border-border/50 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Receita influenciada</p>
                  <p className="text-2xl font-display font-bold text-primary">R$ 847.320</p>
                </div>
                <div className="flex items-center gap-1.5 text-primary text-sm font-semibold bg-primary/10 px-3 py-1 rounded-full">
                  <TrendingUp className="w-3.5 h-3.5" />
                  +34.2%
                </div>
              </div>
              
              {/* Mini chart bars */}
              <div className="flex items-end gap-1.5 h-24 mb-4">
                {[35, 48, 42, 65, 58, 78, 72, 88, 82, 95, 90, 100].map((h, i) => (
                  <div key={i} className="flex-1 bg-gradient-to-t from-primary/60 to-primary rounded-t-sm" style={{ height: `${h}%` }} />
                ))}
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Conversão", value: "4.8%", change: "+1.2%" },
                  { label: "Ticket Médio", value: "R$312", change: "+8%" },
                  { label: "Recompra", value: "67%", change: "+23%" },
                ].map(m => (
                  <div key={m.label} className="bg-secondary/50 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{m.label}</p>
                    <p className="text-sm font-bold mt-0.5">{m.value}</p>
                    <p className="text-[10px] text-primary font-semibold">{m.change}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Floating notification cards */}
            <div className="absolute -top-4 -right-4 bg-card border border-border/50 rounded-xl px-4 py-3 shadow-xl animate-float">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold">Nova venda</p>
                  <p className="text-sm font-bold text-primary">+ R$ 489</p>
                </div>
              </div>
            </div>

            <div className="absolute -bottom-3 -left-4 bg-card border border-border/50 rounded-xl px-4 py-3 shadow-xl animate-float-delayed">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold">Carrinho recuperado</p>
                  <p className="text-[11px] text-muted-foreground">Automação WhatsApp</p>
                </div>
              </div>
            </div>

            <div className="absolute top-1/2 -right-6 bg-card border border-border/50 rounded-xl px-4 py-3 shadow-xl animate-float-slow">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
                  <Bell className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold">+ R$12.4K hoje</p>
                  <p className="text-[11px] text-muted-foreground">Meta: 89%</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
