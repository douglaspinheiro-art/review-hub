import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Link2,
  Globe,
  ShoppingBag,
  ArrowRight,
  AlertTriangle,
  RefreshCw,
  Terminal,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { DataSourceBadge } from "@/components/dashboard/trust/DataSourceBadge";
import EmailHealthCard from "@/components/dashboard/EmailHealthCard";

import {
  useCanaisPageData,
  useWebhookLogs,
  type ChannelRow,
  type WebhookLogEnriched,
} from "@/hooks/useLTVBoost";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

const WEBHOOK_UNMASKED =
  String(import.meta.env.VITE_WEBHOOK_PAYLOAD_UNMASKED ?? "").toLowerCase() === "true";

function formatLastSync(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 0) return d.toLocaleString("pt-BR");
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `há ${hours} h`;
  return d.toLocaleDateString("pt-BR");
}

function formatBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(n);
}

function syncStatusLabel(status: string | null | undefined, ativo: boolean | null): string {
  if (ativo === false) return "inativo";
  const s = (status ?? "ok").toLowerCase();
  if (s === "erro") return "erro";
  if (s === "sincronizando") return "sync";
  return "ok";
}

function reputacaoAviso(json: Json | null | undefined): string | null {
  if (json == null || typeof json !== "object" || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const aviso = o.aviso ?? o.message ?? o.alert;
  return typeof aviso === "string" && aviso.trim() ? aviso : null;
}

const SENSITIVE_KEY = /(email|phone|token|password|cpf|cnpj|authorization|bearer|secret)/i;

function redactForDisplay(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(redactForDisplay);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k)) out[k] = "[oculto]";
      else out[k] = redactForDisplay(v);
    }
    return out;
  }
  return value;
}

function payloadForModal(log: WebhookLogEnriched): string {
  const raw = log.payload_bruto ?? log.payload;
  if (WEBHOOK_UNMASKED) return JSON.stringify(raw, null, 2);
  return JSON.stringify(redactForDisplay(raw), null, 2);
}

function mapWebhookStatus(log: WebhookLogEnriched): string {
  const p = log.status_processamento?.toLowerCase();
  if (p) return p;
  const s = (log.status ?? "").toLowerCase();
  if (s === "processed") return "sucesso";
  if (s === "failed") return "erro";
  return s || "pendente";
}

const WEBHOOK_LOGS_PAGE_SIZE = 50;

