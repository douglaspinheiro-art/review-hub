import { useInView } from "@/hooks/useInView";
import { Repeat, Heart, Rocket, Eye } from "lucide-react";

const benefits = [
  { icon: Repeat, title: "Automação Completa", desc: "Automatize fluxos de atendimento, vendas e pós-venda sem perder o toque humano." },
  { icon: Heart, title: "Fidelização Real", desc: "Crie programas de relacionamento que transformam compradores em clientes fiéis." },
  { icon: Rocket, title: "Campanhas que Convertem", desc: "Segmentação inteligente e mensagens personalizadas que geram resultados." },
  { icon: Eye, title: "Insights em Tempo Real", desc: "Dashboards completos com métricas que importam para tomar decisões rápidas." },
];

export default function Benefits() {
  const { ref, inView } = useInView();

  return (
    <section ref={ref} className="py-20 md:py-28 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className={`text-center max-w-2xl mx-auto mb-16 transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Visão <span className="text-primary">360°</span> do seu cliente
          </h2>
          <p className="text-muted-foreground text-lg">
            Tudo que você precisa para entender, engajar e reter seus clientes em um único lugar.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {benefits.map(({ icon: Icon, title, desc }, idx) => (
            <div
              key={title}
              className={`p-6 rounded-2xl bg-card border shadow-sm hover:shadow-md transition-all duration-500 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              style={{ transitionDelay: `${idx * 100}ms` }}
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        <div className={`mt-16 bg-card border rounded-2xl p-8 shadow-sm transition-all duration-700 delay-300 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <h3 className="font-semibold text-lg mb-4 text-center">Receita Influenciada pela ConversaHub</h3>
          <div className="flex items-end justify-center gap-3 h-40">
            {[35, 48, 42, 65, 58, 78, 72, 88, 82, 95, 90, 100].map((h, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div
                  className="w-6 md:w-10 bg-primary/80 rounded-t-md transition-all duration-700"
                  style={{ height: inView ? `${h}%` : "0%", transitionDelay: `${i * 50}ms` }}
                />
                <span className="text-[10px] text-muted-foreground">{["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
