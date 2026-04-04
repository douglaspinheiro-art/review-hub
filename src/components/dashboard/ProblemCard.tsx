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
      case "critico": return "border-red-500/50 bg-red-500/5 shadow-[0_0_15px_rgba(239,68,68,0.1)] animate-pulse-subtle";
      case "alto": return "border-orange-500/50 bg-orange-500/5";
      case "medio": return "border-amber-500/50 bg-amber-500/5";
      case "oportunidade": return "border-emerald-500/50 bg-emerald-500/5";
      default: return "border-border";
    }
  };

  const getSeverityLabel = () => {
    switch (severidade) {
      case "critico": return "CRÍTICO";
      case "alto": return "ALTO";
      case "medio": return "MÉDIO";
      case "oportunidade": return "OPORTUNIDADE";
    }
  };

  return (
    <div className={cn("border rounded-2xl overflow-hidden transition-all duration-300", getSeverityStyles())}>
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn("text-[10px] font-bold tracking-widest", 
              severidade === "critico" ? "text-red-500 border-red-500/50" : 
              severidade === "oportunidade" ? "text-emerald-500 border-emerald-500/50" : ""
            )}>
              ● {getSeverityLabel()}
            </Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" /> {detectado_em}
            </span>
            {status === "novo" && <Badge className="bg-primary text-primary-foreground text-[10px] font-bold">NOVO</Badge>}
          </div>
          <div className="text-right">
            <span className="text-xs text-muted-foreground block uppercase font-bold tracking-tight">Impacto estimado</span>
            <span className={cn("text-lg font-bold font-syne", severidade === "oportunidade" ? "text-emerald-500" : "text-red-500")}>
              {impacto_estimado < 0 ? "-" : ""}R$ {Math.abs(impacto_estimado).toLocaleString('pt-BR')}
            </span>
          </div>
        </div>

        <div className="flex gap-4">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", 
            severidade === "critico" ? "bg-red-500/10 text-red-500" : "bg-muted text-muted-foreground"
          )}>
            {getIcon()}
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold mb-1 leading-tight">{titulo}</h3>
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{descricao}</p>
            {causa_raiz && (
              <div className="text-xs bg-muted/50 p-2 rounded-lg border border-border/50 mb-4">
                <span className="font-bold text-foreground">Causa:</span> {causa_raiz}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onVer} className="h-8 text-xs font-bold gap-1">
              Ver detalhe <ChevronDown className="w-3 h-3" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {onSnooze && (
              <Button variant="ghost" size="sm" onClick={onSnooze} className="h-8 text-xs font-bold gap-1 text-muted-foreground">
                <Pause className="w-3 h-3" /> Snooze
              </Button>
            )}
            {onAprovar && (
              <Button size="sm" onClick={onAprovar} className="h-8 text-xs font-bold gap-1 bg-emerald-500 hover:bg-emerald-600 text-white border-0">
                <CheckCircle2 className="w-3 h-3" /> Aprovar
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
