/**
 * Card "📈 Evolução semanal" — exibe deltas entre o diagnóstico atual e o anterior
 * (gerado pelo cron `weekly-diagnostic-cron`). Renderiza apenas quando há `week_over_week`
 * com `previous_created_at` populado.
 */
import { useEffect } from "react";
import { TrendingUp, TrendingDown, ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { trackFunnelEvent } from "@/lib/funnel-telemetry";
import type { WeekOverWeek } from "@/hooks/useWeeklyDiagnosticDelta";

interface WeeklyEvolutionCardProps {
  weekOverWeek: WeekOverWeek;
  previousCreatedAt: string | null;
  currentCreatedAt: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  } catch {
    return "—";
  }
}

function DeltaPill({ value, suffix, invert = false }: { value: number; suffix: string; invert?: boolean }) {
  // invert=true → diminuir é bom (ex.: perda em R$)
  const positive = invert ? value < 0 : value > 0;
  const Icon = value === 0 ? ArrowRight : positive ? TrendingUp : TrendingDown;
  const color = value === 0
    ? "text-muted-foreground"
    : positive
      ? "text-emerald-500"
      : "text-red-500";
  const sign = value > 0 ? "+" : "";
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-bold font-mono", color)}>
      <Icon className="w-3 h-3" />
      {sign}{value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{suffix}
    </span>
  );
}

export function WeeklyEvolutionCard({ weekOverWeek, previousCreatedAt, currentCreatedAt }: WeeklyEvolutionCardProps) {
  useEffect(() => {
    void trackFunnelEvent({
      event: "diagnostic_viewed",
      metadata: {
        weekly_evolution_visible: true,
        chs_delta: weekOverWeek.chs_delta ?? null,
        gargalo_changed: weekOverWeek.gargalo_changed ?? false,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chsDelta = Number(weekOverWeek.chs_delta ?? 0);
  const cvrDelta = Number(weekOverWeek.cvr_delta_pp ?? 0);
  const perdaDelta = Number(weekOverWeek.perda_delta_brl ?? 0);

  return (
    <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-3xl p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">📈</span>
          <h3 className="text-sm font-bold uppercase tracking-widest">Evolução semanal</h3>
        </div>
        <p className="text-[11px] text-muted-foreground font-mono">
          {formatDate(previousCreatedAt)} → {formatDate(currentCreatedAt)}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-background/40 border border-border/40 rounded-2xl p-4 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">CHS</p>
          <DeltaPill value={chsDelta} suffix=" pts" />
        </div>
        <div className="bg-background/40 border border-border/40 rounded-2xl p-4 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Conversão</p>
          <DeltaPill value={cvrDelta} suffix=" pp" />
        </div>
        <div className="bg-background/40 border border-border/40 rounded-2xl p-4 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Perda mensal</p>
          <DeltaPill value={perdaDelta} suffix=" R$" invert />
        </div>
      </div>

      {weekOverWeek.gargalo_changed && weekOverWeek.gargalo_anterior && weekOverWeek.gargalo_atual && (
        <div className="text-xs text-muted-foreground border-t border-border/30 pt-4">
          <span className="font-semibold text-foreground">Gargalo mudou:</span>{" "}
          <span className="line-through opacity-60">{weekOverWeek.gargalo_anterior}</span>
          {" → "}
          <span className="text-emerald-500 font-semibold">{weekOverWeek.gargalo_atual}</span>
        </div>
      )}

      {weekOverWeek.applied_recommendation && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex gap-3">
          <Sparkles className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest">Você implementou</p>
            <p className="text-sm font-semibold">{weekOverWeek.applied_recommendation}</p>
            {cvrDelta > 0 && perdaDelta < 0 && (
              <p className="text-xs text-muted-foreground">
                Resultado: +{cvrDelta.toFixed(2)}pp = R$ {Math.abs(perdaDelta).toLocaleString("pt-BR")} recuperados/mês
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}