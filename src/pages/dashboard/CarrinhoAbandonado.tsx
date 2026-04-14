import { useMemo, useState } from "react";
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
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useStoreScope } from "@/contexts/StoreScopeContext";
import { useToast } from "@/hooks/use-toast";
import { useWhatsAppSender } from "@/hooks/useWhatsAppSender";
import { cn } from "@/lib/utils";
import {
  buildCartRecoveryMessage,
  normalizePhoneDigitsBr,
  parseSafeHttpUrl,
} from "@/lib/carrinho-abandonado-helpers";
import { PAGE_SIZE_CARTS as PAGE_SIZE } from "@/lib/pagination-constants";

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
  pending: {
    label: "Pendente",
    icon: Clock,
    color: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25",
  },
  processing: {
    label: "Processando",
    icon: Loader2,
    color: "bg-muted text-foreground border-border",
  },
  message_sent: {
    label: "Msg enviada",
    icon: Send,
    color: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/25",
  },
  recovered: {
    label: "Recuperado",
    icon: CheckCircle,
    color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
  },
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

function parseCartRow(row: any): Cart {
  const rawSt = typeof row.status === "string" ? row.status : "";
  const st: CartStatus = rawSt in STATUS_CONFIG ? (rawSt as CartStatus) : "pending";
  return {
    id: String(row.id),
    customer_name: row.customer_name ?? null,
    customer_phone: String(row.customer_phone ?? ""),
    customer_email: row.customer_email ?? null,
    customer_id: row.customer_id ?? null,
    cart_value: Number(row.cart_value ?? 0),
    source: String(row.source ?? ""),
    status: st,
    message_sent_at: row.message_sent_at ?? null,
    recovered_at: row.recovered_at ?? null,
    created_at: String(row.created_at ?? ""),
    recovery_url: row.recovery_url ?? null,
    abandon_step: row.abandon_step ?? null,
    external_id: row.external_id ?? null,
    store_id: row.store_id ?? null,
    cart_items: Array.isArray(row.cart_items) ? row.cart_items : [],
  };
}

