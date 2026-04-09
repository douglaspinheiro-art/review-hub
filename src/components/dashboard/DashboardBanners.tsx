/**
 * Extracted banner/toast sub-components from Dashboard.tsx.
 * Each component has a single responsibility and receives only the props it needs.
 */
import { useNavigate } from "react-router-dom";
import { Flame, Zap, Trophy, Share2, Smartphone, Target, CheckCircle2, ArrowRight, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ─── Streak milestone toast ─────────────────────────────────────────────────

interface StreakMilestoneToastProps {
  message: string;
  onDismiss: () => void;
}

export function StreakMilestoneToast({ message, onDismiss }: StreakMilestoneToastProps) {
  const navigate = useNavigate();
  return (
    <div className="fixed bottom-24 right-6 z-40 animate-in slide-in-from-right-8 fade-in duration-500">
      <div className="bg-card border border-amber-500/30 rounded-2xl p-5 shadow-2xl shadow-amber-500/10 max-w-sm space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <Flame className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-amber-500">Streak atingido!</p>
            <p className="font-black text-sm">{message}</p>
          </div>
          <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={onDismiss}>✕</button>
        </div>
        <p className="text-xs text-muted-foreground">
          Lojistas consistentes têm <strong>2.8x mais receita recuperada</strong>. Continue aprovando prescrições diariamente.
        </p>
        <Button
          size="sm"
          className="w-full h-7 font-bold text-[10px] gap-1.5"
          onClick={() => { navigate("/dashboard/prescricoes"); onDismiss(); }}
        >
          <Zap className="w-3 h-3" /> Ver Prescrições Pendentes
        </Button>
      </div>
    </div>
  );
}

// ─── Revenue milestone toast ─────────────────────────────────────────────────

interface MilestoneToastProps {
  message: string;
  onDismiss: () => void;
}

export function MilestoneToast({ message, onDismiss }: MilestoneToastProps) {
  const navigate = useNavigate();
  return (
    <div className="fixed bottom-24 right-6 z-40 animate-in slide-in-from-right-8 fade-in duration-500">
      <div className="bg-card border border-primary/30 rounded-2xl p-5 shadow-2xl shadow-primary/10 max-w-sm space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Trophy className="w-5 h-5 text-primary fill-primary/20" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-primary">Marco atingido!</p>
            <p className="font-black text-sm">{message}</p>
          </div>
          <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={onDismiss}>✕</button>
        </div>
        <p className="text-xs text-muted-foreground">
          Parabéns! Você recuperou seu primeiro grande valor com o LTV Boost. Continue aprovando prescrições para crescer ainda mais.
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="h-7 font-bold text-[10px] gap-1.5 flex-1"
            onClick={() => navigate("/dashboard/prescricoes")}
          >
            <Zap className="w-3 h-3" /> Ver Prescrições
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 font-bold text-[10px] gap-1.5"
            onClick={() => {
              if (navigator.share) {
                navigator.share({
                  title: "LTV Boost",
                  text: `Acabei de recuperar ${message} com IA no WhatsApp!`,
                  url: "https://ltvboost.com.br",
                });
              }
              onDismiss();
            }}
          >
            <Share2 className="w-3 h-3" /> Compartilhar
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── WhatsApp not connected banner ──────────────────────────────────────────

export function WhatsAppPendingBanner() {
  const navigate = useNavigate();
  return (
    <Card className="p-6 border-amber-500/30 bg-amber-500/5 rounded-3xl animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
            <Smartphone className="w-5 h-5 text-amber-500" />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-500">Ação necessária</p>
            <p className="font-black text-base">Conecte seu WhatsApp para ativar o produto</p>
            <p className="text-sm text-muted-foreground">Sem isso, nenhuma automação ou campanha será enviada.</p>
          </div>
        </div>
        <Button
          onClick={() => navigate("/dashboard/whatsapp")}
          className="h-12 px-8 bg-amber-500 hover:bg-amber-400 text-black font-black rounded-2xl shadow-lg shadow-amber-500/20 gap-2 shrink-0"
        >
          <Smartphone className="w-4 h-4" /> Conectar agora →
        </Button>
      </div>
    </Card>
  );
}

// ─── Pending prescriptions banner ────────────────────────────────────────────

interface PrescricoesPendingBannerProps {
  pendingCount: number;
  pendingValue: number;
}

export function PrescricoesPendingBanner({ pendingCount, pendingValue }: PrescricoesPendingBannerProps) {
  const navigate = useNavigate();
  return (
    <Card className="p-6 border-red-500/20 bg-red-500/5 rounded-3xl animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-2xl bg-red-500/10 flex items-center justify-center shrink-0 mt-0.5 animate-pulse">
            <Target className="w-5 h-5 text-red-500" />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-red-500">Receita em risco agora</p>
            <p className="font-black text-base">
              R$ {pendingValue.toLocaleString("pt-BR")} identificados mas não capturados
            </p>
            <p className="text-sm text-muted-foreground">
              {pendingCount} {pendingCount === 1 ? "oportunidade detectada" : "oportunidades detectadas"} pela IA.
              Cada hora sem ação reduz a taxa de recuperação.
            </p>
          </div>
        </div>
        <Button
          onClick={() => navigate("/dashboard/prescricoes")}
          className="h-12 px-8 bg-red-500 hover:bg-red-400 text-white font-black rounded-2xl shadow-lg shadow-red-500/20 gap-2 shrink-0"
        >
          <Zap className="w-4 h-4 fill-white" /> Recuperar agora
        </Button>
      </div>
    </Card>
  );
}

// ─── New setup welcome banner ─────────────────────────────────────────────────

interface NewSetupBannerProps {
  isWhatsAppConnected: boolean;
  roi: string;
  pendingCount: number;
}

export function NewSetupBanner({ isWhatsAppConnected, roi, pendingCount }: NewSetupBannerProps) {
  const navigate = useNavigate();
  return (
    <Card className="p-8 border-primary/20 bg-primary/5 shadow-2xl shadow-primary/5 rounded-3xl animate-in fade-in slide-in-from-top-4 duration-700">
      <div className="flex flex-col md:flex-row gap-8 items-center">
        <div className="space-y-4 flex-1">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Loja configurada com sucesso</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-black font-syne uppercase italic tracking-tight">
            A IA já identificou <span className="text-primary">R$ 4.200</span> para recuperar
          </h2>
          <p className="text-sm text-muted-foreground font-medium">
            Complete os 3 passos abaixo para ativar a recuperação automática e capturar esse valor hoje.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="flex items-center gap-3 p-4 bg-background/50 rounded-2xl border border-border/50">
              <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-white" />
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] font-black uppercase tracking-widest">Loja</p>
                <p className="text-xs font-bold text-emerald-500">Conectada</p>
              </div>
            </div>
            <div
              className={cn(
                "flex items-center gap-3 p-4 rounded-2xl border transition-all cursor-pointer hover:scale-[1.02]",
                isWhatsAppConnected ? "bg-background/50 border-border/50" : "bg-amber-500/5 border-amber-500/20"
              )}
              onClick={() => navigate("/dashboard/whatsapp")}
            >
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                isWhatsAppConnected ? "bg-emerald-500" : "bg-amber-500/20"
              )}>
                {isWhatsAppConnected
                  ? <CheckCircle2 className="w-5 h-5 text-white" />
                  : <WifiOff className="w-4 h-4 text-amber-500" />}
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] font-black uppercase tracking-widest">WhatsApp</p>
                <p className={cn("text-xs font-bold", isWhatsAppConnected ? "text-emerald-500" : "text-amber-500")}>
                  {isWhatsAppConnected ? "Conectado" : "Pendente →"}
                </p>
              </div>
            </div>
            <div
              className={cn(
                "flex items-center gap-3 p-4 rounded-2xl border transition-all cursor-pointer hover:scale-[1.02]",
                pendingCount > 0 ? "bg-primary/5 border-primary/20" : "bg-background/50 border-border/50"
              )}
              onClick={() => navigate("/dashboard/prescricoes")}
            >
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                pendingCount > 0 ? "bg-primary" : "bg-muted"
              )}>
                <Zap className={cn("w-4 h-4", pendingCount > 0 ? "fill-primary-foreground text-primary-foreground" : "text-muted-foreground")} />
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] font-black uppercase tracking-widest">Prescrições</p>
                <p className={cn("text-xs font-bold", pendingCount > 0 ? "text-primary" : "text-muted-foreground")}>
                  {pendingCount > 0 ? `${pendingCount} aguardando →` : "Nenhuma ainda"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-6 pt-2">
            <div>
              <p className="text-2xl font-black">{roi}x</p>
              <p className="text-[9px] text-muted-foreground uppercase font-black tracking-widest">ROI sobre assinatura</p>
            </div>
          </div>
        </div>
        <Button
          onClick={() => navigate(isWhatsAppConnected ? "/dashboard/automacoes" : "/dashboard/whatsapp")}
          className="h-16 px-10 bg-primary hover:bg-primary/90 text-primary-foreground font-black rounded-2xl shadow-xl shadow-primary/20 gap-2"
        >
          {isWhatsAppConnected ? "Ativar Primeira Automação" : "Conectar WhatsApp Agora"} <ArrowRight className="w-5 h-5" />
        </Button>
      </div>
    </Card>
  );
}

