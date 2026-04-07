import { useInView } from "@/hooks/useInView";
import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const metrics = [
  {
    value: 500000, label: "Recuperações enviadas", prefix: "", suffix: "+", format: "500K",
    tooltip: "Total de mensagens de recuperação (carrinho, PIX, reativação) enviadas via WhatsApp por todas as lojas ativas na plataforma.",
  },
  {
    value: 12, label: "ROI médio em recuperação", prefix: "", suffix: "x", format: "12",
    tooltip: "Calculado como receita recuperada ÷ mensalidade paga. Mediana de 200+ lojas ativas nos últimos 12 meses. Lojas de moda: 8–16x. Beleza: 10–18x. Suplementos: 12–22x.",
  },
  {
    value: 1000000, label: "Em faturamento recuperado", prefix: "R$ ", suffix: "+", format: "1M",
    tooltip: "Soma de todas as transações confirmadas atribuídas às automações do LTV Boost (carrinho abandonado, reativação e cross-sell) — últimos 12 meses.",
  },
];

function Counter({ target, prefix, suffix, format, animate }: {
  target: number; prefix: string; suffix: string; format: string; animate: boolean;
}) {
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (!animate) return;
    const duration = 2000;
    const steps = 60;
    const increment = target / steps;
    let current = 0;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      current += increment;
      if (step >= steps) {
        setDisplay(format);
        clearInterval(timer);
      } else {
        if (target >= 1000000) setDisplay(`${Math.floor(current / 1000000 * 10) / 10}M`);
        else if (target >= 1000) setDisplay(`${Math.floor(current / 1000)}K`);
        else setDisplay(`${Math.floor(current)}`);
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [animate, target, format]);

  return (
    <span>{prefix}{display}{suffix}</span>
  );
}

export default function Metrics() {
  const { ref, inView } = useInView(0.3);

  return (
    <section ref={ref} className="py-16 md:py-24 space-y-20">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-3 gap-8 text-center">
          {metrics.map((m) => (
            <div key={m.label} className={`space-y-2 transition-all duration-700 ${inView ? "opacity-100 scale-100" : "opacity-0 scale-75"}`}>
              <p className="text-4xl md:text-5xl font-extrabold text-primary">
                <Counter target={m.value} prefix={m.prefix} suffix={m.suffix} format={m.format} animate={inView} />
              </p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="text-muted-foreground font-medium uppercase tracking-widest text-[10px] font-black inline-flex items-center gap-1 cursor-help">
                      {m.label} <Info className="w-3 h-3 opacity-40" />
                    </p>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                    {m.tooltip}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          ))}
        </div>
      </div>

      <div className="container mx-auto px-4">
        <div className={`bg-primary/5 border border-primary/20 rounded-[2.5rem] p-8 md:p-12 text-center space-y-6 transition-all duration-1000 delay-500 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"}`}>
          <h3 className="text-3xl md:text-5xl font-black font-syne tracking-tighter max-w-4xl mx-auto">
            R$ 1.247.382,00.
          </h3>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto font-medium">
            Esse foi o valor que nossa IA identificou como <span className="text-primary font-bold">"dinheiro parado"</span> nos checkouts dos nossos clientes apenas nos últimos 30 dias. Quanto desse valor pertence à sua loja?
          </p>
        </div>
      </div>
    </section>
  );
}
