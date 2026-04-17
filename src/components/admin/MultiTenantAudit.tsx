import { useQuery } from "@tanstack/react-query";
import { Loader2, Shield, AlertTriangle, CheckCircle2, Database } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";

type AuditRow = {
  id: string;
  store_id: string | null;
  user_id: string | null;
  type: string | null;
  is_active: boolean | null;
  audit_status: string;
  detail: string | null;
};

type ErrorBucket = {
  route: string | null;
  message: string;
  occurrences: number;
  last_seen: string;
};

function StatusBadge({ status }: { status: string }) {
  if (status === "ok") {
    return <Badge className="bg-emerald-500/10 text-emerald-500 text-[9px]">OK</Badge>;
  }
  if (status === "missing_store_id") {
    return <Badge className="bg-red-500/10 text-red-500 text-[9px]">SEM STORE</Badge>;
  }
  if (status === "missing_webhook_credential") {
    return <Badge className="bg-amber-500/10 text-amber-500 text-[9px]">SEM CREDENCIAL</Badge>;
  }
  return <Badge variant="outline" className="text-[9px]">{status}</Badge>;
}

export function MultiTenantAudit() {
  const integrationsQuery = useQuery({
    queryKey: ["admin-integrations-audit"],
    queryFn: async () => {
      // RPC restrita a admin via has_role; cliente assina como o admin logado.
      const { data, error } = await supabase.rpc("list_integrations_audit" as never);
      if (error) throw error;
      return ((data ?? []) as AuditRow[]).filter((r) => r.audit_status !== "ok");
    },
    staleTime: 30_000,
  });

  const channelsQuery = useQuery({
    queryKey: ["admin-channels-audit"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_channels_audit" as never);
      if (error) throw error;
      return ((data ?? []) as AuditRow[]).filter((r) => r.audit_status !== "ok");
    },
    staleTime: 30_000,
  });

  const rlsErrorsQuery = useQuery({
    queryKey: ["admin-rls-denials"],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("client_error_events")
        .select("route, message, created_at")
        .gte("created_at", since)
        .or("message.ilike.%row-level security%,message.ilike.%RLS%,message.ilike.%permission denied%")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;

      const buckets = new Map<string, ErrorBucket>();
      for (const row of data ?? []) {
        const key = `${row.route ?? "?"}|${row.message.slice(0, 120)}`;
        const existing = buckets.get(key);
        if (existing) {
          existing.occurrences += 1;
          if (row.created_at > existing.last_seen) existing.last_seen = row.created_at;
        } else {
          buckets.set(key, {
            route: row.route,
            message: row.message.slice(0, 120),
            occurrences: 1,
            last_seen: row.created_at,
          });
        }
      }
      return Array.from(buckets.values()).sort((a, b) => b.occurrences - a.occurrences);
    },
    staleTime: 30_000,
  });

  const allClean =
    integrationsQuery.data?.length === 0 &&
    channelsQuery.data?.length === 0 &&
    rlsErrorsQuery.data?.length === 0;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard
          label="Integrations com problema"
          count={integrationsQuery.data?.length ?? 0}
          loading={integrationsQuery.isLoading}
          icon={Database}
        />
        <SummaryCard
          label="Channels com problema"
          count={channelsQuery.data?.length ?? 0}
          loading={channelsQuery.isLoading}
          icon={Database}
        />
        <SummaryCard
          label="RLS denials (24h)"
          count={rlsErrorsQuery.data?.reduce((s, b) => s + b.occurrences, 0) ?? 0}
          loading={rlsErrorsQuery.isLoading}
          icon={Shield}
        />
      </div>

      {allClean && !integrationsQuery.isLoading && !channelsQuery.isLoading && !rlsErrorsQuery.isLoading && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="pt-6 pb-6 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            <div>
              <p className="font-bold">Sistema multi-tenant limpo</p>
              <p className="text-xs text-muted-foreground">
                Sem integrações órfãs, sem channels órfãos, sem RLS denials nas últimas 24h.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Integrations audit */}
      <AuditTable
        title="Integrations — registros com problema"
        description="Origem: list_integrations_audit() (apenas admin)."
        rows={integrationsQuery.data ?? []}
        loading={integrationsQuery.isLoading}
        error={integrationsQuery.error as Error | null}
      />

      {/* Channels audit */}
      <AuditTable
        title="Channels — registros com problema"
        description="Origem: list_channels_audit() (apenas admin)."
        rows={channelsQuery.data ?? []}
        loading={channelsQuery.isLoading}
        error={channelsQuery.error as Error | null}
      />

      {/* RLS denials */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-500" /> RLS denials por rota (últimas 24h)
          </CardTitle>
          <CardDescription>
            Agrupado por (rota, mensagem). Picos repentinos costumam indicar hook consultando tabela tenant-scoped sem store_id.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rlsErrorsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
            </div>
          ) : (rlsErrorsQuery.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nenhum RLS denial nas últimas 24h.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-left">
                    <th className="py-2 pr-4 font-medium">Rota</th>
                    <th className="py-2 pr-4 font-medium">Mensagem</th>
                    <th className="py-2 pr-4 font-medium text-right">Ocorrências</th>
                    <th className="py-2 font-medium">Última</th>
                  </tr>
                </thead>
                <tbody>
                  {rlsErrorsQuery.data?.map((b, i) => (
                    <tr key={i} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="py-2.5 pr-4 font-mono text-xs">{b.route ?? "—"}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs truncate max-w-md" title={b.message}>{b.message}</td>
                      <td className="py-2.5 pr-4 text-right font-bold">{b.occurrences}</td>
                      <td className="py-2.5 text-muted-foreground text-xs">
                        {new Date(b.last_seen).toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  count,
  loading,
  icon: Icon,
}: {
  label: string;
  count: number;
  loading: boolean;
  icon: typeof Database;
}) {
  return (
    <Card className="border-border/50">
      <CardContent className="pt-4 pb-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${count > 0 ? "bg-red-500/10" : "bg-emerald-500/10"}`}>
          <Icon className={`w-5 h-5 ${count > 0 ? "text-red-500" : "text-emerald-500"}`} />
        </div>
        <div>
          <p className="text-2xl font-black">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : count}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function AuditTable({
  title,
  description,
  rows,
  loading,
  error,
}: {
  title: string;
  description: string;
  rows: AuditRow[];
  loading: boolean;
  error: Error | null;
}) {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" /> {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
          </div>
        ) : error ? (
          <p className="text-sm text-red-500 py-4">Erro: {error.message}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Nenhum registro com problema.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-left">
                  <th className="py-2 pr-4 font-medium">ID</th>
                  <th className="py-2 pr-4 font-medium">Tipo</th>
                  <th className="py-2 pr-4 font-medium">Store</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium">Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/30 hover:bg-muted/20">
                    <td className="py-2.5 pr-4 font-mono text-[10px]">{r.id.slice(0, 8)}</td>
                    <td className="py-2.5 pr-4">{r.type ?? "—"}</td>
                    <td className="py-2.5 pr-4 font-mono text-[10px]">{r.store_id?.slice(0, 8) ?? "—"}</td>
                    <td className="py-2.5 pr-4"><StatusBadge status={r.audit_status} /></td>
                    <td className="py-2.5 text-xs text-muted-foreground">{r.detail ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
