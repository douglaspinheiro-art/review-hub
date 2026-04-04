import { useInView } from "@/hooks/useInView";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const metrics = [
  { value: 47200000, label: "Vendas geradas pela plataforma", prefix: "R$ ", suffix: "", format: "47.2M", context: "nos últimos 12 meses" },
  { value: 200, label: "E-commerces ativos", prefix: "", suffix: "+", format: "200", context: "em todo o Brasil" },
  { value: 12, label: "ROI médio dos clientes", prefix: "", suffix: "x", format: "12", context: "vs média de 3x do mercado" },
  { value: 94, label: "Taxa de abertura WhatsApp", prefix: "", suffix: "%", format: "94", context: "vs 22% do e-mail" },
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
        if (target >= 1000000) setDisplay(`${(Math.floor(current / 100000) / 10).toFixed(1)}M`);
        else if (target >= 1000) setDisplay(`${Math.floor(current / 1000)}K`);
        else setDisplay(`${Math.floor(current)}`);
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [animate, target, format]);

  return <span>{prefix}{display}{suffix}</span>;
}

export default function Metrics() {
  const { ref, inView } = useInView(0.3);

  return (
    <section ref={ref} className="py-20 md:py-28 border-y border-border/50">
      <div className="container mx-auto px-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {metrics.map((m, idx) => (
            <div key={m.label} className={cn(
              "text-center space-y-2 transition-all duration-700",
              inView ? "opacity-100 scale-100" : "opacity-0 scale-90"
            )} style={{ transitionDelay: `${idx * 100}ms` }}>
              <p className="text-3xl md:text-4xl font-display font-extrabold text-primary">
                <Counter target={m.value} prefix={m.prefix} suffix={m.suffix} format={m.format} animate={inView} />
              </p>
              <p className="text-sm font-semibold">{m.label}</p>
              <p className="text-xs text-muted-foreground">{m.context}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
