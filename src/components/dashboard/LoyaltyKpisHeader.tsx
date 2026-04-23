import { Users, Coins, TrendingDown, Trophy } from "lucide-react";
import { useLoyaltyKpis } from "@/hooks/useLoyaltyKpis";
import { Skeleton } from "@/components/ui/skeleton";
import { DataSourceBadge } from "@/components/dashboard/trust/DataSourceBadge";
import { loyaltyTierLabel } from "@/lib/loyalty-labels";

function fmt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
}

export function LoyaltyKpisHeader() {
  const { data, isLoading } = useLoyaltyKpis();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  const k = data ?? {
    active_members: 0,
    points_circulating: 0,
    points_redeemed: 0,
    redemption_rate_pct: 0,
    tier_counts: {},
  };
  const topTier = Object.entries(k.tier_counts ?? {}).sort((a, b) => b[1] - a[1])[0];

  const cards = [
    { label: "Membros ativos", value: fmt(k.active_members), icon: Users, color: "text-blue-500" },
    { label: "Pontos em circulação", value: fmt(k.points_circulating), icon: Coins, color: "text-amber-500" },
    {
      label: "Taxa de resgate",
      value: `${k.redemption_rate_pct.toFixed(1)}%`,
      icon: TrendingDown,
      color: "text-emerald-500",
    },
    {
      label: "Tier dominante",
      value: topTier ? `${loyaltyTierLabel(topTier[0])} (${fmt(topTier[1])})` : "—",
      icon: Trophy,
      color: "text-purple-500",
    },
  ];

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <DataSourceBadge source="real" origin="RPC get_loyalty_kpis_v1 (loyalty_balances + loyalty_transactions)" />
        
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{c.label}</span>
                <Icon className={`w-4 h-4 ${c.color}`} />
              </div>
              <div className="text-xl font-bold tabular-nums">{c.value}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
