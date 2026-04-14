// @ts-nocheck
import { useState } from "react";
import {
  DollarSign, TrendingUp, ShoppingCart, Zap, Target,
  ArrowUpRight, ArrowDownRight, MessageCircle, Mail,
  Smartphone, RefreshCw, Info, ExternalLink, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useROIAttribution } from "@/hooks/useDashboard";
import { useNavigate } from "react-router-dom";
import { ATTRIBUTION_WINDOW_DAYS, ATTRIBUTION_WINDOW_LABEL } from "@/lib/attribution-config";
import {
  AreaChart, Area,
  PieChart, Pie, Cell,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend,
} from "recharts";

const PERIODS = [
  { label: "7 dias", value: 7 },
  { label: "30 dias", value: 30 },
  { label: "90 dias", value: 90 },
];

const CHANNEL_CONFIG: Record<string, { label: string; icon: typeof MessageCircle; color: string }> = {
  whatsapp: { label: "WhatsApp", icon: MessageCircle, color: "text-green-600 bg-green-500/10" },
  email:    { label: "E-mail",   icon: Mail,          color: "text-blue-600 bg-blue-500/10" },
  sms:      { label: "SMS",      icon: Smartphone,    color: "text-orange-600 bg-orange-500/10" },
};

const DONUT_COLORS = ["#7c3aed", "#10b981", "#f59e0b"];

function fmt(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function KpiCard({
  label, value, sub, icon: Icon, color, trend, trendLabel,
}: {
  label: string; value: string; sub?: string;
  icon: typeof DollarSign; color: string;
  trend?: number; trendLabel?: string;
}) {
  return (
    <div className="bg-card border rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", color)}>
          <Icon className="w-4 h-4" />
        </div>
        {trend !== undefined && (
          <div className={cn("flex items-center gap-1 text-[10px] font-black", trend >= 0 ? "text-emerald-500" : "text-red-500")}>
            {trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div>
        <p className="text-2xl font-black font-syne tracking-tighter">{value}</p>
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-0.5">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
        {trendLabel && <p className="text-[10px] text-muted-foreground mt-0.5">{trendLabel}</p>}
      </div>
    </div>
  );
}

function EmptyState({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-5">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
        <Target className="w-8 h-8 text-primary" />
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-black font-syne tracking-tighter uppercase">Sem dados de atribuição</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Conecte sua loja para que o LTV Boost comece a rastrear receita recuperada em tempo real.
        </p>
      </div>
      <Button className="font-bold gap-2 rounded-xl" onClick={onNavigate}>
        Conectar loja <ExternalLink className="w-4 h-4" />
      </Button>
    </div>
  );
}

function AttributionPageSkeleton() {
  return (
    <div className="space-y-8 pb-10 animate-in fade-in duration-200">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <Skeleton className="h-10 w-56 rounded-xl" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Skeleton className="lg:col-span-3 h-72 rounded-2xl" />
        <Skeleton className="lg:col-span-2 h-72 rounded-2xl" />
      </div>
    </div>
  );
}

function DisclaimerCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] text-muted-foreground leading-snug">
      <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden />
      <div>
        <span className="font-bold text-foreground">{title}</span>
        {children}
      </div>
    </div>
  );
}

