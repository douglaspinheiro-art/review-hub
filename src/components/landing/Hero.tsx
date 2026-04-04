import { Button } from "@/components/ui/button";
import { ArrowRight, Star, ShoppingCart, User, MessageCircle, Sparkles } from "lucide-react";
import Calculator from "./Calculator";

const words = ["Vendas", "Marketing", "Dados", "Atendimentos"];

export default function Hero() {
  return (
    <section className="pt-28 pb-16 md:pt-36 md:pb-24 overflow-hidden">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-sm font-bold px-4 py-1.5 rounded-full border border-primary/20 animate-pulse-subtle">
              <Sparkles className="w-4 h-4 fill-primary" />
              🔬 Detecta · Prescreve · Executa · Aprende
            </div>

            <h1 className="text-5xl md:text-6xl lg:text-7xl font-black font-syne leading-[0.9] tracking-tighter">
              Sua loja perde dinheiro todo dia. <br />
              <span className="text-primary italic">A gente encontra e resolve.</span>
            </h1>

            <p className="text-xl text-muted-foreground max-w-lg font-medium leading-relaxed">
              O único sistema que monitora seu funil, detecta o problema, prescreve a solução e executa — em todos os seus canais de venda.
            </p>

            <div className="flex flex-wrap gap-4 items-center">
              <Button asChild size="lg" className="h-14 px-8 text-lg font-black bg-gradient-to-r from-emerald-500 to-blue-600 rounded-xl shadow-xl shadow-emerald-500/20 hover:scale-105 transition-all">
                <a href="#calculator">
                  Diagnóstico grátis <ArrowRight className="ml-2 w-5 h-5" />
                </a>
              </Button>
              <div className="flex -space-x-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-10 h-10 rounded-full border-4 border-background bg-muted" />
                ))}
                <div className="w-10 h-10 rounded-full border-4 border-background bg-primary flex items-center justify-center text-[10px] font-bold text-white">
                  +200
                </div>
              </div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Lojistas Lucrando</p>
            </div>
          </div>

          <div className="relative" id="calculator">
            <div className="absolute -inset-4 bg-primary/20 blur-3xl rounded-full opacity-30 animate-pulse" />
            <Calculator />
          </div>
        </div>
      </div>
    </section>
  );
}
