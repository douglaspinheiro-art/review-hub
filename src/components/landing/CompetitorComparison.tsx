import { useInView } from "@/hooks/useInView";
import { cn } from "@/lib/utils";
import { Check, X, Sparkles } from "lucide-react";

type Column = {
  key: "dashboards" | "consultorias" | "chatbots" | "ltv";
  label: string;
  sub: string;
  highlight?: boolean;
};

const COLUMNS: readonly Column[] = [
  { key: "dashboards", label: "Dashboards", sub: "(painéis paralelos)" },
  { key: "consultorias", label: "Consultorias CRO", sub: "(humano + planilha)" },
  { key: "chatbots", label: "Chatbots", sub: "(atendimento)" },
  { key: "ltv", label: "LTV Boost", sub: "Loop fechado", highlight: true },
] as const;

type Cell = boolean | "partial";

const ROWS: { capability: string; values: Record<Column["key"], Cell> }[] = [
  {
    capability: "Conecta plataforma e-commerce nativamente",
    values: { dashboards: false, consultorias: "partial", chatbots: "partial", ltv: true },
  },
  {
    capability: "Lê dado real do GA4 da loja",
    values: { dashboards: false, consultorias: "partial", chatbots: false, ltv: true },
  },
  {
    capability: "IA decide quem abordar e quando",
    values: { dashboards: false, consultorias: false, chatbots: false, ltv: true },
  },
  {
    capability: "Executa no canal (WhatsApp/Email)",
    values: { dashboards: false, consultorias: false, chatbots: true, ltv: true },
  },
  {
    capability: "Mensura de volta no GA4",
    values: { dashboards: false, consultorias: "partial", chatbots: false, ltv: true },
  },
  {
    capability: "Loop recalibra automaticamente",
    values: { dashboards: false, consultorias: false, chatbots: false, ltv: true },
  },
  {
    capability: "Sem caixa-preta de atribuição",
    values: { dashboards: false, consultorias: true, chatbots: false, ltv: true },
  },
];

function CellIcon({ value }: { value: Cell }) {
  if (value === true) return <Check className="w-5 h-5 text-primary mx-auto" />;
  if (value === "partial")
    return (
      <span className="inline-block px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-500 text-[10px] font-bold uppercase tracking-wider">
        manual
      </span>
    );
  return <X className="w-5 h-5 text-muted-foreground/40 mx-auto" />;
}

export default function CompetitorComparison() {
  const { ref, inView } = useInView();

  return (
    <section ref={ref} className="py-24 md:py-28">
      <div className="container mx-auto px-4">
        <div
          className={cn(
            "max-w-2xl mx-auto text-center mb-10 transition-all duration-700",
            inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          )}
        >
          <p className="text-primary font-semibold text-sm mb-3 uppercase tracking-widest">
            Por que somos diferentes
          </p>
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            Ninguém mais <span className="text-gradient">fecha o loop</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Plataformas de painel mostram. Consultorias recomendam. Chatbots respondem. Só a LTV Boost lê do GA4,
            decide com IA, executa no canal e devolve a métrica auditável.
          </p>
        </div>

        <div
          className={cn(
            "max-w-5xl mx-auto rounded-2xl border border-border/50 overflow-hidden bg-card transition-all duration-700",
            inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          )}
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-secondary/40">
                  <th className="text-left text-xs font-bold uppercase tracking-wider text-muted-foreground px-5 py-4">
                    Capacidade
                  </th>
                  {COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      className={cn(
                        "text-center text-xs font-bold uppercase tracking-wider px-4 py-4",
                        c.highlight ? "bg-primary/10 text-primary" : "text-muted-foreground"
                      )}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        {c.highlight && <Sparkles className="w-3.5 h-3.5" />}
                        <span>{c.label}</span>
                        <span className="text-[9px] font-medium normal-case opacity-70">{c.sub}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, i) => (
                  <tr
                    key={row.capability}
                    className={cn("border-t border-border/40", i % 2 === 1 && "bg-secondary/20")}
                  >
                    <td className="px-5 py-4 text-sm font-medium">{row.capability}</td>
                    {COLUMNS.map((c) => (
                      <td
                        key={c.key}
                        className={cn("px-4 py-4 text-center", c.highlight && "bg-primary/5")}
                      >
                        <CellIcon value={row.values[c.key]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6 max-w-2xl mx-auto">
          Comparação baseada em capacidades públicas das categorias mencionadas. Só a LTV Boost atravessa os três sistemas
          do lojista — e-commerce, GA4 e canal — em um único loop auditável.
        </p>
      </div>
    </section>
  );
}