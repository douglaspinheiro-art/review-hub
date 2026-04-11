import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShoppingCart,
  Send,
  CheckCircle,
  Clock,
  XCircle,
  TrendingUp,
  Loader2,
  RefreshCw,
  Filter,
  AlertCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { getCurrentUserAndStore } from "@/hooks/useDashboard";
import { useToast } from "@/hooks/use-toast";
import { sendTemplateForConnection, type ConnRow } from "@/lib/meta-whatsapp-client";
import { cn } from "@/lib/utils";
import {
  buildCartRecoveryMessage,
  normalizePhoneDigitsBr,
  parseSafeHttpUrl,
} from "@/lib/carrinho-abandonado-helpers";

const PAGE_SIZE = 20;

type CartStatus = "pending" | "processing" | "message_sent" | "recovered" | "expired";

type Cart = {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  customer_email: string | null;
  customer_id: string | null;
  cart_value: number;
  source: string;
  status: CartStatus;
  message_sent_at: string | null;
  recovered_at: string | null;
  created_at: string;
  recovery_url: string | null;
  abandon_step: string | null;
  external_id: string | null;
  store_id: string | null;
  cart_items: { name: string; qty: number; price: number }[];
};

const STATUS_CONFIG: Record<
  CartStatus,
  { label: string; icon: typeof Clock; color: string }
