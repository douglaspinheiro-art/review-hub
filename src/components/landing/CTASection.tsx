import { Button } from "@/components/ui/button";
import { ArrowRight, HelpCircle, Gift, ShoppingBag, ClipboardList } from "lucide-react";
import { useInView } from "@/hooks/useInView";

const examples = [
  { icon: HelpCircle, title: "Quiz Interativo", msg: "Responda 3 perguntas e ganhe um cupom exclusivo! 🎯" },
  { icon: Gift, title: "Promoção Flash", msg: "🔥 Só hoje: 30% OFF em toda a loja! Use FLASH30" },
  { icon: ShoppingBag, title: "Carrinho Abandonado", msg: "Ei! Você esqueceu itens no carrinho. Finalize com 10% OFF 🛒" },
  { icon: ClipboardList, title: "Pesquisa NPS", msg: "Como foi sua experiência? Avalie de 1 a 10 ⭐" },
];

export default function CTASection() {
  const { ref, inView } = useInView();

  return (
    <section ref={ref} className="py-20 md:py-28">
      <div className="container mx-auto px-4">
        <div className={`text-center max-w-2xl mx-auto mb-12 transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Vamos <span className="text-primary">começar?</span>
          </h2>
          <p className="text-muted-foreground text-lg mb-6">
            Veja exemplos do que você pode enviar via WhatsApp com a ConversaHub.
          </p>
          <Button size="lg" className="gap-2">
            Agendar Demo <ArrowRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
          {examples.map(({ icon: Icon, title, msg }, idx) => (
            <div
              key={title}
              className={`bg-card border rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-500 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              style={{ transitionDelay: `${idx * 100}ms` }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <span className="text-sm font-semibold">{title}</span>
              </div>
              <div className="bg-secondary rounded-xl p-3 text-sm text-muted-foreground">
                {msg}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
