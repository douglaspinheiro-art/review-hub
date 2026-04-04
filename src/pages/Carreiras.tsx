import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { ArrowRight, MapPin, Briefcase, Heart, Zap, Users, TrendingUp } from "lucide-react";

const perks = [
  { icon: Heart, title: "Plano de saúde", desc: "Cobertura total para você e dependentes" },
  { icon: Zap, title: "Work anywhere", desc: "100% remoto com encontros presenciais trimestrais" },
  { icon: TrendingUp, title: "Stock options", desc: "Participação no crescimento da empresa" },
  { icon: Users, title: "Ambiente inclusivo", desc: "Time diverso, horizontal e sem microgestão" },
];

const openings = [
  {
    title: "Engenheiro(a) de Software Full Stack",
    area: "Tecnologia",
    type: "CLT",
    location: "Remoto",
    desc: "Desenvolvimento de novas funcionalidades da plataforma usando React, TypeScript e Node.js. Experiência com APIs REST e integrações de terceiros.",
  },
  {
    title: "Product Designer (UI/UX)",
    area: "Produto",
    type: "CLT",
    location: "Remoto",
    desc: "Responsável pelo design end-to-end de funcionalidades, desde pesquisa com usuários até entrega de protótipos para o time de engenharia.",
  },
  {
    title: "Customer Success Manager",
    area: "Sucesso do Cliente",
    type: "CLT",
    location: "Remoto / SP",
    desc: "Onboarding, acompanhamento de saúde e expansão de contas. Foco em NPS, churn e expansão de receita.",
  },
  {
    title: "Especialista em Marketing de Conteúdo",
    area: "Marketing",
    type: "CLT ou PJ",
    location: "Remoto",
    desc: "Criação de conteúdo educativo (blog, vídeos, cases) para atrair e educar e-commerces sobre marketing conversacional.",
  },
];

export default function Carreiras() {
  return (
    <Layout>
      {/* Hero */}
      <section className="py-20 md:py-28 bg-muted/30">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4">
            Construa o futuro do <span className="text-primary">comércio conversacional</span>
          </h1>
          <p className="text-lg text-muted-foreground mb-8">
            Somos um time apaixonado por resolver problemas reais de e-commerces. Se você quer impacto, autonomia e crescimento, você está no lugar certo.
          </p>
          <Button asChild size="lg" className="gap-2">
            <a href="#vagas">Ver vagas abertas <ArrowRight className="w-4 h-4" /></a>
          </Button>
        </div>
      </section>

      {/* Benefícios */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-10">Por que a <span className="text-primary">LTV Boost</span>?</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {perks.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-card border rounded-2xl p-6 text-center">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-1">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Vagas */}
      <section id="vagas" className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-10">Vagas <span className="text-primary">abertas</span></h2>
          <div className="space-y-4 max-w-3xl mx-auto">
            {openings.map((job) => (
              <div key={job.title} className="bg-card border rounded-2xl p-6 hover:shadow-md transition-shadow">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
                  <div>
                    <h3 className="font-bold text-lg">{job.title}</h3>
                    <div className="flex flex-wrap gap-3 mt-1">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Briefcase className="w-3 h-3" />{job.area}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3" />{job.location}
                      </span>
                      <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full font-medium">
                        {job.type}
                      </span>
                    </div>
                  </div>
                  <Button size="sm" className="gap-1 shrink-0">
                    Candidatar <ArrowRight className="w-3 h-3" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{job.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <p className="text-muted-foreground mb-4">Não encontrou a vaga ideal?</p>
            <Button asChild variant="outline">
              <a href="/contato">Envie seu currículo espontaneamente</a>
            </Button>
          </div>
        </div>
      </section>
    </Layout>
  );
}
