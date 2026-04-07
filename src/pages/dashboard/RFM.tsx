import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useContacts } from "@/hooks/useDashboard";
import { TrendingUp, Users, Crown, AlertTriangle, UserX, Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * RFM — Recência, Frequência, Valor
 * Segmenta contatos em 5 grupos usando os campos de customers_v3.
 * Prioridade: rfm_segment pré-calculado no banco → cálculo local via scores.
 * Recência usa last_purchase_at (data real da última compra).
 */

type Contact = {
  id: string;
  name: string | null;
  phone: string | null;
  status: string;
  rfm_recency: number | null;    // score 1-5, calculado pelo backend
  rfm_frequency: number | null;  // score 1-5, calculado pelo backend
  rfm_monetary: number | null;   // score 1-5, calculado pelo backend
  rfm_segment: string | null;    // segmento pré-calculado ("champions", "loyal", etc.)
  last_purchase_at: string | null;
  created_at: string;
  tags: string[] | null;
};

type RFMSegment = "champions" | "loyal" | "at_risk" | "lost" | "new";

const SEGMENTS: Record<RFMSegment, {
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  action: string;
}> = {
  champions: {
    label: "Campeões",
    description: "Compraram recentemente, compram com frequência e gastam mais",
    icon: Crown,
    color: "text-yellow-600",
    bg: "bg-yellow-50 border-yellow-200",
    action: "Recompense com exclusividades e peça indicações",
  },
  loyal: {
    label: "Fiéis",
    description: "Compram regularmente, bom valor médio",
    icon: TrendingUp,
    color: "text-green-600",
    bg: "bg-green-50 border-green-200",
    action: "Envie programa de fidelidade e upsell de produtos premium",
  },
  at_risk: {
    label: "Em risco",
    description: "Foram bons clientes mas estão sumindo",
    icon: AlertTriangle,
    color: "text-orange-600",
    bg: "bg-orange-50 border-orange-200",
    action: "Campanha de win-back com oferta especial personalizada",
  },
  lost: {
    label: "Perdidos",
    description: "Baixa frequência, baixo valor, inativos",
    icon: UserX,
    color: "text-red-600",
    bg: "bg-red-50 border-red-200",
    action: "Último esforço de reativação com desconto agressivo",
  },
  new: {
    label: "Novos",
    description: "Primeira ou segunda compra recente",
    icon: Users,
    color: "text-blue-600",
    bg: "bg-blue-50 border-blue-200",
    action: "Onboarding: boas-vindas, dicas de uso, cross-sell",
  },
};

// Mapeamento de valores do banco → chaves locais
const DB_SEGMENT_MAP: Record<string, RFMSegment> = {
  champions: "champions",
  loyal_customers: "loyal",
  loyal: "loyal",
  at_risk: "at_risk",
  cant_lose: "at_risk",
  lost: "lost",
  hibernating: "lost",
  new_customers: "new",
  new: "new",
  promising: "new",
};

function classifyContact(c: Contact, maxDaysInactive: number): RFMSegment {
  // 1. Usar segmento pré-calculado do banco quando disponível
  if (c.rfm_segment) {
    const mapped = DB_SEGMENT_MAP[c.rfm_segment.toLowerCase()];
    if (mapped) return mapped;
  }

  // 2. Calcular localmente usando last_purchase_at (recência real)
  const recencyDate = c.last_purchase_at ?? c.created_at;
  const daysSincePurchase = (Date.now() - new Date(recencyDate).getTime()) / 86_400_000;

  // Recência: menor = melhor (score 0-1)
  const recencyScore = maxDaysInactive > 0 ? Math.max(0, 1 - daysSincePurchase / maxDaysInactive) : 1;

  // Frequência e valor: normalizar scores 1-5 para 0-1
  const freqScore = c.rfm_frequency != null ? (c.rfm_frequency - 1) / 4 : 0;
  const valueScore = c.rfm_monetary != null ? (c.rfm_monetary - 1) / 4 : 0;

  const isNew = freqScore <= 0.25 && daysSincePurchase < 90;
  if (isNew) return "new";

  const rfmScore = (recencyScore + freqScore + valueScore) / 3;

  if (rfmScore >= 0.55 && freqScore >= 0.75) return "champions";
  if (rfmScore >= 0.3) return "loyal";
  if (c.status === "inactive" || rfmScore < 0.1) return "lost";
  return "at_risk";
}

export default function RFM() {
  const navigate = useNavigate();
  const { data: contacts = [], isLoading } = useContacts();

  const { segments, maxFreq, maxMonetary } = useMemo(() => {
    const typedContacts = contacts as unknown as Contact[];

    // Recência: usar last_purchase_at quando disponível, fallback para created_at
    const maxDaysInactive = Math.max(
      ...typedContacts.map((c) => {
        const d = c.last_purchase_at ?? c.created_at;
        return (Date.now() - new Date(d).getTime()) / 86_400_000;
      }),
      1
    );

    // Para scatter plot: máximos dos scores
    const maxFreq = Math.max(...typedContacts.map((c) => c.rfm_frequency ?? 1), 1);
    const maxMonetary = Math.max(...typedContacts.map((c) => c.rfm_monetary ?? 1), 1);

    const groups: Record<RFMSegment, Contact[]> = {
      champions: [], loyal: [], at_risk: [], lost: [], new: [],
    };

    typedContacts.forEach((c) => {
      const seg = classifyContact(c, maxDaysInactive);
      groups[seg].push(c);
    });

    return { segments: groups, maxFreq, maxMonetary };
  }, [contacts]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Matriz RFM</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Segmentação inteligente por Recência, Frequência e Valor para campanhas mais precisas
        </p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total de contatos", value: contacts.length, color: "text-foreground" },
          {
            label: "Campeões",
            value: segments.champions.length,
            color: "text-yellow-600",
            sub: `${contacts.length > 0 ? Math.round((segments.champions.length / contacts.length) * 100) : 0}% da base`,
          },
          {
            label: "Em risco",
            value: segments.at_risk.length + segments.lost.length,
            color: "text-orange-600",
            sub: "Precisam de ação agora",
          },
          {
            label: "Novos clientes",
            value: segments.new.length,
            color: "text-blue-600",
            sub: `${contacts.length > 0 ? Math.round((segments.new.length / contacts.length) * 100) : 0}% da base`,
          },
        ].map(({ label, value, color, sub }) => (
          <div key={label} className="bg-card border rounded-xl p-4 space-y-1">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={cn("text-2xl font-bold", color)}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
        ))}
      </div>

      {/* Info */}
      <div className="flex items-start gap-2 bg-muted/50 border rounded-xl p-3 text-sm text-muted-foreground">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
        <p>
          A classificação RFM usa <strong>Recência</strong> (data da última compra), <strong>Frequência</strong> e <strong>Valor</strong> de cada contato.
          Conecte seu e-commerce via webhook para enriquecer automaticamente com dados de compra em tempo real.
        </p>
      </div>

      {/* Segmentos */}
      <div className="grid lg:grid-cols-2 gap-4">
        {(Object.entries(SEGMENTS) as [RFMSegment, typeof SEGMENTS[RFMSegment]][]).map(([key, seg]) => {
          const Icon = seg.icon;
          const group = segments[key];
          const pct = contacts.length > 0 ? Math.round((group.length / contacts.length) * 100) : 0;
          const avgFreq = group.length > 0
            ? (group.reduce((s, c) => s + (c.rfm_frequency ?? 0), 0) / group.length).toFixed(1)
            : "—";

          return (
            <div key={key} className={cn("border rounded-xl overflow-hidden", seg.bg)}>
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className={cn("p-2 rounded-lg bg-white/60")}>
                      <Icon className={cn("w-5 h-5", seg.color)} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{seg.label}</h3>
                      <p className="text-xs text-muted-foreground">{seg.description}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn("text-2xl font-bold", seg.color)}>{group.length}</p>
                    <p className="text-xs text-muted-foreground">{pct}%</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 bg-white/50 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all",
                      key === "champions" ? "bg-yellow-500" :
                      key === "loyal" ? "bg-green-500" :
                      key === "at_risk" ? "bg-orange-500" :
                      key === "lost" ? "bg-red-500" : "bg-blue-500"
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className={cn("font-medium", seg.color)}>
                    Freq. média: {avgFreq}/5
                  </span>
                </div>

                {/* Action */}
                <div className="bg-white/60 rounded-lg p-2.5 text-xs">
                  <span className="font-medium">Ação recomendada: </span>
                  <span className="text-muted-foreground">{seg.action}</span>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  className="w-full font-bold text-xs border-white/40 bg-white/20 hover:bg-white/50"
                  disabled={group.length === 0}
                  onClick={() => navigate(`/dashboard/campanhas?segmento=${key}`)}
                >
                  {group.length === 0 ? "Nenhum cliente neste segmento" : `Criar Campanha para ${seg.label}`}
                </Button>
              </div>

              {/* Contact list (top 4) */}
              {group.length > 0 && (
                <div className="border-t border-white/40 bg-white/30 px-4 py-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Contatos neste segmento</p>
                  <div className="space-y-1">
                    {group.slice(0, 4).map((c) => {
                      const recencyDate = c.last_purchase_at ?? c.created_at;
                      const daysAgo = Math.round((Date.now() - new Date(recencyDate).getTime()) / 86_400_000);
                      return (
                        <div key={c.id} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full bg-white/60 flex items-center justify-center text-[10px] font-bold">
                              {c.name?.[0]?.toUpperCase() ?? "?"}
                            </div>
                            <span className="font-medium truncate max-w-[120px]">{c.name ?? "—"}</span>
                          </div>
                          <span className="text-muted-foreground shrink-0">
                            {daysAgo === 0 ? "hoje" : `${daysAgo}d atrás`}
                          </span>
                        </div>
                      );
                    })}
                    {group.length > 4 && (
                      <p className="text-xs text-muted-foreground">+{group.length - 4} contatos</p>
                    )}
                  </div>
                </div>
              )}

              {group.length === 0 && (
                <div className="border-t border-white/40 bg-white/30 px-4 py-3 text-xs text-muted-foreground">
                  Nenhum contato neste segmento ainda.
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Scatter visual */}
      <div className="bg-card border rounded-xl p-5">
        <h2 className="font-semibold mb-4 text-sm">Distribuição Frequência × Valor (scores RFM)</h2>
        <div className="relative h-48 bg-muted/30 rounded-lg overflow-hidden">
          {/* Grid lines */}
          <div className="absolute inset-0 grid grid-cols-4 grid-rows-4">
            {Array.from({ length: 16 }).map((_, i) => (
              <div key={i} className="border border-border/20" />
            ))}
          </div>
          {/* Axis labels */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-muted-foreground">Frequência →</div>
          <div className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground" style={{ writingMode: "vertical-rl", transform: "translateY(-50%) rotate(180deg)" }}>← Valor</div>
          {/* Dots */}
          {(contacts as unknown as Contact[]).map((c) => {
            const freq = c.rfm_frequency ?? 1;
            const monetary = c.rfm_monetary ?? 1;
            const x = maxFreq > 1 ? ((freq - 1) / (maxFreq - 1)) * 85 + 8 : 8;
            const y = maxMonetary > 1 ? (1 - (monetary - 1) / (maxMonetary - 1)) * 85 + 5 : 90;
            const seg = classifyContact(c, 1);
            const dotColor =
              seg === "champions" ? "#ca8a04" :
              seg === "loyal" ? "#16a34a" :
              seg === "at_risk" ? "#ea580c" :
              seg === "lost" ? "#dc2626" : "#2563eb";
            return (
              <div
                key={c.id}
                title={`${c.name ?? "?"} — freq: ${freq}/5, valor: ${monetary}/5`}
                className="absolute w-2.5 h-2.5 rounded-full border border-white/50 cursor-pointer hover:scale-150 transition-transform"
                style={{ left: `${x}%`, top: `${y}%`, backgroundColor: dotColor, transform: "translate(-50%,-50%)" }}
              />
            );
          })}
        </div>
        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-3">
          {(Object.entries(SEGMENTS) as [RFMSegment, typeof SEGMENTS[RFMSegment]][]).map(([key, seg]) => (
            <div key={key} className="flex items-center gap-1.5 text-xs">
              <div className={cn("w-2.5 h-2.5 rounded-full",
                key === "champions" ? "bg-yellow-600" :
                key === "loyal" ? "bg-green-600" :
                key === "at_risk" ? "bg-orange-600" :
                key === "lost" ? "bg-red-600" : "bg-blue-600"
              )} />
              <span className="text-muted-foreground">{seg.label} ({segments[key].length})</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
