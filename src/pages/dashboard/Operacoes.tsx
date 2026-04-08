import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const OPS_ITEMS = [
  { id: "queues", label: "Filas de processamento", status: "ok", detail: "Sem atrasos relevantes nas ultimas 2h." },
  { id: "webhooks", label: "Webhooks recebidos", status: "warn", detail: "3 eventos aguardando reprocessamento." },
  { id: "audits", label: "Auditoria de seguranca", status: "ok", detail: "Nenhuma anomalia critica detectada hoje." },
  { id: "sync", label: "Sincronizacoes pendentes", status: "warn", detail: "1 loja sem sincronizacao completa de catalogo." },
] as const;

function StatusBadge({ status }: { status: "ok" | "warn" }) {
  if (status === "ok") {
    return (
      <Badge className="bg-emerald-500/10 text-emerald-500 border-0 gap-1">
        <CheckCircle2 className="w-3.5 h-3.5" /> Operacional
      </Badge>
    );
  }

  return (
    <Badge className="bg-amber-500/10 text-amber-500 border-0 gap-1">
      <AlertTriangle className="w-3.5 h-3.5" /> Atencao
    </Badge>
  );
}

export default function Operacoes() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">Operacoes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Painel interno para acompanhamento de saude operacional.
          </p>
        </div>
        <Button variant="outline" className="gap-2">
          <RefreshCw className="w-4 h-4" /> Atualizar status
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase">
            <Clock3 className="w-4 h-4" /> SLA medio
          </div>
          <p className="text-2xl font-black mt-2">4m 12s</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase">
            <Shield className="w-4 h-4" /> Integridade
          </div>
          <p className="text-2xl font-black mt-2">99.8%</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase">
            <AlertTriangle className="w-4 h-4" /> Alertas ativos
          </div>
          <p className="text-2xl font-black mt-2">2</p>
        </div>
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="px-5 py-4 border-b">
          <h2 className="font-bold">Checklist de operacao</h2>
        </div>
        <div className="divide-y">
          {OPS_ITEMS.map((item) => (
            <div key={item.id} className="px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <p className="font-semibold">{item.label}</p>
                <p className="text-sm text-muted-foreground">{item.detail}</p>
              </div>
              <StatusBadge status={item.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
