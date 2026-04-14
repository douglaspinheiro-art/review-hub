import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Zap, FlaskConical, CalendarClock, Loader2, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useLoja, useLatestDiagnostico, useDiagnosticos, useExecutionPlaybooks, useUpsertExecutionPlaybook,
  DiagnosticoJSON, Recomendacao,
} from "@/hooks/useConvertIQ";

// ─── Tipo helpers ─────────────────────────────────────────────────────────────
const tipoConfig = {
  quick_win:    { label: "Quick Win",   icon: Zap,            badge: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  ab_test:      { label: "A/B Test",    icon: FlaskConical,   badge: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
  medio_prazo:  { label: "Médio Prazo", icon: CalendarClock,  badge: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
} as const;

const esforcoColors = {
  baixo: "bg-emerald-500/15 text-emerald-500",
  medio: "bg-amber-500/15 text-amber-500",
  alto:  "bg-red-500/15 text-red-500",
} as const;

const numberColors = ["text-primary", "text-blue-500", "text-violet-500"];

const ownerLabel = {
  trafego: "Tráfego pago",
  cro: "CRO",
  crm: "CRM",
  produto: "Produto",
  dados: "Dados",
} as const;

// ─── Priority matrix (simple 2×2) ─────────────────────────────────────────────
function PriorityMatrix({ recs }: { recs: Recomendacao[] }) {
  const esforcoNum = { baixo: 1, medio: 2, alto: 3 } as const;
  const maxImpacto = Math.max(...recs.map(r => r.impacto_pp), 1);

  return (
    <div className="bg-card border rounded-2xl p-5">
      <h3 className="font-semibold mb-4 text-sm">Matriz Esforço × Impacto</h3>
      <div className="relative h-48 border rounded-xl overflow-hidden bg-muted/20">
        {/* Quadrant labels */}
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 pointer-events-none">
          <div className="flex items-center justify-center border-r border-b border-border/50">
            <span className="text-[10px] text-muted-foreground/60 font-medium">Alto impacto<br/>Baixo esforço</span>
          </div>
          <div className="flex items-center justify-center border-b border-border/50">
            <span className="text-[10px] text-muted-foreground/60 font-medium">Alto impacto<br/>Alto esforço</span>
          </div>
          <div className="flex items-center justify-center border-r border-border/50">
            <span className="text-[10px] text-muted-foreground/60 font-medium">Baixo impacto<br/>Baixo esforço</span>
          </div>
          <div className="flex items-center justify-center">
            <span className="text-[10px] text-muted-foreground/60 font-medium">Baixo impacto<br/>Alto esforço</span>
          </div>
        </div>
        {/* "Faça agora" highlight */}
        <div className="absolute top-0 left-0 w-1/2 h-1/2 bg-emerald-500/5 border-r border-b border-emerald-500/20 flex items-end justify-end p-1">
          <span className="text-[9px] text-emerald-500 font-bold">Faça agora ✓</span>
        </div>
        {/* Points */}
        {recs.map((r, i) => {
          const xPct = ((esforcoNum[r.esforco] - 1) / 2) * 80 + 10;
          const yPct = (1 - r.impacto_pp / (maxImpacto * 1.2)) * 80 + 10;
          return (
            <div
              key={i}
              className={cn("absolute w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md border-2 border-background",
                i === 0 ? "bg-primary" : i === 1 ? "bg-blue-500" : "bg-violet-500"
              )}
              style={{ left: `${xPct}%`, top: `${yPct}%`, transform: "translate(-50%,-50%)" }}
              title={r.titulo}
            >
              {i + 1}
            </div>
          );
        })}
        {/* Axis labels */}
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground/50">← Esforço →</div>
        <div className="absolute left-1 top-1/2 -translate-y-1/2 -rotate-90 text-[9px] text-muted-foreground/50 origin-center">← Impacto →</div>
      </div>
    </div>
  );
}

// ─── Recommendation card ──────────────────────────────────────────────────────
function RecCard({ r, idx }: { r: Recomendacao; idx: number }) {
  const tc = tipoConfig[r.tipo] ?? tipoConfig.medio_prazo;
  const TipoIcon = tc.icon;
  const maxImpacto = 2; // approx max for bar scaling

  return (
    <div className="bg-card border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-sm font-extrabold text-white",
          idx === 0 ? "bg-primary" : idx === 1 ? "bg-blue-500" : "bg-violet-500"
        )}>
          {idx + 1}
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border", tc.badge)}>
            <TipoIcon className="w-3 h-3" /> {tc.label}
          </span>
          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full capitalize", esforcoColors[r.esforco])}>
            {r.esforco}
          </span>
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-sm leading-snug mb-2">{r.titulo}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{r.descricao}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-1 border-t">
        <div>
          <p className="text-xs text-muted-foreground">Impacto estimado</p>
          <p className={cn("font-mono font-bold text-sm mt-0.5", numberColors[idx])}>+{r.impacto_pp}pp conversão</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Prazo sugerido</p>
          <p className="font-mono font-bold text-sm mt-0.5">{r.prazo_semanas} {r.prazo_semanas === 1 ? "semana" : "semanas"}</p>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>Potencial de recuperação</span>
          <span>{Math.min(100, Math.round((r.impacto_pp / maxImpacto) * 100))}%</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", idx === 0 ? "bg-primary" : idx === 1 ? "bg-blue-500" : "bg-violet-500")}
            style={{ width: `${Math.min(100, Math.round((r.impacto_pp / maxImpacto) * 100))}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function normalizeOwner(r: Recomendacao): keyof typeof ownerLabel {
  if (r.owner && r.owner in ownerLabel) return r.owner;
  if (r.tipo === "ab_test") return "cro";
  if (r.titulo.toLowerCase().includes("segment")) return "crm";
  if (r.titulo.toLowerCase().includes("checkout")) return "produto";
  return "dados";
}

function effortHours(esforco: Recomendacao["esforco"]) {
  if (esforco === "baixo") return 4;
  if (esforco === "medio") return 12;
  return 24;
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ConvertIQPlano() {
  const loja     = useLoja();
  const lastDiag = useLatestDiagnostico(loja.data?.id ?? null);
  const allDiags = useDiagnosticos(loja.data?.id ?? null);
  const remotePlaybooks = useExecutionPlaybooks(loja.data?.id ?? null);
  const upsertPlaybook = useUpsertExecutionPlaybook();
  const [executado, setExecutado] = useState<Record<string, boolean>>({});
  const [resultadoAcao, setResultadoAcao] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!loja.data?.id) return;
    const raw = window.localStorage.getItem(`convertiq-playbook:${loja.data.id}`);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      setExecutado(parsed);
    } catch {
      setExecutado({});
    }
  }, [loja.data?.id]);

  useEffect(() => {
    if (!loja.data?.id) return;
    const raw = window.localStorage.getItem(`convertiq-playbook-results:${loja.data.id}`);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, string>;
      setResultadoAcao(parsed);
    } catch {
      setResultadoAcao({});
    }
  }, [loja.data?.id]);

  useEffect(() => {
    const rows = remotePlaybooks.data ?? [];
    if (rows.length === 0) return;
    const remoteExec: Record<string, boolean> = {};
    const remoteResult: Record<string, string> = {};
    rows.forEach((row) => {
      remoteExec[row.action_key] = row.status === "done";
      if (row.observed_result) remoteResult[row.action_key] = row.observed_result;
    });
    setExecutado((prev) => ({ ...prev, ...remoteExec }));
    setResultadoAcao((prev) => ({ ...prev, ...remoteResult }));
  }, [remotePlaybooks.data]);

  useEffect(() => {
    if (!loja.data?.id) return;
    window.localStorage.setItem(`convertiq-playbook:${loja.data.id}`, JSON.stringify(executado));
  }, [executado, loja.data?.id]);

  useEffect(() => {
    if (!loja.data?.id) return;
    window.localStorage.setItem(`convertiq-playbook-results:${loja.data.id}`, JSON.stringify(resultadoAcao));
  }, [resultadoAcao, loja.data?.id]);

  // All derived values and hooks must be declared BEFORE any early return to
  // satisfy the Rules of Hooks (no conditional hook calls).
  const diagJson   = lastDiag.data?.recomendacoes as unknown as DiagnosticoJSON | null;
  const recs = useMemo(() => diagJson?.recomendacoes ?? [], [diagJson]);
  const totalImpacto = recs.reduce((s, r) => s + r.impacto_pp, 0);
  const ticket     = Number((loja.data as unknown as Record<string, unknown>)?.ticket_medio ?? 250);
  const visitantes = (lastDiag.data?.dados_funil as Record<string, number> | null)?.visitantes ?? 12400;
  const ganhoPotencial = Math.round((totalImpacto / 100) * visitantes * ticket);
  const oportunidades = useMemo(() => {
    return recs
      .map((r, idx) => {
        const owner = normalizeOwner(r);
        const impactoReais = Math.round((r.impacto_pp / 100) * visitantes * ticket);
        const confidence = Math.min(0.95, 0.55 + (r.tipo === "quick_win" ? 0.25 : r.tipo === "ab_test" ? 0.18 : 0.12));
        const reach = visitantes;
        const impact = Math.max(1, Math.min(10, Math.round(r.impacto_pp * 3.5)));
        const effort = effortHours(r.esforco);
        const rice = Math.round((reach * impact * confidence) / Math.max(effort, 1));
        const ice = Math.round((impact * confidence * 10) / Math.max(effort / 4, 1));
        return { ...r, idx, owner, impactoReais, confidence, reach, rice, ice, effort };
      })
      .sort((a, b) => b.rice - a.rice);
  }, [recs, visitantes, ticket]);

  const recsComScore: Recomendacao[] = oportunidades.map(({ idx, ...o }) => ({
    titulo: o.titulo,
    descricao: o.descricao,
    esforco: o.esforco,
    impacto_pp: o.impacto_pp,
    prazo_semanas: o.prazo_semanas,
    tipo: o.tipo,
    owner: o.owner,
  }));

  const executedCount = Object.values(executado).filter(Boolean).length;
  const progressoExecucao = oportunidades.length > 0 ? Math.round((executedCount / oportunidades.length) * 100) : 0;
  const cvrAtual = Number(allDiags.data?.[0]?.taxa_conversao ?? lastDiag.data?.taxa_conversao ?? 0);
  const cvrBase = Number(allDiags.data?.[1]?.taxa_conversao ?? cvrAtual);
  const liftPp = Math.max(0, cvrAtual - cvrBase);
  const liftReais = Math.round((liftPp / 100) * visitantes * ticket);
  const liftExecutadoPp = oportunidades
    .filter((o, idx) => executado[`${o.titulo}-${idx}`])
    .reduce((sum, o) => sum + o.impacto_pp * o.confidence * 0.5, 0);
  const liftExecutadoReais = Math.round((liftExecutadoPp / 100) * visitantes * ticket);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const segmento = String((loja.data as any)?.plataforma ?? (loja.data as any)?.segment ?? "geral").toLowerCase();
  const observedFilled = Object.values(resultadoAcao).filter((v) => v.trim().length > 0).length;
  const learningFactorBase = segmento.includes("moda") ? 1.05 : segmento.includes("eletr") ? 0.96 : 1;
  const learningFactor = Math.max(0.85, Math.min(1.2, learningFactorBase + (observedFilled >= 3 ? 0.04 : 0)));
  const liftRecalibrado = Math.round(liftExecutadoReais * learningFactor);

  async function persistActionState(params: {
    actionKey: string;
    actionTitle: string;
    owner: string;
    status: "pending" | "in_progress" | "done";
    plannedWeek: number;
    expectedLiftPp: number;
    expectedImpactReais: number;
    observedResult?: string | null;
  }) {
    if (!loja.data?.id) return;
    try {
      await upsertPlaybook.mutateAsync({
        lojaId: loja.data.id,
        diagnosticoId: lastDiag.data?.id ?? null,
        actionKey: params.actionKey,
        actionTitle: params.actionTitle,
        owner: params.owner,
        status: params.status,
        plannedWeek: params.plannedWeek,
        expectedLiftPp: params.expectedLiftPp,
        expectedImpactReais: params.expectedImpactReais,
        observedResult: params.observedResult ?? null,
      });
    } catch {
      // keep local fallback only
    }
  }

  // Early return AFTER all hooks have been declared
  if (loja.isLoading || lastDiag.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link to="/dashboard/funil/diagnostico" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="w-4 h-4" /> Voltar ao diagnóstico
        </Link>
        <h1 className="text-2xl font-bold">Plano de Ação</h1>
        <p className="text-sm text-muted-foreground mt-1">{recs.length} ações priorizadas por impacto vs. esforço</p>
      </div>

      {/* Potential gain banner */}
      {recs.length > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5">
          <p className="text-sm text-muted-foreground">Potencial de ganho total</p>
          <p className="text-3xl font-extrabold font-mono text-primary mt-1">+{totalImpacto.toFixed(2)}pp de conversão</p>
          <p className="text-sm text-muted-foreground mt-1">
            = <strong className="text-foreground">R$ {ganhoPotencial.toLocaleString("pt-BR")}</strong> adicionais por mês
          </p>
        </div>
      )}

      {recs.length === 0 ? (
        <div className="bg-card border rounded-2xl p-10 text-center">
          <p className="text-muted-foreground">Nenhuma recomendação disponível. Gere um diagnóstico primeiro.</p>
          <Button asChild className="mt-4"><Link to="/dashboard/funil">Gerar diagnóstico</Link></Button>
        </div>
      ) : (
        <>
          {/* Priority matrix */}
          <PriorityMatrix recs={recsComScore} />

          <div className="bg-card border rounded-2xl p-5">
            <h3 className="font-semibold mb-4 text-sm">Backlog priorizado por impacto financeiro (RICE + ICE)</h3>
            <div className="space-y-3">
              {oportunidades.map((o, idx) => (
                <div key={`${o.titulo}-${idx}`} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{o.titulo}</p>
                      <p className="text-xs text-muted-foreground mt-1">{o.descricao}</p>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      #{idx + 1}
                    </span>
                  </div>
                  <div className="grid md:grid-cols-5 gap-2 mt-3">
                    <div className="rounded-lg bg-muted/40 p-2">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Impacto</p>
                      <p className="text-sm font-mono font-bold text-emerald-500">R$ {o.impactoReais.toLocaleString("pt-BR")}/mês</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Owner</p>
                      <p className="text-sm font-medium">{ownerLabel[o.owner]}</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">RICE</p>
                      <p className="text-sm font-mono font-bold">{o.rice.toLocaleString("pt-BR")}</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">ICE</p>
                      <p className="text-sm font-mono font-bold">{o.ice}</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Esforço</p>
                      <p className="text-sm font-medium">{o.effort}h</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recommendation cards */}
          <div className="space-y-3">
            <h2 className="font-semibold">Recomendações</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {recsComScore.map((r, i) => <RecCard key={i} r={r} idx={i} />)}
            </div>
          </div>

          <div className="bg-card border rounded-2xl p-5">
            <h3 className="font-semibold mb-4 text-sm">Playbooks de execução (insight → ação → resultado)</h3>
            <div className="space-y-2">
              {oportunidades.map((o, idx) => {
                const id = `${o.titulo}-${idx}`;
                const isDone = !!executado[id];
                return (
                  <button
                    key={id}
                    className={cn(
                      "w-full text-left rounded-xl border px-3 py-2 transition-colors",
                      isDone ? "border-emerald-500/40 bg-emerald-500/10" : "hover:bg-muted/40"
                    )}
                    onClick={() => {
                      const next = !executado[id];
                      setExecutado((prev) => ({ ...prev, [id]: next }));
                      persistActionState({
                        actionKey: id,
                        actionTitle: o.titulo,
                        owner: o.owner,
                        status: next ? "done" : "pending",
                        plannedWeek: idx + 1,
                        expectedLiftPp: o.impacto_pp,
                        expectedImpactReais: o.impactoReais,
                        observedResult: resultadoAcao[id] ?? null,
                      });
                    }}
                  >
                    <p className="text-sm font-medium">{isDone ? "✓" : "○"} {o.titulo}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Owner: {ownerLabel[o.owner]} · Prazo: {o.prazo_semanas} sem · Meta de lift: +{o.impacto_pp}pp
                    </p>
                    {isDone && (
                      <div className="mt-2">
                        <p className="text-[11px] text-muted-foreground mb-1">Resultado observado</p>
                        <input
                          className="w-full rounded-lg border bg-background px-2 py-1 text-xs"
                          placeholder="Ex.: +0.6pp no checkout após ajuste de frete"
                          value={resultadoAcao[id] ?? ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setResultadoAcao((prev) => ({ ...prev, [id]: val }));
                            persistActionState({
                              actionKey: id,
                              actionTitle: o.titulo,
                              owner: o.owner,
                              status: isDone ? "done" : "in_progress",
                              plannedWeek: idx + 1,
                              expectedLiftPp: o.impacto_pp,
                              expectedImpactReais: o.impactoReais,
                              observedResult: val,
                            });
                          }}
                        />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 grid md:grid-cols-3 gap-3">
              <div className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Adoção de recomendações</p>
                <p className="text-xl font-mono font-bold mt-1">{progressoExecucao}%</p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Lift medido (CVR)</p>
                <p className="text-xl font-mono font-bold mt-1">+{liftPp.toFixed(2)}pp</p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Receita incremental estimada</p>
                <p className="text-xl font-mono font-bold text-emerald-500 mt-1">R$ {liftReais.toLocaleString("pt-BR")}</p>
              </div>
            </div>
            <div className="mt-3 rounded-xl border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Lift potencial do que já foi executado</p>
              <p className="text-sm font-semibold mt-1">
                +{liftExecutadoPp.toFixed(2)}pp · R$ {liftExecutadoReais.toLocaleString("pt-BR")}
              </p>
            </div>
          </div>

          <div className="bg-card border rounded-2xl p-5">
            <h3 className="font-semibold mb-3 text-sm">Planner semanal de crescimento</h3>
            <div className="space-y-2">
              {oportunidades.slice(0, 4).map((o, idx) => {
                const weekStart = new Date();
                weekStart.setDate(weekStart.getDate() + idx * 7);
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekEnd.getDate() + 6);
                return (
                  <div key={`${o.titulo}-week`} className="rounded-xl border p-3">
                    <p className="text-[11px] text-muted-foreground">
                      Semana {idx + 1}: {weekStart.toLocaleDateString("pt-BR")} - {weekEnd.toLocaleDateString("pt-BR")}
                    </p>
                    <p className="text-sm font-medium mt-1">{o.titulo}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Owner {ownerLabel[o.owner]} · objetivo +{o.impacto_pp}pp · impacto R$ {o.impactoReais.toLocaleString("pt-BR")}/mês
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-card border rounded-2xl p-5">
            <h3 className="font-semibold mb-3 text-sm">Aprendizado contínuo por segmento</h3>
            <div className="grid md:grid-cols-3 gap-3">
              <div className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Segmento detectado</p>
                <p className="text-sm font-semibold mt-1 uppercase">{segmento}</p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Fator de aprendizado</p>
                <p className="text-sm font-mono font-bold mt-1">{learningFactor.toFixed(2)}x</p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Lift recalibrado</p>
                <p className="text-sm font-mono font-bold text-emerald-500 mt-1">R$ {liftRecalibrado.toLocaleString("pt-BR")}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              O fator aumenta conforme resultados observados são preenchidos e ajuda a recalibrar previsões futuras do mesmo segmento.
            </p>
          </div>
        </>
      )}

      {/* Cross-sell CTA */}
      <div className="bg-card border rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Megaphone className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold mb-1">Quer implementar essas melhorias mais rápido?</h3>
            <p className="text-sm text-muted-foreground mb-3">
              O LTV Boost pode automatizar a recuperação de clientes enquanto você trabalha nas otimizações de conversão.
            </p>
            <Button asChild size="sm" className="gap-2">
              <Link to="/dashboard/campanhas">
                <Megaphone className="w-4 h-4" /> Ver campanhas de reativação
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
