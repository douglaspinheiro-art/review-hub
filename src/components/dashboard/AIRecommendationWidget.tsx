import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Sparkles, AlertTriangle, X, ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useLoja } from "@/hooks/useConvertIQ";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type TopOpportunity = {
  id: string;
  title: string;
  description: string | null;
  severity: string | null;
  estimated_impact: number | null;
  detected_at: string | null;
};

const SEVERITY_STYLE: Record<string, string> = {
  critico: "border-red-500/30 bg-red-500/5",
  critical: "border-red-500/30 bg-red-500/5",
  alto: "border-amber-500/30 bg-amber-500/5",
  high: "border-amber-500/30 bg-amber-500/5",
  medio: "border-primary/20 bg-primary/5",
  medium: "border-primary/20 bg-primary/5",
};

function severityLabel(sev: string | null): string {
  const s = (sev ?? "").toLowerCase();
  if (s === "critico" || s === "critical") return "CRÍTICO";
  if (s === "alto" || s === "high") return "ALTO";
  if (s === "medio" || s === "medium") return "MÉDIO";
  return "OPORTUNIDADE";
}

function useTopOpportunity(storeId: string | null) {
  return useQuery({
    queryKey: ["dashboard-top-opportunity", storeId],
    enabled: !!storeId,
    staleTime: 60_000,
    queryFn: async (): Promise<TopOpportunity | null> => {
      const { data, error } = await supabase
        .from("opportunities")
        .select("id,title,description,severity,estimated_impact,detected_at")
        .eq("store_id", storeId!)
        .eq("status", "novo")
        .order("estimated_impact", { ascending: false, nullsFirst: false })
        .order("detected_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as TopOpportunity | null;
    },
  });
}

function useDismissOpportunity(storeId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (oppId: string) => {
      const { error } = await supabase
        .from("opportunities")
        .update({ status: "ignorado" })
        .eq("id", oppId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard-top-opportunity", storeId] });
      qc.invalidateQueries({ queryKey: ["problems-list"] });
      toast.success("Recomendação dispensada");
    },
    onError: (e) => toast.error(`Erro: ${(e as Error).message}`),
  });
}

export default function AIRecommendationWidget() {
  const navigate = useNavigate();
  const loja = useLoja();
  const storeId = (loja.data as { id?: string } | null)?.id ?? null;
  const { data: opp, isLoading } = useTopOpportunity(storeId);
  const dismiss = useDismissOpportunity(storeId);
  const [dismissing, setDismissing] = useState(false);

  if (isLoading || !opp) return null;

  const sevStyle = SEVERITY_STYLE[(opp.severity ?? "").toLowerCase()] ?? "border-primary/20 bg-primary/5";
  const impact = Number(opp.estimated_impact ?? 0);

  return (
    <div className={cn(
      "rounded-2xl border p-5 relative overflow-hidden",
      sevStyle,
    )}>
      <button
        type="button"
        aria-label="Dispensar recomendação"
        onClick={() => {
          setDismissing(true);
          dismiss.mutate(opp.id, { onSettled: () => setDismissing(false) });
        }}
        disabled={dismissing || dismiss.isPending}
        className="absolute top-3 right-3 p-1 rounded-md hover:bg-foreground/5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        {dismissing || dismiss.isPending
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <X className="w-4 h-4" />}
      </button>

      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-primary">
            Recomendação da IA
          </p>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-foreground/10 text-foreground">
              <AlertTriangle className="w-3 h-3" />
              {severityLabel(opp.severity)}
            </span>
            {impact > 0 && (
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                Potencial R$ {impact.toLocaleString("pt-BR")}
              </span>
            )}
          </div>
        </div>
      </div>

      <h3 className="font-bold text-base leading-snug pr-8">{opp.title}</h3>
      {opp.description && (
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed line-clamp-3">
          {opp.description}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <Button
          size="sm"
          className="h-9 gap-2 font-bold"
          onClick={() => navigate("/dashboard/funil/diagnostico")}
        >
          Ver diagnóstico completo <ArrowRight className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-9 text-muted-foreground"
          onClick={() => navigate("/dashboard/prescricoes")}
        >
          Ver todas as oportunidades
        </Button>
      </div>
    </div>
  );
}
