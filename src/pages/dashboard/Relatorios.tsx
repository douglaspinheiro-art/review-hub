import { useMemo, useState, memo, useEffect, useRef } from "react";
import {
  BarChart3,
  PieChart,
  TrendingUp,
  Download,
  ArrowUpRight,
  Users,
  ShoppingBag,
  MousePointer2,
  Share2,
  MessageCircle,
  Copy,
  Check,
  Sparkles,
  Send,
  Eye,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Cell,
} from "recharts";

// M1: Memoized chart wrappers — prevent re-renders on unrelated state changes (period toggle, copy state, etc.)
const MemoScatterChart = memo(ScatterChart);
import { MetricCard } from "@/components/dashboard/MetricCard";
import { buildRetentionGraph } from "@/lib/retention-graph";
import { getPropensityOutput } from "@/lib/propensity-score";
import { useDashboardSnapshot } from "@/hooks/useDashboard";
import { useLoja } from "@/hooks/useConvertIQ";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DataSourceBadge } from "@/components/dashboard/trust/DataSourceBadge";
import { FreshnessIndicator } from "@/components/dashboard/trust/FreshnessIndicator";
import { MetricGlossary, COMMON_GLOSSARY } from "@/components/dashboard/trust/MetricGlossary";

const PERIODS: Array<{ label: string; value: 7 | 30 | 90 }> = [
  { label: "7 dias", value: 7 },
  { label: "30 dias", value: 30 },
  { label: "90 dias", value: 90 },
];

const DAYS_PT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"] as const;
const HOUR_BUCKETS = ["08h", "12h", "18h"] as const;

const RFM_CHART_POSITIONS: Record<
  string,
  { x: number; y: number; name: string; color: string }
> = {
  champions: { x: 5, y: 5, name: "Campeões", color: "#eab308" },
  loyal: { x: 5, y: 4, name: "Fiéis", color: "#10b981" },
  at_risk: { x: 3, y: 2, name: "Em risco", color: "#f97316" },
  lost: { x: 1, y: 1, name: "Perdidos", color: "#ef4444" },
  new: { x: 5, y: 1, name: "Novos", color: "#3b82f6" },
  other: { x: 2, y: 3, name: "Outros / sem segmento", color: "#64748b" },
};

type SharePayload = {
  periodLabel: string;
  recuperado: number;
  novosContatos: number;
  avgChs: number | null;
  prescricoesAtivas: number;
  prescricoesPendentes: number;
  atribuidoPedidos: number;
  /** Receita de pedidos com atribuição a campanhas (attribution_events no período). */
  atribuidoReceitaPedidos: number;
  /** ISO do snapshot `get_dashboard_snapshot` (quando existir). */
  snapshotGeradoEm: string | null;
};

function formatRetentionD30(v: number | null): string {
  if (v == null || Number.isNaN(v)) return "—";
  const n = Number(v);
  const pct = n <= 1 ? Math.round(n * 100) : Math.round(n);
  return `${pct}%`;
}

function buildShareText(p: SharePayload) {
  const chsLine =
    p.avgChs != null
      ? `🎯 CHS médio da base: *${p.avgChs} pts*\n`
      : "";
  return (
    `📊 *Relatório LTV Boost — ${p.periodLabel}*\n\n` +
    `💰 Receita influenciada: *R$ ${p.recuperado.toLocaleString("pt-BR")}*\n` +
    `👥 Novos contatos (analytics): *${p.novosContatos.toLocaleString("pt-BR")}*\n` +
    chsLine +
    `⚡ Prescrições em execução ou concluídas: *${p.prescricoesAtivas}*\n` +
    `📋 Aguardando aprovação: *${p.prescricoesPendentes}*\n` +
    `📈 Pedidos com atribuição: *${p.atribuidoPedidos}* (R$ ${p.atribuidoReceitaPedidos.toLocaleString("pt-BR")})\n` +
    (p.snapshotGeradoEm
      ? `🕐 Snapshot dos dados: *${new Date(p.snapshotGeradoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}*\n`
      : "") +
    `\n_Resumo alinhado ao período do dashboard e ao RPC get_dashboard_snapshot._`
  );
}

