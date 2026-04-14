import React from "react";
import { cn } from "@/lib/utils";
import { 
  Zap, MessageCircle, Mail, Send, Target, 
  Users, Sparkles, Clock, TrendingUp, CheckCircle2, X 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// Progress removed — unused

export interface PrescriptionProps {
  id: string;
  titulo: string;
  canal: "whatsapp" | "email" | "sms" | "multicanal";
  segmento: string;
  num_clientes: number;
  desconto_valor: number;
  desconto_tipo: "percentual" | "frete_gratis" | "fixo";
  desconto_justificativa?: string;
  custo_estimado: number;
  potencial_estimado: number;
  roi_estimado: number;
  melhor_horario?: string;
  ab_teste_ativo?: boolean;
  status: "aguardando_aprovacao" | "aprovada" | "em_execucao" | "concluida" | "rejeitada";
  preview_msg?: string;
  onAprovar?: () => void;
  onRejeitar?: () => void;
}

export const PrescriptionCard: React.FC<PrescriptionProps> = ({
  titulo, canal, segmento, num_clientes, desconto_valor, desconto_tipo, desconto_justificativa,
  custo_estimado, potencial_estimado, roi_estimado, melhor_horario, ab_teste_ativo, status,
  preview_msg, onAprovar, onRejeitar
}) => {
  const getCanalIcon = () => {
    switch (canal) {
      case "whatsapp": return <MessageCircle className="w-4 h-4" />;
      case "email": return <Mail className="w-4 h-4" />;
      case "sms": return <Send className="w-4 h-4" />;
      default: return <Sparkles className="w-4 h-4" />;
    }
  };

  const getCanalColor = () => {
    switch (canal) {
      case "whatsapp": return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
      case "email": return "text-blue-500 bg-blue-500/10 border-blue-500/20";
      case "sms": return "text-purple-500 bg-purple-500/10 border-purple-500/20";
      default: return "text-primary bg-primary/10 border-primary/20";
    }
  };

  return (
    <div className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all">
      <div className="p-5 border-b border-border/40 bg-muted/20">
        <div className="flex items-center justify-between mb-2">
          <Badge variant="secondary" className={cn("text-[10px] font-bold tracking-widest px-2 py-0.5", getCanalColor())}>
            <div className="flex items-center gap-1">
              {getCanalIcon()} {canal.toUpperCase()}
            </div>
          </Badge>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-bold uppercase">
            <Target className="w-3 h-3" /> {segmento.replace('_', ' ')}
          </div>
        </div>
        <h3 className="text-base font-bold leading-tight">{titulo}</h3>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Alcance</span>
            <div className="flex items-center gap-1.5 font-bold text-sm">
              <Users className="w-3.5 h-3.5 text-primary" /> {num_clientes} clientes
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Potencial ROI</span>
            <div className="flex items-center gap-1.5 font-bold text-sm text-emerald-500">
              <TrendingUp className="w-3.5 h-3.5" /> {roi_estimado}x
            </div>
          </div>
        </div>

        <div className="bg-muted/30 rounded-xl p-3 border border-border/40 mb-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">Desconto sugerido</span>
            <Badge className="bg-primary/20 text-primary border-0 text-[11px] font-bold">
              {desconto_tipo === "frete_gratis" ? "FRETE GRÁTIS" : `${desconto_valor}%`}
            </Badge>
          </div>
          {desconto_justificativa && (
            <p className="text-[11px] text-muted-foreground leading-snug">
              "{desconto_justificativa}"
            </p>
          )}
        </div>

        {preview_msg && (
          <div className="relative mb-5">
            <div className="absolute top-2 right-2 flex gap-0.5">
              <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
              <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
              <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="text-[11px] text-muted-foreground bg-muted/50 p-3 rounded-xl border border-dashed border-border/60 italic line-clamp-2">
              {preview_msg}
            </div>
          </div>
        )}

        {(onAprovar || onRejeitar) && (
          <div className={cn("grid gap-2", onAprovar && onRejeitar ? "grid-cols-2" : "grid-cols-1")}>
            {onRejeitar && (
              <Button variant="outline" onClick={onRejeitar} className="h-9 text-xs font-bold gap-1.5">
                <X className="w-3.5 h-3.5" /> Rejeitar
              </Button>
            )}
            {onAprovar && (
              <Button onClick={onAprovar} className="h-9 text-xs font-bold gap-1.5 bg-primary text-primary-foreground">
                <CheckCircle2 className="w-3.5 h-3.5" /> Aprovar
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="px-5 py-2.5 bg-muted/10 border-t border-border/40 flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-1 text-muted-foreground font-bold">
          <Clock className="w-3 h-3" /> {melhor_horario || "A definir"}
        </div>
        {ab_teste_ativo && (
          <div className="flex items-center gap-1 text-primary font-bold">
            <Zap className="w-3 h-3 fill-primary" /> A/B RECOMENDADO
          </div>
        )}
      </div>
    </div>
  );
};
