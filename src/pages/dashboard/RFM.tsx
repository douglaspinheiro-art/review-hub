// @ts-nocheck
import { useMemo, useCallback, type ElementType } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useContacts, useRfmReportCounts } from "@/hooks/useDashboard";
import { useStoreScope } from "@/contexts/StoreScopeContext";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";
import type { RfmEnglishSegment } from "@/lib/rfm-segments";
import { computeRfmSampleContext, classifyContact } from "@/lib/rfm-classify";
import { isBetaLimitedScope } from "@/lib/beta-scope";
import { supabase } from "@/lib/supabase";
import {
  TrendingUp,
  Users,
  Crown,
  AlertTriangle,
  UserX,
  Loader2,
  Info,
  ExternalLink,
  RefreshCw,
  Download,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Cell,
} from "recharts";

/**
 * RFM — Recência, Frequência, Valor
 * Segmenta contatos em 5 grupos usando os campos de customers_v3.
 * Prioridade: rfm_segment pré-calculado no banco → cálculo local via scores.
 * Recência usa last_purchase_at (data real da última compra).
 */

type CustomerV3Row = Database["public"]["Tables"]["customers_v3"]["Row"];
type Contact = CustomerV3Row;

const EMPTY_CONTACTS: Contact[] = [];

type RFMSegment = RfmEnglishSegment;

const SCATTER_MAX_POINTS = 200;

const SEGMENTS: Record<RFMSegment, {
  label: string;
  description: string;
  icon: ElementType;
  color: string;
  bg: string;
  action: string;
}> = {
  champions: {
    label: "Campeões",
    description: "Compraram recentemente, compram com frequência e gastam mais",
    icon: Crown,
    color: "text-yellow-600",
    bg: "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-900",
    action: "Recompense com exclusividades e peça indicações",
  },
  loyal: {
    label: "Fiéis",
    description: "Compram regularmente, bom valor médio",
    icon: TrendingUp,
    color: "text-green-600",
    bg: "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900",
    action: "Envie programa de fidelidade e upsell de produtos premium",
  },
  at_risk: {
    label: "Em risco",
    description: "Foram bons clientes mas estão sumindo",
    icon: AlertTriangle,
    color: "text-orange-600",
    bg: "bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-900",
    action: "Campanha de win-back com oferta especial personalizada",
  },
  lost: {
    label: "Perdidos",
    description: "Baixa frequência, baixo valor, inativos",
    icon: UserX,
    color: "text-red-600",
    bg: "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900",
    action: "Último esforço de reativação com desconto agressivo",
  },
  new: {
    label: "Novos",
    description: "Primeira ou segunda compra recente",
    icon: Users,
    color: "text-blue-600",
    bg: "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900",
    action: "Onboarding: boas-vindas, dicas de uso, cross-sell",
  },
};

const SEGMENT_DOT_HEX: Record<RFMSegment, string> = {
  champions: "#ca8a04",
  loyal: "#16a34a",
  at_risk: "#ea580c",
  lost: "#dc2626",
  new: "#2563eb",
};

