import Layout from "@/components/Layout";
import { ArrowRight, Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

const posts = [
  {
    slug: "como-aumentar-vendas-whatsapp",
    category: "Marketing",
    title: "Como aumentar vendas pelo WhatsApp em 30 dias",
    excerpt: "Estratégias práticas de marketing conversacional para e-commerces que querem resultados rápidos sem comprometer a experiência do cliente.",
    date: "28 Mar 2025",
    readTime: "6 min",
  },
  {
    slug: "chatbot-ia-atendimento",
    category: "Automação",
    title: "Chatbot com IA: como automatizar sem perder o toque humano",
    excerpt: "Aprenda a configurar fluxos de chatbot que resolvem até 80% dos atendimentos automaticamente, escalando para humanos no momento certo.",
    date: "21 Mar 2025",
    readTime: "8 min",
  },
  {
    slug: "matriz-rfm-ecommerce",
    category: "Analytics",
    title: "Matriz RFM: entenda o valor de cada cliente",
    excerpt: "Como usar a análise de Recência, Frequência e Valor Monetário para segmentar sua base e criar campanhas que realmente convertem.",
    date: "14 Mar 2025",
    readTime: "5 min",
  },
  {
    slug: "whatsapp-business-api",
    category: "WhatsApp API",
    title: "WhatsApp Business API: tudo que você precisa saber",
    excerpt: "Diferença entre WhatsApp Business App e API, como fazer a migração, e por que a API oficial é essencial para escalar suas operações.",
    date: "7 Mar 2025",
    readTime: "10 min",
  },
  {
    slug: "recuperacao-carrinho-abandonado",
    category: "Conversão",
    title: "Recuperação de carrinho abandonado via WhatsApp",
    excerpt: "Táticas de mensagens automatizadas que recuperam entre 15% e 35% dos carrinhos abandonados com abordagem personalizada.",
    date: "28 Fev 2025",
    readTime: "7 min",
  },
  {
    slug: "lgpd-marketing-whatsapp",
    category: "Compliance",
    title: "LGPD e marketing via WhatsApp: como se manter em conformidade",
    excerpt: "Guia prático para coletar consentimento, gerenciar opt-outs e manter sua operação dentro das exigências da Lei Geral de Proteção de Dados.",
    date: "21 Fev 2025",
    readTime: "9 min",
  },
];

const categories = ["Todos", "Marketing", "Automação", "Analytics", "WhatsApp API", "Conversão", "Compliance"];

export default function Blog() {
  return (
    <Layout>
      {/* Hero */}
      <section className="py-20 md:py-28 bg-muted/30">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4">
            Blog <span className="text-primary">LTV Boost</span>
          </h1>
          <p className="text-lg text-muted-foreground">
            Estratégias, tutoriais e tendências de marketing conversacional para e-commerces.
          </p>
        </div>
      </section>

      {/* Categorias */}
      <section className="py-8 border-b">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap gap-2 justify-center">
            {categories.map((cat) => (
              <button
                key={cat}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                  cat === "Todos"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary hover:text-primary"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Posts */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {posts.map((post) => (
              <article key={post.slug} className="bg-card border rounded-2xl overflow-hidden hover:shadow-md transition-shadow group">
                <div className="h-40 bg-gradient-to-br from-primary/10 to-accent" />
                <div className="p-6">
                  <span className="inline-block px-3 py-1 bg-primary/10 text-primary text-xs font-semibold rounded-full mb-3">
                    {post.category}
                  </span>
                  <h2 className="font-bold text-lg leading-snug mb-2 group-hover:text-primary transition-colors">
                    {post.title}
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                    {post.excerpt}
                  </p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{post.date}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{post.readTime}</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="text-center mt-12">
            <Button variant="outline" size="lg">Carregar mais artigos</Button>
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4 text-center max-w-xl">
          <h2 className="text-2xl font-bold mb-2">Receba nossos <span className="text-primary">melhores conteúdos</span></h2>
          <p className="text-muted-foreground mb-6">Toda semana, direto no seu WhatsApp ou e-mail.</p>
          <div className="flex gap-2 max-w-sm mx-auto">
            <input
              type="email"
              placeholder="seu@email.com"
              className="flex-1 px-4 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Button>Assinar</Button>
          </div>
        </div>
      </section>
    </Layout>
  );
}
