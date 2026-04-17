import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { ArrowRight, Code, Zap, Shield, Globe } from "lucide-react";

const features = [
  {
    icon: Code,
    title: "REST API completa",
    desc: "Endpoints para mensagens, contatos, campanhas, automações e analytics. Padrão REST com JSON.",
  },
  {
    icon: Zap,
    title: "Webhooks em tempo real",
    desc: "Receba eventos de entrega, leitura e resposta de mensagens instantaneamente na sua aplicação.",
  },
  {
    icon: Shield,
    title: "Segurança enterprise",
    desc: "Autenticação via API Key e OAuth 2.0, rate limiting, logs de auditoria e IPs autorizados.",
  },
  {
    icon: Globe,
    title: "40+ integrações nativas",
    desc: "Shopify, WooCommerce, Vtex, HubSpot, RD Station, Salesforce e muito mais prontos para usar.",
  },
];

const integrations = [
  { name: "Shopify", category: "E-commerce" },
  { name: "WooCommerce", category: "E-commerce" },
  { name: "Vtex", category: "E-commerce" },
  { name: "Nuvemshop", category: "E-commerce" },
  { name: "Magento", category: "E-commerce" },
  
  { name: "HubSpot", category: "CRM" },
  { name: "Salesforce", category: "CRM" },
  { name: "RD Station", category: "Marketing" },
  { name: "Mercado Pago", category: "Pagamentos" },
  { name: "PagSeguro", category: "Pagamentos" },
  { name: "Bling", category: "ERP" },
  { name: "SAP", category: "ERP" },
  { name: "Melhor Envio", category: "Logística" },
  { name: "API REST", category: "Custom" },
];

export default function API() {
  return (
    <Layout>
      {/* Hero */}
      <section className="py-20 md:py-28 bg-muted/30">
        <div className="container mx-auto px-4 text-center max-w-3xl">
          <span className="inline-block px-4 py-1.5 bg-primary/10 text-primary text-sm font-semibold rounded-full mb-6">
            Para Desenvolvedores
          </span>
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4">
            API & <span className="text-primary">Integrações</span>
          </h1>
          <p className="text-lg text-muted-foreground mb-8">
            Integre a LTV Boost com qualquer sistema. REST API documentada, webhooks, SDKs e 40+ integrações nativas prontas para usar.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button asChild size="lg" className="gap-2">
              <a href="/documentacao">
                Ver documentação <ArrowRight className="w-4 h-4" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#integrations">Ver integrações</a>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {features.map(({ icon: Icon, title, desc }) => (
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

      {/* Exemplo de código */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="text-2xl font-bold mb-2">Comece em <span className="text-primary">minutos</span></h2>
          <p className="text-muted-foreground mb-6">Envie sua primeira mensagem com apenas uma chamada de API.</p>
          <pre className="bg-card border rounded-2xl p-6 text-sm font-mono overflow-x-auto leading-relaxed">
{`// Instalar: npm install axios

const axios = require('axios');

const response = await axios.post(
  'https://api.LTV Boost.com.br/v1/messages/send',
  {
    to: '5511999999999',
    type: 'text',
    text: 'Olá! Bem-vindo à LTV Boost 🚀'
  },
  {
    headers: {
      'Authorization': 'Bearer SUA_API_KEY',
      'Content-Type': 'application/json'
    }
  }
);

console.log(response.data.id); // msg_01HXYZ...`}
          </pre>
          <div className="mt-4 text-right">
            <Button asChild variant="ghost" size="sm" className="gap-1">
              <a href="/documentacao">Ver documentação completa <ArrowRight className="w-3.5 h-3.5" /></a>
            </Button>
          </div>
        </div>
      </section>

      {/* Integrações */}
      <section id="integrations" className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-2">
            <span className="text-primary">40+</span> integrações nativas
          </h2>
          <p className="text-muted-foreground text-center mb-10">Conecte com os principais e-commerces, ERPs, CRMs e gateways de pagamento.</p>
          <div className="flex flex-wrap gap-3 justify-center max-w-3xl mx-auto">
            {integrations.map((int) => (
              <div key={int.name} className="bg-card border rounded-xl px-4 py-2.5 flex items-center gap-2 hover:border-primary/30 transition-colors">
                <span className="text-sm font-medium">{int.name}</span>
                <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">{int.category}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4 text-center max-w-xl">
          <h2 className="text-2xl font-bold mb-2">Pronto para integrar?</h2>
          <p className="text-muted-foreground mb-6">Nosso time técnico está disponível para ajudar na integração.</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button asChild className="gap-2">
              <a href="#agendar-demo">Falar com especialista <ArrowRight className="w-4 h-4" /></a>
            </Button>
            <Button asChild variant="outline">
              <a href="/documentacao">Ver documentação</a>
            </Button>
          </div>
        </div>
      </section>
    </Layout>
  );
}