export default function CarrinhoAbandonado() {
  const [filter, setFilter] = useState<string>("all");
  const [periodDays, setPeriodDays] = useState<PeriodDays>(30);
  const [cursorIdx, setCursorIdx] = useState(0);
  const [cursors, setCursorList] = useState<Array<string | null>>([null]);
  const [lojas, setLojas] = useState<{ id: string; name: string }[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [storeListLoading, setStoreListLoading] = useState(true);

  const { user } = useAuth();
  const scope = useStoreScope();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    async function fetchLojas() {
      if (!user?.id) return;
      const effectiveUserId = scope.effectiveUserId;
      if (!effectiveUserId) return;
      const { data } = await supabase.from("stores").select("id, name").eq("user_id", effectiveUserId).order("name");
      if (data?.length) {
        setLojas(data);
        setSelectedStoreId((prev) => (prev && data.some((s) => s.id === prev) ? prev : data[0].id));
      }
      setStoreListLoading(false);
    }
    void fetchLojas();
  }, [user?.id, scope.effectiveUserId]);

  useEffect(() => {
    setCursorIdx(0);
    setCursorList([null]);
  }, [filter, periodDays, selectedStoreId]);

  const sinceIso = useMemo(
    () => new Date(Date.now() - periodDays * 86_400_000).toISOString(),
    [periodDays],
  );

  const cartsQuery = useQuery({
    queryKey: ["abandoned_carts_v2", user?.id, selectedStoreId, filter, periodDays, cursors[cursorIdx]],
    queryFn: async () => {
      const effectiveStoreId = selectedStoreId || scope.activeStoreId;
      if (!effectiveStoreId) return null;

      const { data, error } = await supabase.rpc("get_abandoned_carts_v2", {
        p_store_id: effectiveStoreId,
        p_since: sinceIso,
        p_status: filter,
        p_cursor_created_at: cursors[cursorIdx],
        p_limit: PAGE_SIZE
      });

      if (error) throw error;
      const res = data as { rows?: unknown[]; total_count?: number; kpi?: unknown };
      return {
        carts: (res.rows || []).map(parseCartRow),
        totalCount: Number(res.total_count ?? 0),
        kpi: res.kpi,
      };
    },
    enabled: !!user?.id && !storeListLoading && (!!selectedStoreId || !!scope.activeStoreId),
    staleTime: 30_000,
  });

  const carts = cartsQuery.data?.carts ?? [];
  const totalCount = cartsQuery.data?.totalCount ?? 0;
  const kpi = cartsQuery.data?.kpi ?? { total: 0, recovered: 0, pending: 0, total_value: 0, recovered_value: 0 };
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const recoveryRate = kpi.total > 0 ? Math.round((kpi.recovered / kpi.total) * 100) : 0;

  const nextCursor = carts.length === PAGE_SIZE ? carts[carts.length - 1].created_at : null;

  const { sendMessage, sendTemplateButton, isReady: isWaReady } = useWhatsAppSender();

  const sendMutation = useMutation({
    mutationFn: async (cart: Cart) => {
      if (!isWaReady) {
        throw new Error("WhatsApp não está conectado ou configurado.");
      }

      const recoveryUrl = parseSafeHttpUrl(cart.recovery_url);
      const text = buildCartRecoveryMessage({
        customerName: cart.customer_name || "cliente",
        cartValueFormatted: cart.cart_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        recoveryUrl: null, // Link goes in the button if possible
      });

      let result;
      if (recoveryUrl) {
        result = await sendTemplateButton(cart.customer_phone, text, {
          label: "Finalizar Compra",
          url: recoveryUrl,
        });
      } else {
        result = await sendMessage(cart.customer_phone, text);
      }

      if (!result.success) {
        throw new Error(result.error || "Falha ao enviar mensagem.");
      }

      const { error: updateError } = await supabase
        .from("abandoned_carts")
        .update({
          status: "message_sent",
          message_sent_at: new Date().toISOString(),
          external_id: result.external_id,
        })
        .eq("id", cart.id);

      if (updateError) throw updateError;
      
      return result;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["abandoned_carts_v2"] });
      toast({ title: "Mensagem enviada!", description: "O cliente foi notificado." });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Erro ao enviar",
        description: err.message,
      });
    }
  });

  const showInitialSkeleton = storeListLoading || (cartsQuery.isLoading && !cartsQuery.data);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold font-syne uppercase italic tracking-tighter">Carrinhos <span className="text-primary">Abandonados</span></h1>
          <p className="text-muted-foreground text-sm mt-1">
            Recupere vendas perdidas com cadência inteligente.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lojas.length > 1 && (
            <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
              <SelectTrigger className="w-[180px] h-9 rounded-xl">
                <SelectValue placeholder="Loja" />
              </SelectTrigger>
              <SelectContent>
                {lojas.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={String(periodDays)} onValueChange={(v) => setPeriodDays(Number(v) as PeriodDays)}>
            <SelectTrigger className="w-[120px] h-9 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 dias</SelectItem>
              <SelectItem value="30">30 dias</SelectItem>
              <SelectItem value="90">90 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-9 rounded-xl gap-2" onClick={() => void cartsQuery.refetch()}>
            <RefreshCw className={cn("w-3.5 h-3.5", cartsQuery.isFetching && "animate-spin")} /> Atualizar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {showInitialSkeleton
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)
          : [
              { label: "Total no período", value: kpi.total, icon: ShoppingCart, color: "text-foreground" },
              { label: "Recuperados", value: kpi.recovered, icon: CheckCircle, color: "text-emerald-500", sub: `${recoveryRate}% taxa` },
              { label: "Aguardando", value: kpi.pending, icon: Clock, color: "text-amber-500" },
              { label: "Valor Recuperado", value: kpi.recovered_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), icon: TrendingUp, color: "text-primary", sub: `de ${kpi.total_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` },
            ].map((item) => (
              <div key={item.label} className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">{item.label}</p>
                  <item.icon className={cn("w-3.5 h-3.5", item.color)} />
                </div>
                <p className={cn("text-xl font-black", item.color)}>{item.value}</p>
                {item.sub && <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{item.sub}</p>}
              </div>
            ))}
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-bold border transition-all",
              filter === f ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20" : "bg-card text-muted-foreground border-border hover:bg-muted"
            )}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
        <div className="ml-auto text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          {totalCount} abandonos
        </div>
      </div>

      {showInitialSkeleton ? (
        <TableSkeleton columns={5} rows={8} />
      ) : cartsQuery.isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
          <p className="text-sm font-medium text-destructive">Não foi possível carregar os carrinhos</p>
          <p className="text-xs text-muted-foreground">{(cartsQuery.error as Error)?.message ?? "Tente novamente."}</p>
          <Button variant="outline" size="sm" onClick={() => void cartsQuery.refetch()}>Tentar novamente</Button>
        </div>
      ) : carts.length === 0 ? (
        <div className="bg-card border border-dashed rounded-3xl py-20 text-center">
          <ShoppingCart className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="font-bold">Nenhum carrinho encontrado</p>
          <p className="text-sm text-muted-foreground">Aguardando sinais do seu e-commerce.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {carts.map((cart) => {
            const cfg = STATUS_CONFIG[cart.status] ?? STATUS_CONFIG.expired;
            return (
              <div key={cart.id} className="bg-card border border-border/40 rounded-2xl p-5 hover:border-primary/30 transition-colors shadow-sm group">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-bold">{cart.customer_name || "Cliente sem nome"}</p>
                      <Badge variant="outline" className={cn("text-[9px] uppercase font-black tracking-widest", cfg.color)}>
                        {cfg.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">{cart.customer_phone}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-primary">
                      {cart.cart_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </p>
                    <p className="text-[10px] uppercase font-black text-muted-foreground">{cart.source}</p>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                  <span>Abandonado em {new Date(cart.created_at).toLocaleString("pt-BR")}</span>
                  <div className="flex gap-3">
                    {cart.recovery_url && (
                      <a href={cart.recovery_url} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1">
                        Ver Carrinho <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[10px] font-black uppercase tracking-widest gap-1 hover:bg-primary/10 hover:text-primary rounded-lg"
                      onClick={() => sendMutation.mutate(cart)}
                      disabled={(sendMutation.isPending && sendMutation.variables?.id === cart.id) || cart.status === "recovered" || !isWaReady}
                    >
                      {sendMutation.isPending && sendMutation.variables?.id === cart.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Send className="w-3 h-3" />
                      )}
                      Recuperar
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-4">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl font-bold h-9"
                disabled={cursorIdx === 0 || cartsQuery.isFetching}
                onClick={() => setCursorIdx(i => i - 1)}
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
              </Button>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Página {cursorIdx + 1} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl font-bold h-9"
                disabled={cursorIdx >= totalPages - 1 || cartsQuery.isFetching || !nextCursor}
                onClick={() => {
                  if (nextCursor && !cursors[cursorIdx + 1]) {
                    setCursorList(prev => {
                      const next = [...prev];
                      next[cursorIdx + 1] = nextCursor;
                      return next;
                    });
                  }
                  setCursorIdx(i => i + 1);
                }}
              >
                Próxima <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
