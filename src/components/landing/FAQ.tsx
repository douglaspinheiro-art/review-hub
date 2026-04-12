import { useInView } from "@/hooks/useInView";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    q: "Preciso ter WhatsApp Business API para usar a LTV Boost?",
    a: "Sim, a plataforma utiliza a API oficial do WhatsApp Business. Nós cuidamos de toda a configuração e integração para você, sem complicação.",
  },
  {
    q: "Existe limite de mensagens enviadas?",
    a: "Os limites seguem as políticas do Meta/WhatsApp. Com nossa plataforma, ajudamos você a gerenciar esses limites de forma inteligente para maximizar o alcance.",
  },
  {
    q: "Quanto tempo leva a implantação?",
    a: "A implantação completa leva em média 5 a 10 dias úteis, incluindo integração com seu e-commerce, configuração de chatbot e treinamento da equipe.",
  },
  {
    q: "Posso integrar com meu ERP ou CRM atual?",
    a: "Sim! Temos mais de 40 integrações nativas com as principais plataformas do mercado, além de API Rest para integrações customizadas.",
  },
  {
    q: "Como funciona o chatbot com IA?",
    a: "Nosso chatbot usa inteligência artificial para entender a intenção do cliente, responder perguntas frequentes, recomendar produtos e até finalizar vendas - tudo de forma automática.",
  },
  {
    q: "Existe fidelidade ou multa contratual?",
    a: "Não. Trabalhamos com planos mensais sem fidelidade. Acreditamos que os resultados falam por si e nossos clientes ficam porque querem.",
  },
];

export default function FAQ() {
  const { ref, inView } = useInView();

  return (
    <section id="faq" ref={ref} className="py-20 md:py-28 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className={`text-center max-w-2xl mx-auto mb-12 transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Perguntas <span className="text-primary">Frequentes</span>
          </h2>
        </div>

        <div className={`max-w-3xl mx-auto transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((f, idx) => (
              <AccordionItem key={idx} value={`item-${idx}`} className="bg-card border rounded-xl px-6">
                <AccordionTrigger className="text-left text-sm md:text-base font-medium hover:no-underline">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-sm leading-relaxed">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
