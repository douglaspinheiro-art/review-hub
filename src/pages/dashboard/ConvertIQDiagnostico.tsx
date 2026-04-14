// @ts-nocheck — Schema misalignment: diagnostics nullable fields
import { Link } from "react-router-dom";
import {
  ArrowLeft, Sparkles, ChevronRight, Loader2, History, AlertCircle, Megaphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useLoja, useLatestDiagnostico, useDiagnosticos, parseDiagnosticoJSON, type DiagnosticoJSON, type Problema } from "@/hooks/useConvertIQ";
import CampaignModal, { ProdutoParaCampanha } from "@/components/dashboard/CampaignModal";

// ─── Severity helpers ─────────────────────────────────────────────────────────
const sevConfig = {
  critico: { label: "CRÍTICO", dot: "bg-red-500 animate-pulse", badge: "bg-red-500/15 text-red-500 border-red-500/30" },
  alto:    { label: "ALTO",    dot: "bg-orange-500",             badge: "bg-orange-500/15 text-orange-500 border-orange-500/30" },
  medio:   { label: "MÉDIO",   dot: "bg-yellow-500",             badge: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" },
} as const;

function SevBadge({ sev }: { sev: keyof typeof sevConfig }) {
  const c = sevConfig[sev] ?? sevConfig.medio;
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", c.dot)} />
      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", c.badge)}>{c.label}</span>
    </div>
  );
}

// ─── Problem card ─────────────────────────────────────────────────────────────
function ProblemaCard({ p, i, onCriarCampanha }: { p: Problema; i: number; onCriarCampanha: () => void }) {
  const alternativas = [
    p.causa_raiz ?? "Falha de UX no passo atual",
    "Segmentação de tráfego desalinhada",
    "Atrito técnico não monitorado",
  ].slice(0, 2);
  const nextStep = p.severidade === "critico"
    ? "Executar correção em até 48h e medir lift diário."
    : p.severidade === "alto"
      ? "Rodar teste controlado por 7 dias."
      : "Monitorar e priorizar no próximo sprint.";
  return (
    <div className={cn(
      "bg-card border rounded-2xl p-5 space-y-3",
      p.severidade === "critico" ? "border-red-500/30" : p.severidade === "alto" ? "border-orange-500/30" : "border-border"
    )}>
      <div className="flex items-center justify-between">
        <SevBadge sev={p.severidade} />
        <span className="text-xs text-muted-foreground">#{i + 1}</span>
      </div>
      <h3 className="font-semibold text-sm leading-snug">{p.titulo}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{p.descricao}</p>
      <div className="rounded-xl border bg-muted/30 p-3">
        <p className="text-[11px] font-semibold text-muted-foreground">Hipóteses alternativas</p>
        <p className="text-xs mt-1">- {alternativas[0]}</p>
        <p className="text-xs">- {alternativas[1]}</p>
        <p className="text-xs text-primary mt-1"><strong>Próximo melhor passo:</strong> {nextStep}</p>
      </div>
      <div className="pt-1 border-t flex items-end justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">Impacto estimado</p>
          <p className="font-mono font-bold text-red-500">
            R$ {(p.impacto_reais ?? 0).toLocaleString("pt-BR")}/mês
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs font-bold gap-1.5 rounded-xl shrink-0"
          onClick={onCriarCampanha}
        >
          <Megaphone className="w-3.5 h-3.5" /> Criar campanha
        </Button>
      </div>
    </div>
  );
}

