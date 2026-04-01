import { useInView } from "@/hooks/useInView";
import { Card, CardContent } from "@/components/ui/card";
import {
  Megaphone, Mail, Smartphone, Brain, FlaskConical,
  BarChart3, Target, Route, LineChart,
  MessageSquare, Tags, Users, HeadphonesIcon,
} from "lucide-react";

const solutions = [
  {
    id: "campanhas",
    title: "Campanhas Inteligentes",
    desc: "Envie campanhas personalizadas via WhatsApp, E-mail e SMS com IA e teste A/B para maximizar resultados.",
    features: [
      { icon: Megaphone, label: "WhatsApp em massa" },
      { icon: Mail, label: "E-mail & SMS" },
      { icon: Brain, label: "Personalização com IA" },
      { icon: FlaskConical, label: "Teste A/B" },
    ],
  },
  {
    id: "analytics",
    title: "Analytics em Tempo Real",
    desc: "Monitore a jornada do cliente com matriz RFM, tracking avançado e dashboards intuitivos.",
    features: [
      { icon: BarChart3, label: "Matriz RFM" },
      { icon: Target, label: "Monitoramento" },
      { icon: Route, label: "Tracking de jornada" },
      { icon: LineChart, label: "Dashboards" },
    ],
  },
  {
    id: "engajamento",
    title: "Engajamento & Fidelização",
    desc: "Chatbot com IA, múltiplos atendentes, categorização inteligente e muito mais para reter clientes.",
    features: [
      { icon: MessageSquare, label: "Chatbot IA" },
      { icon: Tags, label: "Categorização" },
      { icon: Users, label: "Múltiplos atendentes" },
      { icon: HeadphonesIcon, label: "Suporte integrado" },
    ],
  },
];

export default function Solutions() {
  const { ref, inView } = useInView();

  return (
    <section id="solucoes" ref={ref} className="py-20 md:py-28 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className={`text-center max-w-2xl mx-auto mb-16 transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Tudo que você precisa em <span className="text-primary">uma plataforma</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Três frentes integradas para dominar o marketing conversacional do seu e-commerce.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {solutions.map((s, idx) => (
            <Card
              key={s.id}
              className={`border-0 shadow-lg hover:shadow-xl transition-all duration-500 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              style={{ transitionDelay: `${idx * 150}ms` }}
            >
              <CardContent className="p-8 space-y-6">
                <h3 className="text-xl font-bold">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                <div className="grid grid-cols-2 gap-3">
                  {s.features.map(({ icon: Icon, label }) => (
                    <div key={label} className="flex items-center gap-2 text-sm">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <span className="text-muted-foreground">{label}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