function downloadSampleCsv(rows: { c: Contact; segment: RFMSegment }[]) {
  const header = ["id", "nome", "email", "telefone", "segmento_banco", "segmento_matriz", "freq_rfm", "valor_rfm"];
  const lines = rows.map(({ c, segment }) =>
    [
      c.id,
      `"${String(c.name ?? "").replaceAll('"', '""')}"`,
      `"${String(c.email ?? "").replaceAll('"', '""')}"`,
      `"${String(c.phone ?? "").replaceAll('"', '""')}"`,
      `"${String(c.rfm_segment ?? "").replaceAll('"', '""')}"`,
      segment,
      c.rfm_frequency ?? "",
      c.rfm_monetary ?? "",
    ].join(","),
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rfm-amostra-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function RFM() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const scope = useStoreScope();
  const {
    data: contactsResult,
    isLoading,
    isError,
    error,
    refetch,
  } = useContacts({ variant: "sample", sampleMaxRows: 1000 });
  const {
    data: rfmReport,
    isLoading: rfmReportLoading,
    isError: rfmReportError,
    refetch: refetchRfmReport,
  } = useRfmReportCounts();

  const recalcRfm = useMutation({
    mutationFn: async () => {
      const userId = scope.userId;
      const storeId = scope.activeStoreId;
      if (!userId) throw new Error("Sessão inválida");
      if (!storeId) throw new Error("Nenhuma loja vinculada à conta.");

      const { data, error } = await supabase.functions.invoke<{
        ok?: boolean;
        updated?: number;
        capped?: boolean;
        message?: string;
        enqueued?: boolean;
        error?: string;
      }>("calculate-rfm", { body: { store_id: storeId } });
      if (error) throw error;
      if (data && typeof data === "object" && "error" in data && data.error) {
        throw new Error(String(data.error));
      }
      return data as { ok?: boolean; updated?: number; capped?: boolean; message?: string; enqueued?: boolean };
    },
    onSuccess: (data) => {
      const extra = data?.capped && data?.message ? ` ${data.message}` : "";
      toast.success("Segmentos RFM atualizados", {
        description: `Clientes com segmento atualizado: ${data?.updated ?? 0}.${extra}`,
      });
      void queryClient.invalidateQueries({ queryKey: ["contacts", user?.id ?? null] });
      void queryClient.invalidateQueries({ queryKey: ["rfm-report-counts"] });
    },
    onError: (e: Error) => {
      toast.error("Não foi possível recalcular o RFM", { description: e.message });
    },
  });

  const contacts = (contactsResult?.contacts ?? EMPTY_CONTACTS) as Contact[];
  const totalCount = contactsResult?.totalCount ?? 0;
  const isTruncated = totalCount > contacts.length;

  const { segments, maxFreq, maxMonetary, maxDaysInactive, monetaryById, segmentOf } = useMemo(() => {
    const ctx = computeRfmSampleContext(contacts);

    const groups: Record<string, Contact[]> = {
      champions: [],
      loyal: [],
      promising: [],
      at_risk: [],
      lost: [],
      new: [],
      other: [],
    };

    contacts.forEach((c) => {
      const seg = ctx.segmentOf(c) || "other";
      if (groups[seg]) {
        groups[seg].push(c);
      } else {
        groups[seg] = [c];
      }
    });

    return { ...ctx, segments: groups, segmentOf: ctx.segmentOf };
  }, [contacts]);

  const scatterData = useMemo(() => {
    const n = contacts.length;
    if (n === 0) return [];
    const step = n <= SCATTER_MAX_POINTS ? 1 : Math.ceil(n / SCATTER_MAX_POINTS);
    const sampled: Array<{
      id: string;
      x: number;
      y: number;
      name: string;
      segment: RFMSegment;
      fill: string;
    }> = [];
    for (let i = 0; i < n; i += step) {
      const c = contacts[i];
      const freq = c.rfm_frequency ?? 1;
      const monetary = monetaryById.get(c.id) ?? 1;
      const seg = classifyContact(c, maxDaysInactive, monetary);
      sampled.push({
        id: c.id,
        x: freq,
        y: monetary,
        name: c.name ?? "—",
        segment: seg,
        fill: SEGMENT_DOT_HEX[seg],
      });
    }
    return sampled;
  }, [contacts, monetaryById, maxDaysInactive]);

  const exportCsv = useCallback(() => {
    const rows = contacts.map((c) => ({ c, segment: segmentOf(c) }));
    downloadSampleCsv(rows);
    toast.success("CSV exportado", { description: `${rows.length} linhas (amostra carregada).` });
  }, [contacts, segmentOf]);

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl animate-pulse" aria-busy="true">
        <div className="h-8 w-48 rounded-md bg-muted" />
        <div className="h-4 w-full max-w-xl rounded-md bg-muted" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted" />
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-48 rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold font-syne tracking-tight">Matriz RFM</h1>
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Não foi possível carregar os contatos."}
        </p>
        <Button type="button" variant="outline" onClick={() => void refetch()} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold font-syne tracking-tight">Matriz RFM</h1>
        <p className="text-muted-foreground text-sm">
          Ainda não há contatos com dados de compra nesta loja. Conecte seu e-commerce via webhook ou importe clientes para calcular recência, frequência e valor automaticamente.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="default" onClick={() => navigate("/dashboard/integracoes")}>
            Integrações
          </Button>
          <Button variant="outline" onClick={() => navigate("/dashboard/configuracoes")}>
            Configurações
          </Button>
        </div>
      </div>
    );
  }

  const rfm = rfmReport;
  const kpiRow = rfm && !rfmReportError
    ? [
        {
          label: "Total na base",
          value: rfm.total,
          color: "text-foreground",
          sub: isTruncated ? `${contacts.length} carregados para detalhe` : "Todos carregados na amostra",
        },
        {
          label: "Campeões (banco)",
          value: rfm.champions,
          color: "text-yellow-600",
          sub: rfm.total > 0 ? `${Math.round((rfm.champions / rfm.total) * 100)}% do total` : "—",
        },
        {
          label: "Em risco + perdidos (banco)",
          value: rfm.at_risk + rfm.lost,
          color: "text-orange-600",
          sub: "Segmento salvo em customers_v3",
        },
        {
          label: "Novos (banco)",
          value: rfm.new,
          color: "text-blue-600",
          sub: rfm.total > 0 ? `${Math.round((rfm.new / rfm.total) * 100)}% do total` : "—",
        },
      ]
    : [
        {
          label: "Total na base",
          value: totalCount,
          color: "text-foreground",
          sub: `${contacts.length} na amostra analisada`,
        },
        {
          label: "Campeões (amostra)",
          value: segments.champions.length,
          color: "text-yellow-600",
          sub: contacts.length > 0 ? `${Math.round((segments.champions.length / contacts.length) * 100)}% da amostra` : "—",
        },
        {
          label: "Em risco + perdidos (amostra)",
          value: segments.at_risk.length + segments.lost.length,
          color: "text-orange-600",
          sub: "Regra híbrida (matriz)",
        },
        {
          label: "Novos (amostra)",
          value: segments.new.length,
          color: "text-blue-600",
          sub: contacts.length > 0 ? `${Math.round((segments.new.length / contacts.length) * 100)}% da amostra` : "—",
        },
      ];

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-syne tracking-tight">Matriz RFM</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Segmentação inteligente por Recência, Frequência e Valor para campanhas mais precisas
          </p>
          {isTruncated && (
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
              Mostrando os {contacts.length} contatos mais recentes de {totalCount} na base. Exporte a amostra em CSV ou abra Contatos com o mesmo filtro RFM.
            </p>
          )}
          {rfmReportError && (
            <p className="text-xs text-destructive mt-2">
              Não foi possível carregar totais por segmento no banco. Os cartões de resumo usam só a amostra.
              <button type="button" className="ml-2 underline text-primary" onClick={() => void refetchRfmReport()}>
                Tentar novamente
              </button>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => void refetch()}>
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={exportCsv}>
            <Download className="w-4 h-4" />
            Exportar CSV (amostra)
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-2"
            disabled={recalcRfm.isPending}
            onClick={() => recalcRfm.mutate()}
          >
            {recalcRfm.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Recalcular RFM (pedidos)
          </Button>
        </div>
      </div>

      {/* Resumo — totais no banco quando disponível */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {rfmReportLoading && !rfm
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
            ))
          : kpiRow.map(({ label, value, color, sub }) => (
              <div key={label} className="bg-card border rounded-xl p-4 space-y-1">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={cn("text-2xl font-bold", color)}>{value}</p>
                {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
              </div>
            ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Os cartões de segmento abaixo aplicam a mesma lógica da página Contatos ao filtrar por <span className="font-medium text-foreground">?rfm=</span>
        {" "}
        (segmento no banco ou estimativa), sobre os {contacts.length} contatos desta página.
      </p>

      {/* Info */}
      <div className="flex items-start gap-2 bg-muted/50 border rounded-xl p-3 text-sm text-muted-foreground">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
        <p>
          A classificação na matriz usa <strong>Recência</strong> (data da última compra), <strong>Frequência</strong> e <strong>Valor</strong> de cada contato.
          Conecte seu e-commerce via webhook para enriquecer automaticamente com dados de compra em tempo real.
        </p>
      </div>

      {/* Segmentos */}
      <div className="grid lg:grid-cols-2 gap-4">
        {(Object.entries(SEGMENTS) as [RFMSegment, typeof SEGMENTS[RFMSegment]][]).map(([key, seg]) => {
          const Icon = seg.icon;
          const group = segments[key];
          const pct = contacts.length > 0 ? Math.round((group.length / contacts.length) * 100) : 0;
          const avgFreq = group.length > 0
            ? (group.reduce((s, c) => s + (c.rfm_frequency ?? 0), 0) / group.length).toFixed(1)
            : "—";

          const goCampanha = () => navigate(`/dashboard/campanhas?segmento=${key}`);

          return (
            <div key={key} className={cn("border rounded-xl overflow-hidden", seg.bg)}>
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className={cn("p-2 rounded-lg bg-white/60 dark:bg-background/40")}>
                      <Icon className={cn("w-5 h-5", seg.color)} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{seg.label}</h3>
                      <p className="text-xs text-muted-foreground">{seg.description}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn("text-2xl font-bold", seg.color)}>{group.length}</p>
                    <p className="text-xs text-muted-foreground">{pct}% da amostra</p>
                  </div>
                </div>

                <div className="h-1.5 bg-white/50 dark:bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all",
                      key === "champions" ? "bg-yellow-500" :
                      key === "loyal" ? "bg-green-500" :
                      key === "at_risk" ? "bg-orange-500" :
                      key === "lost" ? "bg-red-500" : "bg-blue-500"
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className={cn("font-medium", seg.color)}>
                    Freq. média: {avgFreq}/5
                  </span>
                </div>

                <div className="bg-white/60 dark:bg-background/40 rounded-lg p-2.5 text-xs">
                  <span className="font-medium">Ação recomendada: </span>
                  <span className="text-muted-foreground">{seg.action}</span>
                </div>

                <div className="flex flex-col gap-2">
                  {isBetaLimitedScope ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full font-bold text-xs border-white/40 bg-white/20"
                      disabled={group.length === 0}
                      onClick={() => navigate("/dashboard/benchmark")}
                    >
                      {group.length === 0
                        ? "Nenhum cliente neste segmento"
                        : "Campanhas indisponíveis no beta — ver roteiro"}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full font-bold text-xs border-white/40 bg-white/20 hover:bg-white/50 dark:hover:bg-background/60"
                      disabled={group.length === 0}
                      onClick={goCampanha}
                    >
                      {group.length === 0 ? "Nenhum cliente neste segmento" : `Criar campanha — ${seg.label}`}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full text-xs gap-1 h-8"
                    disabled={group.length === 0}
                    onClick={() => navigate(`/dashboard/contatos?rfm=${key}`)}
                  >
                    <ExternalLink className="w-3 h-3" />
                    Ver em Contatos
                  </Button>
                </div>
              </div>

              {group.length > 0 && (
                <div className="border-t border-white/40 dark:border-white/10 bg-white/30 dark:bg-background/30 px-4 py-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Contatos neste segmento</p>
                  <div className="space-y-1">
                    {group.slice(0, 4).map((c) => {
                      const recencyDate = c.last_purchase_at ?? c.created_at;
                      const daysAgo = Math.round((Date.now() - new Date(recencyDate).getTime()) / 86_400_000);
                      return (
                        <div key={c.id} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full bg-white/60 dark:bg-background/50 flex items-center justify-center text-[10px] font-bold">
                              {c.name?.[0]?.toUpperCase() ?? "?"}
                            </div>
                            <span className="font-medium truncate max-w-[120px]">{c.name ?? "—"}</span>
                          </div>
                          <span className="text-muted-foreground shrink-0">
                            {daysAgo === 0 ? "hoje" : `${daysAgo}d atrás`}
                          </span>
                        </div>
                      );
                    })}
                    {group.length > 4 && (
                      <p className="text-xs text-muted-foreground">+{group.length - 4} contatos</p>
                    )}
                  </div>
                </div>
              )}

              {group.length === 0 && (
                <div className="border-t border-white/40 dark:border-white/10 bg-white/30 dark:bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                  Nenhum contato neste segmento ainda.
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Scatter — Recharts, amostragem para legibilidade */}
      <div
        className="bg-card border rounded-xl p-5"
        role="img"
        aria-label="Gráfico de dispersão frequência versus valor monetário RFM na amostra"
      >
        <h2 className="font-semibold mb-1 text-sm">Distribuição Frequência × Valor (scores RFM)</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Até {SCATTER_MAX_POINTS} pontos para leitura mais clara. Eixos de 1 a 5 (scores).
        </p>
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 12, right: 12, bottom: 28, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis
                type="number"
                dataKey="x"
                name="Frequência"
                domain={[1, 5]}
                ticks={[1, 2, 3, 4, 5]}
                tick={{ fontSize: 10 }}
                label={{ value: "Frequência (1–5)", position: "bottom", offset: 12, fontSize: 10 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Valor"
                domain={[1, 5]}
                ticks={[1, 2, 3, 4, 5]}
                tick={{ fontSize: 10 }}
                label={{ value: "Valor (1–5)", angle: -90, position: "insideLeft", fontSize: 10 }}
              />
              <RechartsTooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as {
                    name?: string;
                    segment?: string;
                    x?: number;
                    y?: number;
                  };
                  return (
                    <div
                      className="rounded-xl border bg-card px-3 py-2 text-xs shadow-md"
                      style={{ borderColor: "hsl(var(--border))" }}
                    >
                      <p className="font-medium text-foreground">{p.name ?? "—"}</p>
                      <p className="text-muted-foreground">
                        Segmento: {p.segment} · Freq {p.x} · Valor {p.y}
                      </p>
                    </div>
                  );
                }}
              />
              <Scatter name="Clientes" data={scatterData} shape="circle">
                {scatterData.map((entry) => (
                  <Cell key={entry.id} fill={entry.fill} fillOpacity={0.85} stroke={entry.fill} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-3 mt-3">
          {(Object.entries(SEGMENTS) as [RFMSegment, typeof SEGMENTS[RFMSegment]][]).map(([key, s]) => (
            <div key={key} className="flex items-center gap-1.5 text-xs">
              <div
                className="w-2.5 h-2.5 rounded-full border border-white/30"
                style={{ backgroundColor: SEGMENT_DOT_HEX[key] }}
              />
              <span className="text-muted-foreground">{s.label} ({segments[key].length})</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
