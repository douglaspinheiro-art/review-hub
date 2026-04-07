import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, TrendingUp, BarChart2, Users, Zap, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const SEGMENTOS = [
  {
    nome: "Moda & Vestuário",
    cvr_medio: 1.4,
    cvr_top25: 2.8,
    ticket_medio: 220,
    abandono: 71,
    cor: "from-pink-500/20 to-transparent",
    borda: "border-pink-500/20",
    badge: "pink",
  },
  {
    nome: "Beleza & Cosméticos",
    cvr_medio: 1.8,
    cvr_top25: 3.1,
    ticket_medio: 160,
    abandono: 68,
    cor: "from-purple-500/20 to-transparent",
    borda: "border-purple-500/20",
    badge: "purple",
  },
  {
    nome: "Suplementos & Saúde",
    cvr_medio: 2.1,
    cvr_top25: 3.4,
    ticket_medio: 190,
    abandono: 65,
    cor: "from-emerald-500/20 to-transparent",
    borda: "border-emerald-500/20",
    badge: "emerald",
  },
  {
    nome: "Eletrônicos",
    cvr_medio: 1.0,
    cvr_top25: 1.9,
    ticket_medio: 680,
    abandono: 76,
    cor: "from-blue-500/20 to-transparent",
    borda: "border-blue-500/20",
    badge: "blue",
  },
  {
    nome: "Casa & Decoração",
    cvr_medio: 1.2,
    cvr_top25: 2.2,
    ticket_medio: 340,
    abandono: 73,
    cor: "from-amber-500/20 to-transparent",
    borda: "border-amber-500/20",
    badge: "amber",
  },
  {
    nome: "Alimentos & Bebidas",
    cvr_medio: 2.4,
    cvr_top25: 3.8,
    ticket_medio: 130,
    abandono: 60,
    cor: "from-orange-500/20 to-transparent",
    borda: "border-orange-500/20",
    badge: "orange",
  },
];

const METRICAS_INDUSTRIA = [
  { label: "Taxa de abertura WhatsApp", valor: "85%", vs: "22% email", positivo: true },
  { label: "Carrinhos abandonados (média BR)", valor: "70%", vs: "das sessões", positivo: false },
  { label: "Clientes que fazem 2ª compra", valor: "40%", vs: "sem ação ativa", positivo: false },
  { label: "Recuperação com automação WhatsApp", valor: "18%", vs: "da receita em risco", positivo: true },
  { label: "Boletos e PIX não pagos", valor: "32%", vs: "não convertem", positivo: false },
  { label: "Aumento de LTV com retenção ativa", valor: "+34%", vs: "nos primeiros 90 dias", positivo: true },
];