> = {
  pending: { label: "Pendente", icon: Clock, color: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  processing: { label: "Processando", icon: Loader2, color: "bg-slate-50 text-slate-700 border-slate-200" },
  message_sent: { label: "Msg enviada", icon: Send, color: "bg-blue-50 text-blue-700 border-blue-200" },
  recovered: { label: "Recuperado", icon: CheckCircle, color: "bg-green-50 text-green-700 border-green-200" },
  expired: { label: "Expirado", icon: XCircle, color: "bg-muted text-muted-foreground border-border" },
};

const FILTERS = ["all", "pending", "processing", "message_sent", "recovered", "expired"] as const;
const FILTER_LABELS: Record<string, string> = {
  all: "Todos",
  pending: "Pendentes",
  processing: "Processando",
  message_sent: "Enviados",
  recovered: "Recuperados",
  expired: "Expirados",
};

type PeriodDays = 7 | 30 | 90;

function parseCartRow(row: Record<string, unknown>): Cart {
  const rawSt = typeof row.status === "string" ? row.status : "";
  const st: CartStatus = rawSt in STATUS_CONFIG ? (rawSt as CartStatus) : "pending";
  return {
    id: String(row.id),
    customer_name: (row.customer_name as string | null) ?? null,
    customer_phone: String(row.customer_phone ?? ""),
    customer_email: (row.customer_email as string | null) ?? null,
    customer_id: (row.customer_id as string | null) ?? null,
    cart_value: Number(row.cart_value ?? 0),
    source: String(row.source ?? ""),
    status: st,
    message_sent_at: (row.message_sent_at as string | null) ?? null,
    recovered_at: (row.recovered_at as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    recovery_url: (row.recovery_url as string | null) ?? null,
    abandon_step: (row.abandon_step as string | null) ?? null,
    external_id: (row.external_id as string | null) ?? null,
    store_id: (row.store_id as string | null) ?? null,
    cart_items: Array.isArray(row.cart_items) ? (row.cart_items as Cart["cart_items"]) : [],
  };
}

function extractCartIdsFromScheduledMetadata(rows: { metadata: unknown }[] | null): Set<string> {
  const ids = new Set<string>();
  for (const row of rows ?? []) {
    const m = row.metadata as Record<string, unknown> | null;
    const cid = m?.cart_id;
    if (typeof cid === "string" && cid.length > 0) ids.add(cid);
  }
  return ids;
}

export default function CarrinhoAbandonado() {
  const [filter, setFilter] = useState<string>("all");
  const [periodDays, setPeriodDays] = useState<PeriodDays>(30);
  const [page, setPage] = useState(0);
  const [lojas, setLojas] = useState<{ id: string; name: string }[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [storeListLoading, setStoreListLoading] = useState(true);

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const fetchLojas = useCallback(async () => {
    if (!user?.id) return;
    setStoreListLoading(true);
    const { effectiveUserId } = await getCurrentUserAndStore();
    if (!effectiveUserId) {
      setStoreListLoading(false);
      setLojas([]);
      setSelectedStoreId("");
      return;
    }
    const { data, error } = await supabase.from("stores").select("id, name").eq("user_id", effectiveUserId).order("name");
    if (error) {
      toast({ title: "Erro", description: "Não foi possível carregar as lojas.", variant: "destructive" });
      setLojas([]);
      setSelectedStoreId("");
    } else if (data?.length) {
      setLojas(data);
      setSelectedStoreId((prev) => (prev && data.some((s) => s.id === prev) ? prev : data[0].id));
    } else {
      setLojas([]);
      setSelectedStoreId("");
    }
    setStoreListLoading(false);
  }, [user?.id, toast]);

  useEffect(() => {
    void fetchLojas();
  }, [fetchLojas]);

  useEffect(() => {
    setPage(0);
  }, [filter, periodDays, selectedStoreId]);

  const sinceIso = useMemo(
    () => new Date(Date.now() - periodDays * 86_400_000).toISOString(),
    [periodDays],
  );

  const periodLabel = periodDays === 7 ? "Últimos 7 dias" : periodDays === 30 ? "Últimos 30 dias" : "Últimos 90 dias";

  const scheduledCartIdsQuery = useQuery({
    queryKey: ["scheduled_cart_recovery_ids", user?.id, selectedStoreId],
    queryFn: async () => {
      if (!user?.id) return new Set<string>();
      const { storeId: defaultStoreId, effectiveUserId } = await getCurrentUserAndStore();
      if (!effectiveUserId) return new Set<string>();
      const sid = selectedStoreId || defaultStoreId || null;
      let q = supabase
        .from("scheduled_messages")
        .select("metadata")
        .eq("user_id", effectiveUserId)
        .eq("status", "pending");
      if (sid) q = q.eq("store_id", sid);
      const { data, error } = await q;
      if (error) throw error;
      return extractCartIdsFromScheduledMetadata(data ?? []);
    },
    enabled: !!user?.id && !storeListLoading,
  });

  const cartsQuery = useQuery({
    queryKey: ["abandoned_carts", user?.id, selectedStoreId, filter, periodDays, page],
    queryFn: async () => {
      const { effectiveUserId, storeId: defaultStoreId } = await getCurrentUserAndStore();
      if (!effectiveUserId) throw new Error("Não autenticado");
      const effectiveStoreId = selectedStoreId || defaultStoreId || null;

      const kpiBuilder = supabase.from("abandoned_carts").select("status,cart_value").gte("created_at", sinceIso);
      const kpiQ = effectiveStoreId
        ? kpiBuilder.eq("store_id", effectiveStoreId)
        : kpiBuilder.eq("user_id", effectiveUserId);

      const { data: kpiRows, error: kpiErr } = await kpiQ;
      if (kpiErr) throw kpiErr;

      let listQ = supabase
        .from("abandoned_carts")
        .select("*", { count: "exact" })
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false });
      if (effectiveStoreId) listQ = listQ.eq("store_id", effectiveStoreId);
      else listQ = listQ.eq("user_id", effectiveUserId);
      if (filter !== "all") listQ = listQ.eq("status", filter);

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error, count } = await listQ.range(from, to);
      if (error) throw error;

      const rows = (data ?? []).map((r) => parseCartRow(r as Record<string, unknown>));
      const kr = kpiRows ?? [];
      const kpi = {
        total: kr.length,
        recovered: kr.filter((r) => r.status === "recovered").length,
        pending: kr.filter((r) => r.status === "pending").length,
        totalValue: kr.reduce((s, r) => s + Number(r.cart_value ?? 0), 0),
        recoveredValue: kr.filter((r) => r.status === "recovered").reduce((s, r) => s + Number(r.cart_value ?? 0), 0),
      };

      return { carts: rows, totalCount: count ?? 0, kpi };
    },
    enabled: !!user?.id && !storeListLoading,
  });

  const scheduledCartIds = scheduledCartIdsQuery.data ?? new Set<string>();
  const carts = cartsQuery.data?.carts ?? [];
  const totalCount = cartsQuery.data?.totalCount ?? 0;
  const kpi = cartsQuery.data?.kpi ?? {
    total: 0,
    recovered: 0,
    pending: 0,
    totalValue: 0,
    recoveredValue: 0,
  };

  const recoveryRate = kpi.total > 0 ? Math.round((kpi.recovered / kpi.total) * 100) : 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const canPrev = page > 0;
  const canNext = (page + 1) * PAGE_SIZE < totalCount;

  const pickWaConnection = async (uid: string, storeId: string | null): Promise<ConnRow> => {
    const sel =
      "id, instance_name, status, provider, meta_phone_number_id, meta_default_template_name, meta_api_version, store_id";
    if (storeId) {
      const { data: byStore, error: e1 } = await supabase
        .from("whatsapp_connections")
        .select(sel)
        .eq("user_id", uid)
        .eq("status", "connected")
        .eq("provider", "meta_cloud")
        .eq("store_id", storeId)
        .limit(1)
        .maybeSingle();
      if (!e1 && byStore) return byStore as ConnRow;
    }
    const { data: loose, error: e2 } = await supabase
      .from("whatsapp_connections")
      .select(sel)
      .eq("user_id", uid)
      .eq("status", "connected")
      .eq("provider", "meta_cloud")
      .is("store_id", null)
      .limit(1)
      .maybeSingle();
    if (!e2 && loose) return loose as ConnRow;
    const { data: anyConn, error: e3 } = await supabase
      .from("whatsapp_connections")
      .select(sel)
      .eq("user_id", uid)
      .eq("status", "connected")
      .eq("provider", "meta_cloud")
      .limit(1)
      .maybeSingle();
    if (e3 || !anyConn) {
      throw new Error("Nenhuma conexão WhatsApp ativa. Conecte em Dashboard → WhatsApp.");
    }
    return anyConn as ConnRow;
  };

  const assertMarketingAllowed = async (cart: Cart, storeId: string | null) => {
    if (cart.customer_id) {
      const { data: cu, error } = await supabase
        .from("customers_v3")
        .select("unsubscribed_at")
        .eq("id", cart.customer_id)
        .maybeSingle();
      if (error) return;
      if (cu?.unsubscribed_at) {
        throw new Error("Cliente optou por sair das mensagens de marketing (e-mail/WhatsApp). Envio bloqueado.");
      }
    }
    if (storeId) {
      const phone = normalizePhoneDigitsBr(cart.customer_phone);
      if (phone.length >= 12) {
        const { data: cu } = await supabase
          .from("customers_v3")
          .select("unsubscribed_at")
          .eq("store_id", storeId)
          .eq("phone", phone)
          .maybeSingle();
        if (cu?.unsubscribed_at) {
          throw new Error("Cliente optou por sair das mensagens de marketing (e-mail/WhatsApp). Envio bloqueado.");
        }
      }
    }
  };

  const sendMutation = useMutation({
    mutationFn: async (cart: Cart) => {
      if (!user?.id) throw new Error("Sessão expirada.");
      const { storeId: defaultStoreId, effectiveUserId: tenantUid } = await getCurrentUserAndStore();
      if (!tenantUid) throw new Error("Não autenticado.");
      const storeId = cart.store_id ?? (selectedStoreId || defaultStoreId || null);

      if (scheduledCartIds.has(cart.id)) {
        throw new Error(
          "Este carrinho já entrou na cadência automática (1h / 12h / 48h). Aguarde ou cancele as mensagens agendadas antes de enviar manualmente.",
        );
      }

      await assertMarketingAllowed(cart, storeId);

      const waConns = await pickWaConnection(tenantUid, storeId);
      if (!waConns.meta_phone_number_id?.trim()) {
        throw new Error("Meta Cloud API: informe Phone number ID em Dashboard → WhatsApp → Configurar API.");
      }
      if (!waConns.meta_default_template_name?.trim()) {
        throw new Error(
          "Meta Cloud API: fora da janela de 24h é obrigatório um template aprovado. Defina o template padrão em Configurar API (variáveis compatíveis com o texto enviado).",
        );
      }

      const safeUrl = parseSafeHttpUrl(cart.recovery_url);
      if (!safeUrl) {
        throw new Error(
          "Meta Cloud: este carrinho não tem um link de recuperação (https) válido. Confirme o payload do webhook da loja.",
        );
      }

      const value = cart.cart_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const name = cart.customer_name ?? "cliente";
      const message = buildCartRecoveryMessage({
        customerName: name,
        cartValueFormatted: value,
        recoveryUrl: safeUrl,
      });

      const number = cart.customer_phone.replace(/\D/g, "").startsWith("55")
        ? cart.customer_phone.replace(/\D/g, "")
        : `55${cart.customer_phone.replace(/\D/g, "")}`;

      await sendTemplateForConnection(waConns, {
        number,
        text: message,
        buttons: [{ type: "url", displayText: "Retomar carrinho", content: safeUrl! }],
      });

      const { error: updateErr } = await supabase
        .from("abandoned_carts")
        .update({ status: "message_sent", message_sent_at: new Date().toISOString() })
        .eq("id", cart.id);
      if (updateErr) throw updateErr;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["abandoned_carts"] });
      void queryClient.invalidateQueries({ queryKey: ["scheduled_cart_recovery_ids"] });
      toast({ title: "Mensagem enviada!", description: "O cliente foi notificado via WhatsApp." });
    },
    onError: (err: Error) =>
      toast({
        title: "Erro ao enviar",
        description: err?.message ?? "Tente novamente.",
        variant: "destructive",
      }),
  });

  const showInitialSkeleton = storeListLoading || (cartsQuery.isLoading && !cartsQuery.data);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Carrinhos Abandonados</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitore e recupere clientes que abandonaram o carrinho ({periodLabel.toLowerCase()})
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lojas.length > 1 && (
            <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue placeholder="Loja" />
              </SelectTrigger>
              <SelectContent>
                {lojas.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={String(periodDays)} onValueChange={(v) => setPeriodDays(Number(v) as PeriodDays)}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 dias</SelectItem>
              <SelectItem value="30">30 dias</SelectItem>
              <SelectItem value="90">90 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => void cartsQuery.refetch()}>
            <RefreshCw className={cn("w-3.5 h-3.5", cartsQuery.isFetching && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

      {cartsQuery.isError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
            <span>{(cartsQuery.error as Error)?.message ?? "Não foi possível carregar os carrinhos."}</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => void cartsQuery.refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}

      {/* KPIs — agregados no período (todas as situações) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {showInitialSkeleton
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card border rounded-xl p-4 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))
          : [
              { label: "Total de carrinhos", value: kpi.total, icon: ShoppingCart, sub: periodLabel },
              {
                label: "Recuperados",
                value: kpi.recovered,
                icon: CheckCircle,
                sub: `${recoveryRate}% de recuperação`,
                color: "text-green-600",
              },
              {
                label: "Aguardando envio",
                value: kpi.pending,
                icon: Clock,
                sub: "Status pendente",
                color: "text-yellow-600",
              },
              {
                label: "Receita recuperada",
                value: kpi.recoveredValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
                icon: TrendingUp,
                sub: `de ${kpi.totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em valor de carrinho`,
                color: "text-primary",
              },
            ].map(({ label, value, icon: Icon, sub, color }) => (
              <div key={label} className="bg-card border rounded-xl p-4 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <Icon className={cn("w-4 h-4", color ?? "text-muted-foreground")} />
                </div>
                <p className={cn("text-2xl font-bold", color)}>{value}</p>
                <p className="text-xs text-muted-foreground">{sub}</p>
              </div>
            ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              filter === f
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:bg-muted",
            )}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Filter className="w-3.5 h-3.5" />
          {totalCount} resultado{totalCount !== 1 ? "s" : ""}
        </div>
      </div>

      {!showInitialSkeleton && !cartsQuery.isError && carts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
            <ShoppingCart className="w-7 h-7 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">Nenhum carrinho encontrado</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Configure o webhook de carrinho abandonado na sua loja (URL com <code className="text-xs">store_id</code> da
              LTV Boost). Em{" "}
              <Link to="/dashboard/integracoes" className="text-primary underline font-medium">
                Integrações
              </Link>{" "}
              você encontra os dados da loja e pode alinhar com o time de implantação.
            </p>
          </div>
        </div>
      )}

      {!cartsQuery.isError && carts.length > 0 && (
        <div className="space-y-3">
          {carts.map((cart) => {
              const cfg = STATUS_CONFIG[cart.status] ?? STATUS_CONFIG.expired;
              const Icon = cfg.icon;
              const items = Array.isArray(cart.cart_items) ? cart.cart_items : [];
              const safeRecovery = parseSafeHttpUrl(cart.recovery_url);
              const automationQueued = scheduledCartIds.has(cart.id);
              return (
                <div key={cart.id} className="bg-card border rounded-xl p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{cart.customer_name ?? "Cliente"}</p>
                        <Badge variant="outline" className={cn("text-xs gap-1", cfg.color)}>
                          <Icon className={cn("w-3 h-3", cart.status === "processing" && "animate-spin")} />
                          {cfg.label}
                        </Badge>
                        {automationQueued && cart.status === "pending" && (
                          <Badge variant="secondary" className="text-xs">
                            Cadência agendada
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{cart.customer_phone}</p>
                      {cart.customer_email && (
                        <p className="text-xs text-muted-foreground">{cart.customer_email}</p>
                      )}
                      {cart.external_id && (
                        <p className="text-[11px] text-muted-foreground">ID externo: {cart.external_id}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-primary">
                        {cart.cart_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">{cart.source}</p>
                    </div>
                  </div>

                  {(cart.abandon_step || safeRecovery) && (
                    <div className="flex flex-wrap gap-2 text-xs">
                      {cart.abandon_step && (
                        <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">
                          Etapa: {cart.abandon_step}
                        </span>
                      )}
                      {safeRecovery && (
                        <a
                          href={safeRecovery}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-2 py-1 font-medium hover:underline"
                        >
                          Link de recuperação <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )}

                  {items.length > 0 && (
                    <div className="bg-muted/40 rounded-lg px-3 py-2 text-sm space-y-1">
                      {items.slice(0, 3).map((item, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <span className="text-muted-foreground">
                            {item.qty}x {item.name}
                          </span>
                          <span className="font-medium text-xs">
                            {(item.price * item.qty).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                          </span>
                        </div>
                      ))}
                      {items.length > 3 && (
                        <p className="text-xs text-muted-foreground">+{items.length - 3} itens</p>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Abandonado{" "}
                      {new Date(cart.created_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {cart.message_sent_at && (
                      <span>
                        Enviado{" "}
                        {new Date(cart.message_sent_at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>

                  {cart.status === "pending" && (
                    <div className="space-y-2">
                      {automationQueued && (
                        <p className="text-[11px] text-muted-foreground bg-muted/60 border rounded-md px-2 py-1">
                          Cadência automática já enfileirada para este carrinho. O envio manual está desativado para
                          evitar mensagens duplicadas.
                        </p>
                      )}
                      {cart.cart_value >= 800 && (
                        <p className="text-[11px] text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-md px-2 py-1">
                          Carrinho de alto ticket: recomendamos handoff para atendimento humano se não converter na 3ª
                          tentativa.
                        </p>
                      )}
                      <Button
                        size="sm"
                        className="gap-2"
                        onClick={() => sendMutation.mutate(cart)}
                        disabled={sendMutation.isPending || automationQueued}
                      >
                        {sendMutation.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        Enviar mensagem de recuperação
                      </Button>
                    </div>
                  )}
                </div>
              );
          })}

          {totalCount > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" disabled={!canPrev} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                Página {page + 1} de {totalPages}
              </span>
              <Button type="button" variant="outline" size="sm" disabled={!canNext} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="bg-muted/50 border rounded-xl p-4 text-sm text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Como funciona a automação</p>
        <p>Quando um carrinho é abandonado no seu e-commerce, o webhook envia os dados para o LTV Boost.</p>
        <p>
          A cadência padrão agenda 3 contatos automáticos: <strong>1h, 12h e 48h</strong> com personalização por valor
          e comportamento.
        </p>
        <p>Para carrinhos de alto ticket, a 3ª etapa recomenda handoff para atendimento humano.</p>
        <p className="text-xs mt-2">
          Configure o segredo e a URL do webhook na documentação da sua plataforma, apontando para a Edge Function{" "}
          <code className="text-xs">webhook-cart</code> com o <code className="text-xs">store_id</code> da loja.
        </p>
      </div>
    </div>
  );
}
