import { 
  X, AlertTriangle, TrendingUp, Zap, 
  ArrowRight, PauseCircle, Clock 
} from "lucide-react";
import { Button } from "@/components/ui/button";
// cn removed — unused

interface CancellationModalProps {
  onClose: () => void;
  onConfirm: () => void;
  revenueAtRisk: number;
  totalRecovered: number;
}

export function CancellationModal({ 
  onClose, 
  onConfirm, 
  revenueAtRisk, 
  totalRecovered 
}: CancellationModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-card border-2 border-border rounded-3xl p-8 max-w-lg w-full space-y-8 shadow-2xl animate-in zoom-in-95 duration-300 relative overflow-hidden">
        {/* Background signal */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/5 rounded-full -mr-32 -mt-32 blur-3xl" />
        
        <div className="flex items-start justify-between relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <Button variant="ghost" size="icon" className="h-10 w-10 -mt-2 -mr-2 rounded-full hover:bg-muted" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="space-y-3 relative z-10">
          <h3 className="text-3xl font-black font-syne tracking-tighter uppercase italic">
            Você tem certeza que quer <span className="text-red-500 underline">deixar esse dinheiro</span> na mesa?
          </h3>
          <p className="text-sm text-muted-foreground font-medium leading-relaxed">
            Ao cancelar agora, você interrompe a recuperação automática das suas vendas.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 relative z-10">
          <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-red-500/60">Receita em Risco (Mensal)</p>
            <p className="text-2xl font-black font-mono text-red-500">R$ {revenueAtRisk.toLocaleString("pt-BR")}</p>
            <p className="text-[9px] text-red-400/50 font-bold italic flex items-center gap-1">
              <Clock className="w-3 h-3" /> Baseado em dados reais
            </p>
          </div>
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500/60">Total Recuperado</p>
            <p className="text-2xl font-black font-mono text-emerald-500">R$ {totalRecovered.toLocaleString("pt-BR")}</p>
            <p className="text-[9px] text-emerald-400/50 font-bold italic flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> ROI comprovado
            </p>
          </div>
        </div>

        <div className="bg-muted/50 rounded-2xl p-6 space-y-4 relative z-10">
          <p className="text-xs font-bold flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary fill-primary" /> Sugestão: Pausar em vez de cancelar
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Mantenha seu histórico, contatos e configurações salvos. Voltamos a recuperar suas vendas automaticamente daqui a 30 dias.
          </p>
          <Button 
            className="w-full h-12 font-black bg-primary text-primary-foreground rounded-xl gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform"
            onClick={onClose} // Em uma implementação real, isso chamaria uma API de pausa
          >
            <PauseCircle className="w-4 h-4" /> Pausar por 30 dias grátis
          </Button>
        </div>

        <div className="flex flex-col gap-3 pt-2 relative z-10">
          <Button variant="ghost" className="text-muted-foreground font-bold text-xs underline underline-offset-4 hover:text-red-500 transition-colors" onClick={onConfirm}>
            Não, quero cancelar e assumir a perda do faturamento
          </Button>
          <Button variant="outline" className="h-12 font-black rounded-xl border-border/60" onClick={onClose}>
            Continuar com LTV Boost <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
