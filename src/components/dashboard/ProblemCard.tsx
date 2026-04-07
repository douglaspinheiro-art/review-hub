import React from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, TrendingDown, Package, Calendar, Clock, ChevronDown, CheckCircle2, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface ProblemProps {
  tipo: "funil" | "produto" | "sazonal" | "reputacao";
  titulo: string;
  descricao: string;
  severidade: "critico" | "alto" | "medio" | "oportunidade";
  impacto_estimado: number;
  causa_raiz?: string;
  detectado_em: string;
  status: "novo" | "snoozed" | "em_tratamento" | "resolvido" | "ignorado";
  canal?: string;
  onVer?: () => void;
  onAprovar?: () => void;
  onSnooze?: () => void;
}

export const ProblemCard: React.FC<ProblemProps> = ({
  tipo, titulo, descricao, severidade, impacto_estimado, causa_raiz, detectado_em, status, canal,
  onVer, onAprovar, onSnooze
}) => {
  const getIcon = () => {
    switch (tipo) {
      case "funil": return <TrendingDown className="w-5 h-5" />;
      case "produto": return <Package className="w-5 h-5" />;
      case "sazonal": return <Calendar className="w-5 h-5" />;
      default: return <AlertTriangle className="w-5 h-5" />;
    }
  };

  const getSeverityStyles = () => {
    switch (severidade) {
      case "critico": return "border-red-500/30 bg-red-500/[0.02] shadow-[0_0_20px_rgba(239,68,68,0.05)] animate-pulse-subtle";
      case "alto": return "border-orange-500/30 bg-orange-500/[0.02]";
      case "medio": return "border-amber-500/30 bg-amber-500/[0.02]";
      case "oportunidade": return "border-emerald-500/30 bg-emerald-500/[0.02]";
      default: return "border-border/50";
    }
  };

  const getSeverityLabel = () => {
    switch (severidade) {
      case "critico": return "ALERTA CRÍTICO";
      case "alto": return "ALTA PRIORIDADE";
      case "medio": return "RISCO MÉDIO";
      case "oportunidade": return "OPORTUNIDADE";
    }
  };

  return (
    <div className={cn("backdrop-blur-sm border rounded-2xl overflow-hidden transition-all duration-500 group hover:border-primary/30", getSeverityStyles())}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={cn("text-[9px] font-black tracking-[0.2em] px-2 py-0.5 border-0 bg-background/50", 
              severidade === "critico" ? "text-red-500" : 
              severidade === "oportunidade" ? "text-emerald-500" : "text-muted-foreground"
            )}>
              {getSeverityLabel()}
            </Badge>
            <span className="text-[10px] font-mono text-muted-foreground/50 flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> {detectado_em}
            </span>
            {status === "novo" && <Badge className="bg-primary text-primary-foreground text-[9px] font-black tracking-tighter px-2 py-0">NOVO</Badge>}
          </div>
          <div className="text-right">
            <span className="text-[9px] text-muted-foreground/60 block uppercase font-black tracking-widest mb-1">Impacto Estimado</span>
            <span className={cn("text-xl font-black font-mono tracking-tighter", severidade === "oportunidade" ? "text-emerald-500" : "text-red-500/80 group-hover:text-red-500 transition-colors")}>
              {impacto_estimado < 0 ? "-" : ""}R$ {Math.abs(impacto_estimado).toLocaleString('pt-BR')}
            </span>
          </div>
        </div>

        <div className="flex gap-5">
          <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 duration-500", 
            severidade === "critico" ? "bg-red-500/10 text-red-500" : "bg-muted/50 text-muted-foreground/70"
          )}>
            {getIcon()}
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold mb-1.5 leading-tight tracking-tight group-hover:text-primary transition-colors">{titulo}</h3>
            <p className="text-sm text-muted-foreground/80 line-clamp-2 mb-4 leading-relaxed">{descricao}</p>
            {causa_raiz && (
              <div className="text-[11px] bg-background/40 backdrop-blur-md p-3 rounded-xl border border-border/30 mb-5">
                <span className="font-black text-foreground/70 uppercase tracking-tighter mr-2">Causa raiz:</span>
                <span className="text-muted-foreground">{causa_raiz}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border/10 mt-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onVer} className="h-8 text-[10px] font-black tracking-widest uppercase gap-2 hover:bg-primary/5">
              Ver detalhes <ChevronDown className="w-3 h-3" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {onSnooze && (
              <Button variant="ghost" size="sm" onClick={onSnooze} className="h-8 text-[10px] font-black tracking-widest uppercase gap-2 text-muted-foreground/50 hover:text-muted-foreground">
                <Pause className="w-3 h-3" /> Snooze
              </Button>
            )}
            {onAprovar && (
              <Button size="sm" onClick={onAprovar} className="h-9 px-5 text-[10px] font-black tracking-widest uppercase gap-2 bg-emerald-600 hover:bg-emerald-500 text-white border-0 shadow-lg shadow-emerald-900/20">
                <CheckCircle2 className="w-3.5 h-3.5" /> Aprovar
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
