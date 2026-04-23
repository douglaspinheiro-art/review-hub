import { useQuery } from "@tanstack/react-query";
import { Heart, Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useLoja } from "@/hooks/useConvertIQ";
import { cn } from "@/lib/utils";

type ISLResult = {
  insufficient_data: boolean;
  reason?: string;
  days_remaining?: number;
  customers_needed?: number;
  isl_score?: number;
  isl_label?: string;
  breakdown?: { chs: number; engagement: number; rfm_health: number; revenue_trend: number };
};

type StoreISL = { isl_score: number | null; isl_label: string | null; isl_history: Array<{ date: string; score: number }> | null };

function useISL(storeId: string | null) {
  return useQuery({
    queryKey: ["store-isl", storeId],
    enabled: !!storeId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ result: ISLResult; history: Array<{ date: string; score: number }> }> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rpcData, error: rpcErr } = await (supabase as any).rpc("calculate_isl", { p_store_id: storeId });
      if (rpcErr) throw rpcErr;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: storeRow } = await (supabase as any)
        .from("stores").select("isl_score,isl_label,isl_history").eq("id", storeId).maybeSingle();
      const sr = (storeRow ?? {}) as StoreISL;
      const history = Array.isArray(sr.isl_history) ? sr.isl_history.slice(-30) : [];
      return { result: rpcData as ISLResult, history };
    },
  });
}

function Sparkline({ points }: { points: Array<{ date: string; score: number }> }) {
  if (points.length < 2) return null;
  const w = 120, h = 32;
  const min = Math.min(...points.map(p => p.score));
  const max = Math.max(...points.map(p => p.score));
  const range = max - min || 1;
  const path = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - ((p.score - min) / range) * h;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const last = points[points.length - 1].score;
  const first = points[0].score;
  const trend = last - first;
  return (
    <div className="flex items-center gap-2">
      <svg width={w} height={h} className="overflow-visible">
        <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={cn("text-[10px] font-bold flex items-center gap-0.5", trend >= 0 ? "text-emerald-500" : "text-red-500")}>
        {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {trend >= 0 ? "+" : ""}{trend.toFixed(0)}
      </span>
    </div>
  );
}

export default function ISLCard() {
  const loja = useLoja();
  const storeId = (loja.data as { id?: string } | null)?.id ?? null;
  const { data, isLoading } = useISL(storeId);

  if (isLoading) {
    return (
      <div className="rounded-2xl border bg-card p-5 flex items-center justify-center h-32">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) return null;

  const { result, history } = data;

  if (result.insufficient_data) {
    const reason = result.reason === "warm_up_period"
      ? `ISL disponível em ${result.days_remaining ?? 30} dias`
      : `Aguardando ${result.customers_needed ?? 50} clientes para liberar`;
    return (
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
            <Heart className="w-4 h-4 text-muted-foreground" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Índice de Saúde da Loja</p>
        </div>
        <p className="text-sm font-bold mb-1">Coletando dados</p>
        <p className="text-xs text-muted-foreground">{reason}.</p>
      </div>
    );
  }

  const score = result.isl_score ?? 0;
  const label = result.isl_label ?? "—";
  const tone = score >= 70 ? "text-emerald-500" : score >= 50 ? "text-amber-500" : "text-red-500";
  const bd = result.breakdown ?? { chs: 0, engagement: 0, rfm_health: 0, revenue_trend: 0 };

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Heart className="w-4 h-4 text-primary" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">Índice de Saúde da Loja</p>
        </div>
        <Sparkline points={history} />
      </div>
      <div className="flex items-baseline gap-3">
        <p className={cn("text-4xl font-extrabold font-mono tabular-nums", tone)}>{score}</p>
        <p className="text-sm font-bold text-muted-foreground">/ 100 · {label}</p>
      </div>
      <div className="grid grid-cols-4 gap-2 mt-4 text-center">
        {[
          { k: "Conversão", v: bd.chs },
          { k: "Engajamento", v: bd.engagement },
          { k: "RFM", v: bd.rfm_health },
          { k: "Receita", v: bd.revenue_trend },
        ].map((d) => (
          <div key={d.k} className="rounded-lg bg-muted/40 px-2 py-1.5">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">{d.k}</p>
            <p className="text-sm font-bold tabular-nums">{d.v}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground/70 mt-3 leading-relaxed">
        Lojas do seu segmento com ISL &gt; 75 cresceram 30%+ em 6 meses.
      </p>
    </div>
  );
}