export default function Atribuicao() {
  const [period, setPeriod] = useState(30);
  const [metaCut, setMetaCut] = useState(20);
  const [googleCut, setGoogleCut] = useState(20);
  const [crmIncrease, setCrmIncrease] = useState(15);
  const { data, isLoading, error, refetch } = useROIAttribution(period);
  const navigate = useNavigate();

  const isEmpty = !isLoading && !error && data && data.totalRevenue === 0;

  const donutData = data?.sourceBreakdown
    ? [
        { name: "Campanhas",   value: data.sourceBreakdown.campaigns },
        { name: "Automações",  value: data.sourceBreakdown.automations },
        { name: "Direto",      value: data.sourceBreakdown.direct },
      ].filter((d) => d.value > 0)
    : [];

  const windowLabel = data?.attributionWindowLabel ?? ATTRIBUTION_WINDOW_LABEL;

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-3xl font-black font-syne tracking-tighter uppercase">Atribuição de ROI</h1>
            <Badge className="bg-primary/10 text-primary border-none text-[9px] font-black uppercase tracking-widest">
              Janela {windowLabel}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            Quanto o LTV Boost está recuperando — por campanha, automação e canal.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="flex bg-muted/50 rounded-xl p-1"
            role="group"
            aria-label="Período de análise"
          >
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPeriod(p.value)}
                aria-pressed={period === p.value}
                aria-label={`Período ${p.label}`}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                  period === p.value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl"
            onClick={() => refetch()}
            aria-label="Atualizar dados de atribuição"
          >
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {isLoading && <AttributionPageSkeleton />}

      {error && (
        <div className="text-center py-16 space-y-3">
          <p className="text-sm text-muted-foreground">Erro ao carregar dados de atribuição.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button>
        </div>
      )}

      {isEmpty && <EmptyState onNavigate={() => navigate("/dashboard/integracoes")} />}

      {!isLoading && data && data.totalRevenue > 0 && (
        <>
          {data.attributionQueryError && (
            <div
              className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
              role="alert"
            >
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" aria-hidden />
              <div>
                <p className="font-bold text-foreground">Não foi possível carregar eventos de atribuição</p>
                <p className="text-muted-foreground text-xs mt-1">{data.attributionQueryError}</p>
                <p className="text-muted-foreground text-xs mt-1">
                  As métricas de receita do gráfico continuam disponíveis; a tabela por campanha pode ficar vazia até o problema ser resolvido.
                </p>
              </div>
            </div>
          )}

          {data.usesEstimatedSourceSplit && (
            <DisclaimerCard title="Distribuição por origem estimada. ">
              Não há pedidos com <code className="text-[10px] bg-muted px-1 rounded">attribution_events</code> no período.
              O gráfico &quot;Por origem&quot; usa uma divisão ilustrativa (55% / 30% / 15%) sobre a receita influenciada — não substitui medição por pedido.
            </DisclaimerCard>
          )}

          {(data.scopeTruncated || data.detailFetchTruncated || data.roasSpendPartial) && (
            <DisclaimerCard title="Consulta otimizada. ">
              {data.scopeTruncated &&
                "Listamos até 20 mil IDs de campanhas da loja para filtrar eventos multi-tenant; acima disso, a atribuição por campanha pode ficar incompleta. "}
              {data.detailFetchTruncated &&
                "Há mais de 500 campanhas distintas com pedidos atribuídos no período; detalhe e custo de envio usados no ROAS consideram apenas um subconjunto para manter a página rápida. "}
              {data.roasSpendPartial &&
                "O denominador do ROAS reflete só o custo das campanhas carregadas nesta consulta — pode subestimar ou superestimar o total real da loja."}
            </DisclaimerCard>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Recuperado"
              value={fmt(data.totalRevenue)}
              icon={DollarSign}
              color="bg-emerald-500/10 text-emerald-600"
              trend={data.revGrowth}
              trendLabel={`vs. ${period} dias anteriores`}
            />
            <KpiCard
              label="ROI / ROAS"
              value={data.roas != null ? `${data.roas.toFixed(1)}x` : "—"}
              sub={
                data.roasDenominatorMissing
                  ? "Informe custo de envio nas campanhas (custo total) para calcular ROAS."
                  : `${data.roasSpendPartial ? "Custo considerado nas campanhas carregadas para esta página. " : ""}Base: ${fmt(data.totalSpendBrl)} em custo de envio.`
              }
              icon={TrendingUp}
              color="bg-primary/10 text-primary"
            />
            <KpiCard
              label="Recuperação Carrinho"
              value={data.cartStats.total > 0 ? `${data.cartStats.recoveryRate}%` : "—"}
              sub={data.cartStats.total > 0 ? `${data.cartStats.recovered}/${data.cartStats.total} carrinhos` : "Sem carrinhos no período"}
              icon={ShoppingCart}
              color="bg-amber-500/10 text-amber-600"
            />
            <KpiCard
              label="Conversões"
              value={data.totalConversions.toLocaleString("pt-BR")}
              sub={data.hasAttribution ? `atribuídas (last-touch ${windowLabel})` : "estimado (sem eventos no período)"}
              icon={Zap}
              color="bg-violet-500/10 text-violet-600"
            />
          </div>

          {/* Revenue time series */}
          <div className="bg-card border rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-black text-sm uppercase tracking-widest">Receita recuperada por dia</h2>
              <span className="text-[10px] text-muted-foreground bg-muted px-2 py-1 rounded-full font-bold uppercase tracking-widest">
                últimos {period} dias
              </span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                  className="text-muted-foreground"
                />
                <Tooltip
                  formatter={(v: number) => [fmt(v), "Receita"]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }}
                />
                <Area
                  type="monotone"
                  dataKey="receita"
                  name="Receita"
                  stroke="#7c3aed"
                  fill="url(#colorReceita)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-muted-foreground">
              Datas no fuso America/Sao_Paulo a partir do dia gravado em analytics.
            </p>
          </div>

          {/* Per-campaign + Source breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3 bg-card border rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
                <h2 className="font-black text-sm uppercase tracking-widest">Por campanha</h2>
                {!data.hasAttribution && (
                  <div className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-500/10 px-2 py-1 rounded-full">
                    <Info className="w-3 h-3" aria-hidden /> Dados insuficientes
                  </div>
                )}
              </div>

              {data.byCampaign.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center space-y-2">
                  <Target className="w-8 h-8 text-muted-foreground/40" aria-hidden />
                  <p className="text-sm text-muted-foreground font-medium">Nenhuma atribuição por campanha ainda</p>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    {data.hasAttribution
                      ? "Assim que pedidos forem atribuídos a campanhas desta loja, eles aparecerão aqui."
                      : "Há receita em analytics no período, mas sem eventos de pedido rastreados — o detalhe por campanha depende de integrações e webhooks."}
                  </p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <caption className="sr-only">Receita e conversões atribuídas por campanha</caption>
                  <thead>
                    <tr className="bg-muted/20 border-b border-border/50">
                      <th className="px-5 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground">Campanha</th>
                      <th className="px-5 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground text-right">Conversões</th>
                      <th className="px-5 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground text-right">Receita</th>
                      <th className="px-5 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground text-right">CVR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byCampaign.map((c) => {
                      const ch = CHANNEL_CONFIG[c.channel] ?? CHANNEL_CONFIG.whatsapp;
                      const ChannelIcon = ch.icon;
                      const cvr = c.sent > 0 ? ((c.conversions / c.sent) * 100).toFixed(1) : "—";
                      const pct = data.totalRevenue > 0 ? (c.revenue / data.totalRevenue) * 100 : 0;
                      return (
                        <tr key={c.id} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", ch.color.split(" ")[1])}>
                                <ChannelIcon className={cn("w-3.5 h-3.5", ch.color.split(" ")[0])} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold truncate max-w-[180px]">{c.name}</p>
                                <div className="w-full mt-1 h-1 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <span className="text-xs font-bold">{c.conversions}</span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <span className="text-xs font-black text-emerald-600">{fmt(c.revenue)}</span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <span className="text-xs font-bold text-muted-foreground">{cvr !== "—" ? `${cvr}%` : "—"}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="lg:col-span-2 bg-card border rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="font-black text-sm uppercase tracking-widest">Por origem</h2>
                {!data.hasAttribution && (
                  <Badge className="text-[8px] bg-amber-500/10 text-amber-600 border-none font-black">Estimado</Badge>
                )}
              </div>

              {donutData.length === 0 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">Sem valores para exibir no gráfico neste período.</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie
                        data={donutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={72}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {donutData.map((_, i) => (
                          <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number) => [fmt(v)]}
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>

                  <div className="space-y-3">
                    {donutData.map((d, i) => (
                      <div key={d.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                          <span className="text-xs font-bold">{d.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-black">{fmt(d.value)}</span>
                          <span className="text-[10px] text-muted-foreground ml-1.5">
                            {data.totalRevenue > 0 ? `${Math.round((d.value / data.totalRevenue) * 100)}%` : "0%"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {data.usesEstimatedSourceSplit && (
                <p className="text-[10px] text-muted-foreground border-t pt-3">
                  Proporções ilustrativas até existirem eventos de atribuição por pedido.
                </p>
              )}
            </div>
          </div>

          {data.cartStats.total > 0 && (
            <div className="bg-card border rounded-2xl p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-amber-500" aria-hidden />
                  <h2 className="font-black text-sm uppercase tracking-widest">Recuperação de carrinho abandonado</h2>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs font-bold gap-1 text-muted-foreground h-8 rounded-xl"
                  onClick={() => navigate("/dashboard/carrinho-abandonado")}
                >
                  Ver todos <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                <div className="md:col-span-2 space-y-3">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-3xl font-black font-syne tracking-tighter">
                        {data.cartStats.recovered}
                        <span className="text-base font-bold text-muted-foreground ml-1">/ {data.cartStats.total}</span>
                      </p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Carrinhos recuperados</p>
                    </div>
                    <p className="text-2xl font-black text-amber-500">{data.cartStats.recoveryRate}%</p>
                  </div>
                  <Progress value={data.cartStats.recoveryRate} className="h-2.5 bg-amber-500/10" />
                  <p className="text-[10px] text-muted-foreground">
                    Benchmark do setor: ~15-25% — você está{" "}
                    <span className={cn("font-bold", data.cartStats.recoveryRate >= 15 ? "text-emerald-500" : "text-amber-500")}>
                      {data.cartStats.recoveryRate >= 15 ? "dentro" : "abaixo"} da média
                    </span>
                  </p>
                </div>

                <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Receita recuperada</p>
                  <p className="text-2xl font-black font-syne tracking-tighter text-amber-600">
                    {fmt(data.cartStats.recoveredValue)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">de carrinhos no período</p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card border rounded-2xl p-6 space-y-4">
              <div className="space-y-2">
                <h3 className="font-black text-sm uppercase tracking-widest">Modelos comparativos de atribuição</h3>
                <DisclaimerCard title="Ilustrativo. ">
                  First-touch e linear aqui são aproximações a partir do last-touch — não usam jornada multi-toque real. Use para comparar ordens de grandeza, não para fechar orçamento de mídia.
                </DisclaimerCard>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={[
                    { modelo: "Last-touch", campanhas: data.models.lastTouch.campaigns, automacoes: data.models.lastTouch.automations, direto: data.models.lastTouch.direct },
                    { modelo: "First-touch", campanhas: data.models.firstTouch.campaigns, automacoes: data.models.firstTouch.automations, direto: data.models.firstTouch.direct },
                    { modelo: "Linear", campanhas: data.models.linear.campaigns, automacoes: data.models.linear.automations, direto: data.models.linear.direct },
                  ]}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                  <XAxis dataKey="modelo" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v: number) => [fmt(v)]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="campanhas" name="Campanhas" stackId="a" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="automacoes" name="Automações" stackId="a" fill="#10b981" />
                  <Bar dataKey="direto" name="Direto" stackId="a" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-card border rounded-2xl p-6 space-y-4">
              <div className="space-y-2">
                <h3 className="font-black text-sm uppercase tracking-widest">Cenários de decisão e risco de canal</h3>
                <DisclaimerCard title="Simulação interna. ">
                  Não integra Meta Ads nem Google Ads. Valores derivados do split CRM / direto / campanhas do próprio painel.
                </DisclaimerCard>
              </div>
              <div className="space-y-3 rounded-xl border p-3">
                <div>
                  <div className="flex justify-between text-[11px]">
                    <span id="meta-cut-label">Corte Meta</span>
                    <span aria-live="polite">{metaCut}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={50}
                    value={metaCut}
                    onChange={(e) => setMetaCut(Number(e.target.value))}
                    className="w-full"
                    aria-labelledby="meta-cut-label"
                    aria-valuemin={0}
                    aria-valuemax={50}
                    aria-valuenow={metaCut}
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[11px]">
                    <span id="google-cut-label">Corte Google</span>
                    <span aria-live="polite">{googleCut}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={50}
                    value={googleCut}
                    onChange={(e) => setGoogleCut(Number(e.target.value))}
                    className="w-full"
                    aria-labelledby="google-cut-label"
                    aria-valuemin={0}
                    aria-valuemax={50}
                    aria-valuenow={googleCut}
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[11px]">
                    <span id="crm-label">Aumento CRM</span>
                    <span aria-live="polite">{crmIncrease}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={50}
                    value={crmIncrease}
                    onChange={(e) => setCrmIncrease(Number(e.target.value))}
                    className="w-full"
                    aria-labelledby="crm-label"
                    aria-valuemin={0}
                    aria-valuemax={50}
                    aria-valuenow={crmIncrease}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="rounded-xl border p-3">
                  <p className="text-xs font-bold">Se reduzir Meta em {metaCut}%</p>
                  <p className="text-sm text-red-500 font-mono mt-1">{fmt(Math.round((data.scenarioImpact.metaMinus20Pct / 20) * metaCut))} estimado</p>
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-xs font-bold">Se reduzir Google em {googleCut}%</p>
                  <p className="text-sm text-red-500 font-mono mt-1">{fmt(Math.round((data.scenarioImpact.googleMinus20Pct / 20) * googleCut))} estimado</p>
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-xs font-bold">Se aumentar CRM em {crmIncrease}%</p>
                  <p className="text-sm text-emerald-500 font-mono mt-1">+{fmt(Math.round((data.scenarioImpact.crmPlus15Pct / 15) * crmIncrease))}</p>
                </div>
              </div>
              <div className="space-y-2">
                {data.channelRisk.map((r) => (
                  <div key={r.channel} className="flex items-center justify-between text-xs rounded-lg bg-muted/30 p-2 gap-2 flex-wrap">
                    <span className="font-semibold">{r.channel}</span>
                    <span className="text-muted-foreground">assistido {fmt(r.assistedRevenue)}</span>
                    <span className={cn(
                      "font-bold px-1.5 py-0.5 rounded",
                      r.saturationRisk === "alto" ? "bg-red-500/15 text-red-500" : r.saturationRisk === "medio" ? "bg-amber-500/15 text-amber-600" : "bg-emerald-500/15 text-emerald-600"
                    )}>
                      risco {r.saturationRisk}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 bg-muted/30 border border-border/50 rounded-2xl p-4">
            <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Modelo de atribuição:</strong>{" "}
              Last-touch dentro de {ATTRIBUTION_WINDOW_DAYS} dia(s) de calendário ({windowLabel}) após envio rastreado,
              alinhado ao job de conversão e ao campo <code className="text-[10px] bg-muted px-1 rounded">attribution_window_days</code> das campanhas (padrão 3 dias).
              Uma venda entra em <code className="text-[10px] bg-muted px-1 rounded">attribution_events</code> quando o pedido é associado a envio recente ou a cupom/UTM da loja.
              {!data.hasAttribution && " Dados por campanha aparecem quando os primeiros eventos forem gravados."}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
