import Layout from "@/components/Layout";

const sections = [
  {
    title: "1. Informações que coletamos",
    content: `Coletamos informações que você nos fornece diretamente ao criar uma conta, contratar nossos serviços ou entrar em contato conosco. Isso inclui: nome completo, e-mail, telefone, dados da empresa (razão social, CNPJ), dados de faturamento e informações de uso da plataforma.

Também coletamos automaticamente dados técnicos como endereço IP, tipo de navegador, páginas visitadas, tempo de sessão e logs de uso da API, conforme você interage com nossos serviços.`,
  },
  {
    title: "2. Como usamos suas informações",
    content: `Utilizamos suas informações para:
• Fornecer, operar e melhorar nossos serviços
• Processar pagamentos e gerenciar sua conta
• Enviar comunicações relacionadas ao serviço (onboarding, suporte, atualizações)
• Analisar o uso da plataforma para melhorar a experiência do usuário
• Cumprir obrigações legais e regulatórias
• Prevenir fraudes e garantir a segurança da plataforma`,
  },
  {
    title: "3. Compartilhamento de dados",
    content: `Não vendemos seus dados pessoais a terceiros. Podemos compartilhar suas informações com:

• Prestadores de serviço que nos auxiliam na operação (processadores de pagamento, servidores em nuvem, ferramentas de suporte) — sempre com contratos de proteção de dados
• Autoridades legais quando exigido por lei ou ordem judicial
• Potenciais compradores em caso de fusão, aquisição ou venda de ativos — com notificação prévia a você`,
  },
  {
    title: "4. Retenção de dados",
    content: `Mantemos seus dados pelo período necessário para prestar os serviços contratados e cumprir obrigações legais. Após o encerramento da conta:

• Dados de conta: excluídos em até 90 dias após solicitação
• Dados de faturamento: retidos por 5 anos (obrigação fiscal)
• Logs de auditoria: retidos por 12 meses
• Backups: removidos nos ciclos regulares de rotação (máximo 30 dias)`,
  },
  {
    title: "5. Segurança",
    content: `Implementamos medidas técnicas e organizacionais para proteger seus dados, incluindo: criptografia em trânsito (TLS 1.3) e em repouso (AES-256), controle de acesso por perfil, autenticação multifator para acesso administrativo, monitoramento contínuo e auditorias de segurança regulares.

Em caso de incidente de segurança que afete seus dados, notificaremos você e a ANPD conforme exigido pela LGPD, dentro do prazo de 72 horas.`,
  },
  {
    title: "6. Seus direitos (LGPD)",
    content: `Nos termos da Lei 13.709/2018 (LGPD), você tem os seguintes direitos em relação aos seus dados pessoais:

• Confirmação: saber se tratamos seus dados
• Acesso: receber cópia dos dados que temos sobre você
• Correção: solicitar atualização de dados incompletos ou incorretos
• Anonimização ou bloqueio: para dados desnecessários ou excessivos
• Eliminação: exclusão de dados tratados com base em consentimento
• Portabilidade: receber seus dados em formato estruturado
• Oposição: contestar o tratamento realizado em desconformidade com a lei

Para exercer qualquer direito, entre em contato: privacidade@LTV Boost.com.br`,
  },
  {
    title: "7. Cookies",
    content: `Utilizamos cookies essenciais (necessários para o funcionamento da plataforma), cookies de desempenho (análise de uso agregado) e cookies de funcionalidade (preferências do usuário). Não utilizamos cookies de rastreamento de terceiros para fins publicitários sem seu consentimento explícito.`,
  },
  {
    title: "8. Contato",
    content: `Encarregado de Proteção de Dados (DPO): privacidade@LTV Boost.com.br
Endereço: Rua Exemplo, 1000 — São Paulo, SP — CEP 01310-100
Telefone: (11) 3000-0000`,
  },
];

export default function Privacidade() {
  return (
    <Layout>
      <section className="py-20">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="mb-10">
            <h1 className="text-4xl font-extrabold mb-3">Política de <span className="text-primary">Privacidade</span></h1>
            <p className="text-muted-foreground text-sm">
              Última atualização: 01 de janeiro de 2025 · Versão 2.1
            </p>
            <p className="text-muted-foreground mt-4 leading-relaxed">
              Esta Política de Privacidade descreve como a <strong>LTV Boost Tecnologia Ltda.</strong> ("LTV Boost", "nós" ou "nosso") coleta, usa, armazena e protege suas informações pessoais ao utilizar nossa plataforma e serviços.
            </p>
          </div>

          <div className="space-y-8">
            {sections.map((section) => (
              <div key={section.title} className="border-b pb-8 last:border-0">
                <h2 className="text-lg font-bold mb-3">{section.title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                  {section.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
}
