import { useInView } from "@/hooks/useInView";
import { useEffect, useState } from "react";

const metrics = [
  { value: 500000, label: "Consumidores impactados", prefix: "", suffix: "+", format: "500K" },
  { value: 12, label: "ROI médio dos clientes", prefix: "", suffix: "x", format: "12" },
  { value: 1000000, label: "Em vendas geradas", prefix: "R$ ", suffix: "+", format: "1M" },
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
    <section ref={ref} className="py-16 md:py-20">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-3 gap-8 text-center">
          {metrics.map((m) => (
            <div key={m.label} className={`space-y-2 transition-all duration-700 ${inView ? "opacity-100 scale-100" : "opacity-0 scale-75"}`}>
              <p className="text-4xl md:text-5xl font-extrabold text-primary">
                <Counter target={m.value} prefix={m.prefix} suffix={m.suffix} format={m.format} animate={inView} />
              </p>
              <p className="text-muted-foreground font-medium">{m.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
