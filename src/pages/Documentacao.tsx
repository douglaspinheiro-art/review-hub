import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Code, Key, Webhook, Zap, BookOpen, ExternalLink } from "lucide-react";

const sections = [
  {
    icon: Key,
    title: "Autenticação",
    desc: "API Keys, OAuth 2.0 e gerenciamento de tokens de acesso.",
    href: "#auth",
  },
  {
    icon: MessageIcon,
    title: "Mensagens",
    desc: "Enviar, receber e gerenciar mensagens via WhatsApp.",
    href: "#messages",
  },
  {
    icon: Webhook,
    title: "Webhooks",
    desc: "Receba eventos em tempo real na sua aplicação.",
    href: "#webhooks",
  },
  {
    icon: Zap,
    title: "Automações",
    desc: "Criar e gerenciar fluxos automatizados via API.",
    href: "#automations",
  },
];

function MessageIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

const endpoints = [
  { method: "POST", path: "/v1/messages/send", desc: "Enviar mensagem para um contato" },
  { method: "GET", path: "/v1/messages/{id}", desc: "Buscar status de uma mensagem" },
  { method: "POST", path: "/v1/campaigns", desc: "Criar campanha de disparo em massa" },
  { method: "GET", path: "/v1/contacts", desc: "Listar contatos com filtros e paginação" },
  { method: "POST", path: "/v1/contacts", desc: "Criar ou atualizar um contato" },
  { method: "GET", path: "/v1/analytics/overview", desc: "Métricas gerais da conta" },
];

const methodColor: Record<string, string> = {
  GET: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  POST: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  PUT: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export default function Documentacao() {
  return (
    <Layout>
      {/* Hero */}
      <section className="py-20 md:py-28 bg-muted/30">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Code className="w-6 h-6 text-primary" />
            </div>
            <span className="text-sm font-semibold text-primary px-3 py-1 bg-primary/10 rounded-full">API v1.0</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4">
            Documentação da <span className="text-primary">API</span>
          </h1>
          <p className="text-lg text-muted-foreground mb-8">
            Integre a LTV Boost com seu sistema, plataforma de e-commerce ou CRM. REST API com autenticação via API Key.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="gap-2">
              <a href="#quickstart"><Zap className="w-4 h-4" /> Começar agora</a>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <a href="#referencia"><BookOpen className="w-4 h-4" /> Referência completa</a>
            </Button>
          </div>
        </div>
      </section>

      {/* Base URL */}
      <section className="py-12 border-b">
        <div className="container mx-auto px-4 max-w-3xl">
          <p className="text-sm font-medium text-muted-foreground mb-2">BASE URL</p>
          <div className="bg-muted rounded-xl p-4 font-mono text-sm flex items-center justify-between">
            <span>https://api.LTV Boost.com.br/v1</span>
            <button
              className="text-xs text-primary hover:underline"
              onClick={() => navigator.clipboard?.writeText("https://api.LTV Boost.com.br/v1")}
            >
              Copiar
            </button>
          </div>
        </div>
      </section>

      {/* Seções */}
      <section className="py-16">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
            {sections.map(({ icon: Icon, title, desc, href }) => (
              <a key={title} href={href} className="bg-card border rounded-2xl p-5 hover:shadow-md hover:border-primary/30 transition-all group">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold mb-1 text-sm">{title}</h3>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </a>
            ))}
          </div>

          {/* Quickstart */}
          <div id="quickstart" className="mb-16">
            <h2 className="text-2xl font-bold mb-6">Quickstart</h2>
            <div className="space-y-4">
              <div className="bg-card border rounded-xl p-6">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">1</span>
                  Obtenha sua API Key
                </h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Acesse <strong>Configurações → Integrações → API Keys</strong> no painel da LTV Boost e gere uma nova chave.
                </p>
              </div>

              <div className="bg-card border rounded-xl p-6">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">2</span>
                  Faça sua primeira requisição
                </h3>
                <pre className="bg-muted rounded-lg p-4 text-xs font-mono overflow-x-auto">
{`curl -X POST https://api.LTV Boost.com.br/v1/messages/send \\
  -H "Authorization: Bearer SUA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "5511999999999",
    "type": "text",
    "text": "Olá! Esta é uma mensagem de teste."
  }'`}
                </pre>
              </div>

              <div className="bg-card border rounded-xl p-6">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">3</span>
                  Resposta de sucesso
                </h3>
                <pre className="bg-muted rounded-lg p-4 text-xs font-mono overflow-x-auto">
{`{
  "id": "msg_01HXYZ123ABC",
  "status": "queued",
  "to": "5511999999999",
  "created_at": "2025-04-01T10:00:00Z"
}`}
                </pre>
              </div>
            </div>
          </div>

          {/* Endpoints */}
          <div id="referencia">
            <h2 className="text-2xl font-bold mb-6">Endpoints principais</h2>
            <div className="bg-card border rounded-2xl divide-y">
              {endpoints.map((ep) => (
                <div key={ep.path} className="flex items-center gap-4 p-4 hover:bg-muted/40 transition-colors">
                  <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold shrink-0 ${methodColor[ep.method]}`}>
                    {ep.method}
                  </span>
                  <code className="text-sm font-mono text-primary shrink-0">{ep.path}</code>
                  <span className="text-sm text-muted-foreground">{ep.desc}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground ml-auto shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SDKs */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <h2 className="text-2xl font-bold mb-2">SDKs e bibliotecas</h2>
          <p className="text-muted-foreground mb-8">Integrações oficiais para as principais linguagens.</p>
          <div className="flex flex-wrap gap-3 justify-center">
            {["Node.js", "Python", "PHP", "Ruby", "Go"].map((lang) => (
              <div key={lang} className="bg-card border rounded-xl px-5 py-3 font-mono text-sm font-medium">
                {lang}
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground mt-6">SDKs em desenvolvimento — acesso antecipado disponível.</p>
        </div>
      </section>
    </Layout>
  );
}