export default function BenchmarkPage() {
  const [segmentoAtivo, setSegmentoAtivo] = useState<string | null>(null);
  const segmento = SEGMENTOS.find(s => s.nome === segmentoAtivo) ?? null;

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      {/* Nav */}
      <nav className="border-b border-white/5 px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-black text-white text-sm">L</div>
          <span className="font-bold tracking-tighter text-white">LTV BOOST</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link to="/calculadora-abandono-carrinho" className="text-sm text-white/50 hover:text-white font-bold transition-colors">Calculadora →</Link>
          <Link to="/signup">
            <Button size="sm" className="font-black text-[10px] uppercase tracking-widest gap-1.5">
              Criar conta grátis <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-16 space-y-16">
        {/* Hero */}
        <div className="text-center space-y-5">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-[10px] font-black px-4 py-1.5 rounded-full border border-primary/20 uppercase tracking-[0.2em]">
            <BarChart2 className="w-3.5 h-3.5" />
            Índice de Conversão — E-commerce Brasileiro Q2/2026
          </div>
          <h1 className="text-5xl md:text-6xl font-black font-syne leading-[0.9] tracking-tighter">
            Benchmark de<br />
            <span className="text-primary italic">conversão por segmento</span>
          </h1>
          <p className="text-lg text-white/50 max-w-2xl mx-auto font-medium">
            Dados agregados e anonimizados de +200 lojas ativas na plataforma LTV Boost. Atualizado trimestralmente. Compare sua CVR com as melhores lojas do seu segmento.
          </p>
          <div className="flex items-center justify-center gap-6 text-sm text-white/30 font-bold">
            <span className="flex items-center gap-1.5"><Users className="w-4 h-4" /> +200 lojas</span>
            <span className="flex items-center gap-1.5"><TrendingUp className="w-4 h-4" /> Dados reais</span>
            <span className="flex items-center gap-1.5"><Zap className="w-4 h-4" /> Q2 2026</span>
          </div>
        </div>

        {/* Grid de segmentos */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black font-syne tracking-tighter">CVR por segmento</h2>
            <span className="text-[10px] text-white/30 font-black uppercase tracking-widest">Clique para detalhar</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {SEGMENTOS.map((s) => {
              const isAtivo = segmentoAtivo === s.nome;
              return (
                <button
                  key={s.nome}
                  onClick={() => setSegmentoAtivo(isAtivo ? null : s.nome)}
                  className={cn(
                    "text-left bg-gradient-to-br border rounded-2xl p-6 transition-all hover:scale-[1.01] space-y-4",
                    s.cor, s.borda,
                    isAtivo && "ring-2 ring-primary"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="font-black text-base text-white">{s.nome}</p>
                      <p className="text-xs text-white/40">Ticket médio: R$ {s.ticket_medio}</p>
                    </div>
                    <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-white/10 text-white/40">
                      {s.abandono}% abandono
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    {/* CVR médio */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-white/40 font-bold">CVR médio do segmento</span>
                        <span className="font-black text-white/70">{s.cvr_medio}%</span>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-white/20 rounded-full"
                          style={{ width: `${(s.cvr_medio / s.cvr_top25) * 100}%` }}
                        />
                      </div>
                    </div>
                    {/* CVR top 25% */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-emerald-400/70 font-bold flex items-center gap-1">
                          Top 25% das lojas
                          <Info className="w-3 h-3 text-white/20" />
                        </span>
                        <span className="font-black text-emerald-400">{s.cvr_top25}%</span>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full w-full shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                      </div>
                    </div>
                  </div>

                  {isAtivo && (
                    <div className="pt-3 border-t border-white/8 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Impacto de chegar ao top 25%</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white/5 rounded-xl p-3 text-center">
                          <p className="text-lg font-black text-emerald-400">
                            +{((s.cvr_top25 - s.cvr_medio) / s.cvr_medio * 100).toFixed(0)}%
                          </p>
                          <p className="text-[9px] text-white/30 font-bold uppercase">mais vendas</p>
                        </div>
                        <div className="bg-white/5 rounded-xl p-3 text-center">
                          <p className="text-lg font-black text-primary">
                            +R$ {Math.round(10000 * (s.cvr_top25 - s.cvr_medio) / 100 * s.ticket_medio).toLocaleString("pt-BR")}
                          </p>
                          <p className="text-[9px] text-white/30 font-bold uppercase">por 10k visitas</p>
                        </div>
                      </div>
                      <Link to={`/calculadora-abandono-carrinho`}>
                        <Button size="sm" className="w-full h-9 font-black text-[10px] uppercase tracking-widest gap-1.5 mt-2">
                          Calcular meu gap <ArrowRight className="w-3 h-3" />
                        </Button>
                      </Link>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Métricas do setor */}
        <div className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-black font-syne tracking-tighter">Métricas do e-commerce brasileiro</h2>
            <p className="text-sm text-white/40">Referência do setor para planejamento estratégico e definição de metas.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {METRICAS_INDUSTRIA.map(({ label, valor, vs, positivo }) => (
              <div key={label} className="bg-white/3 border border-white/8 rounded-2xl p-5 flex items-center gap-4">
                <div className={cn(
                  "text-2xl font-black font-mono shrink-0 w-20 text-center",
                  positivo ? "text-emerald-400" : "text-red-400"
                )}>
                  {valor}
                </div>
                <div>
                  <p className="font-bold text-sm text-white">{label}</p>
                  <p className="text-xs text-white/40">{vs}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Metodologia */}
        <div className="bg-white/3 border border-white/8 rounded-2xl p-8 space-y-4">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-primary" />
            <h3 className="font-black text-lg">Metodologia</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-white/50 leading-relaxed">
            <div>
              <p className="font-bold text-white mb-2">Fonte dos dados</p>
              <p>Dados anonimizados e agregados de lojas ativas na plataforma LTV Boost com consentimento explícito. Nenhum dado individual ou identificável é utilizado.</p>
            </div>
            <div>
              <p className="font-bold text-white mb-2">Critérios de inclusão</p>
              <p>Lojas com mínimo de 90 dias de dados, faturamento mensal acima de R$ 30k e pelo menos 500 sessões mensais. Outliers (top e bottom 5%) removidos.</p>
            </div>
            <div>
              <p className="font-bold text-white mb-2">Frequência de atualização</p>
              <p>Relatório publicado trimestralmente. Esta edição cobre dados de janeiro a março de 2026, com base em 214 lojas ativas.</p>
            </div>
            <div>
              <p className="font-bold text-white mb-2">CVR: definição utilizada</p>
              <p>Taxa de conversão calculada como pedidos confirmados / sessões únicas. Não inclui trocas, cancelamentos ou chargebacks.</p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center space-y-6 pb-8">
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Descubra sua posição</p>
            <h2 className="text-4xl font-black font-syne tracking-tighter">
              Onde sua loja está<br />nesse ranking?
            </h2>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg" className="h-14 px-10 font-black bg-primary hover:bg-primary/90 rounded-2xl gap-2">
              <Link to="/calculadora-abandono-carrinho">
                Calcular meu gap agora <ArrowRight className="w-5 h-5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-14 px-10 font-black rounded-2xl gap-2 border-white/10 hover:bg-white/5">
              <Link to="/signup">
                Criar conta grátis <ArrowRight className="w-5 h-5" />
              </Link>
            </Button>
          </div>
          <p className="text-xs text-white/20">14 dias gratuitos · Dados reais da sua loja · Setup em 10 min</p>
        </div>
      </div>
    </div>
  );
}
