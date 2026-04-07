import { useState } from "react";
import { useInView } from "@/hooks/useInView";
import {
  Megaphone, Mail, Smartphone, Brain, FlaskConical,
  BarChart3, Target, Route, LineChart,
  MessageSquare, Tags, Users, HeadphonesIcon,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  {
    id: "campanhas",
    label: "Campanhas",
    title: "Campanhas Inteligentes",
    desc: "Dispare campanhas personalizadas via WhatsApp, E-mail e SMS com segmentação por IA e testes A/B para maximizar cada envio.",
    features: [
      "WhatsApp em massa com personalização",
      "E-mail & SMS integrados",
      "Segmentação por IA e comportamento",
      "Testes A/B automáticos",
      "Templates pré-aprovados",
      "Agendamento inteligente",
    ],
    mockup: {
      title: "Campanha: Black Friday VIP",
      stats: [
        { label: "Enviadas", value: "12.4K" },
        { label: "Abertas", value: "94%" },
        { label: "Vendas", value: "R$340K" },
      ],
    },
  },
  {
    id: "analytics",
    label: "Analytics",
    title: "Analytics em Tempo Real",
    desc: "Monitore a jornada do cliente com matriz RFM, tracking avançado e dashboards intuitivos que mostram onde agir.",
    features: [
      "Matriz RFM automática",
      "Monitoramento de jornada",
      "Cohorts e LTV analysis",
      "Dashboards customizáveis",
      "Alertas inteligentes",
      "Exportação de relatórios",
    ],
    mockup: {
      title: "Dashboard de Performance",
      stats: [
        { label: "LTV Médio", value: "R$892" },
        { label: "Retenção", value: "67%" },
        { label: "NPS", value: "78" },
      ],
    },
  },
  {
    id: "engajamento",
    label: "Engajamento",
    title: "Engajamento & Fidelização",
    desc: "Chatbot com IA, múltiplos atendentes e automações que mantêm seus clientes comprando mais e voltando sempre.",
    features: [
      "Chatbot com IA conversacional",
      "Múltiplos atendentes simultâneos",
      "Categorização automática",
      "Fluxos de pós-venda",
      "Programa de fidelidade",
      "NPS e pesquisas automatizadas",
    ],
    mockup: {
      title: "Inbox Unificado",
      stats: [
        { label: "Satisfação", value: "4.8/5" },
        { label: "Tempo resp.", value: "< 2min" },
        { label: "Resolvidos", value: "96%" },
      ],
    },
  },
];

export default function Solutions() {
  const { ref, inView } = useInView();
  const [active, setActive] = useState("campanhas");
  const tab = tabs.find(t => t.id === active)!;

  return (
    <section id="solucoes" ref={ref} className="py-24 md:py-32">
      <div className="container mx-auto px-4">
        <div className={cn(
          "text-center max-w-2xl mx-auto mb-12 transition-all duration-700",
          inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        )}>
          <p className="text-primary font-semibold text-sm mb-3 uppercase tracking-widest">Plataforma completa</p>
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            Tudo que você precisa, <span className="text-gradient">nada que não precisa</span>
          </h2>
        </div>

        {/* Tabs */}
        <div className={cn(
          "flex justify-center gap-2 mb-12 transition-all duration-700",
          inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        )}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={cn(
                "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all",
                active === t.id
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                  : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className={cn(
          "grid lg:grid-cols-2 gap-12 items-center max-w-5xl mx-auto transition-all duration-500",
          inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        )}>
          <div className="space-y-6">
            <h3 className="text-2xl font-display font-bold">{tab.title}</h3>
            <p className="text-muted-foreground leading-relaxed">{tab.desc}</p>
            <ul className="space-y-3">
              {tab.features.map(f => (
                <li key={f} className="flex items-center gap-3 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-muted-foreground">{f}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Mockup */}
          <div className="bg-card border border-border/50 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-destructive/60" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <div className="w-3 h-3 rounded-full bg-primary/60" />
              <span className="ml-2 text-xs text-muted-foreground">{tab.mockup.title}</span>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {tab.mockup.stats.map(s => (
                <div key={s.label} className="bg-secondary/50 rounded-xl p-4 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
                  <p className="text-lg font-bold text-primary mt-1">{s.value}</p>
                </div>
              ))}
            </div>
            <div className="h-32 bg-secondary/30 rounded-xl flex items-center justify-center">
              <div className="flex items-end gap-1 h-20">
                {[40, 55, 45, 70, 60, 80, 75, 90, 85, 95].map((h, i) => (
                  <div key={i} className="w-4 bg-gradient-to-t from-primary/50 to-primary rounded-t-sm" style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
