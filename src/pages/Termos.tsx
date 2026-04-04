import Layout from "@/components/Layout";

const sections = [
  {
    title: "1. Aceitação dos Termos",
    content: `Ao acessar ou utilizar os serviços da LTV Boost Tecnologia Ltda. ("LTV Boost"), você concorda com estes Termos de Uso. Se você utiliza a plataforma em nome de uma empresa, declara ter autoridade para vinculá-la a estes termos.`,
  },
  {
    title: "2. Descrição do Serviço",
    content: `A LTV Boost é uma plataforma SaaS de marketing conversacional que permite a clientes ("Clientes") enviar mensagens via WhatsApp Business API, criar automações de chatbot, gerenciar contatos e analisar resultados de campanhas.

O serviço é fornecido "como está" e pode ser atualizado, modificado ou descontinuado com aviso prévio mínimo de 30 dias, exceto em casos de força maior ou exigência legal.`,
  },
  {
    title: "3. Conta e Responsabilidades",
    content: `Você é responsável por:
• Manter a confidencialidade de suas credenciais de acesso
• Todas as atividades realizadas em sua conta
• Garantir que todos os usuários adicionados à conta estejam cientes e em conformidade com estes termos
• Notificar imediatamente a LTV Boost sobre qualquer acesso não autorizado

Você não pode: compartilhar credenciais entre usuários, usar a plataforma para atividades ilegais ou que violem as políticas do WhatsApp/Meta, realizar engenharia reversa do software ou tentar acessar sistemas sem autorização.`,
  },
  {
    title: "4. Uso do WhatsApp Business API",
    content: `A LTV Boost opera como parceiro oficial da Meta para acesso à WhatsApp Business API. Ao utilizar nossos serviços de mensageria, você concorda também com os Termos de Serviço do WhatsApp Business e as Políticas de Mensageria da Meta.

É expressamente proibido:
• Enviar mensagens não solicitadas (spam)
• Usar a API para enviar conteúdo ilegal, enganoso ou que viole direitos de terceiros
• Tentar contornar os limites de volume estabelecidos pelo Meta
• Usar números de WhatsApp não aprovados pela Meta para disparos em massa`,
  },
  {
    title: "5. Pagamentos e Cancelamento",
    content: `Os planos da LTV Boost são personalizados e definidos em proposta comercial individualizada. O faturamento ocorre mensalmente, com cobrança antecipada.

Cancelamento: você pode cancelar a qualquer momento sem multa contratual. O acesso permanece ativo até o final do período pago. Não há reembolso proporcional por período não utilizado após a cobrança já realizada.

Inadimplência: após 7 dias de atraso, a conta será suspensa. Após 30 dias, os dados poderão ser removidos permanentemente.`,
  },
  {
    title: "6. Propriedade Intelectual",
    content: `A LTV Boost e todo seu conteúdo (software, interface, marca, documentação) são de propriedade exclusiva da LTV Boost Tecnologia Ltda. Você recebe uma licença limitada, não exclusiva e intransferível para usar a plataforma durante o período de contrato.

Seus dados e conteúdos enviados através da plataforma permanecem de sua propriedade. Você concede à LTV Boost uma licença limitada para processar esses dados exclusivamente para fins de prestação do serviço.`,
  },
  {
    title: "7. Limitação de Responsabilidade",
    content: `A LTV Boost não se responsabiliza por perdas indiretas, lucros cessantes ou danos consequentes decorrentes do uso ou impossibilidade de uso do serviço.

Nossa responsabilidade máxima está limitada ao valor pago pelo Cliente nos 3 meses anteriores ao evento que originou a reclamação.

Não garantimos disponibilidade ininterrupta do serviço, mas nos comprometemos a atingir o SLA de 99.9% de uptime mensal.`,
  },
  {
    title: "8. Alterações nos Termos",
    content: `Podemos modificar estes termos com aviso prévio de 30 dias por e-mail ou notificação na plataforma. O uso continuado dos serviços após o prazo de aviso constitui aceite das novas condições.`,
  },
  {
    title: "9. Lei Aplicável e Foro",
    content: `Estes termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da Comarca de São Paulo, Estado de São Paulo, para dirimir quaisquer controvérsias, com renúncia a qualquer outro por mais privilegiado que seja.`,
  },
  {
    title: "10. Contato",
    content: `LTV Boost Tecnologia Ltda.
CNPJ: 00.000.000/0001-00
Rua Exemplo, 1000 — São Paulo, SP — CEP 01310-100
legal@LTV Boost.com.br`,
  },
];

export default function Termos() {
  return (
    <Layout>
      <section className="py-20">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="mb-10">
            <h1 className="text-4xl font-extrabold mb-3">Termos de <span className="text-primary">Uso</span></h1>
            <p className="text-muted-foreground text-sm">
              Última atualização: 01 de janeiro de 2025 · Versão 3.0
            </p>
            <p className="text-muted-foreground mt-4 leading-relaxed">
              Leia atentamente estes Termos de Uso antes de utilizar a plataforma LTV Boost. Eles estabelecem os direitos e obrigações de ambas as partes.
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
