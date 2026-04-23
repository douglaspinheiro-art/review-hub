import { Clock, Zap, Network, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAdvancedAttribution } from "@/hooks/useAdvancedAttribution";
import { DataSourceBadge } from "@/components/dashboard/trust/DataSourceBadge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { cn } from "@/lib/utils";

function fmtHours(h: number | null): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 24) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

function KpiTile({
  icon: Icon, label, value, sub, color,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-card border rounded-2xl p-5 space-y-3">
      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", color)}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-2xl font-black font-syne tracking-tighter">{value}</p>
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-0.5">
          {label}
        </p>
        {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  );
}

export function AdvancedAttributionTab({ periodDays }: { periodDays: number }) {
  const { data, isLoading, error } = useAdvancedAttribution(periodDays);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-16 text-sm text-muted-foreground">
        Erro ao carregar modelos avançados.
      </div>
    );
  }

  const noTtc = data.ttcSampleSize === 0;
  const noAssisted = data.assistedTotal === 0 && data.directTotal === 0;

  const bucketColors = ["#10b981", "#34d399", "#fbbf24", "#f59e0b", "#f97316", "#ef4444"];

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-200">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <h2 className="text-xl font-black font-syne tracking-tighter uppercase flex items-center gap-2">
            Modelos avançados
          </h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Gap entre evento de envio e pedido (time-to-conversion) e razão entre conversões
            assistidas e diretas — agregadas das execuções de prescrição.
          </p>
        </div>
        <DataSourceBadge
          source="real"
          origin="attribution_events + executions"
          note="TTC calculado a partir de attribution_events. Assistidas/diretas vindas da tabela executions."
        />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile
          icon={Clock}
          label="TTC mediano"
          value={fmtHours(data.ttcMedianHours)}
          sub={`Amostra: ${data.ttcSampleSize.toLocaleString("pt-BR")} pedidos`}
          color="bg-primary/10 text-primary"
        />
        <KpiTile
          icon={Clock}
          label="TTC médio"
          value={fmtHours(data.ttcAvgHours)}
          sub="Inclui caudas longas (até 30 dias)"
          color="bg-violet-500/10 text-violet-600"
        />
        <KpiTile
          icon={Zap}
          label="Conversões diretas"
          value={data.directTotal.toLocaleString("pt-BR")}
          sub="Vindas da própria mensagem"
          color="bg-emerald-500/10 text-emerald-600"
        />
        <KpiTile
          icon={Network}
          label="Assistidas"
          value={data.assistedTotal.toLocaleString("pt-BR")}
          sub={`${data.assistedRatePct}% do total`}
          color="bg-amber-500/10 text-amber-600"
        />
      </div>

      {/* TTC histogram */}
      <div className="bg-card border rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-sm uppercase tracking-widest">
            Distribuição de tempo até conversão
          </h3>
          <Badge className="text-[9px] bg-muted text-muted-foreground border-none font-black uppercase tracking-widest">
            Últimos {periodDays} dias
          </Badge>
        </div>
        {noTtc ? (
          <p className="text-xs text-muted-foreground py-12 text-center">
            Nenhum pedido atribuído com timestamp coerente neste período.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.ttcBuckets} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(v: number, _n, item) => [
                  `${v.toLocaleString("pt-BR")} (${item?.payload?.pctOfTotal ?? 0}%)`,
                  "Pedidos",
                ]}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {data.ttcBuckets.map((_, i) => (
                  <Cell key={i} fill={bucketColors[i % bucketColors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-muted/40 rounded-lg p-3">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
          <p>
            Pedidos rápidos (≤6h) indicam mensagens com forte pull comercial. Caudas longas
            (&gt;3 dias) sugerem assistência de awareness mais que conversão direta.
          </p>
        </div>
      </div>

      {/* Assisted vs direct breakdown */}
      <div className="bg-card border rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-sm uppercase tracking-widest">
            Assistidas vs diretas por prescrição
          </h3>
        </div>
        {noAssisted ? (
          <p className="text-xs text-muted-foreground py-12 text-center">
            Nenhuma execução de prescrição registrou conversões neste período.
          </p>
        ) : (
          <div className="space-y-3">
            {data.topAssistingCampaigns.map((c) => {
              const total = c.assisted + c.direct;
              const assistedPct = total > 0 ? (c.assisted / total) * 100 : 0;
              const directPct = 100 - assistedPct;
              return (
                <div key={c.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold truncate max-w-[60%]">{c.name}</span>
                    <span className="text-muted-foreground">
                      <span className="text-emerald-600 font-bold">{c.direct}</span> diretas ·{" "}
                      <span className="text-amber-600 font-bold">{c.assisted}</span> assistidas
                    </span>
                  </div>
                  <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                    <div className="bg-emerald-500" style={{ width: `${directPct}%` }} />
                    <div className="bg-amber-500" style={{ width: `${assistedPct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-muted/40 rounded-lg p-3">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
          <p>
            Conversões <span className="font-bold text-emerald-600">diretas</span> são atribuídas
            ao último toque. <span className="font-bold text-amber-600">Assistidas</span> são
            execuções que tocaram o cliente mas não foram o último toque antes do pedido.
          </p>
        </div>
      </div>
    </div>
  );
}