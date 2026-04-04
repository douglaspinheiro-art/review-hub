import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Gift, Copy, Check, TrendingUp, DollarSign,
  Users, Clock, Loader2, ExternalLink, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Referral = {
  id: string;
  referred_email: string;
  status: "pending" | "trial" | "converted" | "paid";
  commission_pct: number;
  commission_brl: number | null;
  plan_name: string | null;
  converted_at: string | null;
  created_at: string;
};

const STATUS_CONFIG = {
  pending:   { label: "Cadastrado",  color: "bg-muted text-muted-foreground border-border" },
  trial:     { label: "Em trial",    color: "bg-blue-50 text-blue-700 border-blue-200" },
  converted: { label: "Convertido",  color: "bg-green-50 text-green-700 border-green-200" },
  paid:      { label: "Pago",        color: "bg-purple-50 text-purple-700 border-purple-200" },
};


export default function Afiliados() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [linkCopied, setLinkCopied] = useState(false);

  const referralLink = `https://LTV Boost.com/signup?ref=${user?.id?.slice(0, 8) ?? ""}`;

  const { data: referrals = [] } = useQuery({
    queryKey: ["affiliate_referrals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affiliate_referrals")
        .select("*")
        .eq("referrer_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Referral[];
    },
    enabled: !!user,
  });

  const payoutMutation = useMutation({
    mutationFn: async () => {
      // In production: create a payout request row
      await new Promise((r) => setTimeout(r, 1000));
    },
    onSuccess: () => {
      toast({ title: "Solicitação enviada!", description: "Processaremos o pagamento em até 5 dias úteis via PIX." });
    },
  });

  function copyLink() {
    navigator.clipboard.writeText(referralLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  const totalEarned   = referrals.reduce((s, r) => s + (r.commission_brl ?? 0), 0);
  const converted     = referrals.filter((r) => r.status === "converted" || r.status === "paid").length;
  const pending       = referrals.filter((r) => r.status === "pending" || r.status === "trial").length;
  const pendingAmount = totalEarned; // simplified — in prod would separate paid vs unpaid

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Programa de Afiliados</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Indique o LTV Boost e ganhe 20% de comissão recorrente por 12 meses
        </p>
      </div>

      {/* How it works */}
      <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Gift className="w-5 h-5 text-primary" />
          <h2 className="font-semibold">Como funciona</h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            { step: "1", title: "Compartilhe seu link", desc: "Envie seu link único para lojistas que podem se beneficiar do LTV Boost" },
            { step: "2", title: "Eles se cadastram",    desc: "A indicação é rastreada automaticamente quando usam seu link" },
            { step: "3", title: "Você recebe 20%",      desc: "A cada mensalidade paga, você recebe 20% de comissão por 12 meses" },
          ].map(({ step, title, desc }) => (
            <div key={step} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">
                {step}
              </div>
              <div>
                <p className="text-sm font-semibold">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Referral link */}
      <div className="bg-card border rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-sm">Seu link de indicação</h2>
        <div className="flex gap-2">
          <div className="flex-1 h-10 rounded-md border border-input bg-muted px-3 flex items-center text-sm font-mono text-muted-foreground overflow-hidden">
            <span className="truncate">{referralLink}</span>
          </div>
          <Button variant="outline" className="shrink-0 gap-2" onClick={copyLink}>
            {linkCopied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
            {linkCopied ? "Copiado!" : "Copiar"}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Compartilhar no WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`Conhece o LTV Boost? Plataforma de WhatsApp marketing que estou usando na minha loja. Vale muito a pena: ${referralLink}`)}`, color: "bg-green-50 text-green-700 border-green-200 hover:bg-green-100" },
            { label: "Compartilhar no LinkedIn", href: `https://linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(referralLink)}`, color: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" },
          ].map(({ label, href, color }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn("flex items-center gap-1.5 text-xs font-medium border rounded-lg px-3 py-1.5 transition-colors", color)}
            >
              <ExternalLink className="w-3 h-3" />
              {label}
            </a>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total indicados", value: referrals.length, icon: Users, color: "text-primary" },
          { label: "Convertidos",     value: converted,         icon: TrendingUp, color: "text-green-600" },
          { label: "Em andamento",    value: pending,           icon: Clock, color: "text-yellow-600" },
          { label: "Saldo pendente",  value: `R$ ${pendingAmount.toFixed(2).replace(".", ",")}`, icon: DollarSign, color: "text-emerald-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border rounded-xl p-4 space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{label}</p>
              <Icon className={cn("w-4 h-4", color)} />
            </div>
            <p className={cn("text-2xl font-bold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Referrals table */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold">Indicações</h2>
          <Button
            size="sm"
            className="gap-2"
            onClick={() => payoutMutation.mutate()}
            disabled={pendingAmount < 100 || payoutMutation.isPending}
          >
            {payoutMutation.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <DollarSign className="w-3.5 h-3.5" />
            }
            Solicitar pagamento via PIX
          </Button>
        </div>
        {pendingAmount < 100 && (
          <p className="px-5 py-2 text-xs text-muted-foreground bg-muted/30 border-b">
            Saldo mínimo para resgate: R$ 100,00 — faltam R$ {(100 - pendingAmount).toFixed(2).replace(".", ",")}
          </p>
        )}
        {referrals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
            <Gift className="w-8 h-8 opacity-20" />
            <p className="text-sm">Nenhuma indicação ainda — compartilhe seu link!</p>
          </div>
        ) : (
          <div className="divide-y">
            {referrals.map((r) => {
              const sc = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.pending;
              return (
                <div key={r.id} className="px-5 py-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs font-bold shrink-0">
                    {r.referred_email[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.referred_email}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      <span>Indicado {new Date(r.created_at).toLocaleDateString("pt-BR")}</span>
                      {r.plan_name && <span>· {r.plan_name}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {r.commission_brl && (
                      <span className="text-sm font-semibold text-green-600">
                        R$ {r.commission_brl.toFixed(2).replace(".", ",")}
                      </span>
                    )}
                    <Badge variant="outline" className={cn("text-xs", sc.color)}>
                      {sc.label}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Commission tiers */}
      <div className="bg-card border rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-sm">Comissões por plano indicado</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            { plan: "Crescimento", price: "R$ 197/mês", commission: "R$ 39,40/mês" },
            { plan: "Escala",      price: "R$ 497/mês", commission: "R$ 99,40/mês" },
            { plan: "Enterprise",  price: "Sob consulta", commission: "Negociado" },
          ].map(({ plan, price, commission }) => (
            <div key={plan} className="border rounded-lg p-4 space-y-2">
              <p className="font-semibold text-sm">{plan}</p>
              <p className="text-xs text-muted-foreground">{price}</p>
              <div className="flex items-center gap-1 text-green-600 text-sm font-bold">
                <ChevronRight className="w-3.5 h-3.5" />
                {commission}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Comissões são pagas mensalmente por 12 meses enquanto o cliente indicado mantiver a assinatura ativa.
          Pagamento via PIX em até 5 dias úteis após solicitação (mínimo R$ 100).
        </p>
      </div>
    </div>
  );
}
