// @ts-nocheck
import { useState } from "react";
import { ArrowRight, CheckCircle2, DollarSign, Gift, Link2, MessageCircle, Sparkles, TrendingUp, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const PLANS = [
  { plan: "Starter", price: "R$ 447/mês", commission: "R$ 89/mês", months: "× 12 meses", total: "R$ 1.068/afiliado" },
  { plan: "Growth", price: "R$ 897/mês", commission: "R$ 179/mês", months: "× 12 meses", total: "R$ 2.148/afiliado", highlight: true },
  { plan: "Scale", price: "R$ 1.997/mês", commission: "R$ 399/mês", months: "× 12 meses", total: "R$ 4.788/afiliado" },
];

const TESTIMONIALS = [
  { name: "Bruno M.", role: "Consultor de E-commerce", earnings: "R$ 4.200/mês", text: "Indico o LTV Boost para todos os meus clientes de qualquer forma. Agora ganho 20% em cima disso. É dinheiro passivo real." },
  { name: "Carla F.", role: "Agência Digital", earnings: "R$ 9.800/mês", text: "Tenho 12 clientes ativos na plataforma. Todo mês cai automaticamente no meu PIX sem eu precisar fazer nada." },
  { name: "Rafael T.", role: "Mentor de Lojistas", earnings: "R$ 2.100/mês", text: "Mencionei no meu grupo de WhatsApp uma vez e já gerei 18 indicações. Produto que vende sozinho." },
];

const STEPS = [
  { number: "01", title: "Cadastre-se grátis", desc: "Crie sua conta em 2 minutos e acesse seu painel de afiliado com link único rastreado." },
  { number: "02", title: "Compartilhe seu link", desc: "Envie para lojistas, grupos de e-commerce, Stories, mentorias — qualquer canal que você já usa." },
  { number: "03", title: "Eles assinam", desc: "Cada indicação que virar cliente pago é rastreada automaticamente. Sem planilha, sem esforço manual." },
  { number: "04", title: "Você recebe todo mês", desc: "20% do valor da assinatura cai no seu PIX mensalmente por 12 meses seguidos por cliente." },
];

export default function AfiliadosPublico() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubmitted(true);
    setTimeout(() => {
      window.location.href = `/signup?affiliate=true&email=${encodeURIComponent(email)}`;
    }, 800);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      {/* Nav */}
      <nav className="border-b border-white/5 px-6 py-4 flex items-center justify-between max-w-7xl mx-auto">
        <a href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-black text-primary-foreground">L</div>
          <span className="font-bold tracking-tighter">LTV BOOST</span>
        </a>
        <div className="flex items-center gap-4">
          <a href="/login" className="text-xs font-bold text-muted-foreground hover:text-white transition-colors">Já sou afiliado</a>
          <Button asChild size="sm" className="h-9 font-bold rounded-xl text-xs bg-primary">
            <a href="#cadastro">Começar agora</a>
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-24 md:py-32 px-6">
        <div className="max-w-5xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-[10px] font-black px-4 py-1.5 rounded-full border border-primary/20 uppercase tracking-[0.2em]">
            <Gift className="w-3.5 h-3.5" /> Programa de Afiliados — 20% Recorrente
          </div>
          <h1 className="text-5xl md:text-7xl font-black font-syne tracking-tighter leading-[0.9]">
            Ganhe até<br />
            <span className="text-primary italic">R$ 9.800/mês</span><br />
            indicando lojistas
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto font-medium leading-relaxed">
            20% de comissão recorrente por 12 meses. Sem limite de indicações. Pagamento automático via PIX. Produto que seus clientes já precisam.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto" id="cadastro">
            <Input
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="h-14 rounded-2xl bg-white/5 border-white/10 text-white placeholder:text-white/30 font-medium flex-1"
            />
            <Button
              type="submit"
              disabled={submitted}
              className="h-14 px-8 font-black rounded-2xl bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 gap-2 whitespace-nowrap"
            >
              {submitted ? <><CheckCircle2 className="w-5 h-5" /> Redirecionando...</> : <>Quero ser afiliado <ArrowRight className="w-5 h-5" /></>}
            </Button>
          </form>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Gratuito · Sem taxa de entrada · Pague só se quiser assinar</p>
        </div>
      </section>

      {/* Numbers */}
      <section className="py-16 border-y border-white/5 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: "+200", label: "Afiliados ativos" },
            { value: "20%", label: "Comissão recorrente" },
            { value: "12 meses", label: "Duração por cliente" },
            { value: "5 dias úteis", label: "Prazo de pagamento PIX" },
          ].map(({ value, label }) => (
            <div key={label} className="space-y-2">
              <p className="text-3xl md:text-4xl font-black font-syne text-primary">{value}</p>
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto space-y-16">
          <div className="space-y-4">
            <Badge className="bg-primary/10 text-primary border-none font-black text-[10px] uppercase tracking-widest">Como funciona</Badge>
            <h2 className="text-4xl md:text-5xl font-black font-syne tracking-tighter">4 passos. Renda recorrente.</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {STEPS.map(({ number, title, desc }) => (
              <div key={number} className="bg-white/3 border border-white/5 rounded-3xl p-8 flex gap-6 hover:border-primary/20 transition-colors">
                <span className="text-5xl font-black font-syne text-primary/20 leading-none shrink-0">{number}</span>
                <div className="space-y-2">
                  <h3 className="text-lg font-black">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Commission table */}
      <section className="py-24 px-6 bg-white/2">
        <div className="max-w-5xl mx-auto space-y-12">
          <div className="space-y-4">
            <Badge className="bg-emerald-500/10 text-emerald-500 border-none font-black text-[10px] uppercase tracking-widest">Comissões</Badge>
            <h2 className="text-4xl md:text-5xl font-black font-syne tracking-tighter">Quanto você vai ganhar?</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map(({ plan, price, commission, months, total, highlight }) => (
              <div key={plan} className={cn(
                "border rounded-3xl p-8 space-y-6 transition-all",
                highlight ? "border-primary bg-primary/5 shadow-2xl shadow-primary/10" : "border-white/5 bg-white/2"
              )}>
                {highlight && <Badge className="bg-primary text-primary-foreground border-none font-black text-[9px] uppercase">Mais indicado</Badge>}
                <div>
                  <h3 className="text-xl font-black">{plan}</h3>
                  <p className="text-sm text-muted-foreground">{price}</p>
                </div>
                <div className="border-t border-white/10 pt-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Comissão/mês</span>
                    <span className={cn("text-lg font-black", highlight ? "text-primary" : "text-emerald-500")}>{commission}</span>
                  </div>
                  {months && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Duração</span>
                      <span className="text-sm font-bold">{months}</span>
                    </div>
                  )}
                  <div className="bg-white/5 rounded-2xl p-4 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Total por afiliado</p>
                    <p className={cn("text-2xl font-black font-syne", highlight ? "text-primary" : "")}>{total}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6 text-center">
            <p className="text-emerald-300 font-medium text-sm">
              💡 Exemplo: Se você indicar <strong>10 clientes no plano Growth</strong>, você recebe <strong>R$ 1.790/mês</strong> por 12 meses — <strong>R$ 21.480 no total</strong> com um único esforço de indicação.
            </p>
          </div>
        </div>
      </section>

      {/* Program for Agencies */}
      <section className="py-24 px-6 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-primary/5 blur-3xl rounded-full" />
        <div className="max-w-5xl mx-auto bg-gradient-to-br from-primary/20 to-transparent border border-primary/20 rounded-[3rem] p-12 md:p-20 relative z-10 space-y-12">
          <div className="max-w-2xl space-y-6">
            <Badge className="bg-primary text-primary-foreground border-none font-black text-[10px] uppercase tracking-[0.2em] px-4">AGÊNCIAS E CONSULTORES</Badge>
            <h2 className="text-4xl md:text-6xl font-black font-syne tracking-tighter leading-none">Aumente o LTV dos seus clientes e sua receita.</h2>
            <p className="text-lg text-muted-foreground font-medium">
              O LTV Boost é o parceiro ideal para agências de performance. Ajude seus clientes a vender mais com a base que eles já têm e garanta uma nova linha de receita recorrente para sua agência.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Zap, title: "Implantação Grátis", desc: "Nosso time ajuda na configuração inicial para seus clientes de agência." },
              { icon: TrendingUp, title: "Melhor ROI", desc: "Prove valor rápido recuperando carrinhos e boletos no primeiro dia." },
              { icon: DollarSign, title: "Comissão White-label", desc: "Opção de cobrar direto do seu cliente ou receber cashback de 20%." },
            ].map((f, i) => (
              <div key={i} className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                  <f.icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
          <Button size="lg" className="h-16 px-10 rounded-2xl font-black text-lg gap-3 shadow-2xl shadow-primary/20" asChild>
            <a href="#cadastro">Seja uma Agência Parceira <ArrowRight className="w-6 h-6" /></a>
          </Button>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto space-y-12">
          <div className="space-y-4">
            <Badge className="bg-amber-500/10 text-amber-500 border-none font-black text-[10px] uppercase tracking-widest">Afiliados reais</Badge>
            <h2 className="text-4xl md:text-5xl font-black font-syne tracking-tighter">Quem já está ganhando</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map(({ name, role, earnings, text }) => (
              <div key={name} className="bg-white/3 border border-white/5 rounded-3xl p-8 space-y-6 hover:border-primary/20 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-black text-lg">
                    {name[0]}
                  </div>
                  <span className="text-emerald-400 font-black text-lg">{earnings}</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed italic">"{text}"</p>
                <div>
                  <p className="font-bold text-sm">{name}</p>
                  <p className="text-xs text-muted-foreground">{role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 px-6 bg-white/2">
        <div className="max-w-3xl mx-auto space-y-12">
          <h2 className="text-4xl font-black font-syne tracking-tighter text-center">Dúvidas frequentes</h2>
          <div className="space-y-4">
            {[
              { q: "Preciso ser cliente do LTV Boost para ser afiliado?", a: "Não. Você pode ser afiliado sem assinar o produto. Mas afiliados que usam o produto convertem muito mais porque falam com autoridade e experiência própria." },
              { q: "Quando recebo minha comissão?", a: "As comissões são processadas mensalmente. Assim que um cliente indicado paga a mensalidade, sua comissão entra em fila e você solicita o saque via PIX com mínimo de R$ 100." },
              { q: "Tem limite de indicações?", a: "Zero limite. Você pode indicar quantos lojistas quiser. Cada um gera comissão recorrente por 12 meses independente dos outros." },
              { q: "O que acontece se o cliente que eu indiquei cancelar?", a: "A comissão para no mês do cancelamento. Você continua recebendo normalmente enquanto o cliente mantiver a assinatura ativa." },
              { q: "Como é feito o rastreamento das indicações?", a: "Via link exclusivo com UTM parametrizado. Cada indicação fica registrada no seu painel com status em tempo real: cadastrado, em trial, convertido, pago." },
            ].map(({ q, a }) => (
              <div key={q} className="border border-white/5 rounded-2xl p-6 space-y-3 hover:border-primary/20 transition-colors">
                <p className="font-bold">{q}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center space-y-8">
          <Sparkles className="w-12 h-12 text-primary mx-auto" />
          <h2 className="text-4xl md:text-5xl font-black font-syne tracking-tighter">
            Pronto para ganhar <span className="text-primary italic">renda recorrente</span>?
          </h2>
          <p className="text-muted-foreground text-lg font-medium">Cadastre-se agora, receba seu link e comece a indicar ainda hoje.</p>
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <Input
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="h-14 rounded-2xl bg-white/5 border-white/10 text-white placeholder:text-white/30 font-medium flex-1"
            />
            <Button
              type="submit"
              disabled={submitted}
              className="h-14 px-8 font-black rounded-2xl bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 gap-2 whitespace-nowrap"
            >
              {submitted ? <CheckCircle2 className="w-5 h-5" /> : <><Zap className="w-5 h-5" /> Começar agora</>}
            </Button>
          </form>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Sem taxa · Sem mensalidade · 100% gratuito para afiliados</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 px-6 text-center">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} LTV Boost · <a href="/termos" className="hover:text-white transition-colors">Termos</a> · <a href="/privacidade" className="hover:text-white transition-colors">Privacidade</a>
        </p>
      </footer>
    </div>
  );
}