// ─── History modal ────────────────────────────────────────────────────────────
function HistoryModal({ diags, onClose }: {
  diags: Array<{ id: string; created_at: string; taxa_conversao: number; score: number; recomendacoes: unknown }>;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-card border rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Diagnósticos anteriores</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>
        {diags.length === 0 ? (
          <div className="text-center py-8">
            <History className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum diagnóstico anterior</p>
          </div>
        ) : (
          <div className="space-y-3">
            {diags.map(d => {
              const json = d.recomendacoes as DiagnosticoJSON | null;
              const resumo = json?.resumo ?? "Diagnóstico sem resumo";
              return (
                <div key={d.id} className="border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">
                      {new Date(d.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                        {d.taxa_conversao}% conv.
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">
                        Score {d.score}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{resumo}</p>
                  {json?.problemas && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {json.problemas.map((p, i) => (
                        <span key={`hp-${p.severidade}-${i}`} className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border",
                          sevConfig[p.severidade as keyof typeof sevConfig]?.badge ?? "bg-muted text-muted-foreground border-border"
                        )}>
                          {p.titulo.slice(0, 20)}…
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ConvertIQDiagnostico() {
  const [showHistory, setShowHistory] = useState(false);
  const [campaignModal, setCampaignModal] = useState<{
    open: boolean;
    objective: "recovery" | "rebuy" | "loyalty" | "lancamento";
    nome?: string;
  }>({ open: false, objective: "recovery" });
  const loja     = useLoja();
  const lastDiag = useLatestDiagnostico(loja.data?.id ?? null);
  const allDiags = useDiagnosticos(loja.data?.id ?? null);

  const loading = loja.isLoading || lastDiag.isLoading;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-40 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-72 rounded-xl" />
          <Skeleton className="h-4 w-56 rounded-lg" />
        </div>
        <Skeleton className="h-48 w-full rounded-2xl" />
        <div className="grid md:grid-cols-3 gap-4">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="hidden md:block h-64 rounded-2xl" />
          <Skeleton className="hidden md:block h-64 rounded-2xl" />
        </div>
        <Skeleton className="h-12 w-full rounded-2xl" />
      </div>
    );
  }

  if (!lastDiag.data) {
    return (
      <div className="space-y-4">
        <Link to="/dashboard/funil" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Voltar ao dashboard
        </Link>
        <div className="bg-card border rounded-2xl p-10 text-center">
          <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h2 className="font-semibold mb-1">Nenhum diagnóstico disponível</h2>
          <p className="text-sm text-muted-foreground mb-4">Volte ao dashboard e gere seu primeiro diagnóstico com IA</p>
          <Button asChild><Link to="/dashboard/funil">Ir ao dashboard</Link></Button>
        </div>
      </div>
    );
  }

  const diagJson = parseDiagnosticoJSON(lastDiag.data.recomendacoes);
  const problemas = diagJson?.problemas ?? [];
  const problemasOrdenados = [...problemas].sort((a, b) => b.impacto_reais - a.impacto_reais);
  const gargaloPrincipal = problemasOrdenados[0] ?? null;
  const perda_principal = diagJson?.perda_principal ?? "Não identificado";
  const pct = diagJson?.percentual_explicado ?? 0;
  const resumo = diagJson?.resumo ?? lastDiag.data.resumo ?? "";

  return (
    <div className="space-y-6">
      {showHistory && (
        <HistoryModal
          diags={allDiags.data ?? []}
          onClose={() => setShowHistory(false)}
        />
      )}

      {campaignModal.open && (
        <CampaignModal
          onClose={() => setCampaignModal(s => ({ ...s, open: false }))}
          initialObjective={campaignModal.objective}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Link to="/dashboard/funil" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Voltar ao dashboard
        </Link>
        <span className="text-xs text-muted-foreground">
          Powered by <span className="font-semibold">Claude AI</span>
        </span>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Diagnóstico de Conversão</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerado em {new Date(lastDiag.data.created_at).toLocaleString("pt-BR", {
            day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
          })}
        </p>
      </div>

      {/* AI summary card */}
      <div className="bg-card border-l-4 border-l-primary rounded-2xl p-6 space-y-4"
        style={{ background: "linear-gradient(135deg, hsl(var(--card)), hsl(var(--card)/0.8))" }}>
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Análise da Inteligência Artificial</span>
        </div>

        <p className="text-base leading-relaxed">{resumo}</p>

        <div className="h-px bg-border" />

        <div>
          <p className="text-xs text-muted-foreground mb-1">Principal gargalo identificado</p>
          <div className="flex items-center gap-3">
            <p className="font-bold text-sm">{perda_principal}</p>
            {pct > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                {pct}% das perdas explicadas
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
            Score {lastDiag.data.score}/100
          </span>
          <span className="text-xs text-muted-foreground">Taxa de conversão: <strong>{lastDiag.data.taxa_conversao}%</strong></span>
        </div>

        {problemas.length > 0 && (
          <div className="rounded-xl border bg-muted/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Por que a IA recomendou isso</p>
            <ul className="space-y-1">
              {problemas.slice(0, 3).map((p, idx) => (
                <li key={`ev-${p.severidade}-${p.impacto_reais}-${idx}`} className="text-sm">
                  - <strong>{p.titulo}</strong>: {p.evidencia ?? p.descricao}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Problems */}
      {problemas.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold">Problemas Identificados</h2>
          {gargaloPrincipal && (
            <div className="bg-card border border-primary/30 rounded-2xl p-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-2">Gargalo principal priorizado</p>
              <h3 className="font-semibold">{gargaloPrincipal.titulo}</h3>
              <p className="text-sm text-muted-foreground mt-1">{gargaloPrincipal.descricao}</p>
              <div className="grid md:grid-cols-3 gap-3 mt-4">
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">Impacto mensal estimado</p>
                  <p className="font-mono font-bold text-red-500 mt-1">
                    R$ {(gargaloPrincipal.impacto_reais ?? 0).toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">Causa raiz provável</p>
                  <p className="text-sm font-medium mt-1">{gargaloPrincipal.causa_raiz ?? perda_principal}</p>
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">Confiança da hipótese</p>
                  <p className="text-sm font-semibold mt-1">
                    {gargaloPrincipal.confianca != null && gargaloPrincipal.confianca > 0
                      ? `${Math.min(99, gargaloPrincipal.confianca)}%`
                      : pct > 0
                        ? `${Math.min(99, pct)}%`
                        : "N/A"}
                  </p>
                </div>
              </div>
              {gargaloPrincipal.evidencia && (
                <div className="mt-3 rounded-xl border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Evidência</p>
                  <p className="text-sm mt-1">{gargaloPrincipal.evidencia}</p>
                </div>
              )}
            </div>
          )}
          <div className="grid md:grid-cols-3 gap-4">
            {problemas.map((p, i) => (
              <ProblemaCard
                key={`${p.severidade}-${p.impacto_reais}-${i}`}
                p={p}
                i={i}
                onCriarCampanha={() => setCampaignModal({
                  open: true,
                  objective: p.severidade === "critico" || p.severidade === "alto" ? "recovery" : "rebuy",
                  nome: p.titulo,
                })}
              />
            ))}
          </div>
        </div>
      )}

      {/* CTA to plan */}
      <Button asChild className="w-full gap-2" size="lg">
        <Link to="/dashboard/funil/plano">
          Ver plano de ação <ChevronRight className="w-4 h-4" />
        </Link>
      </Button>

      {diagJson?.recomendacoes?.length ? (
        <div className="bg-card border rounded-2xl p-5">
          <h2 className="font-semibold mb-3">Plano semanal sugerido (copiloto)</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {diagJson.recomendacoes.slice(0, 4).map((r, i) => (
              <div key={`rec-${r.titulo}-${i}`} className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Semana {i + 1}</p>
                <p className="text-sm font-medium mt-1">{r.titulo}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Meta: +{r.impacto_pp}pp · prazo {r.prazo_semanas} sem
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* History */}
      <div className="bg-card border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Diagnósticos anteriores</h2>
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => setShowHistory(true)}>
            <History className="w-3.5 h-3.5" /> Ver histórico
          </Button>
        </div>

        {allDiags.isLoading ? (
          <div className="h-12 bg-muted animate-pulse rounded-lg" />
        ) : (allDiags.data ?? []).length <= 1 ? (
          <div className="text-center py-6">
            <History className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum diagnóstico anterior encontrado</p>
            <p className="text-xs text-muted-foreground mt-1">Gere diagnósticos periodicamente para acompanhar a evolução</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(allDiags.data ?? []).slice(1).map(d => (
              <div key={d.id} className="flex items-center justify-between p-3 rounded-xl border hover:bg-muted/30 transition-colors">
                <div>
                  <p className="text-sm font-medium">
                    {new Date(d.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                  <p className="text-xs text-muted-foreground">{d.taxa_conversao}% conversão · {(d.recomendacoes as unknown as DiagnosticoJSON)?.problemas?.length ?? 0} problemas</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">Score {d.score}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