// ─── First week welcome banner ────────────────────────────────────────────────

interface FirstWeekBannerProps {
  revenueLast30: number;
  roi: string;
  pendingCount: number;
}

export function FirstWeekBanner({ revenueLast30, roi, pendingCount }: FirstWeekBannerProps) {
  const navigate = useNavigate();
  return (
    <Card className="p-8 border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent shadow-2xl shadow-emerald-500/10 rounded-3xl animate-in fade-in slide-in-from-top-4 duration-700">
      <div className="flex flex-col md:flex-row gap-8 items-center">
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Sua primeira semana</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-black font-syne tracking-tighter text-emerald-400">
            R$ {revenueLast30.toLocaleString("pt-BR")}
          </h2>
          <p className="text-sm text-muted-foreground font-medium">
            recuperados pela IA nesta semana. Cada prescrição aprovada aumenta esse número.
          </p>
          <div className="flex gap-6 pt-2">
            <div>
              <p className="text-2xl font-black">{roi}x</p>
              <p className="text-[9px] text-muted-foreground uppercase font-black tracking-widest">ROI sobre assinatura</p>
            </div>
            <div className="w-px bg-border/20" />
            <div>
              <p className="text-2xl font-black">{pendingCount}</p>
              <p className="text-[9px] text-muted-foreground uppercase font-black tracking-widest">Prescrições pendentes</p>
            </div>
          </div>
        </div>
        <Button
          onClick={() => navigate("/dashboard/prescricoes")}
          className="h-14 px-10 bg-emerald-500 hover:bg-emerald-400 text-black font-black rounded-2xl shadow-xl shadow-emerald-500/20 gap-2 shrink-0"
        >
          <Zap className="w-5 h-5 fill-black" /> Aprovar Prescrições
        </Button>
      </div>
    </Card>
  );
}
