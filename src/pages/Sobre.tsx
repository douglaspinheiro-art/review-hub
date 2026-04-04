import Layout from "@/components/Layout";
import { MessageCircle, Target, Heart, Users, TrendingUp, Zap } from "lucide-react";

const values = [
  {
    icon: Target,
    title: "Foco em Resultado",
    desc: "Cada funcionalidade existe para gerar mais vendas e retenção para nossos clientes.",
  },
  {
    icon: Heart,
    title: "Obsessão pelo Cliente",
    desc: "Suporte dedicado, onboarding personalizado e melhoria contínua baseada em feedback real.",
  },
  {
    icon: Zap,
    title: "Inovação Constante",
    desc: "Integramos as mais recentes tecnologias de IA para manter nossos clientes sempre à frente.",
  },
  {
    icon: TrendingUp,
    title: "Crescimento Compartilhado",
    desc: "Quando nossos clientes crescem, nós crescemos. Nosso sucesso está diretamente ligado ao deles.",
  },
];

const team = [
  { name: "Douglas Almeida", role: "CEO & Co-fundador", initial: "D" },
  { name: "Ana Ribeiro", role: "CTO & Co-fundadora", initial: "A" },
  { name: "Carlos Mendes", role: "Head de Produto", initial: "C" },
  { name: "Fernanda Costa", role: "Head de Sucesso do Cliente", initial: "F" },
];

export default function Sobre() {
  return (
    <Layout>
      {/* Hero */}
      <section className="py-20 md:py-28 bg-muted/30">
        <div className="container mx-auto px-4 text-center max-w-3xl">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <MessageCircle className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold mb-6">
            Sobre a <span className="text-primary">LTV Boost</span>
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Nascemos da necessidade real de e-commerces brasileiros em transformar conversas no WhatsApp em vendas concretas. Unimos automação, inteligência artificial e comunicação humanizada em uma única plataforma.
          </p>
        </div>
      </section>

      {/* Missão */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
            <div>
              <h2 className="text-3xl font-bold mb-4">Nossa <span className="text-primary">Missão</span></h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Democratizar o marketing conversacional de alta performance para e-commerces de todos os tamanhos. Acreditamos que toda empresa merece ter acesso às mesmas ferramentas de automação e IA que as grandes corporações usam.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Transformamos cada mensagem de WhatsApp em uma oportunidade de negócio — do primeiro contato ao pós-venda, criando relacionamentos duradouros entre marcas e clientes.
              </p>
            </div>
            <div className="bg-card border rounded-3xl p-8 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">200+ clientes ativos</p>
                  <p className="text-sm text-muted-foreground">E-commerces em todo o Brasil</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">12x ROI médio</p>
                  <p className="text-sm text-muted-foreground">Retorno sobre investimento comprovado</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">500K+ consumidores impactados</p>
                  <p className="text-sm text-muted-foreground">Mensagens entregues via plataforma</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Valores */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Nossos <span className="text-primary">Valores</span></h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {values.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-card border rounded-2xl p-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Time */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Nosso <span className="text-primary">Time</span></h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-3xl mx-auto">
            {team.map(({ name, role, initial }) => (
              <div key={name} className="bg-card border rounded-2xl p-6 text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-primary">{initial}</span>
                </div>
                <p className="font-semibold">{name}</p>
                <p className="text-sm text-muted-foreground mt-1">{role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
}