function publicSiteBase(): string {
  const env =
    (import.meta.env.VITE_APP_URL as string | undefined) ||
    (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined);
  if (env && /^https?:\/\//i.test(env.trim())) return env.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export default function Relatorios() {
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedLinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    if (copiedLinkTimerRef.current) clearTimeout(copiedLinkTimerRef.current);
  }, []);

  const loja = useLoja();

  // BFF hook consolidation (Priority 3)
  const { 
    data: snapshot, 
    isLoading: snapshotLoading, 
    isError: snapshotError, 
    refetch: refetchSnapshot 
  } = useDashboardSnapshot(period);

  // useAdvancedReports not yet implemented — stub
  const reportsLoading = false;
  const cohorts: any[] = [];
  const cohortsLoading = reportsLoading;
  const refetchCohorts = refetchSnapshot;

  const heatmap: { cells: Record<string, number>; max: number } | null = null as { cells: Record<string, number>; max: number } | null;

  const isLoading = snapshotLoading || loja.isLoading;
  const error = snapshotError;

  const periodPhrase =
    period === 7 ? "últimos 7 dias" : period === 30 ? "últimos 30 dias" : "últimos 90 dias";
  const periodLabel = `${periodPhrase} (${new Date().toLocaleDateString("pt-BR")})`;

  const prescricoesAtivas = snapshot?.prescriptions?.active_count ?? 0;
  const prescricoesPendentes = snapshot?.prescriptions?.pending_count ?? 0;
  const atribuidoPedidos = snapshot?.attributed_order_count ?? 0;
  const atribuidoReceitaPedidos = snapshot?.attributed_order_revenue ?? 0;

  const sharePayload: SharePayload = useMemo(
    () => ({
      periodLabel,
      recuperado: snapshot?.analytics?.total_revenue ?? 0,
      novosContatos: snapshot?.analytics?.total_new_contacts ?? 0,
      avgChs: snapshot?.rfm?.avg_chs ?? null,
      prescricoesAtivas,
      prescricoesPendentes,
      atribuidoPedidos,
      atribuidoReceitaPedidos,
      snapshotGeradoEm: snapshot?.timestamp ?? null,
    }),
    [
      periodLabel,
      snapshot,
      prescricoesAtivas,
      prescricoesPendentes,
      atribuidoPedidos,
      atribuidoReceitaPedidos,
    ],
  );

  const textoWA = useMemo(() => buildShareText(sharePayload), [sharePayload]);
  // Points to the dashboard itself — the /relatorio-anual public route does not exist yet.
  const shareableUrl = `${publicSiteBase()}/dashboard/relatorios?period=${period}`;

  const retentionNodes = useMemo(
    () =>
      buildRetentionGraph({
        recoveredRevenue: snapshot?.analytics?.total_revenue ?? 0,
        activeOpportunities: snapshot?.opportunities ?? 0,
        unreadConversations: snapshot?.unread ?? 0,
        chs: snapshot?.rfm?.avg_chs ?? 0,
      }),
    [snapshot],
  );
  const propensity = useMemo(() => getPropensityOutput(retentionNodes), [retentionNodes]);

  const rfmScatterData = useMemo(() => {
    if (!snapshot?.rfm) return [];
    const entries: { key: string; x: number; y: number; z: number; name: string; fill: string }[] = [];
    (["champions", "loyal", "at_risk", "lost", "new"] as const).forEach((key) => {
      const count = snapshot.rfm[key];
      if (count == null || count <= 0) return;
      const pos = RFM_CHART_POSITIONS[key];
      entries.push({
        key,
        x: pos.x,
        y: pos.y,
        z: count,
        name: pos.name,
        fill: pos.color,
      });
    });
    return entries;
  }, [snapshot]);

  const refetchAll = () => {
    void refetchSnapshot();
    void refetchCohorts();
  };

  const copyTexto = () => {
    void navigator.clipboard.writeText(textoWA);
    setCopied(true);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  const copyLink = () => {
    void navigator.clipboard.writeText(shareableUrl);
    setCopiedLink(true);
    if (copiedLinkTimerRef.current) clearTimeout(copiedLinkTimerRef.current);
    copiedLinkTimerRef.current = setTimeout(() => setCopiedLink(false), 2000);
  };

  const hasSparseData =
    !snapshotLoading &&
    snapshot?.analytics?.total_revenue === 0 &&
    snapshot?.rfm?.total_customers === 0;

  const revenueFmt = snapshot?.analytics?.total_revenue != null
    ? snapshot.analytics.total_revenue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black font-syne tracking-tighter uppercase">Relatórios Avançados</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Visão consolidada com dados da sua conta (analytics diários, clientes e envios).
          </p>
          {/* H5: data freshness timestamp — shows when the snapshot was last computed */}
          {snapshot?.timestamp && (
            <p className="text-[11px] text-muted-foreground mt-1 font-mono">
              Dados calculados às{" "}
              {new Date(snapshot.timestamp).toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
                hour: "2-digit",
                minute: "2-digit",
                day: "2-digit",
                month: "2-digit",
              })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 mr-2">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  period === p.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-10 font-bold gap-2 rounded-xl border-dashed opacity-60"
                  onClick={() => { /* toast placeholder */ }}
                >
                  <Download className="w-4 h-4" /> PDF em breve
                </Button>
              </TooltipTrigger>
              <TooltipContent>Clique para ser avisado do lançamento.</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button
            size="sm"
            className="h-10 font-bold gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white"
            onClick={() => setShowShare(!showShare)}
          >
            <Share2 className="w-4 h-4" /> Compartilhar resumo
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-16 text-muted-foreground text-sm">Carregando relatórios…</div>
      )}

      {error && !isLoading && (
        <div className="text-center py-12 space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5">
          <p className="text-muted-foreground text-sm">Não foi possível carregar alguns dados.</p>
          <Button variant="outline" size="sm" onClick={() => refetchAll()}>
            Tentar novamente
          </Button>
        </div>
      )}

      {!isLoading && !error && hasSparseData && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm text-muted-foreground">
          Ainda não há dados de analytics nem clientes sincronizados nesta conta. Conecte integrações e aguarde o
          primeiro preenchimento de <code className="text-xs">analytics_daily</code> para ver tendências aqui.
        </div>
      )}

      {!isLoading && !error && snapshot && (
        <>
          {showShare && (
            <div className="bg-[#0A0A0F] border border-primary/20 rounded-2xl p-6 space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm font-black uppercase tracking-widest text-primary">
                  Resumo — {periodPhrase}
                </span>
              </div>
              <div className="bg-black/40 rounded-xl p-4 font-mono text-xs text-white/80 whitespace-pre-line leading-relaxed border border-white/5">
                {textoWA}
              </div>
              <div className="flex gap-3 flex-wrap">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(textoWA)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors"
                >
                  <MessageCircle className="w-4 h-4" /> Enviar via WhatsApp
                </a>
                <Button variant="outline" size="sm" className="h-10 gap-2 text-xs font-bold rounded-xl" onClick={copyTexto}>
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copiado!" : "Copiar texto"}
                </Button>
                <Button variant="outline" size="sm" className="h-10 gap-2 text-xs font-bold rounded-xl" onClick={copyLink}>
                  {copiedLink ? <Check className="w-4 h-4 text-green-500" /> : <Share2 className="w-4 h-4" />}
                  {copiedLink ? "Link copiado!" : "Copiar link público"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground font-mono break-all">{shareableUrl}</p>
              <p className="text-[10px] text-muted-foreground italic">
                Texto baseado nos totais do período selecionado e na base de clientes atual.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {isLoading ? (
              [1, 2, 3, 4].map((i) => (
                <div key={i} className="h-28 rounded-xl bg-card border animate-pulse" />
              ))
            ) : (
              <>
                <MetricCard
                  label="Receita influenciada"
                  value={revenueFmt}
                  // Only show trend when there is a non-zero prior period — a zero
                  // baseline would produce +∞% which is misleading for new stores.
                  trend={
                    snapshot?.prev_revenue && snapshot.prev_revenue > 0
                      ? Math.round(((snapshot.analytics.total_revenue - snapshot.prev_revenue) / snapshot.prev_revenue) * 100)
                      : undefined
                  }
                  trendLabel={
                    snapshot?.prev_revenue && snapshot.prev_revenue > 0
                      ? `vs período anterior (${periodPhrase})`
                      : undefined
                  }
                  icon={TrendingUp}
                  tooltip="Soma de receita influenciada em analytics_daily no período."
                />
                <MetricCard
                  label="Novos contatos"
                  value={(snapshot?.analytics.total_new_contacts ?? 0).toLocaleString("pt-BR")}
                  icon={Users}
                  tooltip="Novos contatos agregados no período (analytics diários)."
                />
                <MetricCard
                  label="Taxa de entrega"
                  value={snapshot ? `${Math.round((snapshot.analytics.total_delivered / Math.max(1, snapshot.analytics.total_sent)) * 100)}%` : "—"}
                  icon={Send}
                  tooltip="Mensagens entregues / enviadas no período (analytics diários)."
                />
                <MetricCard
                  label="Taxa de leitura"
                  value={snapshot ? `${Math.round((snapshot.analytics.total_read / Math.max(1, snapshot.analytics.total_delivered)) * 100)}%` : "—"}
                  icon={Eye}
                  tooltip="Mensagens lidas / entregues no período."
                />
              </>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {isLoading ? (
              [1, 2, 3, 4].map((i) => (
                <div key={i} className="h-28 rounded-xl bg-card border animate-pulse" />
              ))
            ) : (
              <>
                <MetricCard
                  label="Recuperação de carrinhos"
                  value="—"
                  icon={ShoppingBag}
                  tooltip="Carrinhos marcados como recuperados / total rastreado no período."
                />
                <MetricCard
                  label="Pedidos atribuídos"
                  value={String(snapshot.attributed_order_count ?? 0)}
                  subValue={(snapshot.attributed_order_revenue ?? 0).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                  icon={BarChart3}
                  tooltip="Pedidos com atribuição a campanhas da loja no período (attribution_events)."
                />
                <MetricCard
                  label="Oportunidades abertas"
                  value={String(snapshot?.opportunities ?? 0)}
                  icon={Sparkles}
                  tooltip="Oportunidades não resolvidas na fila."
                />
                <MetricCard
                  label="Mensagens não lidas (inbox)"
                  value={String(snapshot?.unread ?? 0)}
                  icon={MessageCircle}
                  tooltip="Soma de não lidas nas conversas atuais."
                />
              </>
            )}
          </div>

          <div className="bg-card border rounded-2xl p-6 space-y-4">
            <h3 className="font-bold text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> Retention graph (sinais da conta)
            </h3>
            <div className="grid md:grid-cols-3 gap-3">
              {retentionNodes.map((node) => (
                <div key={node.id} className="rounded-xl border p-4 bg-muted/20">
                  <p className="text-xs text-muted-foreground">{node.label}</p>
                  <p className="text-2xl font-black">{node.score}/100</p>
                  <p className="text-xs text-muted-foreground">{node.reason}</p>
                </div>
              ))}
            </div>
            <p className="text-sm">
              Propensão dominante: <span className="font-bold">{propensity.bestNode.label}</span>{" "}
              <span className="text-muted-foreground">
                (confiança {propensity.confidence}% · {propensity.band})
              </span>
            </p>
          </div>

          <div className="bg-card border rounded-2xl p-6 space-y-4">
            <h3 className="font-bold text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> Próximas ações recomendadas
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  label: "Recuperar clientes em risco",
                  sub: "Prescrições de IA aguardando aprovação",
                  to: "/dashboard/prescricoes",
                  icon: BarChart3,
                  color: "text-amber-500 bg-amber-500/10",
                },
                {
                  label: "Criar campanha para Campeões",
                  sub: "Segmento com maior engajamento histórico",
                  to: "/dashboard/campanhas",
                  icon: TrendingUp,
                  color: "text-emerald-500 bg-emerald-500/10",
                },
                {
                  label: "Ativar automação win-back",
                  sub: "Clientes inativos ou em risco",
                  to: "/dashboard/automacoes",
                  icon: Users,
                  color: "text-blue-500 bg-blue-500/10",
                },
              ].map(({ label, sub, to, icon: Icon, color }) => (
                <Link
                  key={label}
                  to={to}
                  className="flex items-center gap-3 p-4 bg-muted/30 border border-border/50 rounded-xl hover:border-primary/30 hover:bg-primary/5 transition-all group"
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color.split(" ")[1]}`}>
                    <Icon className={`w-4 h-4 ${color.split(" ")[0]}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold truncate">{label}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{sub}</p>
                  </div>
                  <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary ml-auto shrink-0 transition-colors" />
                </Link>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card border rounded-2xl p-6">
              <h3 className="font-bold text-base mb-6 flex items-center gap-2">
                <PieChart className="w-4 h-4 text-primary" /> Distribuição RFM (clientes na base)
              </h3>
              {snapshot.rfm.total_customers === 0 && rfmScatterData.length === 0 && (
                <p className="text-sm text-muted-foreground">Sem clientes em customers_v3 para esta loja.</p>
              )}
              {rfmScatterData.length > 0 && (
                <>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <MemoScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
                        <XAxis
                          type="number"
                          dataKey="x"
                          name="Recência"
                          domain={[0, 6]}
                          axisLine={false}
                          tick={{ fontSize: 10 }}
                          label={{ value: "Recência (proxy)", position: "insideBottom", offset: -10, fontSize: 10 }}
                        />
                        <YAxis
                          type="number"
                          dataKey="y"
                          name="Frequência"
                          domain={[0, 6]}
                          axisLine={false}
                          tick={{ fontSize: 10 }}
                          label={{ value: "Frequência (proxy)", angle: -90, position: "insideLeft", fontSize: 10 }}
                        />
                        <ZAxis type="number" dataKey="z" range={[120, 2000]} name="Clientes" />
                        <RechartsTooltip
                          cursor={{ strokeDasharray: "3 3" }}
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            borderRadius: "12px",
                            border: "1px solid hsl(var(--border))",
                          }}
                          formatter={(value: number, _name: string, props: { payload?: { name: string } }) => [
                            `${value} clientes`,
                            props.payload?.name ?? "",
                          ]}
                        />
                        <Scatter name="Segmentos" data={rfmScatterData}>
                          {rfmScatterData.map((entry) => (
                            <Cell key={entry.key} fill={entry.fill} fillOpacity={0.65} stroke={entry.fill} />
                          ))}
                        </Scatter>
                      </MemoScatterChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {rfmScatterData.map((d) => (
                      <Badge
                        key={d.key}
                        variant="outline"
                        className="text-[8px] uppercase tracking-tighter"
                        style={{ borderColor: `${d.fill}44`, color: d.fill }}
                      >
                        {d.name}: {d.z}
                      </Badge>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="bg-card border rounded-2xl p-6">
              <h3 className="font-bold text-base mb-6 flex items-center gap-2">
                <MousePointer2 className="w-4 h-4 text-primary" /> Envios por dia e faixa horária
              </h3>
              {snapshotLoading && <p className="text-sm text-muted-foreground">Carregando envios…</p>}
              {!snapshotLoading && heatmap && heatmap.max === 0 && (
                <p className="text-sm text-muted-foreground">
                  Sem envios agregados no período (snapshot sem dados de heatmap).
                </p>
              )}
              {!snapshotLoading && heatmap && heatmap.max > 0 && (
                <>
                  <div className="space-y-2">
                    <div className="grid grid-cols-4 gap-1">
                      <div />
                      {HOUR_BUCKETS.map((h) => (
                        <div key={h} className="text-[10px] font-bold text-muted-foreground text-center">
                          {h}
                        </div>
                      ))}
                    </div>
                    {DAYS_PT.map((day, dayIndex) => (
                      <div key={day} className="grid grid-cols-4 gap-1">
                        <div className="text-[10px] font-bold text-muted-foreground flex items-center">{day}</div>
                        {HOUR_BUCKETS.map((hour) => {
                          const key = `${dayIndex}-${hour}`;
                          const count = heatmap.cells[key] ?? 0;
                          const intensity = heatmap.max > 0 ? count / heatmap.max : 0;
                          const opacity = Math.max(0.08, intensity);
                          return (
                            <div
                              key={`${day}-${hour}`}
                              className="h-8 rounded-md transition-all hover:scale-105 cursor-help"
                              style={{
                                backgroundColor: `rgba(16, 185, 129, ${opacity})`,
                                border: `1px solid rgba(16, 185, 129, ${opacity + 0.08})`,
                              }}
                              title={`${count} envios`}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-6 italic text-center">
                    Agregação server-side em message_sends (mesmo período do snapshot), por dia da semana e faixa de
                    horário.
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="bg-card border rounded-2xl p-6">
            <h3 className="font-bold text-base mb-6 flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" /> Cohorts de clientes (pipeline)
            </h3>
            {cohortsLoading && <p className="text-sm text-muted-foreground">Carregando cohorts…</p>}
            {!cohortsLoading && cohorts.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum snapshot em customer_cohorts. Quando o job de dados popular esta tabela, os valores aparecem
                aqui.
              </p>
            )}
            {!cohortsLoading && cohorts.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="p-2 text-left font-semibold">Mês cohort</th>
                      <th className="p-2 text-center font-semibold bg-muted/20">Tamanho</th>
                      <th className="p-2 text-center font-semibold">Retenção D30</th>
                      <th className="p-2 text-right font-semibold text-muted-foreground">Computado em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cohorts.map((row: any) => (
                      <tr key={row.id} className="border-b border-border/30">
                        <td className="p-2 text-muted-foreground">{row.cohort_month}</td>
                        <td className="p-2 text-center bg-muted/10">{row.cohort_size}</td>
                        <td className="p-2 text-center font-mono">{formatRetentionD30(row.retention_d30)}</td>
                        <td className="p-2 text-right text-muted-foreground text-[10px]">
                          {row.computed_at
                            ? new Date(row.computed_at).toLocaleString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