export default function Canais() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [webhookLogsPage, setWebhookLogsPage] = useState(1);

  const canaisQuery = useCanaisPageData(true);
  const logsQuery = useWebhookLogs(true, { page: webhookLogsPage, pageSize: WEBHOOK_LOGS_PAGE_SIZE });
  const webhookLogs = logsQuery.data?.logs ?? [];
  const webhookLogsTotal = logsQuery.data?.totalCount ?? 0;
  const webhookLogsTotalPages = Math.max(1, Math.ceil(webhookLogsTotal / WEBHOOK_LOGS_PAGE_SIZE));

  const onSyncAll = async () => {
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["canais-page-data"] }),
        queryClient.invalidateQueries({ queryKey: ["webhook_logs"] }),
      ]);
      toast.success("Dados atualizados.");
    } catch {
      toast.error("Não foi possível atualizar.");
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "sucesso":
      case "processed":
        return <CheckCircle2 className="w-3 h-3 text-emerald-500" />;
      case "erro":
      case "failed":
        return <XCircle className="w-3 h-3 text-red-500" />;
      default:
        return <Clock className="w-3 h-3 text-amber-500" />;
    }
  };

  const renderChannelCards = () => {
    /* Demo branch removed — only real data from Supabase */

    if (canaisQuery.isLoading) {
      return (
        <>
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-card border border-border/50 rounded-2xl p-6 space-y-4">
              <Skeleton className="h-12 w-12 rounded-xl" />
              <Skeleton className="h-6 w-[75%]" />
              <Skeleton className="h-4 w-[50%]" />
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/40">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          ))}
        </>
      );
    }

    if (canaisQuery.isError) {
      return (
        <div className="md:col-span-2 lg:col-span-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center space-y-4">
          <p className="text-sm font-medium text-destructive">Não foi possível carregar os canais.</p>
          <Button variant="outline" size="sm" className="font-bold gap-2" onClick={() => void canaisQuery.refetch()}>
            <RefreshCw className="w-4 h-4" /> Tentar novamente
          </Button>
        </div>
      );
    }

    const { storeId, channels, statsByChannelId } = canaisQuery.data ?? {
      storeId: null,
      channels: [],
      statsByChannelId: {},
    };

    if (!storeId) {
      return (
        <div className="md:col-span-2 lg:col-span-3 rounded-2xl border border-border/60 bg-muted/10 p-10 text-center space-y-4">
          <p className="text-sm text-muted-foreground">Nenhuma loja associada à conta. Conclua o onboarding ou crie uma loja.</p>
          <Button asChild className="font-bold rounded-xl">
            <Link to="/onboarding">Ir para onboarding</Link>
          </Button>
        </div>
      );
    }

    if (channels.length === 0) {
      return (
        <div className="md:col-span-2 lg:col-span-3 rounded-2xl border border-dashed border-border/60 bg-muted/5 p-10 text-center space-y-4">
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Ainda não há canais registados para esta loja. Ligue a sua loja ou marketplaces em Integrações para começar a ver pedidos por canal.
          </p>
          <Button asChild className="font-bold rounded-xl gap-2">
            <Link to="/dashboard/integracoes">
              <Link2 className="w-4 h-4" /> Abrir Integrações
            </Link>
          </Button>
        </div>
      );
    }

    return channels.map((ch) => (
      <ChannelCard key={ch.id} channel={ch} stats={statsByChannelId[ch.id]} />
    ));
  };

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-black font-syne tracking-tighter uppercase">Meus Canais</h1>
            <DataSourceBadge
              source="real"
              origin="Tabela orders_v3 + webhook_logs · janela 90d"
              note="Pedidos e receita agregam orders_v3 dos últimos 90 dias. Status de sync vem de webhook_logs."
            />
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie as fontes de dados e integrações da sua loja.
            <span className="block text-[10px] uppercase tracking-widest text-muted-foreground/80 mt-1">
              Pedidos e receita nos cards: últimos 90 dias
            </span>
          </p>
        </div>
        <Button
          variant="outline"
          className="font-bold gap-2 rounded-xl"
          onClick={() => void onSyncAll()}
          disabled={canaisQuery.isFetching || logsQuery.isFetching}
        >
          {(canaisQuery.isFetching || logsQuery.isFetching) && !canaisQuery.isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Sincronizar tudo
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {renderChannelCards()}
        {(
          <div className="border-2 border-dashed border-border/60 rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-4 hover:border-primary/40 hover:bg-primary/5 transition-colors">
            <Link to="/dashboard/integracoes" className="flex flex-col items-center space-y-4 w-full group">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <Link2 className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div>
                <h4 className="font-bold text-sm">Conectar canal</h4>
                <p className="text-xs text-muted-foreground">E-commerce, CRM e mais — em Integrações.</p>
              </div>
            </Link>
          </div>
        )}
      </div>

      <EmailHealthCard storeId={canaisQuery.data?.storeId ?? undefined} />

      {user && (
        <div className="pt-12 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500">
                <Terminal className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold font-syne tracking-tight">Logs de webhooks da sua conta</h2>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">
                  Eventos visíveis para o seu utilizador (RLS)
                </p>
              </div>
            </div>
            {logsQuery.isError && (
              <Button variant="outline" size="sm" className="font-bold gap-2 shrink-0" onClick={() => void logsQuery.refetch()}>
                <RefreshCw className="w-4 h-4" /> Tentar logs
              </Button>
            )}
          </div>

          <div className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-border/50 flex items-center justify-between bg-muted/20">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Webhooks recentes</h3>
              <Badge className="bg-purple-500/10 text-purple-500 border-0 text-[10px] font-black">Ao vivo</Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/10 border-b border-border/50">
                    <th className="px-6 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground">Timestamp</th>
                    <th className="px-6 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground">Origem</th>
                    <th className="px-6 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground">Loja</th>
                    <th className="px-6 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground">Estado</th>
                    <th className="px-6 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {logsQuery.isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td colSpan={5} className="px-6 py-4 h-12 bg-muted/5" />
                      </tr>
                    ))
                  ) : logsQuery.isError ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-xs text-destructive font-medium">
                        Erro ao carregar logs.
                      </td>
                    </tr>
                  ) : webhookLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-xs text-muted-foreground italic font-medium">
                        Nenhum log de webhook registado ainda.
                      </td>
                    </tr>
                  ) : (
                    webhookLogs.map((log) => {
                      const displayStatus = mapWebhookStatus(log);
                      const plataforma = log.plataforma ?? log.source ?? "—";
                      return (
                        <tr key={log.id} className="hover:bg-muted/10 transition-colors">
                          <td className="px-6 py-4 text-[10px] font-mono font-bold text-muted-foreground">
                            {new Date(log.created_at).toLocaleString("pt-BR")}
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant="outline" className="text-[9px] font-black uppercase border-border/60">
                              {plataforma}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-[11px] font-bold">{log.store_name ?? "—"}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-tighter">
                              {getStatusIcon(displayStatus)}
                              <span
                                className={cn(
                                  displayStatus === "sucesso" || displayStatus === "processed"
                                    ? "text-emerald-500"
                                    : displayStatus === "erro" || displayStatus === "failed"
                                      ? "text-red-500"
                                      : "text-amber-500",
                                )}
                              >
                                {displayStatus}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-[10px] font-black uppercase tracking-tighter gap-1 hover:bg-purple-500/10 hover:text-purple-500"
                                >
                                  <Eye className="w-3 h-3" /> Payload
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl bg-[#0A0A0F] border-[#1E1E2E] text-white">
                                <DialogHeader>
                                  <DialogTitle className="text-sm font-black uppercase tracking-widest text-purple-500">
                                    Webhook — {plataforma}
                                  </DialogTitle>
                                </DialogHeader>
                                {!WEBHOOK_UNMASKED && (
                                  <p className="text-[10px] text-muted-foreground">
                                    Campos sensíveis estão ocultos. Para ambiente de desenvolvimento completo, defina{" "}
                                    <span className="font-mono">VITE_WEBHOOK_PAYLOAD_UNMASKED=true</span>.
                                  </p>
                                )}
                                <div className="bg-black/50 p-4 rounded-xl border border-border/40 max-h-[400px] overflow-y-auto">
                                  <pre className="text-[10px] font-mono text-emerald-400 whitespace-pre-wrap break-all">
                                    {payloadForModal(log)}
                                  </pre>
                                </div>
                                {(log.erro_mensagem || log.error_message) && (
                                  <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-[10px] font-bold">
                                    ERRO: {log.erro_mensagem ?? log.error_message}
                                  </div>
                                )}
                              </DialogContent>
                            </Dialog>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {webhookLogsTotal > WEBHOOK_LOGS_PAGE_SIZE && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-t border-border/50 bg-muted/10">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
                  Página {webhookLogsPage} de {webhookLogsTotalPages} · {webhookLogsTotal} eventos
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="font-bold text-[10px] uppercase"
                    disabled={webhookLogsPage <= 1 || logsQuery.isFetching}
                    onClick={() => setWebhookLogsPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="font-bold text-[10px] uppercase"
                    disabled={webhookLogsPage >= webhookLogsTotalPages || logsQuery.isFetching}
                    onClick={() => setWebhookLogsPage((p) => Math.min(webhookLogsTotalPages, p + 1))}
                  >
                    Seguinte
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

function ChannelCard({ channel, stats }: { channel: ChannelRow; stats?: { pedidos: number; receita: number } }) {
  const label = syncStatusLabel(channel.status_sync, channel.ativo ?? true);
  const aviso = reputacaoAviso(channel.reputacao_json);
  const pedidos = stats?.pedidos ?? 0;
  const receita = stats?.receita ?? 0;
  const isLoja = channel.tipo === "loja_propria";

  return (
    <div className="bg-card border border-border/50 rounded-2xl p-6 space-y-6 shadow-sm hover:border-primary/30 transition-all group">
      <div className="flex items-start justify-between">
        <div
          className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center shadow-lg",
            isLoja ? "bg-primary/10 text-primary" : "bg-yellow-400 text-white",
          )}
        >
          {isLoja ? <Globe className="w-6 h-6" /> : <ShoppingBag className="w-6 h-6" />}
        </div>
        <Badge
          className={cn(
            "border-0 text-[10px] font-black uppercase tracking-widest px-2 py-0.5",
            label === "erro" && "bg-red-500/10 text-red-500",
            label === "sync" && "bg-amber-500/10 text-amber-500",
            label === "inativo" && "bg-muted text-muted-foreground",
            (label === "ok" || label === "") && "bg-emerald-500/10 text-emerald-500",
          )}
        >
          {label === "ok" ? "OK" : label.toUpperCase()}
        </Badge>
      </div>

      <div>
        <h3 className="font-bold text-lg leading-tight">
          {channel.nome_canal?.trim() || channel.plataforma?.trim() || channel.tipo}
        </h3>
        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
          <Clock className="w-3 h-3" /> Última sync: {formatLastSync(channel.last_sync_at)}
        </p>
        {channel.plataforma && channel.nome_canal && (
          <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider">{channel.plataforma}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 py-4 border-y border-border/40">
        <div>
          <span className="text-[9px] font-bold uppercase text-muted-foreground block mb-1">Pedidos (90d)</span>
          <div className="text-lg font-black font-syne">{pedidos}</div>
        </div>
        <div>
          <span className="text-[9px] font-bold uppercase text-muted-foreground block mb-1">Receita (90d)</span>
          <div className="text-lg font-black font-syne text-emerald-500 tabular-nums">{formatBRL(receita)}</div>
        </div>
      </div>

      {channel.erro_sync && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 text-[10px] text-red-400 font-medium">{channel.erro_sync}</div>
      )}

      {aviso && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <div>
            <p className="text-[10px] font-bold text-amber-500 uppercase">Reputação</p>
            <p className="text-[10px] text-amber-200/80 leading-tight">{aviso}</p>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex-1 inline-flex">
                <Button variant="outline" className="flex-1 h-9 text-[10px] font-black uppercase tracking-widest rounded-lg" asChild>
                  <Link to="/dashboard/integracoes">Configurar</Link>
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Gerir integrações e credenciais</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button variant="ghost" className="h-9 w-9 p-0 rounded-lg" asChild aria-label="Abrir integrações">
          <Link to="/dashboard/integracoes">
            <ArrowRight className="w-4 h-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
