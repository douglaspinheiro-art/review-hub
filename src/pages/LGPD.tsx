import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Shield, CheckCircle, FileText, Mail } from "lucide-react";

const rights = [
  { title: "Confirmação", desc: "Confirmar se tratamos seus dados pessoais." },
  { title: "Acesso", desc: "Receber uma cópia dos dados que possuímos sobre você." },
  { title: "Correção", desc: "Solicitar atualização de dados incompletos, inexatos ou desatualizados." },
  { title: "Anonimização/Bloqueio", desc: "Para dados desnecessários, excessivos ou tratados em desconformidade." },
  { title: "Eliminação", desc: "Excluir dados pessoais tratados com base em consentimento." },
  { title: "Portabilidade", desc: "Receber seus dados em formato estruturado e interoperável." },
  { title: "Não compartilhamento", desc: "Ser informado sobre com quem compartilhamos seus dados." },
  { title: "Revogação do consentimento", desc: "Retirar consentimento previamente dado a qualquer momento." },
  { title: "Oposição", desc: "Contestar tratamento realizado em desconformidade com a LGPD." },
];

const measures = [
  { icon: Shield, title: "Criptografia ponta a ponta", desc: "Todos os dados em trânsito e em repouso são criptografados com padrões AES-256 e TLS 1.3." },
  { icon: CheckCircle, title: "Minimização de dados", desc: "Coletamos apenas os dados estritamente necessários para a prestação do serviço." },
  { icon: FileText, title: "Registro de atividades", desc: "Mantemos logs de acesso e operações conforme exigido pelo Marco Civil da Internet." },
  { icon: Mail, title: "DPO designado", desc: "Possuímos Encarregado de Proteção de Dados (DPO) dedicado e acessível." },
];

export default function LGPD() {
  return (
    <Layout>
      {/* Hero */}
      <section className="py-20 md:py-28 bg-muted/30">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4">
            Conformidade com a <span className="text-primary">LGPD</span>
          </h1>
          <p className="text-lg text-muted-foreground">
            A LTV Boost está em conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018). Entenda como protegemos seus dados e os direitos que você possui.
          </p>
        </div>
      </section>

      {/* O que é a LGPD */}
      <section className="py-16">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="text-2xl font-bold mb-4">O que é a <span className="text-primary">LGPD</span>?</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            A Lei Geral de Proteção de Dados (LGPD), Lei nº 13.709/2018, é a legislação brasileira que regula o tratamento de dados pessoais por pessoas físicas e jurídicas. Inspirada no GDPR europeu, ela estabelece princípios, direitos dos titulares e obrigações para quem coleta e processa dados pessoais.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            A ANPD (Autoridade Nacional de Proteção de Dados) é o órgão responsável por fiscalizar o cumprimento da lei. A LTV Boost atua tanto como <strong>controladora</strong> (em relação aos dados de seus clientes diretos) quanto como <strong>operadora</strong> (em relação aos dados dos usuários finais tratados em nome de seus clientes).
          </p>
        </div>
      </section>

      {/* Medidas implementadas */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-10">Medidas que <span className="text-primary">implementamos</span></h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {measures.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-card border rounded-2xl p-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2 text-sm">{title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Seus direitos */}
      <section className="py-16">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="text-2xl font-bold mb-8">Seus <span className="text-primary">direitos</span> como titular</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {rights.map((right) => (
              <div key={right.title} className="bg-card border rounded-xl p-4 flex gap-3">
                <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">{right.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{right.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Como exercer direitos */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="text-2xl font-bold mb-4">Como exercer seus <span className="text-primary">direitos</span></h2>
          <p className="text-muted-foreground mb-6 leading-relaxed">
            Para exercer qualquer direito previsto na LGPD, entre em contato com nosso Encarregado de Proteção de Dados (DPO). Responderemos dentro do prazo legal de 15 dias.
          </p>
          <div className="bg-card border rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="font-semibold">DPO — Encarregado de Proteção de Dados</p>
              <p className="text-sm text-muted-foreground mt-1">privacidade@LTV Boost.com.br</p>
            </div>
            <Button asChild variant="outline">
              <a href="/contato">Enviar solicitação</a>
            </Button>
          </div>

          <div className="mt-8 p-4 bg-primary/5 border border-primary/20 rounded-xl">
            <p className="text-sm text-muted-foreground">
              <strong>Prazo de resposta:</strong> 15 dias corridos a partir do recebimento da solicitação, conforme art. 19 da LGPD. Em casos complexos, o prazo pode ser estendido por mais 15 dias, com justificativa.
            </p>
          </div>
        </div>
      </section>
    </Layout>
  );
}
