import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Loader2, AlertCircle, Sparkles, ArrowRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CHSGauge } from "@/components/dashboard/CHSGauge";
import { supabase } from "@/lib/supabase";
import { trackFunnelEvent } from "@/lib/funnel-telemetry";

/**
 * 3.5 — Página pública read-only do diagnóstico.
 * Mostra apenas dados não-sensíveis (CHS, label, resumo, contagem de problemas).
 * Não expõe receita, visitantes ou impacto em R$ — esses dados ficam no /resultado autenticado.
 */
type SharedDiag = {
  store_name?: string;
  chs?: number;
  chs_label?: string;
  resumo?: string;
  perda_principal?: string;
  percentual_explicado?: number;
  problemas_count?: number;
  recomendacoes_count?: number;
  created_at?: string;
  error?: string;
};

export default function DiagnosticoCompartilhado() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SharedDiag | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) { setLoading(false); return; }
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: rpc } = await (supabase as any).rpc("get_shared_diagnostic", { p_token: token });
        if (cancelled) return;
        setData(rpc as SharedDiag);
        void trackFunnelEvent({
          event: "diagnostic_share_link_viewed",
          metadata: { has_data: Boolean(rpc && !(rpc as SharedDiag).error) },
        });
      } catch (_e) {
        setData({ error: "load_failed" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] text-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!data || data.error) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] text-white flex flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertCircle className="w-10 h-10 text-amber-500" />
        <h1 className="text-2xl font-black font-syne tracking-tighter">Link inválido ou expirado</h1>
        <p className="text-sm text-muted-foreground max-w-md">
          Esse diagnóstico não está mais disponível. Peça um novo link a quem te enviou.
        </p>
        <Button asChild size="lg" className="font-bold rounded-xl gap-2 mt-4">
          <Link to="/">Conhecer o LTV Boost <ArrowRight className="w-4 h-4" /></Link>
        </Button>
      </div>
    );
  }

  const chs = data.chs ?? 0;

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="border-b border-[#1E1E2E] bg-background/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-black">L</div>
            <span className="font-bold tracking-tighter">LTV BOOST</span>
          </Link>
          <Badge className="bg-muted/40 text-muted-foreground border border-border text-[10px] font-bold uppercase tracking-wide">
            <Lock className="w-3 h-3 mr-1" /> Compartilhado
          </Badge>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 pt-12 pb-20 space-y-12">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-[10px] font-black px-3 py-1 rounded-full border border-primary/20 uppercase tracking-[0.2em]">
            <Sparkles className="w-3 h-3" /> Diagnóstico ConvertIQ
          </div>
          <h1 className="text-3xl md:text-4xl font-black font-syne tracking-tighter">
            {data.store_name ?? "Loja"}
          </h1>
          <p className="text-xs text-muted-foreground">
            Resumo público · números absolutos da loja não são exibidos.
          </p>
        </div>

        <div className="flex justify-center">
          <CHSGauge score={chs} label={data.chs_label ?? "Regular"} className="w-full max-w-sm border-0 bg-transparent" />
        </div>

        {data.resumo && (
          <div className="bg-[#13131A] border border-[#1E1E2E] rounded-2xl p-6 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Resumo da IA</p>
            <p className="text-sm leading-relaxed">{String(data.resumo)}</p>
            {data.perda_principal && (
              <p className="text-xs text-muted-foreground pt-2 border-t border-[#1E1E2E]">
                Maior gargalo: <span className="font-bold text-foreground">{String(data.perda_principal)}</span>
                {typeof data.percentual_explicado === "number" && (
                  <> · {data.percentual_explicado}% das perdas explicadas</>
                )}
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[#13131A] border border-[#1E1E2E] rounded-2xl p-5 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Problemas</p>
            <p className="text-3xl font-black font-jetbrains">{data.problemas_count ?? 0}</p>
          </div>
          <div className="bg-[#13131A] border border-[#1E1E2E] rounded-2xl p-5 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Recomendações</p>
            <p className="text-3xl font-black font-jetbrains text-emerald-500">{data.recomendacoes_count ?? 0}</p>
          </div>
        </div>

        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 text-center space-y-4">
          <h2 className="text-xl font-black font-syne tracking-tighter">Quer um diagnóstico para sua loja?</h2>
          <p className="text-sm text-muted-foreground">Em 2 minutos você recebe a análise completa, com perda em R$/mês e plano de ação.</p>
          <Button asChild size="lg" className="font-bold rounded-xl gap-2">
            <Link to="/signup">Gerar meu diagnóstico grátis <ArrowRight className="w-4 h-4" /></Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
