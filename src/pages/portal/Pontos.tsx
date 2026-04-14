import { useState } from "react";
import { useParams } from "react-router-dom";
import { Trophy, Star, Gift, Clock, Loader2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { LOYALTY_REASON_LABELS } from "@/lib/loyalty-labels";

const TIER_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string; next?: string; nextPoints?: number }> = {
  bronze: {
    label: "Bronze",
    color: "text-amber-700",
    bg: "bg-amber-100",
    icon: "🥉",
    next: "Prata",
    nextPoints: 500,
  },
  silver: {
    label: "Prata",
    color: "text-slate-600",
    bg: "bg-slate-100",
    icon: "🥈",
    next: "Ouro",
    nextPoints: 1500,
  },
  gold: {
    label: "Ouro",
    color: "text-yellow-600",
    bg: "bg-yellow-50",
    icon: "🥇",
    next: "Diamante",
    nextPoints: 5000,
  },
  diamond: {
    label: "Diamante",
    color: "text-cyan-600",
    bg: "bg-cyan-50",
    icon: "💎",
  },
};

interface LoyaltyData {
  points: number;
  tier: string;
  total_earned: number;
  total_redeemed: number;
  transactions: {
    points: number;
    reason: string;
    description: string | null;
    created_at: string;
  }[];
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "Hoje";
  if (d === 1) return "Ontem";
  if (d < 30) return `${d} dias atrás`;
  const m = Math.floor(d / 30);
  if (m < 12) return `${m} ${m === 1 ? "mês" : "meses"} atrás`;
  return `${Math.floor(m / 12)} anos atrás`;
}

export default function Pontos() {
  const { slug } = useParams<{ slug: string }>();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<LoyaltyData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleLookup() {
    if (!phone.trim() || !slug) return;
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const { data: result, error: rpcError } = await supabase.rpc("resolve_loyalty_by_phone", {
        p_slug: slug,
        p_phone: phone.trim(),
      });

      if (rpcError) throw rpcError;

      const payload = result as unknown as { error?: string } & LoyaltyData;
      if (payload.error) {
        setError(payload.error);
      } else {
        setData(payload as LoyaltyData);
      }
    } catch (err) {
      setError("Erro ao consultar pontos. Tente novamente.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const tier = data ? (TIER_CONFIG[data.tier] ?? TIER_CONFIG.bronze) : null;
  const progressToNext = data && tier?.nextPoints
    ? Math.min(Math.round((data.total_earned / tier.nextPoints) * 100), 100)
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/10 flex flex-col items-center justify-start p-4 pt-10">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Trophy className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Programa de Fidelidade</h1>
          <p className="text-muted-foreground text-sm">
            Digite seu número de celular para consultar seus pontos
          </p>
        </div>

        {/* Phone lookup card */}
        {!data && (
          <div className="bg-card border rounded-2xl p-6 space-y-4 shadow-sm">
            <div className="space-y-2">
              <label className="text-sm font-medium">Número de celular</label>
              <div className="flex gap-2">
                <Input
                  type="tel"
                  placeholder="(11) 99999-9999"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                  className="flex-1"
                />
                <Button onClick={handleLookup} disabled={!phone.trim() || loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                </Button>
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Apenas o número cadastrado na loja tem acesso aos pontos
            </p>
          </div>
        )}

        {/* Results */}
        {data && tier && (
          <>
            {/* Points card */}
            <div className={cn("rounded-2xl p-6 shadow-sm", tier.bg)}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Seus pontos</p>
                  <p className="text-4xl font-bold mt-1">{data.points.toLocaleString("pt-BR")}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatPhone(phone)}</p>
                </div>
                <div className="text-right space-y-1">
                  <span className={cn("text-3xl")}>{tier.icon}</span>
                  <p className={cn("text-sm font-bold", tier.color)}>{tier.label}</p>
                </div>
              </div>

              {progressToNext !== null && tier.nextPoints && (
                <div className="mt-4 space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Progresso para {tier.next}</span>
                    <span>{data.total_earned.toLocaleString("pt-BR")} / {tier.nextPoints.toLocaleString("pt-BR")} pts</span>
                  </div>
                  <div className="h-2 bg-white/50 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${progressToNext}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Faltam {(tier.nextPoints - data.total_earned).toLocaleString("pt-BR")} pontos para {tier.next}
                  </p>
                </div>
              )}

              {!tier.next && (
                <p className="mt-3 text-xs font-medium text-cyan-700">
                  🎉 Você está no nível máximo!
                </p>
              )}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Total ganho", value: data.total_earned.toLocaleString("pt-BR"), icon: Star },
                { label: "Resgatado", value: data.total_redeemed.toLocaleString("pt-BR"), icon: Gift },
                { label: "Disponível", value: data.points.toLocaleString("pt-BR"), icon: Trophy },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="bg-card border rounded-xl p-3 text-center">
                  <Icon className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
                  <p className="font-bold text-sm">{value}</p>
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            {/* Transaction history */}
            {data.transactions.length > 0 && (
              <div className="bg-card border rounded-2xl overflow-hidden shadow-sm">
                <div className="px-4 py-3 border-b">
                  <p className="font-medium text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    Histórico de pontos
                  </p>
                </div>
                <div className="divide-y">
                  {data.transactions.map((tx, i) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{LOYALTY_REASON_LABELS[tx.reason] ?? tx.reason}</p>
                        {tx.description && (
                          <p className="text-xs text-muted-foreground truncate">{tx.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground">{timeAgo(tx.created_at)}</p>
                      </div>
                      <span className={cn(
                        "text-sm font-bold shrink-0",
                        tx.points >= 0 ? "text-green-600" : "text-red-500"
                      )}>
                        {tx.points >= 0 ? "+" : ""}{tx.points.toLocaleString("pt-BR")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.transactions.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-sm">
                <Gift className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Nenhuma transação ainda
              </div>
            )}

            {/* Back button */}
            <button
              onClick={() => { setData(null); setPhone(""); setError(null); }}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
            >
              ← Consultar outro número
            </button>
          </>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground pb-6">
          Powered by{" "}
          <span className="font-semibold text-primary">LTV Boost</span>
        </p>
      </div>
    </div>
  );
}
