import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, TrendingUp, Zap, ShoppingCart, CreditCard, RefreshCw, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const BENCHMARKS: Record<string, number> = {
  "Moda": 2.8, "Beleza": 3.1, "Suplementos": 3.4,
  "Eletrônicos": 1.9, "Casa": 2.2, "Outro": 2.5,
};

const PRESETS: Record<string, { visitantes: number; conversao: number; ticket: number }> = {
  "Moda":       { visitantes: 14000, conversao: 1.4, ticket: 220 },
  "Beleza":     { visitantes: 12000, conversao: 1.8, ticket: 160 },
  "Suplementos":{ visitantes: 9000,  conversao: 2.1, ticket: 190 },
  "Eletrônicos":{ visitantes: 8000,  conversao: 1.0, ticket: 680 },
  "Casa":       { visitantes: 10000, conversao: 1.2, ticket: 340 },
  "Outro":      { visitantes: 12400, conversao: 1.4, ticket: 250 },
};

const CAUSAS = [
  { icon: ShoppingCart, label: "Carrinho abandonado", pct: "~70% das sessões", cor: "text-red-400" },
  { icon: CreditCard, label: "Boletos e PIX não pagos", pct: "~32% não convertem", cor: "text-amber-400" },
  { icon: RefreshCw, label: "Clientes sem 2ª compra", pct: "~60% compram 1 vez", cor: "text-orange-400" },
];

