import { useState, useMemo, useEffect } from "react";
import {
  Megaphone, Plus, CalendarDays, Play, Loader2, FlaskConical, Trophy,
  Trash2, Copy, Search, Clock, MessageCircle, Mail, Smartphone,
} from "lucide-react";
import { useCampaigns } from "@/hooks/useDashboard";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, useNavigate } from "react-router-dom";
import CampaignModal, { CampaignPrefill } from "@/components/dashboard/CampaignModal";
import { TrialGate } from "@/components/dashboard/TrialGate";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  draft:     { label: "Rascunho",     className: "bg-muted text-muted-foreground" },
  scheduled: { label: "Agendada",     className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  running:   { label: "Em andamento", className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  completed: { label: "Concluída",    className: "bg-green-500/10 text-green-600 border-green-500/20" },
  paused:    { label: "Pausada",      className: "bg-orange-500/10 text-orange-600 border-orange-500/20" },
  failed:    { label: "Falhou",       className: "bg-red-500/10 text-red-600 border-red-500/20" },
};

const FILTER_TABS = [
  { value: "all",       label: "Todas" },
  { value: "running",   label: "Em andamento" },
  { value: "scheduled", label: "Agendadas" },
  { value: "completed", label: "Concluídas" },
  { value: "draft",     label: "Rascunhos" },
];

const CHANNEL_CONFIG = {
  whatsapp: { label: "WhatsApp", icon: MessageCircle, className: "bg-green-500/10 text-green-700 border-green-500/20" },
  email:    { label: "E-mail",   icon: Mail,          className: "bg-blue-500/10 text-blue-700 border-blue-500/20" },
  sms:      { label: "SMS",      icon: Smartphone,    className: "bg-orange-500/10 text-orange-700 border-orange-500/20" },
} as const;

export default function Campanhas() {
  const [showModal, setShowModal] = useState(false);
  const [modalPrefill, setModalPrefill] = useState<CampaignPrefill | undefined>(undefined);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("new") === "true") {
      const raw = sessionStorage.getItem("campaign_prefill");
      if (raw) {
        try { setModalPrefill(JSON.parse(raw)); } catch { /* ignore */ }
        sessionStorage.removeItem("campaign_prefill");
      }
      setShowModal(true);
      navigate("/dashboard/campanhas", { replace: true });
    }
  }, [location.search, navigate]);
  const [filter, setFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: campaigns = [], isLoading, error, refetch } = useCampaigns();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const filtered = useMemo(() => {
    return campaigns.filter((c) => {
      const matchesStatus  = filter === "all" || c.status === filter;
      const matchesChannel = channelFilter === "all" || c.channel === channelFilter;
      const matchesSearch  = search === "" || c.name.toLowerCase().includes(search.toLowerCase());
      return matchesStatus && matchesChannel && matchesSearch;
    });
  }, [campaigns, filter, channelFilter, search]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: campaigns.length };
    for (const c of campaigns) {
      counts[c.status] = (counts[c.status] ?? 0) + 1;
    }
    return counts;
  }, [campaigns]);

  const dispatchMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      setDispatchingId(campaignId);
      const { data, error } = await supabase.functions.invoke("dispatch-campaign", {
        body: { campaign_id: campaignId },
      });
      if (error) throw error;
      return data as { sent: number; failed: number };
    },
    onSuccess: (data) => {
      toast({
        title: "Campanha disparada!",
        description: `${data.sent} mensagens enviadas${data.failed > 0 ? `, ${data.failed} falharam` : ""}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao disparar campanha", description: err.message, variant: "destructive" });
    },
    onSettled: () => setDispatchingId(null),
  });

  const deleteMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const { error } = await supabase.from("campaigns").delete().eq("id", campaignId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Campanha excluída." });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: () => {
      toast({ title: "Erro ao excluir campanha", variant: "destructive" });
    },
    onSettled: () => setConfirmDeleteId(null),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (campaign: typeof campaigns[number]) => {
      const { error } = await supabase.from("campaigns").insert({
        user_id: user!.id,
        name: `${campaign.name} (cópia)`,
        message: campaign.message,
        channel: campaign.channel,
        tags: campaign.tags ?? [],
        status: "draft",
        total_contacts: 0,
        sent_count: 0,
        delivered_count: 0,
        read_count: 0,
        reply_count: 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Campanha duplicada!", description: "Salva como rascunho." });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: () => {
      toast({ title: "Erro ao duplicar campanha", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      {showModal && (
        <CampaignModal
          prefill={modalPrefill}
          onClose={() => { setShowModal(false); setModalPrefill(undefined); }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campanhas</h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie seus disparos e campanhas de mensagens</p>
        </div>
        <Button className="gap-2" onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4" />
          Nova Campanha
        </Button>
      </div>

      {/* Busca + Filtros */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar campanha..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Filtros de status */}
        <div className="flex gap-1 flex-wrap">
          {FILTER_TABS.map((tab) => {
            const count = tabCounts[tab.value] ?? 0;
            if (tab.value !== "all" && count === 0) return null;
            return (
              <button
                key={tab.value}
                onClick={() => setFilter(tab.value)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5",
                  filter === tab.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
                <span className={cn("text-[10px] font-bold px-1 rounded", filter === tab.value ? "bg-white/20" : "bg-background")}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filtros de canal */}
        <div className="flex gap-1 flex-wrap">
          {([
            { value: "all", label: "Todos os canais", icon: null },
            ...Object.entries(CHANNEL_CONFIG).map(([v, cfg]) => ({ value: v, label: cfg.label, icon: cfg.icon })),
          ] as { value: string; label: string; icon: React.ElementType | null }[]).map((ch) => {
            const Icon = ch.icon;
            return (
              <button
                key={ch.value}
                onClick={() => setChannelFilter(ch.value)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5",
                  channelFilter === ch.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {Icon && <Icon className="w-3 h-3" />}
                {ch.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-card border rounded-xl p-5 space-y-4 animate-pulse">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-3 bg-muted rounded w-1/5" />
                </div>
                <div className="h-8 w-20 bg-muted rounded-lg" />
              </div>
              <div className="grid grid-cols-4 gap-4">
                {[...Array(4)].map((_, j) => (
                  <div key={j} className="h-14 bg-muted rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Erro */}
      {error && (
        <div className="text-center py-12 space-y-3">
          <p className="text-muted-foreground text-sm">Erro ao carregar campanhas.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && campaigns.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-8 text-center max-w-lg mx-auto">
          <div className="w-20 h-20 rounded-3xl bg-primary/5 border border-primary/10 flex items-center justify-center">
            <Megaphone className="w-10 h-10 text-primary/30" />
          </div>
          <div className="space-y-2">
            <p className="font-black text-xl font-syne tracking-tighter uppercase">Nenhuma campanha ainda</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Crie sua primeira campanha e comece a recuperar clientes em minutos. A taxa média de leitura no WhatsApp é de <strong className="text-foreground">94%</strong> — 10x maior que e-mail.
            </p>
          </div>

          {/* Step-by-step guide */}
          <div className="w-full space-y-3 text-left">
            {[
              { step: "1", title: "Escolha o canal", desc: "WhatsApp, E-mail ou SMS" },
              { step: "2", title: "Defina o público", desc: "Por tag, comportamento ou segmento RFM" },
              { step: "3", title: "Escreva a mensagem", desc: "Ou use os templates da IA" },
            ].map((s) => (
              <div key={s.step} className="flex items-start gap-3 p-4 bg-muted/30 rounded-2xl">
                <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5">{s.step}</div>
                <div>
                  <p className="text-sm font-black">{s.title}</p>
                  <p className="text-xs text-muted-foreground">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <Button onClick={() => setShowModal(true)} className="gap-2 font-black rounded-xl flex-1">
              <Plus className="w-4 h-4" /> Criar primeira campanha
            </Button>
            <Button variant="outline" className="gap-2 font-bold rounded-xl" onClick={() => navigate("/dashboard/automacoes")}>
              Ver automações prontas
            </Button>
          </div>
        </div>
      )}

      {/* Empty search/filter */}
      {!isLoading && !error && campaigns.length > 0 && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
          <Search className="w-8 h-8 opacity-20" />
          <p className="text-sm">Nenhuma campanha encontrada para este filtro.</p>
          <button onClick={() => { setFilter("all"); setChannelFilter("all"); setSearch(""); }} className="text-xs text-primary hover:underline">
            Limpar filtros
          </button>
        </div>
      )}

      {/* Lista */}
      {!isLoading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((c) => {
            const readRate = c.sent_count > 0 ? Math.round((c.read_count / c.sent_count) * 100) : 0;
            const deliveryRate = c.sent_count > 0 ? Math.round((c.delivered_count / c.sent_count) * 100) : 0;
            const replyRate = c.sent_count > 0 ? Math.round((c.reply_count / c.sent_count) * 100) : 0;
            const progress = c.total_contacts > 0 ? Math.round((c.sent_count / c.total_contacts) * 100) : 0;
            const st = STATUS_LABEL[c.status] ?? STATUS_LABEL.draft;

            return (
              <div key={c.id} className="bg-card border rounded-xl p-5 space-y-4">
                {/* Cabeçalho do card */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold truncate">{c.name}</h3>
                      <Badge variant="outline" className={cn("text-xs", st.className)}>{st.label}</Badge>
                      {(() => {
                        const ch = CHANNEL_CONFIG[c.channel as keyof typeof CHANNEL_CONFIG] ?? CHANNEL_CONFIG.whatsapp;
                        const Icon = ch.icon;
                        return (
                          <Badge variant="outline" className={cn("text-xs flex items-center gap-1", ch.className)}>
                            <Icon className="w-2.5 h-2.5" />{ch.label}
                          </Badge>
                        );
                      })()}
                      {c.ab_variant && (
                        <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-600 border-purple-500/20 flex items-center gap-1">
                          <FlaskConical className="w-2.5 h-2.5" />
                          Variante {c.ab_variant.toUpperCase()}
                        </Badge>
                      )}
                      {c.ab_variant && c.winner_variant === c.ab_variant && (
                        <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-700 border-yellow-500/20 flex items-center gap-1">
                          <Trophy className="w-2.5 h-2.5" />
                          Vencedora
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      {c.scheduled_at && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />
                          {new Date(c.scheduled_at).toLocaleString("pt-BR")}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Criada em {new Date(c.created_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Duplicar */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-muted-foreground h-8 px-2"
                      disabled={duplicateMutation.isPending}
                      onClick={() => duplicateMutation.mutate(c)}
                      title="Duplicar campanha"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>

                    {/* Deletar (só rascunhos) */}
                    {c.status === "draft" && (
                      confirmDeleteId === c.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">Confirmar?</span>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 px-2 text-xs"
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate(c.id)}
                          >
                            {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Sim"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Não
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1.5 text-muted-foreground hover:text-destructive h-8 px-2"
                          onClick={() => setConfirmDeleteId(c.id)}
                          title="Excluir rascunho"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )
                    )}

                    {/* Disparar */}
                    {(c.status === "draft" || c.status === "scheduled") && (
                      <TrialGate action="disparar campanhas">
                        <Button
                          size="sm"
                          className="gap-1.5"
                          disabled={dispatchingId === c.id}
                          onClick={() => dispatchMutation.mutate(c.id)}
                        >
                          {dispatchingId === c.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Play className="w-3.5 h-3.5" />}
                          {dispatchingId === c.id ? "Disparando..." : "Disparar"}
                        </Button>
                      </TrialGate>
                    )}
                  </div>
                </div>

                {/* Preview da mensagem / assunto */}
                {(c.subject || c.message) && (
                  <div className="bg-muted/40 rounded-lg px-3 py-2 space-y-0.5">
                    {c.subject && (
                      <p className="text-xs font-semibold text-foreground truncate">Assunto: {c.subject}</p>
                    )}
                    <p className="text-sm text-muted-foreground line-clamp-2">{c.message}</p>
                  </div>
                )}

                {/* Métricas */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                  {[
                    { label: "Enviados",  value: c.sent_count.toLocaleString("pt-BR") },
                    { label: "Entregues", value: c.sent_count > 0 ? `${deliveryRate}%` : "—" },
                    { label: "Lidos",     value: c.sent_count > 0 ? `${readRate}%` : "—" },
                    { label: "Respostas", value: c.sent_count > 0 ? `${replyRate}%` : "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-muted/40 rounded-lg py-2">
                      <p className="text-lg font-bold">{value}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>

                {/* Barra de progresso */}
                {c.total_contacts > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Progresso</span>
                      <span>{c.sent_count.toLocaleString("pt-BR")} / {c.total_contacts.toLocaleString("pt-BR")}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
