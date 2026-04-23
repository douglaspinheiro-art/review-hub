import { useMemo } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Loader2,
  Plug,
  RefreshCw,
  Shield,
  Webhook,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useTeamAccess } from "@/hooks/useTeamAccess";
import {
  operationalHealthQueryKey,
  useOperationalHealth,
} from "@/hooks/useOperationalHealth";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";
import { DataSourceBadge } from "@/components/dashboard/trust/DataSourceBadge";

type FunilDiarioRow = Database["public"]["Tables"]["funil_diario"]["Row"];
type DataQualityRow = Database["public"]["Tables"]["data_quality_snapshots"]["Row"];

const GA4_DIFF_WARN_PCT = 25;
const DUPLICATE_WARN_PCT = 10;
const PHONE_LOW_WARN_PCT = 40;
const FUNIL_STALE_MS = 72 * 60 * 60 * 1000;

function formatRelativePt(iso: string | null | undefined): string {
  if (!iso) return "sem registo";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "sem registo";
  const diffMs = Date.now() - t;
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60000);
  if (mins < 2) return "há instantes";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return `há ${days} dias`;
}

function funilFreshnessMs(funil: FunilDiarioRow | null): number | null {
  if (!funil?.ingested_at) return null;
  const t = new Date(funil.ingested_at).getTime();
  return Number.isNaN(t) ? null : Date.now() - t;
}

function computeIntegrityScore(q: DataQualityRow | null): number | null {
  if (!q) return null;
  const meta = q.metadata as Record<string, unknown> | null;
  if (meta?.note === "no_orders_7d") return null;

  const parts: number[] = [];
  if (q.phone_fill_rate != null) parts.push(Math.min(100, Number(q.phone_fill_rate)));
  if (q.utm_fill_rate != null) parts.push(Math.min(100, Number(q.utm_fill_rate)));

  let base: number | null = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
  if (base == null && q.duplicate_order_rate == null && q.ga4_purchase_vs_orders_diff_pct == null) {
    return null;
  }
  if (base == null) base = 85;

  if (q.duplicate_order_rate != null) {
    base -= Math.min(30, Number(q.duplicate_order_rate) * 1.5);
  }
  if (q.ga4_purchase_vs_orders_diff_pct != null) {
    base -= Math.min(40, Math.abs(Number(q.ga4_purchase_vs_orders_diff_pct)) * 0.8);
  }
  return Math.round(Math.max(0, Math.min(100, base)));
}

type CheckStatus = "ok" | "warn";

type ChecklistItem = {
  id: string;
  label: string;
  detail: string;
  status: CheckStatus;
};

