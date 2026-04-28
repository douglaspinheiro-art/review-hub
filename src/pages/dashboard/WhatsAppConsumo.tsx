import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, MessageSquare, Package, AlertTriangle, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { useStoreScopeOptional } from "@/contexts/StoreScopeContext";

type UsageRow = {
  usage_date: string;
  category: string;
  messages_count: number;
  price_brl_total: number;
};

type Wallet = {
  store_id: string;
  included_quota: number;
  used_in_cycle: number;
  purchased_balance: number;
  cycle_start: string;
  cycle_end: string;
  soft_limit_pct: number;
  status: string;
};

type Pack = {
  id: string;
  name: string;
  messages_count: number;
  price_brl: number;
  category: string;
};

const CATEGORY_LABEL: Record<string, string> = {
  marketing: "Marketing",
  utility: "Utilidade",
  authentication: "Autenticação",
  service: "Serviço",
};

function formatBRL(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export default function WhatsAppConsumo() {
  const scope = useStoreScopeOptional();
  const storeId = scope?.activeStoreId ?? null;

  const walletQ = useQuery({
    queryKey: ["wa-wallet", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("wa_wallet_ensure", { p_store_id: storeId as string });
      if (error) throw error;
      return data as unknown as Wallet;
    },
  });

  const usageQ = useQuery({
    queryKey: ["wa-usage", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("wa_usage_summary_for_store", {
        p_store_id: storeId as string,
        p_days: 30,
      });
      if (error) throw error;
      return (data ?? []) as UsageRow[];
    },
  });

  const packsQ = useQuery({
    queryKey: ["wa-packs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_message_packs")
        .select("id, name, messages_count, price_brl, category")
        .eq("active", true)
        .order("messages_count", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Pack[];
    },
  });

  const wallet = walletQ.data;
  const usage = usageQ.data ?? [];

  const totals = useMemo(() => {
    const byCategory = new Map<string, number>();
    let totalMsgs = 0;
    for (const r of usage) {
      byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.messages_count);
      totalMsgs += r.messages_count;
    }
    return { byCategory, totalMsgs };
  }, [usage]);

  const quotaPct = wallet && wallet.included_quota > 0
    ? Math.min(100, Math.round((wallet.used_in_cycle / wallet.included_quota) * 100))
    : 0;

  const remainingQuota = wallet ? Math.max(0, wallet.included_quota - wallet.used_in_cycle) : 0;
  const totalAvailable = wallet ? remainingQuota + wallet.purchased_balance : 0;

  const isLoading = walletQ.isLoading || usageQ.isLoading;

  if (!storeId) {
    return (
      <div className="p-8">
        <Card className="p-8 text-center">
          <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Selecione uma loja para ver o consumo do WhatsApp.</p>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">Consumo do WhatsApp</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Acompanhe o uso de mensagens do ciclo atual e gerencie pacotes adicionais.
        </p>
      </div>

      {wallet?.status === "suspended" && (
        <Card className="p-4 border-destructive/40 bg-destructive/5 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-destructive">Envios suspensos</p>
            <p className="text-muted-foreground">
              Sua conta atingiu o limite configurado. Compre um pacote ou ajuste o limite para retomar os envios.
            </p>
          </div>
        </Card>
      )}

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Franquia do plano</p>
          <div className="text-2xl font-mono font-semibold">
            {wallet?.used_in_cycle.toLocaleString("pt-BR") ?? 0}
            <span className="text-sm text-muted-foreground font-sans font-normal">
              {" "}/ {wallet?.included_quota.toLocaleString("pt-BR") ?? 0}
            </span>
          </div>
          <Progress value={quotaPct} className="h-2 mt-3" />
          <p className="text-xs text-muted-foreground mt-2">
            {remainingQuota.toLocaleString("pt-BR")} restantes no ciclo
          </p>
        </Card>

        <Card className="p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Pacotes adicionais</p>
          <div className="text-2xl font-mono font-semibold">
            {wallet?.purchased_balance.toLocaleString("pt-BR") ?? 0}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Mensagens compradas que não expiram no ciclo.
          </p>
        </Card>

        <Card className="p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Saldo total disponível</p>
          <div className="text-2xl font-mono font-semibold text-primary">
            {totalAvailable.toLocaleString("pt-BR")}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Ciclo: {wallet ? `${formatDate(wallet.cycle_start)} → ${formatDate(wallet.cycle_end)}` : "—"}
          </p>
        </Card>
      </div>

      {/* Consumo por categoria */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Consumo por categoria (30 dias)</h2>
          <Badge variant="secondary" className="font-mono">
            {totals.totalMsgs.toLocaleString("pt-BR")} mensagens
          </Badge>
        </div>
        {totals.totalMsgs === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            <Sparkles className="mx-auto h-8 w-8 mb-2 opacity-50" />
            Nenhum envio registrado ainda. Quando suas campanhas dispararem, o consumo aparece aqui.
          </div>
        ) : (
          <div className="space-y-3">
            {Array.from(totals.byCategory.entries()).map(([cat, count]) => {
              const pct = totals.totalMsgs > 0 ? (count / totals.totalMsgs) * 100 : 0;
              return (
                <div key={cat}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-foreground">{CATEGORY_LABEL[cat] ?? cat}</span>
                    <span className="font-mono text-muted-foreground">
                      {count.toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Pacotes disponíveis */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-1">
          <Package className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Comprar mensagens adicionais</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Pacotes não expiram e somam ao saldo da carteira.
        </p>
        {packsQ.isLoading ? (
          <div className="py-6 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (packsQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhum pacote disponível no momento.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {(packsQ.data ?? []).map((pack) => (
              <div
                key={pack.id}
                className="rounded-lg border border-border p-4 flex flex-col gap-3"
              >
                <div>
                  <p className="text-sm text-muted-foreground">{pack.name}</p>
                  <p className="text-2xl font-mono font-semibold">
                    {pack.messages_count.toLocaleString("pt-BR")}
                  </p>
                  <p className="text-xs text-muted-foreground">mensagens · {CATEGORY_LABEL[pack.category] ?? pack.category}</p>
                </div>
                <div className="flex items-end justify-between mt-auto">
                  <span className="text-lg font-semibold">{formatBRL(pack.price_brl)}</span>
                  <Button
                    size="sm"
                    disabled={buyingId === pack.id || !activeStoreId}
                    onClick={() => handleBuyPack(pack.id)}
                  >
                    {buyingId === pack.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Comprar"
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}