export default function CalculadoraPage() {
  const [visitantes, setVisitantes] = useState(12400);
  const [conversao, setConversao] = useState(1.4);
  const [ticketMedio, setTicketMedio] = useState(250);
  const [segmento, setSegmento] = useState("Moda");

  function handleSegmentoChange(novo: string) {
    setSegmento(novo);
    const preset = PRESETS[novo];
    if (preset) {
      setVisitantes(preset.visitantes);
      setConversao(preset.conversao);
      setTicketMedio(preset.ticket);
    }
  }

  const bench = BENCHMARKS[segmento] || 2.5;
  const diff = (bench - conversao) / 100;
  const perda = Math.max(0, Math.round(visitantes * diff * ticketMedio));
  const recuperavel = Math.round(perda * 0.18);
  const perdaDia = Math.round(perda / 30);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      {/* Nav */}
      <nav className="border-b border-white/5 px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-black text-white text-sm">L</div>
          <span className="font-bold tracking-tighter text-white">LTV BOOST</span>
        </Link>
        <Link to="/signup">
          <Button size="sm" className="font-black text-[10px] uppercase tracking-widest gap-1.5">
            Criar conta grátis <ArrowRight className="w-3 h-3" />
          </Button>
        </Link>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-16 space-y-16">
        {/* Hero */}
        <div className="text-center space-y-5">
          <div className="inline-flex items-center gap-2 bg-red-500/10 text-red-400 text-[10px] font-black px-4 py-1.5 rounded-full border border-red-500/20 uppercase tracking-[0.2em]">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            Calculadora de Perda de Faturamento
          </div>
          <h1 className="text-5xl md:text-6xl font-black font-syne leading-[0.9] tracking-tighter">
            Quanto dinheiro sua loja<br />
            <span className="text-red-500 italic">está perdendo todo mês?</span>
          </h1>
          <p className="text-lg text-white/50 max-w-xl mx-auto font-medium">
            Preencha os dados da sua loja e descubra em 5 segundos o gap entre sua conversão atual e o benchmark do seu segmento.
          </p>
        </div>

        {/* Causas principais */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {CAUSAS.map(({ icon: Icon, label, pct, cor }) => (
            <div key={label} className="bg-white/3 border border-white/8 rounded-2xl p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                <Icon className={cn("w-5 h-5", cor)} />
              </div>
              <div>
                <p className="font-bold text-sm text-white">{label}</p>
                <p className="text-xs text-white/40 font-medium">{pct}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Calculadora principal */}
        <TooltipProvider>
          <div className="bg-white/3 border border-white/8 rounded-[2rem] p-8 md:p-12 space-y-10">
            <div>
              <h2 className="text-2xl font-black font-syne tracking-tighter">Calcule sua perda mensal</h2>
              <p className="text-sm text-white/40 mt-1">Todos os campos são opcionais — os valores padrão são médias do segmento.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em] ml-1">Visitantes únicos/mês</label>
                <Input
                  type="number"
                  min="0"
                  value={visitantes}
                  onChange={(e) => setVisitantes(Math.max(0, Number(e.target.value)))}
                  className="bg-white/5 border-white/10 h-13 font-mono font-bold rounded-xl text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em] ml-1">Taxa de conversão atual (%)</label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={conversao}
                  onChange={(e) => setConversao(Math.max(0, Math.min(100, Number(e.target.value))))}
                  className="bg-white/5 border-white/10 h-13 font-mono font-bold rounded-xl text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em] ml-1">Ticket médio (R$)</label>
                <Input
                  type="number"
                  min="0"
                  value={ticketMedio}
                  onChange={(e) => setTicketMedio(Math.max(0, Number(e.target.value)))}
                  className="bg-white/5 border-white/10 h-13 font-mono font-bold rounded-xl text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em] ml-1">Segmento</label>
                <Select value={segmento} onValueChange={handleSegmentoChange}>
                  <SelectTrigger className="bg-white/5 border-white/10 h-13 font-bold rounded-xl text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#13131A] border-white/10 text-white">
                    {Object.keys(BENCHMARKS).map((s) => (
                      <SelectItem key={s} value={s}>{s} (benchmark: {BENCHMARKS[s]}%)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Resultado */}
            <div className="bg-red-500/5 border border-red-500/15 rounded-[1.5rem] p-8 space-y-6">
              <div className="text-center space-y-2">
                <p className="text-[10px] font-black text-red-400/60 uppercase tracking-[0.3em]">
                  Faturamento que sua loja está deixando de ganhar todo mês:
                </p>
                <div className="text-6xl md:text-7xl font-black font-mono text-red-500 tracking-tighter">
                  R$ {perda.toLocaleString("pt-BR")}
                </div>
                {perda > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-sm text-red-400/60 font-medium inline-flex items-center gap-1.5 cursor-help">
                        ≈ R$ {recuperavel.toLocaleString("pt-BR")} recuperáveis via automação WhatsApp
                        <Info className="w-3.5 h-3.5 text-red-400/40" />
                      </p>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed bg-[#13131A] border-white/10">
                      <p className="font-bold mb-1">Como calculamos os 18%?</p>
                      <p>Taxa média medida em +200 lojas ativas no LTV Boost nos últimos 12 meses. Considera apenas transações confirmadas via WhatsApp — carrinhos recuperados, boletos pagos e reativações.</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4 border-t border-red-500/10 pt-6">
                <div className="text-center space-y-1">
                  <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Sua CVR</p>
                  <p className="text-xl font-black font-mono text-white">{conversao}%</p>
                </div>
                <div className="text-center space-y-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] inline-flex items-center gap-1 cursor-help">
                        Benchmark <Info className="w-2.5 h-2.5" />
                      </p>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs bg-[#13131A] border-white/10">
                      Média de CVR de lojas líderes do segmento com +R$ 50k/mês, baseada em dados agregados de Shopify e Nuvemshop no Brasil (2024).
                    </TooltipContent>
                  </Tooltip>
                  <p className="text-xl font-black font-mono text-emerald-400">{bench}%</p>
                </div>
                <div className="text-center space-y-1">
                  <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Perda/dia</p>
                  <p className="text-xl font-black font-mono text-red-400">R$ {perdaDia.toLocaleString("pt-BR")}</p>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="space-y-4">
              <Button asChild className="w-full h-16 text-lg font-black bg-gradient-to-r from-emerald-500 to-blue-600 rounded-2xl gap-3 shadow-xl shadow-emerald-900/20 hover:scale-[1.02] transition-transform">
                <Link to={`/signup?perda=${perda}`}>
                  Recuperar R$ {recuperavel.toLocaleString("pt-BR")} via WhatsApp agora <ArrowRight className="w-5 h-5" />
                </Link>
              </Button>
              <div className="flex items-center justify-center gap-6 text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">
                <span className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500 opacity-50" /> 14 dias grátis</span>
                <span className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500 opacity-50" /> Sem cartão</span>
                <span className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500 opacity-50" /> Setup em 10 min</span>
              </div>
            </div>
          </div>
        </TooltipProvider>

        {/* Prova social */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
          {[
            { value: "+200", label: "lojas ativas", sub: "e-commerces brasileiros" },
            { value: "18%", label: "de recuperação média", sub: "sobre receita em risco" },
            { value: "34%", label: "de aumento de LTV", sub: "nos primeiros 90 dias" },
          ].map(({ value, label, sub }) => (
            <div key={label} className="bg-white/3 border border-white/8 rounded-2xl p-6 space-y-2">
              <p className="text-4xl font-black font-syne text-primary">{value}</p>
              <p className="font-bold text-white">{label}</p>
              <p className="text-sm text-white/40">{sub}</p>
            </div>
          ))}
        </div>

        {/* Como funciona */}
        <div className="space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-black font-syne tracking-tighter">Como a IA recupera esse dinheiro</h2>
            <p className="text-white/40 text-sm">Três etapas automáticas que acontecem sem intervenção manual</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { step: "01", icon: TrendingUp, title: "Detecta a falha", desc: "A IA analisa seu funil em tempo real e identifica exatamente onde o dinheiro está vazando — carrinho, boleto ou cliente inativo." },
              { step: "02", icon: Zap, title: "Prescreve a ação", desc: "Gera uma prescrição personalizada com impacto estimado em R$, tipo de campanha e segmento de clientes. Você aprova com 1 clique." },
              { step: "03", icon: CheckCircle2, title: "Executa e recupera", desc: "WhatsApp personalizado enviado automaticamente. Taxa de abertura de 85% vs. 22% do email. Dinheiro de volta em horas." },
            ].map(({ step, icon: Icon, title, desc }) => (
              <div key={step} className="relative bg-white/3 border border-white/8 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/30">Passo {step}</span>
                </div>
                <h3 className="font-black text-lg text-white">{title}</h3>
                <p className="text-sm text-white/50 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA final */}
        <div className="text-center space-y-6 pb-8">
          <h2 className="text-4xl font-black font-syne tracking-tighter">
            Pare de perder R$ {perdaDia.toLocaleString("pt-BR")}/dia
          </h2>
          <Button asChild size="lg" className="h-16 px-12 text-lg font-black bg-primary hover:bg-primary/90 rounded-2xl shadow-xl shadow-primary/20 gap-2">
            <Link to={`/signup?perda=${perda}`}>
              Começar grátis agora <ArrowRight className="w-5 h-5" />
            </Link>
          </Button>
          <p className="text-xs text-white/30">14 dias gratuitos · Sem cartão de crédito · Cancele quando quiser</p>
        </div>
      </div>
    </div>
  );
}
