import { Clock, ShieldCheck, AlertTriangle, MessageCircle } from "lucide-react";
import { useInboxSlaKpis } from "@/hooks/useInboxSlaKpis";
import { Skeleton } from "@/components/ui/skeleton";
import { DataSourceBadge } from "@/components/dashboard/trust/DataSourceBadge";

function fmt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
}

export function InboxSlaHeader() {
  const { data, isLoading } = useInboxSlaKpis();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 px-3 py-2 border-b bg-muted/20">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 rounded" />
        ))}
      </div>
    );
  }

  const k = data ?? {
    open_conversations: 0,
    total_last_7d: 0,
    within_sla_count: 0,
    breach_count: 0,
    pct_within_sla: 0,
    avg_first_response_min: 0,
  };

  const slaColor =
    k.pct_within_sla >= 90 ? "text-emerald-500" : k.pct_within_sla >= 70 ? "text-amber-500" : "text-destructive";
  const tmrColor =
    k.avg_first_response_min <= 30
      ? "text-emerald-500"
      : k.avg_first_response_min <= 120
      ? "text-amber-500"
      : "text-destructive";

  const items = [
    { label: "Abertas", value: fmt(k.open_conversations), icon: MessageCircle, color: "text-blue-500" },
    {
      label: "TMR (1ª resp.)",
      value: k.avg_first_response_min > 0 ? `${fmt(k.avg_first_response_min)} min` : "—",
      icon: Clock,
      color: tmrColor,
    },
    { label: "Dentro do SLA", value: `${k.pct_within_sla.toFixed(0)}%`, icon: ShieldCheck, color: slaColor },
    {
      label: "SLA estourado",
      value: fmt(k.breach_count),
      icon: AlertTriangle,
      color: k.breach_count > 0 ? "text-destructive" : "text-muted-foreground",
    },
  ];

  return (
    <div className="border-b bg-muted/10">
      <div className="flex items-center gap-2 px-3 pt-2">
        <DataSourceBadge source="real" origin="RPC get_inbox_sla_kpis_v1 (conversations + messages, 7d)" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 px-3 py-2">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <div key={it.label} className="rounded border bg-card px-2.5 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{it.label}</span>
                <Icon className={`w-3.5 h-3.5 ${it.color}`} />
              </div>
              <div className={`text-base font-bold tabular-nums ${it.color}`}>{it.value}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
