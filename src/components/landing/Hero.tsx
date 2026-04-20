import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Star, Sparkles, TrendingDown } from "lucide-react";

const REVENUE_RANGES: Record<string, number> = {
  "ate_50k": 25000,
  "50_200k": 100000,
  "200_500k": 300000,
  "500k_plus": 700000,
};

const REVENUE_LABELS: Record<string, string> = {
  "ate_50k": "Até R$ 50k/mês",
  "50_200k": "R$ 50k – 200k/mês",
  "200_500k": "R$ 200k – 500k/mês",
  "500k_plus": "Acima de R$ 500k/mês",
};

export default function Hero() {
  const [faixa, setFaixa] = useState<string>("");
  const [ticket, setTicket] = useState<string>("");

  const perda = useMemo(() => {
    if (!faixa || !ticket) return 0;
    const receita = REVENUE_RANGES[faixa] || 0;
    const ticketNum = Number(ticket) || 0;
    if (receita === 0 || ticketNum === 0) return 0;
    // Estimativa: ~12% da receita está "vazando" em CRO + retenção (média de mercado)
    return Math.round(receita * 0.12);
  }, [faixa, ticket]);

  const showResult = perda > 0;

  return (
    <section className="pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden relative">
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />

      <div className="container mx-auto px-4 relative">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-sm font-semibold px-4 py-2 rounded-full border border-primary/20">
              <div className="flex items-center gap-1">
                {[1,2,3,4,5].map(s => <Star key={s} className="w-3 h-3 fill-primary" />)}
              </div>
              Avaliado 4.9/5 por 200+ lojistas
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-extrabold leading-[1.05] tracking-tight">
              Descubra quanto sua loja perde{" "}
              <span className="text-gradient">todo dia.</span>
            </h1>

            <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
              Responda 2 perguntas e veja em segundos uma estimativa do quanto você está deixando na mesa — sem cadastro.
            </p>

            <div className="flex flex-wrap gap-2">
              {[
                "Moda: +22% recompra em 60 dias",
                "Beleza: payback médio em 9 dias",
                "Suplementos: +31% em reativação",
              ].map((proof) => (
                <span key={proof} className="px-3 py-1 rounded-full text-xs font-semibold bg-secondary border border-border/50">
                  {proof}
                </span>
              ))}
            </div>
          </div>

          {/* Mini-calculadora interativa */}
          <div className="relative">
            <div className="absolute -inset-8 bg-primary/10 blur-[80px] rounded-full opacity-40" />

            <div className="relative bg-card border border-border/50 rounded-2xl p-6 md:p-8 shadow-2xl">
              <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground mb-5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                Estimativa rápida — sem cadastro
              </div>

              <div className="space-y-5 mb-6">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground/80">
                    Qual o faturamento mensal da sua loja?
                  </label>
                  <Select value={faixa} onValueChange={setFaixa}>
                    <SelectTrigger className="h-12 bg-background/50 border-border/60">
                      <SelectValue placeholder="Selecione uma faixa" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(REVENUE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground/80">
                    Qual o ticket médio? (R$)
                  </label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="Ex: 250"
                    value={ticket}
                    onChange={(e) => setTicket(e.target.value)}
                    className="h-12 bg-background/50 border-border/60 font-mono font-bold"
                  />
                </div>
              </div>

              {showResult ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingDown className="w-4 h-4 text-destructive" />
                      <span className="text-[10px] font-black tracking-[0.2em] uppercase text-destructive">
                        Estimativa de perda mensal
                      </span>
                    </div>
                    <p className="text-4xl md:text-5xl font-display font-extrabold text-destructive leading-tight">
                      ~ R$ {perda.toLocaleString("pt-BR")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Baseado em CRO + retenção média do seu segmento. O diagnóstico completo aponta exatamente onde.
                    </p>
                  </div>

                  <Button
                    asChild
                    size="lg"
                    className="w-full h-14 text-base font-bold bg-primary hover:bg-primary/90 rounded-xl shadow-xl shadow-primary/25 hover:shadow-primary/40 transition-all"
                  >
                    <a href={`/signup?perda=${perda}&faixa=${faixa}&ticket=${ticket}`}>
                      Quero o diagnóstico completo (grátis) <ArrowRight className="ml-2 w-5 h-5" />
                    </a>
                  </Button>
                  <p className="text-[11px] text-muted-foreground text-center">
                    • Leva menos de 1 minuto • Sem cartão • Resultado imediato
                  </p>
                </div>
              ) : (
                <div className="bg-secondary/40 border border-border/40 rounded-xl p-5 text-center">
                  <p className="text-sm text-muted-foreground">
                    Preencha os 2 campos acima para ver sua estimativa.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
