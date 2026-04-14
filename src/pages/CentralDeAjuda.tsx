// @ts-nocheck
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Search, MessageCircle, BookOpen, Video, ArrowRight, ChevronRight } from "lucide-react";

const categories = [
  {
    icon: MessageCircle,
    title: "WhatsApp & Conexão",
    desc: "Conectar número, QR Code, sessão e status",
    articles: 12,
    href: "#whatsapp",
  },
  {
    icon: BookOpen,
    title: "Campanhas e Disparos",
    desc: "Criação, envio em massa e agendamento",
    articles: 18,
    href: "#campanhas",
  },
  {
    icon: Video,
    title: "Chatbot e Automação",
    desc: "Fluxos, respostas automáticas e IA",
    articles: 15,
    href: "#chatbot",
  },
  {
    icon: Search,
    title: "Analytics e Relatórios",
    desc: "Dashboards, RFM e métricas de campanhas",
    articles: 9,
    href: "#analytics",
  },
];

const popular = [
  { title: "Como conectar meu número de WhatsApp à plataforma", views: "2.4k", href: "#" },
  { title: "Criando minha primeira campanha de disparo em massa", views: "1.8k", href: "#" },
  { title: "Como importar contatos via planilha CSV", views: "1.5k", href: "#" },
  { title: "Configurando o chatbot com respostas automáticas", views: "1.2k", href: "#" },
  { title: "Entendendo a matriz RFM e como usar na segmentação", views: "980", href: "#" },
  { title: "Limites de envio do WhatsApp Business API", views: "870", href: "#" },
];

export default function CentralDeAjuda() {
  return (
    <Layout>
      {/* Hero */}
      <section className="py-20 md:py-24 bg-gradient-to-b from-primary/5 to-background">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4">
            Central de <span className="text-primary">Ajuda</span>
          </h1>
          <p className="text-lg text-muted-foreground mb-8">
            Encontre respostas, tutoriais e guias para usar todo o potencial da LTV Boost.
          </p>
          <div className="relative max-w-lg mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar artigos, tutoriais e guias..."
              className="w-full pl-12 pr-4 py-3.5 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
            />
          </div>
        </div>
      </section>

      {/* Categorias */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-8">Navegue por <span className="text-primary">categoria</span></h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
            {categories.map(({ icon: Icon, title, desc, articles, href }) => (
              <a
                key={title}
                href={href}
                className="bg-card border rounded-2xl p-6 hover:shadow-md hover:border-primary/30 transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-1">{title}</h3>
                <p className="text-sm text-muted-foreground mb-3">{desc}</p>
                <span className="text-xs text-primary font-medium">{articles} artigos →</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Artigos populares */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="text-2xl font-bold mb-8">Artigos mais <span className="text-primary">acessados</span></h2>
          <div className="bg-card border rounded-2xl divide-y">
            {popular.map((article) => (
              <a
                key={article.title}
                href={article.href}
                className="flex items-center justify-between p-4 hover:bg-muted/40 transition-colors group"
              >
                <span className="text-sm font-medium group-hover:text-primary transition-colors pr-4">
                  {article.title}
                </span>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground">{article.views} views</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Suporte direto */}
      <section className="py-16">
        <div className="container mx-auto px-4 text-center max-w-xl">
          <h2 className="text-2xl font-bold mb-2">Não encontrou o que precisava?</h2>
          <p className="text-muted-foreground mb-6">Nossa equipe de suporte está disponível para ajudar.</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button asChild className="gap-2">
              <a href="/contato"><MessageCircle className="w-4 h-4" /> Falar com suporte</a>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <a href="/documentacao"><BookOpen className="w-4 h-4" /> Ver documentação</a>
            </Button>
          </div>
        </div>
      </section>
    </Layout>
  );
}
