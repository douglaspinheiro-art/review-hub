import { useEffect, useState } from "react";
import {
  Zap, MessageCircle, Mail, Send,
  Plus, Play, Pause, ChevronRight,
  UserPlus, ShoppingCart, CreditCard,
  RefreshCcw, Gift, Heart, Sparkles,
  BarChart3, Settings2, Clock, Loader2
} from "lucide-react";
import AutomacaoModal from "@/components/dashboard/AutomacaoModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { TrialGate } from "@/components/dashboard/TrialGate";
import { JORNADAS_META } from "@/lib/automations-meta";

export default function Automacoes() {
  const { user, isTrialActive } = useAuth();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);

  const { data: automations = [], isLoading } = useQuery({
    queryKey: ["automations", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automations")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  // Seed: se usuário não tem automações, criar as 7 defaults
  const seedMutation = useMutation({
    mutationFn: async () => {
      const rows = JORNADAS_META.map(j => ({
        user_id: user!.id,
        name: j.titulo,
        trigger: j.trigger,
        message_template: j.message_template,
        delay_minutes: j.delay_minutes,
        is_active: j.defaultActive,
      }));
      const { error } = await supabase.from("automations").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automations"] }),
  });

  useEffect(() => {
    if (!isLoading && automations.length === 0 && user) {
      seedMutation.mutate();
    }
  }, [isLoading, automations.length, user]);

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("automations")
        .update({ is_active })
        .eq("id", id)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: (_, { is_active }) => {
      toast.success(is_active ? "Automação ativada" : "Automação pausada");
      queryClient.invalidateQueries({ queryKey: ["automations"] });
    },
    onError: () => toast.error("Erro ao atualizar automação"),
  });

  // Mescla dados do DB com metadata de UI (ícones, fluxo, kpi)
  const jornadas = JORNADAS_META.map(meta => {
    const dbRow = automations.find(a => a.name === meta.titulo);
    return { ...meta, id: dbRow?.id, is_active: dbRow?.is_active ?? meta.defaultActive, sent_count: dbRow?.sent_count ?? 0 };
  });

  const activeCount = jornadas.filter(j => j.is_active).length;

  if (isLoading || seedMutation.isPending) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        {seedMutation.isPending && (
          <p className="text-sm text-muted-foreground font-medium animate-pulse">
            Configurando suas jornadas automáticas...
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      {showModal && <AutomacaoModal onClose={() => setShowModal(false)} />}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black font-syne tracking-tighter uppercase italic">Jornadas <span className="text-primary">Permanentes</span></h1>
          <p className="text-muted-foreground text-sm mt-1">Automações que trabalham 24/7 — <span className="text-foreground font-bold">{activeCount} ativas</span> agora.</p>
        </div>
        <Button
          className="font-bold gap-2 rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20"
          onClick={() => setShowModal(true)}
        >
          <Plus className="w-4 h-4" /> Criar Jornada Customizada
        </Button>
      </div>

      {activeCount === 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 flex items-center justify-between gap-3 animate-in fade-in duration-300">
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-amber-500 shrink-0" />
            <p className="text-sm font-bold text-amber-600">
              Nenhuma automação ativa — ative ao menos Carrinho Abandonado para começar a recuperar vendas imediatamente.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {jornadas.map((j) => (
          <div key={j.slug} className={cn(
            "bg-card border rounded-2xl overflow-hidden transition-all duration-300 flex flex-col",
            j.is_active ? "border-primary/20 shadow-sm" : "border-border/50 opacity-70 grayscale"
          )}>
            <div className="p-6 space-y-4 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", j.bg)}>
                    <j.icon className={cn("w-5 h-5", j.color)} />
                  </div>
                  <div>
                    <h3 className="font-black text-sm leading-tight">{j.titulo}</h3>
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{j.gatilho}</p>
                  </div>
                </div>
                <TrialGate action="ativar automações">
                  <Switch
                    checked={j.is_active}
                    disabled={!j.id || toggleMutation.isPending}
                    onCheckedChange={(checked) => j.id && toggleMutation.mutate({ id: j.id, is_active: checked })}
                  />
                </TrialGate>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">{j.desc}</p>

              {(j as any).templateVars && (
                <div className="bg-muted/40 rounded-xl px-3 py-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">Variáveis disponíveis</p>
                  <p className="text-[10px] font-mono text-muted-foreground">{(j as any).templateVars}</p>
                </div>
              )}

              <div className="space-y-1.5">
                {j.fluxo.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                    <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[8px] font-black shrink-0">{i + 1}</div>
                    {step}
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 pb-6 pt-2 border-t border-border/30 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">{j.kpi}</p>
                <p className={cn("text-lg font-black font-mono", j.color)}>{j.kpiValue}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Enviados</p>
                <p className="text-lg font-black font-mono text-muted-foreground">{j.sent_count.toLocaleString("pt-BR")}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
