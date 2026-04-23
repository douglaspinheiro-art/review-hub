import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type SimulatorRecommendation = {
  titulo: string;
  descricao: string;
  esforco: string;
  impacto_pp: number;
  prazo_semanas: number;
  tipo: string;
};

interface Props {
  recomendacoes: SimulatorRecommendation[];
  /** Visitantes mensais usados para projetar receita extra. */
  visitantes: number;
  /** Ticket médio usado para projetar receita extra. */
  ticketMedio: number;
  /** CVR atual (%) — base para somar +Δpp das ações selecionadas. */
  cvrAtualPct: number;
}

/**
 * 3.2 — Simulador interativo de recomendações.
 * O lojista marca quais ações pretende aplicar e vê em tempo real:
 *  - ganho projetado de CVR (em pp)
 *  - receita extra mensal e em 90 dias
 *  - prazo combinado (mais demorado entre as selecionadas)
 */
export function RecommendationsSimulator({
  recomendacoes,
  visitantes,
  ticketMedio,
  cvrAtualPct,
}: Props) {
  // Por padrão, marca quick wins (mais fáceis de aplicar).
  const [selected, setSelected] = useState<Set<number>>(() => {
    const initial = new Set<number>();
    recomendacoes.forEach((r, i) => {
      if (r.tipo === "quick_win") initial.add(i);
    });
    return initial;
  });

  const toggle = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const sim = useMemo(() => {
    let liftPp = 0;
    let prazoMaxSemanas = 0;
    selected.forEach((idx) => {
      const r = recomendacoes[idx];
      if (!r) return;
      liftPp += Number(r.impacto_pp) || 0;
      prazoMaxSemanas = Math.max(prazoMaxSemanas, Number(r.prazo_semanas) || 0);
    });
    const cvrProjetada = Math.max(0, cvrAtualPct + liftPp);
    const pedidosAtuais = (cvrAtualPct / 100) * visitantes;
    const pedidosProjetados = (cvrProjetada / 100) * visitantes;
    const receitaExtraMes = Math.max(
      0,
      Math.round((pedidosProjetados - pedidosAtuais) * ticketMedio),
    );
    const receita90d = receitaExtraMes * 3;
    return { liftPp, cvrProjetada, receitaExtraMes, receita90d, prazoMaxSemanas };
  }, [selected, recomendacoes, cvrAtualPct, visitantes, ticketMedio]);

  if (!recomendacoes.length) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold font-syne uppercase tracking-tighter flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-emerald-500" /> Plano de ação · simule seu ganho
        </h2>
        <p className="text-[11px] text-muted-foreground">
          Marque o que pretende aplicar — a projeção atualiza em tempo real.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Lista de ações */}
        <div className="space-y-4">
          {recomendacoes.map((r, i) => {
            const checked = selected.has(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => toggle(i)}
                className={cn(
                  "w-full text-left border rounded-2xl p-5 md:p-6 transition-all",
                  checked
                    ? "border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/30"
                    : "border-[#1E1E2E] bg-[#13131A] hover:border-[#2E2E3E]",
                )}
              >
                <div className="flex items-start gap-4">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(i)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                  />
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center text-xs font-black",
                        r.tipo === "quick_win" ? "bg-emerald-500/20 text-emerald-500" :
                        r.tipo === "ab_test" ? "bg-blue-500/20 text-blue-500" :
                        "bg-amber-500/20 text-amber-500",
                      )}>
                        #{i + 1}
                      </div>
                      <Badge className={cn("text-[9px] font-black uppercase border-none",
                        r.tipo === "quick_win" ? "bg-emerald-500/20 text-emerald-500" :
                        r.tipo === "ab_test" ? "bg-blue-500/20 text-blue-500" :
                        "bg-amber-500/20 text-amber-500",
                      )}>
                        {r.tipo === "quick_win" ? "⚡ Quick Win" : r.tipo === "ab_test" ? "🧪 Teste A/B" : "📅 Médio Prazo"}
                      </Badge>
                      <Badge variant="outline" className="text-[9px]">
                        {r.esforco === "baixo" ? "Esforço baixo" : r.esforco === "medio" ? "Esforço médio" : "Esforço alto"}
                      </Badge>
                    </div>
                    <h3 className="text-base font-bold">{r.titulo}</h3>
                    <p className="text-sm text-muted-foreground">{r.descricao}</p>
                    <div className="flex gap-6 text-xs pt-1">
                      <span className="text-emerald-500 font-bold">+{r.impacto_pp}pp de conversão</span>
                      <span className="text-muted-foreground">{r.prazo_semanas} semana{r.prazo_semanas > 1 ? "s" : ""}</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Painel lateral de projeção (sticky) */}
        <aside className="lg:sticky lg:top-24 h-fit">
          <div className="border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent rounded-2xl p-6 space-y-5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-500" />
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500/80">
                Sua projeção
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Receita extra em 90 dias
              </p>
              <p className="text-3xl md:text-4xl font-black font-jetbrains text-emerald-500 tracking-tighter leading-none">
                R$ {sim.receita90d.toLocaleString("pt-BR")}
              </p>
              <p className="text-[11px] text-muted-foreground">
                R$ {sim.receitaExtraMes.toLocaleString("pt-BR")}/mês adicionais
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-emerald-500/15">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                  CVR atual
                </p>
                <p className="text-base font-black font-jetbrains">{cvrAtualPct.toFixed(2)}%</p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-500/80 mb-1">
                  CVR projetada
                </p>
                <p className="text-base font-black font-jetbrains text-emerald-500">
                  {sim.cvrProjetada.toFixed(2)}%
                </p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                  Ganho total
                </p>
                <p className="text-base font-black font-jetbrains">+{sim.liftPp.toFixed(2)}pp</p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                  Prazo
                </p>
                <p className="text-base font-black font-jetbrains">
                  {sim.prazoMaxSemanas > 0 ? `${sim.prazoMaxSemanas}sem` : "—"}
                </p>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground italic leading-relaxed pt-3 border-t border-emerald-500/15">
              Estimativa = Δpp × visitantes × ticket médio. Resultado real depende da execução de cada ação.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}