function buildChecklist(args: {
  funil: FunilDiarioRow | null;
  quality: DataQualityRow | null;
  webhookFailures: number;
  webhookStale: number;
}): ChecklistItem[] {
  const { funil, quality, webhookFailures, webhookStale } = args;
  const items: ChecklistItem[] = [];

  const freshMs = funilFreshnessMs(funil);
  const funilStale = freshMs != null && freshMs > FUNIL_STALE_MS;
  const hasFunil = !!funil?.ingested_at;
  items.push({
    id: "funil",
    label: "Sincronização do funil (GA4)",
    detail: hasFunil
      ? `Última ingestão ${formatRelativePt(funil!.ingested_at)} · período ${funil?.periodo ?? "—"} · fonte ${funil?.fonte ?? "—"}.`
      : "Ainda não há linhas em funil_diario. Confirme GA4 na loja e o job sync-funil-ga4 (cron).",
    status: hasFunil && !funilStale ? "ok" : "warn",
  });

  const meta = quality?.metadata as Record<string, unknown> | null;
  const noOrders = meta?.note === "no_orders_7d";
  items.push({
    id: "quality",
    label: "Snapshot de qualidade de dados",
    detail: noOrders
      ? "Sem pedidos nos últimos 7 dias — métricas de preenchimento não aplicáveis."
      : quality
        ? `Snapshot ${quality.snapshot_date}. Telefone ${quality.phone_fill_rate ?? "—"}% · UTM ${quality.utm_fill_rate ?? "—"}% · duplicados (logs) ${quality.duplicate_order_rate ?? "—"}%.`
        : "Sem snapshot em data_quality_snapshots. Aguarde o job data-pipeline-cron ou verifique a loja.",
    status: quality && !noOrders ? "ok" : "warn",
  });

  const ga4Diff = quality?.ga4_purchase_vs_orders_diff_pct;
  const ga4Warn =
    ga4Diff != null && Math.abs(Number(ga4Diff)) >= GA4_DIFF_WARN_PCT;
  items.push({
    id: "ga4_orders",
    label: "Alinhamento GA4 vs pedidos",
    detail:
      ga4Diff == null
        ? "Sem divergência calculada (funil GA4 ou pedidos insuficientes)."
        : `Diferença estimada ${Number(ga4Diff).toFixed(1)}% entre compras GA4 e pedidos na loja.`,
    status: ga4Warn ? "warn" : "ok",
  });

  items.push({
    id: "webhooks",
    label: "Webhooks de e-commerce",
    detail:
      webhookFailures === 0 && webhookStale === 0
        ? "Nenhuma falha evidente nem filas antigas nas últimas 48 h (amostra consultada)."
        : `${webhookFailures} falha(s) com erro e ${webhookStale} evento(s) possivelmente pendentes há mais de 2 h.`,
    status: webhookFailures > 0 || webhookStale > 0 ? "warn" : "ok",
  });

  const dup = quality?.duplicate_order_rate;
  const phone = quality?.phone_fill_rate;
  const dupWarn = dup != null && Number(dup) >= DUPLICATE_WARN_PCT;
  const phoneWarn = phone != null && Number(phone) < PHONE_LOW_WARN_PCT;
  items.push({
    id: "hygiene",
    label: "Higiene de pedidos e contactos",
    detail:
      dupWarn || phoneWarn
        ? [
            dupWarn ? `Taxa de duplicados nos logs elevada (${Number(dup).toFixed(1)}%).` : null,
            phoneWarn ? `Telefone preenchido abaixo de ${PHONE_LOW_WARN_PCT}% (${Number(phone).toFixed(1)}%).` : null,
          ]
            .filter(Boolean)
            .join(" ")
        : "Duplicados e preenchimento de telefone dentro do esperado (ou sem dados).",
    status: dupWarn || phoneWarn ? "warn" : "ok",
  });

  return items;
}

