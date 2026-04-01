import { useInView } from "@/hooks/useInView";
import { Bot, Zap, TrendingUp } from "lucide-react";

export default function About() {
  const { ref, inView } = useInView();

  return (
    <section ref={ref} className="py-20 md:py-28">
      <div className={`container mx-auto px-4 max-w-4xl text-center space-y-6 transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <h2 className="text-3xl md:text-4xl font-bold">
          Marketing conversacional <span className="text-primary">potencializado por IA</span>
        </h2>
        <p className="text-lg text-muted-foreground leading-relaxed">
          Combinamos automação inteligente, análise de dados em tempo real e comunicação omnichannel
          para transformar cada conversa em uma oportunidade de negócio. Do primeiro contato ao pós-venda,
          oferecemos uma experiência completa e personalizada para seus clientes.
        </p>
        <div className="grid md:grid-cols-3 gap-6 pt-8">
          {[
            { icon: Bot, title: "IA Avançada", desc: "Chatbots inteligentes que entendem e respondem como humanos" },
            { icon: Zap, title: "Automação Total", desc: "Fluxos automatizados para cada etapa da jornada do cliente" },
            { icon: TrendingUp, title: "Resultados Reais", desc: "ROI comprovado com métricas transparentes e em tempo real" },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="p-6 rounded-2xl bg-secondary/50 space-y-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
                <Icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-lg">{title}</h3>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
