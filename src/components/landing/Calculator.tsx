import { useState, useEffect } from "react";
import { ArrowRight, CheckCircle2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface CalculatorProps {
  onPerdaChange?: (perda: number) => void;
}

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

export default function Calculator({ onPerdaChange }: CalculatorProps) {
  const [visitantes, setVisitantes] = useState(12400);
  const [conversao, setConversao] = useState(1.4);
  const [ticketMedio, setTicketMedio] = useState(250);
  const [segmento, setSegmento] = useState("Moda");
  const [perda, setPerda] = useState(0);

  function handleSegmentoChange(novo: string) {
    setSegmento(novo);
    const preset = PRESETS[novo];
    if (preset) {
      setVisitantes(preset.visitantes);
      setConversao(preset.conversao);
      setTicketMedio(preset.ticket);
    }
  }

  useEffect(() => {
    const bench = BENCHMARKS[segmento] || 2.5;
    const diff = (bench - conversao) / 100;
    const calculo = visitantes * diff * ticketMedio;
    const novaPerda = Math.max(0, Math.round(calculo));
    setPerda(novaPerda);
    onPerdaChange?.(novaPerda);
  }, [visitantes, conversao, ticketMedio, segmento]);

  return (
    <div className="bg-card/40 backdrop-blur-2xl border border-white/5 rounded-[2.5rem] p-6 md:p-10 shadow-2xl relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 rounded-full -mr-40 -mt-40 blur-[100px] group-hover:bg-primary/10 transition-all duration-1000" />
      
      <div className="relative z-10">
        <h3 className="text-2xl font-black font-syne mb-1 tracking-tighter">Seu ecommerce está deixando dinheiro na mesa?</h3>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 mb-10">Detectamos o seu gap de faturamento em 5 segundos</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-muted-foreground/50 tracking-[0.2em] ml-1">Visitantes/mês</label>
            <Input 
              type="number" 
              min="0"
              value={visitantes} 
              onChange={(e) => setVisitantes(Math.max(0, Number(e.target.value)))}
              className="bg-background/30 border-white/5 h-12 font-mono font-bold rounded-xl focus:ring-primary/20 transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-muted-foreground/50 tracking-[0.2em] ml-1">Conversão atual (%)</label>
            <Input 
              type="number" 
              min="0" 
              max="100"
              step="0.1"
              value={conversao} 
              onChange={(e) => setConversao(Math.max(0, Math.min(100, Number(e.target.value))))}
              className="bg-background/30 border-white/5 h-12 font-mono font-bold rounded-xl focus:ring-primary/20 transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-muted-foreground/50 tracking-[0.2em] ml-1">Ticket médio (R$)</label>
            <Input 
              type="number" 
              min="0"
              value={ticketMedio} 
              onChange={(e) => setTicketMedio(Math.max(0, Number(e.target.value)))}
              className="bg-background/30 border-white/5 h-12 font-mono font-bold rounded-xl focus:ring-primary/20 transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-muted-foreground/50 tracking-[0.2em] ml-1">Segmento</label>
            <Select value={segmento} onValueChange={handleSegmentoChange}>
              <SelectTrigger className="bg-background/30 border-white/5 h-12 font-bold rounded-xl focus:ring-primary/20 transition-all">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background border-white/10">
                <SelectItem value="Moda">Moda</SelectItem>
                <SelectItem value="Beleza">Beleza</SelectItem>
                <SelectItem value="Suplementos">Suplementos</SelectItem>
                <SelectItem value="Eletrônicos">Eletrônicos</SelectItem>
                <SelectItem value="Casa">Casa</SelectItem>
                <SelectItem value="Outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="text-center space-y-3 mb-10 bg-red-500/5 py-8 rounded-[2rem] border border-red-500/10">
          <p className="text-[10px] font-black text-red-500/60 uppercase tracking-[0.3em]">Faturamento que você está deixando de ganhar:</p>
          <div className="text-5xl md:text-6xl font-black font-mono text-red-500 tracking-tighter group-hover:scale-105 transition-transform duration-700">
            R$ {perda.toLocaleString('pt-BR')}
          </div>
          {perda > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="text-[11px] text-red-400/60 font-medium inline-flex items-center gap-1.5 cursor-help">
                    ≈ R$ {Math.round(perda * 0.18).toLocaleString('pt-BR')} recuperáveis com automação WhatsApp
                    <Info className="w-3 h-3 text-red-400/40 shrink-0" />
                  </p>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                  <p className="font-bold mb-1">Como calculamos os 18%?</p>
                  <p>Taxa média de recuperação medida em +200 lojas ativas no LTV Boost nos últimos 12 meses. Clientes de moda recuperam entre 14–22%, beleza entre 17–24%, eletrônicos entre 11–16%. Considera apenas transações confirmadas via WhatsApp.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4 mb-10 text-center border-y border-white/5 py-6">
          <div className="space-y-1">
            <p className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-[0.2em]">Sua CVR</p>
            <p className="text-sm font-mono font-black">{conversao}%</p>
          </div>
          <div className="space-y-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] inline-flex items-center gap-1 cursor-help">
                    Benchmark <Info className="w-2.5 h-2.5" />
                  </p>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  Média de CVR de lojas líderes do segmento com +R$ 50k/mês, baseada em dados agregados de plataformas como Shopify e Nuvemshop para o Brasil (2024).
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <p className="text-sm font-mono font-black text-emerald-500">{BENCHMARKS[segmento] || 2.5}%</p>
          </div>
          <div className="space-y-1">
            <p className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-[0.2em]">Perda/dia</p>
            <p className="text-sm font-mono font-black text-red-500">R$ {Math.round(perda/30).toLocaleString('pt-BR')}</p>
          </div>
        </div>

        <Button asChild className="w-full h-16 text-lg font-black bg-emerald-600 hover:bg-emerald-500 transition-all duration-500 rounded-2xl gap-3 shadow-xl shadow-emerald-900/20">
          <a href={`/signup?perda=${perda}`}>
            Recuperar via WhatsApp agora <ArrowRight className="w-5 h-5" />
          </a>
        </Button>

        <div className="flex items-center justify-center gap-6 mt-8 text-[9px] font-black text-muted-foreground/40 uppercase tracking-[0.2em]">
          <span className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500 opacity-50" /> 14 dias grátis</span>
          <span className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500 opacity-50" /> Sem cartão</span>
          <span className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500 opacity-50" /> Setup em 10 min</span>
        </div>
      </div>
    </div>
  );
}
