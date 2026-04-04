import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShoppingCart, Send, CheckCircle, Clock, XCircle,
  TrendingUp, Loader2, RefreshCw, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { sendText } from "@/lib/evolution-api";
import { cn } from "@/lib/utils";

type Cart = {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  customer_email: string | null;
  cart_value: number;
  source: string;
  status: "pending" | "message_sent" | "recovered" | "expired";
  message_sent_at: string | null;
  recovered_at: string | null;
  created_at: string;
  cart_items: { name: string; qty: number; price: number }[];
};

const STATUS_CONFIG = {
  pending:      { label: "Pendente",     icon: Clock,        color: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  message_sent: { label: "Msg enviada",  icon: Send,         color: "bg-blue-50 text-blue-700 border-blue-200" },
  recovered:    { label: "Recuperado",   icon: CheckCircle,  color: "bg-green-50 text-green-700 border-green-200" },
  expired:      { label: "Expirado",     icon: XCircle,      color: "bg-muted text-muted-foreground border-border" },
};

const FILTERS = ["all", "pending", "message_sent", "recovered", "expired"] as const;
const FILTER_LABELS: Record<string, string> = {
  all: "Todos", pending: "Pendentes", message_sent: "Enviados", recovered: "Recuperados", expired: "Expirados",
};

export default function CarrinhoAbandonado() {
  const [filter, setFilter] = useState<string>("all");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: carts = [], isLoading, refetch } = useQuery({
    queryKey: ["abandoned_carts", filter],
    queryFn: async () => {
      let q = supabase
        .from("abandoned_carts")
        .select("*")
        .order("created_at", { ascending: false });
      if (filter !== "all") q = q.eq("status", filter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Cart[];
    },
    enabled: !!user,
  });

  const sendMutation = useMutation({
    mutationFn: async (cart: Cart) => {
      // 1. Get user's active WhatsApp connection with Evolution API config
      const { data: waConns, error: waErr } = await supabase
        .from("whatsapp_connections")
        .select("instance_name, evolution_api_url, evolution_api_key")
        .eq("user_id", user!.id)
        .eq("status", "connected")
        .limit(1)
        .single();

      if (waErr || !waConns) {
        throw new Error("Nenhuma conexão WhatsApp ativa. Conecte o WhatsApp em Configurações.");
      }
      if (!waConns.evolution_api_url || !waConns.evolution_api_key) {
        throw new Error("Evolution API não configurada. Configure em Configurações → WhatsApp API.");
      }

      // 2. Build recovery message
      const name = cart.customer_name ?? "cliente";
      const value = cart.cart_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const message = `Olá ${name}! 👋 Você deixou ${value} em itens no carrinho.\n\nSua seleção ainda está guardada. Finalize sua compra agora e garanta seus produtos! 🛍️`;

      // 3. Send WhatsApp message via Evolution API
      await sendText(
        { baseUrl: waConns.evolution_api_url, apiKey: waConns.evolution_api_key },
        waConns.instance_name,
        { number: cart.customer_phone, text: message }
      );

      // 4. Update cart status in DB
      const { error: updateErr } = await supabase
        .from("abandoned_carts")
        .update({ status: "message_sent", message_sent_at: new Date().toISOString() })
        .eq("id", cart.id);
      if (updateErr) throw updateErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["abandoned_carts"] });
      toast({ title: "Mensagem enviada!", description: "O cliente foi notificado via WhatsApp." });
    },
    onError: (err: Error) => toast({
      title: "Erro ao enviar",
      description: err?.message ?? "Tente novamente.",
      variant: "destructive",
    }),
  });

  // KPIs
  const total = carts.length;
  const recovered = carts.filter((c) => c.status === "recovered").length;
  const pending = carts.filter((c) => c.status === "pending").length;
  const recoveryRate = total > 0 ? Math.round((recovered / total) * 100) : 0;
  const totalValue = carts.reduce((s, c) => s + c.cart_value, 0);
  const recoveredValue = carts.filter((c) => c.status === "recovered")
    .reduce((s, c) => s + c.cart_value, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Carrinhos Abandonados</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitore e recupere clientes que abandonaram o carrinho
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5" />
          Atualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total de carrinhos", value: total, icon: ShoppingCart, sub: "Últimos 30 dias" },
          { label: "Recuperados", value: recovered, icon: CheckCircle, sub: `${recoveryRate}% de recuperação`, color: "text-green-600" },
          { label: "Aguardando envio", value: pending, icon: Clock, sub: "Precisam de ação", color: "text-yellow-600" },
          {
            label: "Receita recuperada",
            value: recoveredValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
            icon: TrendingUp,
            sub: `de ${totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} total`,
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
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              filter === f
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:bg-muted"
            )}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Filter className="w-3.5 h-3.5" />
          {carts.length} resultado{carts.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Empty state */}
      {!isLoading && carts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
            <ShoppingCart className="w-7 h-7 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">Nenhum carrinho encontrado</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Configure o webhook de carrinho abandonado em <strong>Configurações</strong> para começar a capturar dados do seu e-commerce.
            </p>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Cart list */}
      {!isLoading && carts.length > 0 && (
        <div className="space-y-3">
          {carts.map((cart) => {
            const cfg = STATUS_CONFIG[cart.status] ?? STATUS_CONFIG.expired;
            const Icon = cfg.icon;
            const items = Array.isArray(cart.cart_items) ? cart.cart_items : [];
            return (
              <div key={cart.id} className="bg-card border rounded-xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{cart.customer_name ?? "Cliente"}</p>
                      <Badge variant="outline" className={cn("text-xs gap-1", cfg.color)}>
                        <Icon className="w-3 h-3" />
                        {cfg.label}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{cart.customer_phone}</p>
                    {cart.customer_email && (
                      <p className="text-xs text-muted-foreground">{cart.customer_email}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-primary">
                      {cart.cart_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">{cart.source}</p>
                  </div>
                </div>

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
                    Abandonado {new Date(cart.created_at).toLocaleString("pt-BR", {
                      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                  {cart.message_sent_at && (
                    <span>Enviado {new Date(cart.message_sent_at).toLocaleString("pt-BR", {
                      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                    })}</span>
                  )}
                </div>

                {cart.status === "pending" && (
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={() => sendMutation.mutate(cart)}
                    disabled={sendMutation.isPending}
                  >
                    {sendMutation.isPending
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Send className="w-3.5 h-3.5" />
                    }
                    Enviar mensagem de recuperação
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Webhook info */}
      <div className="bg-muted/50 border rounded-xl p-4 text-sm text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Como funciona a automação</p>
        <p>Quando um carrinho é abandonado no seu e-commerce, o webhook envia os dados para o LTV Boost.</p>
        <p>Uma mensagem personalizada é enviada automaticamente após <strong>15–60 minutos</strong> com um link para retomar a compra.</p>
        <p className="text-xs mt-2">Configure o webhook em <strong>Configurações → Webhooks de E-commerce</strong>.</p>
      </div>
    </div>
  );
}
