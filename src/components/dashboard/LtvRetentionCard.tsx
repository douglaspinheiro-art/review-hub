import { Card } from "@/components/ui/card";
import { TrendingUp, RefreshCw, Repeat } from "lucide-react";
import { useLtvSummary } from "@/hooks/useLtvSummary";
import { DataSourceBadge } from "@/components/dashboard/trust/DataSourceBadge";
import { Skeleton } from "@/components/ui/skeleton";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v || 0);

export interface LtvRetentionCardProps {
  storeId?: string;
}

export function LtvRetentionCard({ storeId }: LtvRetentionCardProps) {
  const { data, isLoading } = useLtvSummary(storeId);

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-semibold">LTV & Retenção</h3>
            <DataSourceBadge
              source="derived"
              origin="RPC get_ltv_summary_v1"
              updatedAt={data?.computed_at}
              note="Calculado a partir de orders_v3 e customers_v3."
              compact
            />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Valor real do cliente ao longo do tempo.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">LTV 12m</div>
            <div className="text-xl font-bold mt-1 font-mono">{fmtBRL(data?.avg_ltv_12m ?? 0)}</div>
            <div className="text-[10px] text-muted-foreground mt-1">por cliente</div>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <Repeat className="w-3 h-3" /> Repeat rate
            </div>
            <div className="text-xl font-bold mt-1 font-mono">
              {(data?.repeat_purchase_rate ?? 0).toFixed(1)}%
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {data?.repeat_customers ?? 0}/{data?.total_customers ?? 0} clientes
            </div>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Recompra
            </div>
            <div className="text-xl font-bold mt-1 font-mono">
              {Math.round(data?.avg_days_between_purchases ?? 0)}d
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">tempo médio</div>
          </div>
        </div>
      )}

      {!isLoading && data?.cohorts && data.cohorts.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Retenção D30 — últimas {Math.min(6, data.cohorts.length)} coortes
          </div>
          <div className="flex items-end gap-1 h-10">
            {data.cohorts.slice(0, 6).reverse().map((c) => {
              const h = Math.max(8, Math.min(100, (c.retention_d30 || 0)));
              return (
                <div key={c.cohort_month} className="flex-1 flex flex-col items-center gap-0.5">
                  <div
                    className="w-full bg-emerald-500/60 rounded-sm"
                    style={{ height: `${h}%` }}
                    title={`${c.cohort_month}: ${c.retention_d30}%`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!isLoading && (!data || data.total_customers === 0) && (
        <div className="text-xs text-muted-foreground py-3 text-center">
          Sem pedidos suficientes para calcular LTV. Conecte sua loja para começar.
        </div>
      )}
    </Card>
  );
}

export default LtvRetentionCard;