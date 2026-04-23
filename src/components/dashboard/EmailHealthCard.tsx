import { Card } from "@/components/ui/card";
import { Mail, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useEmailHealth } from "@/hooks/useEmailHealth";
import { DataSourceBadge } from "@/components/dashboard/trust/DataSourceBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface EmailHealthCardProps {
  storeId?: string;
}

const STATUS_STYLES = {
  healthy: { color: "text-emerald-500", icon: CheckCircle2, label: "Saudável" },
  warning: { color: "text-amber-500", icon: AlertTriangle, label: "Atenção" },
  critical: { color: "text-red-500", icon: AlertTriangle, label: "Crítico" },
} as const;

export function EmailHealthCard({ storeId }: EmailHealthCardProps) {
  const { data, isLoading } = useEmailHealth(storeId);
  const status = data?.status ?? "healthy";
  const meta = STATUS_STYLES[status];
  const Icon = meta.icon;

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-sky-500" />
            <h3 className="text-sm font-semibold">Saúde de envio (E-mail)</h3>
            <DataSourceBadge
              source="real"
              origin="customers_v3 (bounce/complaint/unsubscribe)"
              updatedAt={data?.computedAt}
              compact
            />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Risco de blacklist e degradação do remetente.
          </p>
        </div>
        <div className={cn("flex items-center gap-1.5 text-xs font-medium", meta.color)}>
          <Icon className="w-4 h-4" />
          {meta.label}
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-20" />
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <Metric label="Hard bounce" value={data?.bounceRate ?? 0} count={data?.hardBounces ?? 0} threshold={5} />
          <Metric label="Complaint" value={data?.complaintRate ?? 0} count={data?.complaints ?? 0} threshold={0.3} />
          <Metric label="Opt-out" value={data?.optOutRate ?? 0} count={data?.unsubscribed ?? 0} threshold={2} />
        </div>
      )}

      {!isLoading && (data?.totalContacts ?? 0) === 0 && (
        <div className="text-xs text-muted-foreground py-2 text-center">
          Sem contatos com e-mail ainda.
        </div>
      )}
    </Card>
  );
}

function Metric({ label, value, count, threshold }: { label: string; value: number; count: number; threshold: number }) {
  const over = value > threshold;
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-bold mt-1 font-mono", over && "text-red-500")}>
        {value.toFixed(2)}%
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{count} contatos · limite {threshold}%</div>
    </div>
  );
}

export default EmailHealthCard;