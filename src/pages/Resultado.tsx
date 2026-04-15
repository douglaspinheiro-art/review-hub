
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Zap, TrendingUp, AlertCircle, Loader2, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CHSGauge } from "@/components/dashboard/CHSGauge";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

type DiagnosticData = {
  resumo?: string;
  perda_principal?: string;
  percentual_explicado?: number;
  problemas?: Array<{
    titulo: string;
    descricao: string;
    severidade: string;
    impacto_reais: number;
  }>;
  recomendacoes?: Array<{
    titulo: string;
    descricao: string;
    esforco: string;
    impacto_pp: number;
    prazo_semanas: number;
    tipo: string;
  }>;
};

export default function Resultado() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [diagnostic, setDiagnostic] = useState<DiagnosticData | null>(null);
  const [chs, setChs] = useState(0);
  const [chsLabel, setChsLabel] = useState("Regular");
  const [storeName, setStoreName] = useState("Your Store");

  useEffect(() => {
    async function fetchDiagnostic() {
      if (!user?.id) return;

      // Get store name
      const { data: storeData } = await supabase
        .from("stores")
        .select("nome")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (storeData?.nome) setStoreName(storeData.nome);

      // Get latest diagnostic
      const { data: diagData } = await supabase
        .from("diagnostics_v3")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (diagData) {
        setDiagnostic(diagData.diagnostic_json as DiagnosticData);
        setChs(diagData.chs ?? 47);
        setChsLabel(diagData.chs_label ?? "Regular");
      }
      setLoading(false);
    }

    fetchDiagnostic();
  }, [user?.id]);

  // Compute loss from funnel data
  const rawFunnel = sessionStorage.getItem("ltv_funnel_data");
  const funnel = rawFunnel ? JSON.parse(rawFunnel) : null;
  const ticketMedio = funnel?.ticket_medio || 250;
  const metaConversao = funnel?.meta_conversao || 2.5;
  const visitantesNum = funnel?.visitantes || 12400;
  const pedidosNum = funnel?.pedido || 174;
  const conversaoAtual = visitantesNum > 0 ? (pedidosNum / visitantesNum) * 100 : 1.4;
  const perdaMensal = Math.round(
    ((metaConversao / 100) - (conversaoAtual / 100)) * visitantesNum * ticketMedio
  );

  const handleContinue = () => {
    navigate("/setup");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const problemas = diagnostic?.problemas || [];
  const recomendacoes = diagnostic?.recomendacoes || [];

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white pb-20">
      {/* Top Header */}
      <div className="border-b border-[#1E1E2E] bg-background/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-black">L</div>
            <span className="font-bold tracking-tighter">LTV BOOST</span>
          </div>
          <Button size="sm" onClick={handleContinue} className="font-bold rounded-xl h-9">
            Continue Setup →
          </Button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 pt-12 space-y-16">
        {/* CHS Block */}
        <div className="text-center space-y-8">
          <div className="space-y-2">
            <h1 className="text-4xl font-black font-syne tracking-tighter uppercase italic">
              Diagnostic: {storeName}
            </h1>
            <p className="text-muted-foreground text-sm">
              Based on {visitantesNum.toLocaleString("pt-BR")} visitors · {pedidosNum} orders · Conversion {conversaoAtual.toFixed(2)}%
            </p>
          </div>

          <div className="flex justify-center">
            <CHSGauge
              score={chs}
              label={chsLabel}
              className="w-full max-w-sm border-0 bg-transparent"
            />
          </div>
        </div>

        {/* Loss Block */}
        {perdaMensal > 0 && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-3xl p-8 text-center space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <AlertCircle className="w-16 h-16 text-red-500" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold uppercase tracking-widest text-red-500/80">You are losing</p>
              <div className="text-5xl font-black font-jetbrains text-red-500 tracking-tighter">
                R$ {perdaMensal.toLocaleString("pt-BR")} <span className="text-lg opacity-50">/ month</span>
              </div>
              <p className="text-xs text-muted-foreground">vs. segment benchmark ({metaConversao}%)</p>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-red-500/10">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Your CVR</p>
                <p className="text-lg font-black">{conversaoAtual.toFixed(2)}%</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Benchmark</p>
                <p className="text-lg font-black text-emerald-500">{metaConversao}%</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Loss/day</p>
                <p className="text-lg font-black text-red-500">R$ {Math.round(perdaMensal / 30).toLocaleString("pt-BR")}</p>
              </div>
            </div>
          </div>
        )}

        {/* AI Summary */}
        {diagnostic?.resumo && (
          <div className="bg-primary/5 border-l-4 border-primary rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <span className="text-[10px] font-black uppercase tracking-widest text-primary">AI Analysis</span>
            </div>
            <p className="text-sm text-white/90 leading-relaxed">{diagnostic.resumo}</p>
            {diagnostic.perda_principal && (
              <p className="text-xs text-muted-foreground">
                Main bottleneck: <strong className="text-white">{diagnostic.perda_principal}</strong>
                {diagnostic.percentual_explicado && (
                  <Badge className="ml-2 bg-primary/20 text-primary border-none text-[9px]">
                    {diagnostic.percentual_explicado}% of losses explained
                  </Badge>
                )}
              </p>
            )}
          </div>
        )}

        {/* Problems */}
        {problemas.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold font-syne uppercase tracking-tighter flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" /> Priority Issues
            </h2>
            <div className="space-y-4">
              {problemas.map((p, i) => (
                <div key={i} className={cn(
                  "border rounded-2xl p-6 transition-all",
                  p.severidade === "critico"
                    ? "border-red-500/30 bg-red-500/5"
                    : p.severidade === "alto"
                    ? "border-orange-500/30 bg-orange-500/5"
                    : "border-yellow-500/30 bg-yellow-500/5"
                )}>
                  <div className="flex items-center justify-between mb-3">
                    <Badge variant="outline" className={cn("text-[10px] font-bold tracking-widest px-2 py-0.5",
                      p.severidade === "critico" ? "text-red-500 border-red-500/50" :
                      p.severidade === "alto" ? "text-orange-500 border-orange-500/50" :
                      "text-yellow-500 border-yellow-500/50"
                    )}>
                      {p.severidade === "critico" ? "CRITICAL" : p.severidade === "alto" ? "HIGH" : "MEDIUM"}
                    </Badge>
                    <span className="text-sm font-bold text-red-500">R$ {p.impacto_reais?.toLocaleString("pt-BR")}/mo</span>
                  </div>
                  <h3 className="text-lg font-bold mb-2">{p.titulo}</h3>
                  <p className="text-sm text-muted-foreground">{p.descricao}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {recomendacoes.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold font-syne uppercase tracking-tighter flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-500" /> Action Plan
            </h2>
            <div className="space-y-4">
              {recomendacoes.map((r, i) => (
                <div key={i} className="border border-[#1E1E2E] bg-[#13131A] rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <div className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center text-xs font-black",
                      r.tipo === "quick_win" ? "bg-emerald-500/20 text-emerald-500" :
                      r.tipo === "ab_test" ? "bg-blue-500/20 text-blue-500" :
                      "bg-amber-500/20 text-amber-500"
                    )}>
                      #{i + 1}
                    </div>
                    <Badge className={cn("text-[9px] font-black uppercase border-none",
                      r.tipo === "quick_win" ? "bg-emerald-500/20 text-emerald-500" :
                      r.tipo === "ab_test" ? "bg-blue-500/20 text-blue-500" :
                      "bg-amber-500/20 text-amber-500"
                    )}>
                      {r.tipo === "quick_win" ? "⚡ Quick Win" : r.tipo === "ab_test" ? "🧪 A/B Test" : "📅 Medium Term"}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] ml-auto">
                      {r.esforco === "baixo" ? "Low effort" : r.esforco === "medio" ? "Medium effort" : "High effort"}
                    </Badge>
                  </div>
                  <h3 className="text-base font-bold mb-2">{r.titulo}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{r.descricao}</p>
                  <div className="flex gap-6 text-xs">
                    <span className="text-emerald-500 font-bold">+{r.impacto_pp}pp conversion</span>
                    <span className="text-muted-foreground">{r.prazo_semanas} week{r.prazo_semanas > 1 ? "s" : ""}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No diagnostic fallback */}
        {!diagnostic && (
          <div className="text-center space-y-4 py-12">
            <Sparkles className="w-12 h-12 text-muted-foreground mx-auto" />
            <h2 className="text-xl font-bold">Diagnostic not available yet</h2>
            <p className="text-sm text-muted-foreground">The AI may still be processing your data. You can proceed to setup your account.</p>
          </div>
        )}

        {/* CTA */}
        <div className="text-center space-y-6 pt-8 border-t border-[#1E1E2E]">
          <div className="space-y-2">
            <h2 className="text-2xl font-black font-syne tracking-tighter">Ready to recover this revenue?</h2>
            <p className="text-sm text-muted-foreground">Connect WhatsApp and start executing AI prescriptions automatically.</p>
          </div>
          <Button
            onClick={handleContinue}
            size="lg"
            className="h-14 px-12 text-lg font-black bg-gradient-to-r from-emerald-500 to-blue-600 rounded-xl shadow-lg shadow-emerald-500/20 hover:scale-[1.02] transition-all"
          >
            Continue Setup →
          </Button>
          <p className="text-[10px] text-muted-foreground">🛡️ 14-day guarantee · Cancel anytime</p>
        </div>
      </div>
    </div>
  );
}
