import { useState, useEffect } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export default function Calculator() {
  const [visitantes, setVisitantes] = useState(12400);
  const [conversao, setConversao] = useState(1.4);
  const [ticketMedio, setTicketMedio] = useState(250);
  const [segmento, setSegmento] = useState("Moda");
  const [perda, setPerda] = useState(0);

  const BENCHMARKS: Record<string, number> = {
    "Moda": 2.8, "Beleza": 3.1, "Suplementos": 3.4,
    "Eletrônicos": 1.9, "Casa": 2.2, "Outro": 2.5,
  };

  useEffect(() => {
    const bench = BENCHMARKS[segmento] || 2.5;
    const diff = (bench - conversao) / 100;
    const calculo = visitantes * diff * ticketMedio;
    setPerda(Math.max(0, Math.round(calculo)));
  }, [visitantes, conversao, ticketMedio, segmento]);

  return (
    <div className="bg-[#13131A] border border-[#1E1E2E] rounded-2xl p-8 shadow-2xl relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mr-32 -mt-32 blur-3xl group-hover:bg-primary/10 transition-all" />
      
      <div className="relative z-10">
        <h3 className="text-xl font-bold font-syne mb-1">Calcule sua perda agora</h3>
        <p className="text-xs text-muted-foreground mb-8">Grátis. 20 segundos. Sem cadastro.</p>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Visitantes/mês</label>
            <Input 
              type="number" 
              min="0"
              value={visitantes} 
              onChange={(e) => setVisitantes(Math.max(0, Number(e.target.value)))}
              className="bg-background/50 border-[#1E1E2E] h-11 font-bold"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Conversão atual (%)</label>
            <Input 
              type="number" 
              min="0"
              max="100"
              step="0.1"
              value={conversao} 
              onChange={(e) => setConversao(Math.max(0, Math.min(100, Number(e.target.value))))}
              className="bg-background/50 border-[#1E1E2E] h-11 font-bold"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Ticket médio (R$)</label>
            <Input 
              type="number" 
              min="0"
              value={ticketMedio} 
              onChange={(e) => setTicketMedio(Math.max(0, Number(e.target.value)))}
              className="bg-background/50 border-[#1E1E2E] h-11 font-bold"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Segmento da loja</label>
            <Select value={segmento} onValueChange={setSegmento}>
              <SelectTrigger className="bg-background/50 border-[#1E1E2E] h-11 font-bold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Moda">Moda</SelectItem>
                <SelectItem value="Beleza">Beleza</SelectItem>
                <SelectItem value="Eletrônicos">Eletrônicos</SelectItem>
                <SelectItem value="Casa">Casa</SelectItem>
                <SelectItem value="Outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="text-center space-y-2 mb-8">
          <p className="text-sm font-medium text-muted-foreground">Você está perdendo</p>
          <div className="text-4xl md:text-5xl font-black font-jetbrains text-red-500 tracking-tighter">
            R$ {perda.toLocaleString('pt-BR')} <span className="text-lg opacity-50">/ mês</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-8 text-center border-y border-[#1E1E2E] py-4">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase">Sua CVR</p>
            <p className="text-sm font-bold">{conversao}%</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase">Benchmark</p>
            <p className="text-sm font-bold text-emerald-500">{BENCHMARKS[segmento] || 2.5}%</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase">Perda/dia</p>
            <p className="text-sm font-bold text-red-500">R$ {Math.round(perda/30).toLocaleString('pt-BR')}</p>
          </div>
        </div>

        <Button asChild className="w-full h-14 text-lg font-black bg-gradient-to-r from-emerald-500 to-blue-600 hover:scale-[1.02] transition-all rounded-xl gap-2 shadow-lg shadow-emerald-500/20">
          <a href={`/signup?perda=${perda}`}>
            Ver diagnóstico completo da minha loja <ArrowRight className="w-5 h-5" />
          </a>
        </Button>

        <div className="flex items-center justify-center gap-4 mt-6 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
          <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Grátis</span>
          <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Sem cartão</span>
          <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Resultado em 2min</span>
        </div>
      </div>
    </div>
  );
}
