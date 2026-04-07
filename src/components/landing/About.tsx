import { useInView } from "@/hooks/useInView";
import { Bot, Zap, TrendingUp } from "lucide-react";

export default function About() {
  const { ref, inView } = useInView();

  return (
    <section ref={ref} className="py-20 md:py-28">
      <div className={`container mx-auto px-4 max-w-4xl text-center space-y-6 transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <h2 className="text-3xl md:text-4xl font-black font-syne tracking-tighter">
          Seu e-commerce precisa de um <br />
          <span className="text-primary italic">Agente de Retenção 24/7.</span>
        </h2>
        <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto font-medium">
          Não é um bot de disparo. É um <strong className="text-foreground">Agente de IA</strong> que analisa o comportamento de cada cliente,
          prescreve a oferta certa e executa a recuperação via WhatsApp. Enquanto você dorme, ele minera lucro na sua base de dados.
        </p>
        <div className="grid md:grid-cols-3 gap-6 pt-12">
          {[
            { icon: Bot, title: "Agente IA", desc: "Toma decisões de venda em tempo real baseado em comportamento — sem templates genéricos, sem spam." },
            { icon: Zap, title: "Escala sem CAC", desc: "Aumente seu faturamento sem gastar mais em anúncios, focando em quem já te conhece." },
            { icon: TrendingUp, title: "LTV Exponencial", desc: "Transforme compradores únicos em clientes fiéis que compram mais vezes com margem maior." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="p-8 rounded-[2rem] bg-card/40 border border-white/5 space-y-4 text-left group hover:border-primary/20 transition-all">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Icon className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-black text-xl font-syne tracking-tight">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
