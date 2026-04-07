import { Link } from "react-router-dom";
import { ArrowLeft, Zap, FlaskConical, CalendarClock, Loader2, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLoja, useLatestDiagnostico, DiagnosticoJSON, Recomendacao } from "@/hooks/useConvertIQ";

// ─── Tipo helpers ─────────────────────────────────────────────────────────────
const tipoConfig = {
  quick_win:    { label: "Quick Win",   icon: Zap,            badge: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  ab_test:      { label: "A/B Test",    icon: FlaskConical,   badge: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
  medio_prazo:  { label: "Médio Prazo", icon: CalendarClock,  badge: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
} as const;

const esforcoColors = {
  baixo: "bg-emerald-500/15 text-emerald-500",
  medio: "bg-amber-500/15 text-amber-500",
  alto:  "bg-red-500/15 text-red-500",
} as const;

const numberColors = ["text-primary", "text-blue-500", "text-violet-500"];

// ─── Priority matrix (simple 2×2) ─────────────────────────────────────────────
function PriorityMatrix({ recs }: { recs: Recomendacao[] }) {
  const esforcoNum = { baixo: 1, medio: 2, alto: 3 } as const;
  const maxImpacto = Math.max(...recs.map(r => r.impacto_pp), 1);

  return (
    <div className="bg-card border rounded-2xl p-5">
      <h3 className="font-semibold mb-4 text-sm">Matriz Esforço × Impacto</h3>
      <div className="relative h-48 border rounded-xl overflow-hidden bg-muted/20">
        {/* Quadrant labels */}
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 pointer-events-none">
          <div className="flex items-center justify-center border-r border-b border-border/50">
            <span className="text-[10px] text-muted-foreground/60 font-medium">Alto impacto<br/>Baixo esforço</span>
          </div>
          <div className="flex items-center justify-center border-b border-border/50">
            <span className="text-[10px] text-muted-foreground/60 font-medium">Alto impacto<br/>Alto esforço</span>
          </div>
          <div className="flex items-center justify-center border-r border-border/50">
            <span className="text-[10px] text-muted-foreground/60 font-medium">Baixo impacto<br/>Baixo esforço</span>
          </div>
          <div className="flex items-center justify-center">
            <span className="text-[10px] text-muted-foreground/60 font-medium">Baixo impacto<br/>Alto esforço</span>
          </div>
        </div>
        {/* "Faça agora" highlight */}
        <div className="absolute top-0 left-0 w-1/2 h-1/2 bg-emerald-500/5 border-r border-b border-emerald-500/20 flex items-end justify-end p-1">
          <span className="text-[9px] text-emerald-500 font-bold">Faça agora ✓</span>
        </div>
        {/* Points */}
        {recs.map((r, i) => {
          const xPct = ((esforcoNum[r.esforco] - 1) / 2) * 80 + 10;
          const yPct = (1 - r.impacto_pp / (maxImpacto * 1.2)) * 80 + 10;
          return (
            <div
              key={i}
              className={cn("absolute w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md border-2 border-background",
                i === 0 ? "bg-primary" : i === 1 ? "bg-blue-500" : "bg-violet-500"
              )}
              style={{ left: `${xPct}%`, top: `${yPct}%`, transform: "translate(-50%,-50%)" }}
              title={r.titulo}
            >
              {i + 1}
            </div>
          );
        })}
        {/* Axis labels */}
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground/50">← Esforço →</div>
        <div className="absolute left-1 top-1/2 -translate-y-1/2 -rotate-90 text-[9px] text-muted-foreground/50 origin-center">← Impacto →</div>
      </div>
    </div>
  );
}

// ─── Recommendation card ──────────────────────────────────────────────────────
function RecCard({ r, idx }: { r: Recomendacao; idx: number }) {
  const tc = tipoConfig[r.tipo] ?? tipoConfig.medio_prazo;
  const TipoIcon = tc.icon;
  const maxImpacto = 2; // approx max for bar scaling

  return (
    <div className="bg-card border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-sm font-extrabold text-white",
          idx === 0 ? "bg-primary" : idx === 1 ? "bg-blue-500" : "bg-violet-500"
        )}>
          {idx + 1}
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border", tc.badge)}>
            <TipoIcon className="w-3 h-3" /> {tc.label}
          </span>
          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full capitalize", esforcoColors[r.esforco])}>
            {r.esforco}
          </span>
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-sm leading-snug mb-2">{r.titulo}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{r.descricao}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-1 border-t">
        <div>
          <p className="text-xs text-muted-foreground">Impacto estimado</p>
          <p className={cn("font-mono font-bold text-sm mt-0.5", numberColors[idx])}>+{r.impacto_pp}pp conversão</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Prazo sugerido</p>
          <p className="font-mono font-bold text-sm mt-0.5">{r.prazo_semanas} {r.prazo_semanas === 1 ? "semana" : "semanas"}</p>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>Potencial de recuperação</span>
          <span>{Math.min(100, Math.round((r.impacto_pp / maxImpacto) * 100))}%</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", idx === 0 ? "bg-primary" : idx === 1 ? "bg-blue-500" : "bg-violet-500")}
            style={{ width: `${Math.min(100, Math.round((r.impacto_pp / maxImpacto) * 100))}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ConvertIQPlano() {
  const loja     = useLoja();
  const lastDiag = useLatestDiagnostico(loja.data?.id ?? null);

  if (loja.isLoading || lastDiag.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const diagJson   = lastDiag.data?.recomendacoes as unknown as DiagnosticoJSON | null;
  const recs       = diagJson?.recomendacoes ?? [];
  const totalImpacto = recs.reduce((s, r) => s + r.impacto_pp, 0);
  const ticket     = Number((loja.data as any)?.ticket_medio ?? 250);
  const visitantes = (lastDiag.data?.dados_funil as Record<string, number> | null)?.visitantes ?? 12400;
  const ganhoPotencial = Math.round((totalImpacto / 100) * visitantes * ticket);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link to="/dashboard/funil/diagnostico" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="w-4 h-4" /> Voltar ao diagnóstico
        </Link>
        <h1 className="text-2xl font-bold">Plano de Ação</h1>
        <p className="text-sm text-muted-foreground mt-1">{recs.length} ações priorizadas por impacto vs. esforço</p>
      </div>

      {/* Potential gain banner */}
      {recs.length > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5">
          <p className="text-sm text-muted-foreground">Potencial de ganho total</p>
          <p className="text-3xl font-extrabold font-mono text-primary mt-1">+{totalImpacto.toFixed(2)}pp de conversão</p>
          <p className="text-sm text-muted-foreground mt-1">
            = <strong className="text-foreground">R$ {ganhoPotencial.toLocaleString("pt-BR")}</strong> adicionais por mês
          </p>
        </div>
      )}

      {recs.length === 0 ? (
        <div className="bg-card border rounded-2xl p-10 text-center">
          <p className="text-muted-foreground">Nenhuma recomendação disponível. Gere um diagnóstico primeiro.</p>
          <Button asChild className="mt-4"><Link to="/dashboard/funil">Gerar diagnóstico</Link></Button>
        </div>
      ) : (
        <>
          {/* Priority matrix */}
          <PriorityMatrix recs={recs} />

          {/* Recommendation cards */}
          <div className="space-y-3">
            <h2 className="font-semibold">Recomendações</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {recs.map((r, i) => <RecCard key={i} r={r} idx={i} />)}
            </div>
          </div>
        </>
      )}

      {/* Cross-sell CTA */}
      <div className="bg-card border rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Megaphone className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold mb-1">Quer implementar essas melhorias mais rápido?</h3>
            <p className="text-sm text-muted-foreground mb-3">
              O LTV Boost pode automatizar a recuperação de clientes enquanto você trabalha nas otimizações de conversão.
            </p>
            <Button asChild size="sm" className="gap-2">
              <Link to="/dashboard/campanhas">
                <Megaphone className="w-4 h-4" /> Ver campanhas de reativação
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
