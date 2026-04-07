import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2, Circle, ChevronDown, ChevronUp,
  Smartphone, Megaphone, Zap, Users, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

// ─── Hook de status de ativação ───────────────────────────────────────────────

function useActivationStatus(userId: string | undefined) {
  // WhatsApp conectado
  const { data: whatsappConnected = false, isLoading: l1 } = useQuery({
    queryKey: ["activation_whatsapp", userId],
    queryFn: async () => {
      const { count } = await supabase
        .from("whatsapp_connections")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!)
        .eq("status", "connected");
      return (count ?? 0) > 0;
    },
    enabled: !!userId,
  });

  // Campanha criada
  const { data: campaignCreated = false, isLoading: l2 } = useQuery({
    queryKey: ["activation_campaign", userId],
    queryFn: async () => {
      const { count } = await supabase
        .from("campaigns")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!);
      return (count ?? 0) > 0;
    },
    enabled: !!userId,
  });

  // Automação ativa
  const { data: automationActive = false, isLoading: l3 } = useQuery({
    queryKey: ["activation_automation", userId],
    queryFn: async () => {
      const { count } = await supabase
        .from("automations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!)
        .eq("is_active", true);
      return (count ?? 0) > 0;
    },
    enabled: !!userId,
  });

  // Tem contatos
  const { data: hasContacts = false, isLoading: l4 } = useQuery({
    queryKey: ["activation_contacts", userId],
    queryFn: async () => {
      const { count } = await supabase
        .from("customers_v3")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!);
      return (count ?? 0) > 0;
    },
    enabled: !!userId,
  });

  return {
    whatsappConnected,
    campaignCreated,
    automationActive,
    hasContacts,
    isLoading: l1 || l2 || l3 || l4,
  };
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function ActivationChecklist() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem("activation_checklist_collapsed") === "1"
  );
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem("activation_checklist_dismissed") === "1"
  );

  const { whatsappConnected, campaignCreated, automationActive, hasContacts, isLoading } =
    useActivationStatus(user?.id);

  const steps = [
    {
      key: "whatsapp",
      label: "Conectar WhatsApp",
      desc: "Vincule sua instância para começar a enviar mensagens",
      done: whatsappConnected,
      icon: Smartphone,
      href: "/dashboard/whatsapp",
      cta: "Conectar agora",
    },
    {
      key: "contacts",
      label: "Importar contatos",
      desc: "Integre sua loja ou importe sua lista de clientes",
      done: hasContacts,
      icon: Users,
      href: "/dashboard/integracoes",
      cta: "Ver integrações",
    },
    {
      key: "automation",
      label: "Ativar automação",
      desc: "Ligue pelo menos uma jornada automática (ex: carrinho abandonado)",
      done: automationActive,
      icon: Zap,
      href: "/dashboard/automacoes",
      cta: "Ver automações",
    },
    {
      key: "campaign",
      label: "Criar primeira campanha",
      desc: "Envie sua primeira campanha de WhatsApp",
      done: campaignCreated,
      icon: Megaphone,
      href: "/dashboard/campanhas?new=true",
      cta: "Criar campanha",
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;

  // Não renderizar se já concluiu tudo ou dispensou
  if (dismissed || allDone || isLoading) return null;

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("activation_checklist_collapsed", next ? "1" : "0");
  }

  function dismiss() {
    setDismissed(true);
    localStorage.setItem("activation_checklist_dismissed", "1");
  }

  return (
    <div className="bg-card border border-primary/20 rounded-2xl overflow-hidden shadow-sm">
      {/* Header do card */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {steps.map((s) => (
              <div
                key={s.key}
                className={cn(
                  "w-2 h-2 rounded-full transition-colors",
                  s.done ? "bg-emerald-500" : "bg-muted"
                )}
              />
            ))}
          </div>
          <div>
            <p className="text-sm font-black">Primeiros passos</p>
            <p className="text-xs text-muted-foreground">
              {completedCount} de {steps.length} concluídos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleCollapse}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground"
            aria-label={collapsed ? "Expandir" : "Recolher"}
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
          <button
            onClick={dismiss}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground"
            aria-label="Dispensar checklist"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Lista de steps */}
      {!collapsed && (
        <div className="divide-y divide-border/40">
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.key}
                className={cn(
                  "flex items-center gap-4 px-5 py-3.5 transition-colors",
                  s.done ? "opacity-60" : "hover:bg-muted/30 cursor-pointer"
                )}
                onClick={() => !s.done && navigate(s.href)}
              >
                {/* Check icon */}
                {s.done ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground/40 shrink-0" />
                )}

                {/* Feature icon */}
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  s.done ? "bg-muted" : "bg-primary/10"
                )}>
                  <Icon className={cn("w-4 h-4", s.done ? "text-muted-foreground" : "text-primary")} />
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-semibold", s.done && "line-through text-muted-foreground")}>
                    {s.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{s.desc}</p>
                </div>

                {/* CTA */}
                {!s.done && (
                  <span className="text-xs font-bold text-primary shrink-0 flex items-center gap-1 hover:underline">
                    {s.cta} →
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
