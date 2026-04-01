import { Button } from "@/components/ui/button";
import { ArrowRight, Star, ShoppingCart, User, MessageCircle } from "lucide-react";

const words = ["Vendas", "Marketing", "Dados", "Atendimentos"];

export default function Hero() {
  return (
    <section className="pt-28 pb-16 md:pt-36 md:pb-24 overflow-hidden">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 bg-secondary text-secondary-foreground text-sm font-medium px-4 py-1.5 rounded-full">
              <div className="flex -space-x-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="w-6 h-6 rounded-full bg-primary/20 border-2 border-background flex items-center justify-center">
                    <User className="w-3 h-3 text-primary" />
                  </div>
                ))}
              </div>
              200+ clientes satisfeitos
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight">
              Potencialize suas{" "}
              <span className="relative inline-block h-[1.2em] overflow-hidden align-bottom">
                <span className="animate-word-rotate flex flex-col">
                  {words.map((w) => (
                    <span key={w} className="text-primary h-[1.2em] flex items-center">{w}</span>
                  ))}
                </span>
              </span>
              <br />
              no WhatsApp
            </h1>

            <p className="text-lg text-muted-foreground max-w-lg">
              A plataforma completa de marketing conversacional com IA para e-commerces que querem vender mais, fidelizar clientes e automatizar atendimento.
            </p>

            <div className="flex flex-wrap gap-3">
              <Button size="lg" className="gap-2">
                Agendar Demo <ArrowRight className="w-4 h-4" />
              </Button>
              <Button size="lg" variant="outline">Ver Cases</Button>
            </div>
          </div>

          <div className="relative hidden lg:block">
            <div className="relative w-full h-[480px]">
              {/* Phone mockup */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent rounded-3xl" />
              <div className="absolute top-8 right-8 w-72 bg-card rounded-2xl shadow-xl border p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <MessageCircle className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Chat WhatsApp</p>
                    <p className="text-xs text-muted-foreground">Agora</p>
                  </div>
                </div>
                <div className="bg-secondary rounded-xl p-3 text-sm">
                  Olá Maria! 🎉 Temos uma oferta exclusiva para você: 20% OFF na coleção de verão!
                </div>
                <div className="bg-primary text-primary-foreground rounded-xl p-3 text-sm ml-8">
                  Quero ver! Me manda o link 😍
                </div>
              </div>

              <div className="absolute bottom-12 left-4 w-56 bg-card rounded-2xl shadow-xl border p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Maria Silva</p>
                    <p className="text-xs text-muted-foreground">Cliente VIP</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Star className="w-3 h-3 text-primary fill-primary" />
                  <span>12 compras · R$ 4.800</span>
                </div>
              </div>

              <div className="absolute top-1/2 left-1/3 w-48 bg-card rounded-2xl shadow-xl border p-3">
                <div className="flex items-center gap-2 mb-2">
                  <ShoppingCart className="w-4 h-4 text-primary" />
                  <p className="text-xs font-semibold">Produto Favorito</p>
                </div>
                <div className="w-full h-16 bg-secondary rounded-lg mb-2" />
                <p className="text-xs text-muted-foreground">Kit Skincare Premium</p>
                <p className="text-sm font-bold text-primary">R$ 189,90</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
