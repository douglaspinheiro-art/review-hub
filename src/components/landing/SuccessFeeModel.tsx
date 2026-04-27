import { useInView } from "@/hooks/useInView";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowRight, Lock, CheckCircle2 } from "lucide-react";

const EXAMPLE_ROWS = [
  { label: "Faturamento mensal da loja", value: "R$ 600.000" },
  { label: "Receita recuperada média no trimestre", value: "R$ 142.000" },
  { label: "Success fee (2,5%)", value: "R$ 3.550" },
  { label: "Base fixa trimestral", value: "R$ 5.400" },
];

export default function SuccessFeeModel() {
  const { ref, inView } = useInView();

  return (
    <section ref={ref} className="py-24 md:py-28">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
          {/* Left: copy */}
          <div
            className={cn(
              "space-y-6 transition-all duration-700",
              inView ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8"
            )}
          >
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-xs font-bold px-3 py-1.5 rounded-full border border-primary/20 uppercase tracking-wider">
              <Lock className="w-3 h-3" />
              Único modelo do mercado
            </div>

            <h2 className="text-3xl md:text-4xl font-display font-bold leading-tight">
              Cobramos quando recuperamos.{" "}
              <span className="text-gradient">Simples assim.</span>
            </h2>

            <p className="text-muted-foreground text-lg leading-relaxed">
              Modelo híbrido alinhado a resultado: <strong className="text-foreground">base fixa baixa</strong> para cobrir
              infraestrutura + <strong className="text-foreground">success fee de 2-3% apenas sobre a receita
              comprovadamente recuperada</strong> — auditável no seu GA4, não em dashboard inflado da ferramenta.
            </p>

            <ul className="space-y-3">
              {[
                "Sem fidelidade. Sem letra miúda.",
                "Se não recuperarmos, você não paga success fee.",
                "Atribuição auditada no seu GA4 antes de cada fatura.",
                "Cláusula de saída em 90 dias se ROI < 5x.",
              ].map((item) => (
                <li key={item} className="flex gap-3 text-sm">
                  <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>

            <Button
              asChild
              size="lg"
              className="h-12 px-6 gap-1.5 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25"
            >
              <a href="/signup">
                Solicitar diagnóstico gratuito <ArrowRight className="w-4 h-4" />
              </a>
            </Button>
          </div>

          {/* Right: example card */}
          <div
            className={cn(
              "transition-all duration-700",
              inView ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"
            )}
          >
            <div className="relative">
              <div className="absolute -inset-6 bg-primary/10 blur-[80px] rounded-full opacity-50" />
              <div className="relative bg-card border border-border/50 rounded-2xl p-7 shadow-2xl">
                <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground mb-1">
                  Exemplo trimestral
                </p>
                <h3 className="font-display font-bold text-xl mb-6">
                  Loja faturando R$ 600k/mês
                </h3>

                <div className="space-y-3 mb-6">
                  {EXAMPLE_ROWS.map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between py-2 border-b border-border/40"
                    >
                      <span className="text-sm text-muted-foreground">{row.label}</span>
                      <span className="text-sm font-bold font-mono">{row.value}</span>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl bg-primary/10 border border-primary/30 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Investimento total
                    </span>
                    <span className="text-xl font-display font-extrabold font-mono">R$ 8.950</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary">
                      ROI no trimestre
                    </span>
                    <span className="text-3xl font-display font-extrabold text-primary font-mono">15,8x</span>
                  </div>
                </div>

                <p className="text-[10px] text-muted-foreground mt-4 leading-relaxed">
                  Exemplo ilustrativo baseado na mediana de lojas no ICP nos primeiros 90 dias.
                  Resultado individual varia conforme base e ticket médio.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}