function StatusBadge({ status }: { status: CheckStatus }) {
  if (status === "ok") {
    return (
      <Badge className="bg-emerald-500/10 text-emerald-500 border-0 gap-1 shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5" /> OK
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-500/10 text-amber-500 border-0 gap-1 shrink-0">
      <AlertTriangle className="w-3.5 h-3.5" /> Atenção
    </Badge>
  );
}

export default function Operacoes() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const teamAccess = useTeamAccess();
  const health = useOperationalHealth();

  const isCollaborator = teamAccess.data?.mode === "collaborator";

  const checklist = useMemo(() => {
    if (!health.data) return [];
    return buildChecklist({
      funil: health.data.latestFunil,
      quality: health.data.latestQuality,
      webhookFailures: health.data.webhookFailures48h,
      webhookStale: health.data.webhookPendingStale48h,
    });
  }, [health.data]);

  const alertCount = useMemo(() => checklist.filter((c) => c.status === "warn").length, [checklist]);

  const integrityScore = useMemo(
    () => computeIntegrityScore(health.data?.latestQuality ?? null),
    [health.data?.latestQuality],
  );

  const funilSummary = useMemo(() => {
    const f = health.data?.latestFunil;
    if (!f?.ingested_at) return "Sem dados";
    return formatRelativePt(f.ingested_at);
  }, [health.data?.latestFunil]);

  if (teamAccess.isFetched && isCollaborator) {
    return <Navigate to="/dashboard" replace />;
  }

  const onRefresh = async () => {
    if (!user?.id) return;
    try {
      await queryClient.invalidateQueries({ queryKey: operationalHealthQueryKey(user.id) });
      toast({ title: "Estado atualizado", description: "Dados operacionais recarregados." });
    } catch {
      toast({ title: "Erro ao atualizar", description: "Tente novamente dentro de instantes.", variant: "destructive" });
    }
  };

  const loading = teamAccess.isLoading || health.isLoading;
  const error = health.isError;
  const noStore = health.isSuccess && !health.data?.storeId;
  const noPipelineData =
    health.isSuccess &&
    health.data?.storeId &&
    !health.data.latestFunil &&
    !health.data.latestQuality;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">Operações</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Saúde técnica da tua loja: funil GA4, qualidade de dados e webhooks.
          </p>
          <div className="mt-2">
            <DataSourceBadge
              source="derived"
              origin="useOperationalHealth + checklist derivado"
              note="Score de integridade composto: freshness do funil (peso 40%), qualidade de dados (35%) e saúde de webhooks (25%). Métrica interna — não é padrão de mercado."
            />
          </div>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={onRefresh}
          disabled={loading || health.isFetching}
        >
          {health.isFetching ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Atualizar estado
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm">Não foi possível carregar o estado operacional.</p>
          <Button variant="secondary" size="sm" onClick={() => health.refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}

      {loading && !error && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-xl border bg-card p-4 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-24" />
              </div>
            ))}
          </div>
          <div className="rounded-2xl border bg-card p-5 space-y-3">
            <Skeleton className="h-5 w-48" />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 py-2 border-b border-border/60 last:border-0">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-56" />
                  <Skeleton className="h-3 w-full max-w-xl" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full shrink-0" />
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase">
              <BarChart3 className="w-4 h-4" /> Funil GA4
            </div>
            <p className="text-2xl font-black mt-2 capitalize">{funilSummary}</p>
            <p className="text-xs text-muted-foreground mt-1">Última ingestão em funil_diario</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase">
              <Shield className="w-4 h-4" /> Qualidade (estim.)
            </div>
            <p className="text-2xl font-black mt-2">
              {integrityScore != null ? `${integrityScore}%` : "N/D"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Com base no último snapshot</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase">
              <AlertTriangle className="w-4 h-4" /> Itens em atenção
            </div>
            <p className="text-2xl font-black mt-2">{alertCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Linhas do checklist com estado Atenção</p>
          </div>
        </div>
      )}

      {!loading && !error && (noStore || noPipelineData) && (
        <div className="rounded-xl border bg-muted/30 p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            {noStore
              ? "Não foi encontrada uma loja associada à conta. Conclua o onboarding ou associe uma loja."
              : "Ainda não há dados de pipeline (funil ou qualidade). Configure GA4 e os jobs agendados no Supabase, ou aguarde a primeira execução."}
          </p>
          <Button asChild variant="default" size="sm">
            <Link to="/dashboard/integracoes" className="gap-2 inline-flex items-center">
              <Plug className="w-4 h-4" /> Abrir integrações
            </Link>
          </Button>
        </div>
      )}

      {!loading && !error && health.data?.storeId && (
        <div className="rounded-2xl border bg-card">
          <div className="px-5 py-4 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h2 className="font-bold">Checklist operacional</h2>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Webhook className="w-3.5 h-3.5" />
              Webhooks: últimas 48 h (amostra até 400 eventos)
            </span>
          </div>
          <div className="divide-y">
            {checklist.map((item) => (
              <div
                key={item.id}
                className="px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="font-semibold">{item.label}</p>
                  <p className="text-sm text-muted-foreground break-words">{item.detail}</p>
                </div>
                <StatusBadge status={item.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
