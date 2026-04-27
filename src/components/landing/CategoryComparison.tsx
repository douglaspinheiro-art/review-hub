import { useInView } from "@/hooks/useInView";
import { cn } from "@/lib/utils";
import { Check, X, MessageCircle, Mail, Briefcase, Sparkles } from "lucide-react";

type CategoryKey = "whatsapp" | "email" | "agency" | "ltv";

type Category = {
  key: CategoryKey;
  label: string;
  sub: string;
  icon: typeof MessageCircle;
  highlight?: boolean;
  tag?: string;
};

const CATEGORIES: readonly Category[] = [
  { key: "whatsapp", label: "Ferramentas de WhatsApp", sub: "(disparo isolado)", icon: MessageCircle },
  { key: "email",    label: "Plataformas de E-mail",   sub: "(envio em massa)",  icon: Mail },
  { key: "agency",   label: "Agências de CRM",          sub: "(humano + planilha)", icon: Briefcase },
  { key: "ltv",      label: "LTV Boost",                sub: "Closed-Loop Revenue Recovery", icon: Sparkles, highlight: true, tag: "Você está aqui" },
] as const;

const ROWS: { capability: string; values: Record<CategoryKey, boolean> }[] = [
  { capability: "Lê dados reais do seu GA4",        values: { whatsapp: false, email: false, agency: false, ltv: true } },
  { capability: "Mapeia perda em 5 dimensões",      values: { whatsapp: false, email: false, agency: false, ltv: true } },
  { capability: "Executa multicanal sincronizado",  values: { whatsapp: false, email: false, agency: false, ltv: true } },
  { capability: "Atribui receita no seu GA4",       values: { whatsapp: false, email: false, agency: false, ltv: true } },
  { capability: "Auditável sem caixa-preta",        values: { whatsapp: false, email: false, agency: false, ltv: true } },
];

export default function CategoryComparison() {
  const { ref, inView } = useInView();

  return (
    <section ref={ref} className="py-20 md:py-24">
      <div className="container mx-auto px-4">
        <div
          className={cn(
            "max-w-3xl mx-auto text-center mb-12 transition-all duration-700",
            inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          )}
        >
          <p className="text-primary font-semibold text-sm mb-3 uppercase tracking-widest">
            Categoria nova
          </p>
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            Não somos mais uma ferramenta de WhatsApp.{" "}
            <span className="text-gradient">Somos uma categoria nova.</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Em 2026, e-commerce não perde dinheiro por falta de ferramenta — perde por falta de loop fechado.
            As 3 categorias existentes resolvem 1 pedaço cada. A LTV Boost fecha o ciclo inteiro.
          </p>
        </div>

        <div
          className={cn(
            "grid md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto transition-all duration-700",
            inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          )}
        >
          {CATEGORIES.map((cat, i) => (
            <div
              key={cat.key}
              className={cn(
                "relative rounded-2xl border p-5 flex flex-col gap-4 transition-all",
                cat.highlight
                  ? "border-primary bg-primary/5 ring-2 ring-primary/30 shadow-xl shadow-primary/10"
                  : "border-border/50 bg-card"
              )}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              {cat.tag && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1 rounded-full whitespace-nowrap shadow-lg shadow-primary/30 uppercase tracking-wider">
                  {cat.tag}
                </div>
              )}

              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                    cat.highlight ? "bg-primary/20" : "bg-secondary"
                  )}
                >
                  <cat.icon className={cn("w-5 h-5", cat.highlight ? "text-primary" : "text-muted-foreground")} />
                </div>
                <div className="min-w-0">
                  <p className={cn("text-sm font-bold leading-tight", cat.highlight && "text-primary")}>
                    {cat.label}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{cat.sub}</p>
                </div>
              </div>

              <ul className="space-y-2 border-t border-border/40 pt-4">
                {ROWS.map((row) => {
                  const ok = row.values[cat.key];
                  return (
                    <li key={row.capability} className="flex items-start gap-2 text-xs">
                      {ok ? (
                        <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      ) : (
                        <X className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-0.5" />
                      )}
                      <span className={cn(ok ? "text-foreground font-medium" : "text-muted-foreground/60")}>
                        {row.capability}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-10 max-w-3xl mx-auto">
          As 3 primeiras categorias resolvem 1 pedaço. Nós somos os <strong className="text-foreground">únicos</strong> que
          fechamos o ciclo inteiro — e provamos no único lugar que importa: o seu GA4.
        </p>
      </div>
    </section>
  );
}