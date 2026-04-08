import { useState, useRef, useEffect, useMemo } from "react";
import { MessageCircle, Search, Clock, Send, Loader2, WifiOff, Settings, AlertCircle, Sparkles, User, Check, MoreVertical, Plus, Smile, Paperclip, Zap as ZapIcon, Minus } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useConversations, useMessages, useConversationIdsByMessageSearch, useInboxRoutingSettings } from "@/hooks/useDashboard";
import { useWhatsAppSender } from "@/hooks/useWhatsAppSender";
import { useAuth } from "@/hooks/useAuth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { ContactInfoSidebar } from "@/components/dashboard/ContactInfoSidebar";
import { formatDistanceToNow, isSameDay, format, isYesterday, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { TrialGate } from "@/components/dashboard/TrialGate";
import { trackMoatEvent } from "@/lib/moat-telemetry";

const STATUS_FILTERS = [
  { label: "Todas", value: "all" },
  { label: "Abertas", value: "open" },
  { label: "Pendentes", value: "pending" },
  { label: "Fechadas", value: "closed" },
];

const STATUS_COLORS: Record<string, string> = {
  open: "bg-green-500/10 text-green-600 border-green-500/20",
  pending: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  closed: "bg-muted text-muted-foreground",
};

function getSlaBucket(slaDueAt: string | null | undefined): "none" | "breach" | "soon" | "ok" {
  if (!slaDueAt) return "none";
  const t = new Date(slaDueAt).getTime();
  if (Number.isNaN(t)) return "none";
  const now = Date.now();
  if (t < now) return "breach";
  if (t - now <= 60 * 60 * 1000) return "soon";
  return "ok";
}

const AVATAR_COLORS = [
  "bg-blue-500/10 text-blue-600",
  "bg-emerald-500/10 text-emerald-600",
  "bg-violet-500/10 text-violet-600",
  "bg-amber-500/10 text-amber-600",
  "bg-rose-500/10 text-rose-600",
  "bg-cyan-500/10 text-cyan-600",
];

function getAvatarColor(name: string = "") {
  if (!name) return AVATAR_COLORS[0];
  const charCode = name.charCodeAt(0);
  return AVATAR_COLORS[charCode % AVATAR_COLORS.length];
}

function formatDateSeparator(date: Date) {
  if (isToday(date)) return "Hoje";
  if (isYesterday(date)) return "Ontem";
  return format(date, "d 'de' MMMM", { locale: ptBR });
}

export default function Inbox() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [composerMode, setComposerMode] = useState<"text" | "template" | "flow">("text");
  const [ctaLabel, setCtaLabel] = useState("Ver oferta");
  const [ctaUrl, setCtaUrl] = useState("");
  const [flowId, setFlowId] = useState("");
  const [flowScreenId, setFlowScreenId] = useState("");
  const [assigneeName, setAssigneeName] = useState("");
  const [slaDueAt, setSlaDueAt] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [internalNote, setInternalNote] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [agentsDraft, setAgentsDraft] = useState("");
  const agentsFieldTouched = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const h = window.setTimeout(() => setDebouncedSearch(search.trim()), 320);
    return () => window.clearTimeout(h);
  }, [search]);

  const { data: conversations = [], isLoading } = useConversations(statusFilter);
  const { data: routingSettings } = useInboxRoutingSettings();
  const { data: messageSearchIds = [], isFetching: searchingHistory } = useConversationIdsByMessageSearch(debouncedSearch);
  const messageSearchSet = useMemo(() => new Set(messageSearchIds), [messageSearchIds]);

  useEffect(() => {
    if (!routingSettings || agentsFieldTouched.current) return;
    setAgentsDraft((routingSettings.agent_names ?? []).join(", "));
  }, [routingSettings]);

  const saveRoutingMutation = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("no user");
      const names = agentsDraft
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const { error } = await (supabase as any).from("inbox_routing_settings").upsert(
        {
          user_id: uid,
          agent_names: names,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      agentsFieldTouched.current = false;
      toast.success("Fila salva — novas conversas sem responsável recebem o próximo da rotação");
      queryClient.invalidateQueries({ queryKey: ["inbox_routing_settings"] });
    },
    onError: () => toast.error("Não foi possível salvar a fila"),
  });
  const { data: messages = [], isLoading: loadingMsgs } = useMessages(selectedId);
  const sender = useWhatsAppSender();
  const { user } = useAuth();
  const { data: conversationNotes = [] } = useQuery({
    queryKey: ["conversation_notes", selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      const { data, error } = await (supabase as any)
        .from("conversation_notes")
        .select("*")
        .eq("conversation_id", selectedId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedId,
  });
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  // Fetch AI Suggestion
  useEffect(() => {
    if (!selectedId || messages.length === 0) {
      setAiSuggestion(null);
      return;
    }
    
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.direction === "outbound") {
      setAiSuggestion(null);
      return;
    }

    async function getSuggestion() {
      setLoadingAi(true);
      try {
        const { data, error } = await supabase.functions.invoke("ai-reply-suggest", {
          body: { conversation_id: selectedId }
        });
        if (error) throw error;
        const suggestion = data?.suggestion ?? data?.suggestions?.[0] ?? null;
        setAiSuggestion(suggestion);
        if (suggestion) {
          void trackMoatEvent("inbox_ai_used", { conversation_id: selectedId });
        }
      } catch (e) {
        console.error("AI Error:", e);
      } finally {
        setLoadingAi(false);
      }
    }

    getSuggestion();
  }, [selectedId, messages.length]);

  // Real-time: messages for selected conversation
  useEffect(() => {
    if (!selectedId) return;

    const channel = supabase
      .channel(`messages:${selectedId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${selectedId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["messages", selectedId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedId, queryClient]);

  // Real-time: conversations list
  useEffect(() => {
    const channel = supabase
      .channel("conversations-list")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Scroll to bottom when messages load or new message arrives
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Fix BUG-011: mark conversation as read when selected
  useEffect(() => {
    if (!selectedId) return;
    const conv = conversations.find((c) => c.id === selectedId);
    if (!conv || conv.unread_count === 0) return;
    supabase
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", selectedId)
      .then(() => queryClient.invalidateQueries({ queryKey: ["conversations"] }));
  }, [selectedId, conversations, queryClient]);

  const sendMutation = useMutation({
    mutationFn: async (payload: { content: string; mode: "text" | "template" | "flow"; ctaLabel?: string; ctaUrl?: string; flowId?: string; flowScreenId?: string }) => {
      if (!selectedId) return;
      setSendError(null);
      const content = payload.content;

      // 1. Send via WhatsApp if connection is ready
      let externalId: string | undefined;
      if (sender.isReady && selectedContact?.phone) {
        const result =
          payload.mode === "template" && payload.ctaLabel && payload.ctaUrl
            ? await sender.sendTemplateButton(selectedContact.phone, content, { label: payload.ctaLabel, url: payload.ctaUrl })
            : payload.mode === "flow" && payload.flowId && payload.flowScreenId
              ? await sender.sendFlowMessage(selectedContact.phone, {
                text: content,
                buttonText: payload.ctaLabel || "Abrir menu",
                flowId: payload.flowId,
                screenId: payload.flowScreenId,
              })
              : await sender.sendMessage(selectedContact.phone, content);
        if (!result.success) {
          setSendError(result.error ?? "Falha ao enviar. Mensagem salva localmente.");
        } else {
          externalId = result.external_id;
        }
      }

      // 2. Always save to DB (local record)
      const { error } = await supabase.from("messages").insert({
        conversation_id: selectedId,
        content,
        direction: "outbound",
        status: externalId ? "sent" : "failed",
        type: payload.mode === "template" || payload.mode === "flow" ? "template" : "text",
        external_id: externalId ?? null,
      });
      if (error) throw error;

      await supabase
        .from("conversations")
        .update({ last_message: content, last_message_at: new Date().toISOString() })
        .eq("id", selectedId);
    },
    onMutate: async (newPayload) => {
      await queryClient.cancelQueries({ queryKey: ["messages", selectedId] });
      const previousMessages = queryClient.getQueryData(["messages", selectedId]);

      if (selectedId) {
        queryClient.setQueryData(["messages", selectedId], (old: any[] = []) => [
          ...old,
          {
            id: `temp-${Date.now()}`,
            content: newPayload.content,
            direction: "outbound",
            status: "sending",
            created_at: new Date().toISOString(),
            conversation_id: selectedId,
            type: newPayload.mode === "template" || newPayload.mode === "flow" ? "template" : "text",
          },
        ]);
      }

      return { previousMessages };
    },
    onError: (err, newContent, context) => {
      if (selectedId && context?.previousMessages) {
        queryClient.setQueryData(["messages", selectedId], context.previousMessages);
      }
      setSendError("Erro ao enviar mensagem. Tente novamente.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onSuccess: () => {
      setDraft("");
      setComposerMode("text");
      setCtaUrl("");
    },
  });

  function handleSend() {
    const text = draft.trim();
    if (!text || sendMutation.isPending) return;
    if (composerMode === "template" && (!ctaLabel.trim() || !ctaUrl.trim())) {
      setSendError("Para template, preencha texto e URL do botão.");
      return;
    }
    if (composerMode === "flow" && (!flowId.trim() || !flowScreenId.trim())) {
      setSendError("Para lista interativa, preencha Flow ID e Screen ID.");
      return;
    }
    sendMutation.mutate({
      content: text,
      mode: composerMode,
      ctaLabel: composerMode === "template" ? ctaLabel.trim() : undefined,
      ctaUrl: composerMode === "template" ? ctaUrl.trim() : undefined,
      flowId: composerMode === "flow" ? flowId.trim() : undefined,
      flowScreenId: composerMode === "flow" ? flowScreenId.trim() : undefined,
    });
  }

  async function saveOpsMeta() {
    if (!selectedId) return;
    const { error } = await (supabase as any)
      .from("conversations")
      .update({
        assigned_to_name: assigneeName || null,
        priority,
        sla_due_at: slaDueAt ? new Date(slaDueAt).toISOString() : null,
      })
      .eq("id", selectedId);
    if (!error) {
      void trackMoatEvent("ops_metadata_saved", {
        conversation_id: selectedId,
        priority,
        has_sla: Boolean(slaDueAt),
      });
      toast.success("Atribuição/SLA atualizados");
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }
  }

  async function addInternalNote() {
    if (!selectedId || !internalNote.trim() || !user?.id) return;
    const { error } = await (supabase as any).from("conversation_notes").insert({
      conversation_id: selectedId,
      user_id: user.id,
      note: internalNote.trim(),
    });
    if (!error) {
      setInternalNote("");
      queryClient.invalidateQueries({ queryKey: ["conversation_notes", selectedId] });
      toast.success("Nota interna adicionada");
    }
  }

  const selectedConv = conversations.find((c) => c.id === selectedId);
  const selectedContact = selectedConv?.contacts as { name: string; phone: string; tags: string[] } | null;

  useEffect(() => {
    if (!selectedConv) return;
    setAssigneeName((selectedConv as any).assigned_to_name ?? "");
    setSlaDueAt((selectedConv as any).sla_due_at ? new Date((selectedConv as any).sla_due_at).toISOString().slice(0, 16) : "");
    setPriority(((selectedConv as any).priority ?? "normal") as "low" | "normal" | "high" | "urgent");
  }, [selectedConv?.id]);

  const uniqueTags = Array.from(new Set(
    conversations.flatMap((c: any) => Array.isArray(c.contacts?.tags) ? c.contacts.tags : [])
  ));

  const filtered = conversations.filter((c) => {
    const contact = c.contacts as { name: string; phone: string; tags?: string[] } | null;
    const matchesTag = tagFilter === "all" || !!contact?.tags?.includes(tagFilter);
    const term = search.trim().toLowerCase();
    const matchesSnippet =
      !term ||
      contact?.name?.toLowerCase().includes(term) ||
      contact?.phone?.includes(search.trim()) ||
      !!c.last_message?.toLowerCase().includes(term);
    const matchesHistory = term.length >= 2 && messageSearchSet.has(c.id);
    const matchesSearch = !term ? true : matchesSnippet || matchesHistory;
    return matchesTag && matchesSearch;
  });
  const prioritized = [...filtered].sort((a: any, b: any) => {
    const score = (row: any) => {
      const sla = getSlaBucket(row.sla_due_at);
      const priority = row.priority === "urgent" ? 4 : row.priority === "high" ? 3 : row.priority === "normal" ? 2 : 1;
      const unread = Number(row.unread_count ?? 0) > 0 ? 1 : 0;
      const slaScore = sla === "breach" ? 3 : sla === "soon" ? 2 : 0;
      return (slaScore * 100) + (priority * 10) + unread;
    };
    return score(b) - score(a);
  });
  const slaBreaches = prioritized.filter((c: any) => getSlaBucket(c.sla_due_at) === "breach").length;
  const urgentCount = prioritized.filter((c: any) => c.priority === "urgent" || c.priority === "high").length;

  return (
    <div className="flex h-full -m-4 md:-m-6 overflow-hidden">
      {/* Lista de conversas */}
      <div className={cn(
        "flex flex-col border-r bg-card w-full md:w-80 shrink-0",
        selectedId && "hidden md:flex"
      )}>
        <div className="p-4 border-b space-y-3">
          <h1 className="font-semibold text-lg">Conversas</h1>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar contato ou histórico (2+ letras)..."
              className="pl-9 pr-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {searchingHistory && debouncedSearch.length >= 2 && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
            )}
          </div>
          <div className="rounded-lg border bg-muted/30 p-2 space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Fila (round-robin)</p>
            <Input
              value={agentsDraft}
              onChange={(e) => {
                agentsFieldTouched.current = true;
                setAgentsDraft(e.target.value);
              }}
              placeholder="Maria, João, Pedro…"
              className="h-8 text-xs"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 text-[11px] w-full"
              disabled={saveRoutingMutation.isPending}
              onClick={() => saveRoutingMutation.mutate()}
            >
              {saveRoutingMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Salvar fila de atendentes"}
            </Button>
          </div>
          <div className="flex gap-1 flex-wrap">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                  statusFilter === f.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          {uniqueTags.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => setTagFilter("all")}
                className={cn(
                  "px-2 py-1 rounded-full text-[10px] font-semibold transition-colors",
                  tagFilter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                Todas tags
              </button>
              {uniqueTags.slice(0, 8).map((tag) => (
                <button
                  key={tag}
                  onClick={() => setTagFilter(tag)}
                  className={cn(
                    "px-2 py-1 rounded-full text-[10px] font-semibold transition-colors",
                    tagFilter === tag ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="p-4 space-y-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="flex justify-between items-center">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-8" />
                    </div>
                    <Skeleton className="h-3 w-full" />
                  </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border bg-muted/30 px-2 py-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">SLA estourado</p>
              <p className="text-sm font-black text-red-500">{slaBreaches}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 px-2 py-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Alta prioridade</p>
              <p className="text-sm font-black text-amber-500">{urgentCount}</p>
            </div>
          </div>
                </div>
              ))}
            </div>
          )}
          {!isLoading && conversations.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 px-5 gap-5 text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center">
                <MessageCircle className="w-7 h-7 text-primary/30" />
              </div>
              <div className="space-y-1">
                <p className="font-black text-sm">Nenhuma conversa ainda</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  As conversas aparecem aqui quando clientes respondem suas campanhas ou mandam mensagem direta no WhatsApp.
                </p>
              </div>
              <div className="w-full space-y-2 text-left">
                {[
                  { step: "1", label: "Conecte o WhatsApp", href: "/dashboard/whatsapp" },
                  { step: "2", label: "Dispare uma campanha", href: "/dashboard/campanhas" },
                  { step: "3", label: "Aguarde as respostas aqui", href: null },
                ].map((s) => (
                  <div key={s.step} className="flex items-center gap-3 p-3 rounded-xl bg-muted/20 text-xs">
                    <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black text-[10px] shrink-0">{s.step}</span>
                    {s.href
                      ? <Link to={s.href} className="font-bold text-primary hover:underline">{s.label} →</Link>
                      : <span className="font-medium text-muted-foreground">{s.label}</span>
                    }
                  </div>
                ))}
              </div>
            </div>
          )}
          {!isLoading && conversations.length > 0 && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
              <MessageCircle className="w-8 h-8 opacity-30" />
              <span className="text-sm">Nenhuma conversa encontrada</span>
            </div>
          )}
          {prioritized.map((conv) => {
            const contact = conv.contacts as { name: string; phone: string } | null;
            const isSelected = selectedId === conv.id;
            const isOnline = conv.last_message_at && (Date.now() - new Date(conv.last_message_at).getTime() < 1000 * 60 * 5);
            const avatarColor = getAvatarColor(contact?.name || contact?.phone);
            const sla = getSlaBucket((conv as { sla_due_at?: string | null }).sla_due_at);

            return (
              <button
                key={conv.id}
                onClick={() => setSelectedId(conv.id)}
                className={cn(
                  "w-full text-left p-4 border-b transition-all relative group",
                  isSelected 
                    ? "bg-primary/5 dark:bg-primary/10" 
                    : "hover:bg-muted/50"
                )}
              >
                {/* Active Indicator Line */}
                {isSelected && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                )}

                <div className="flex items-start gap-3">
                  <div className="relative shrink-0">
                    <div className={cn(
                      "w-11 h-11 rounded-full flex items-center justify-center font-semibold text-base transition-transform group-hover:scale-105",
                      avatarColor
                    )}>
                      {contact?.name?.[0]?.toUpperCase() ?? contact?.phone?.[0] ?? "?"}
                    </div>
                    {isOnline && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-background rounded-full" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={cn(
                        "font-semibold text-sm truncate",
                        conv.unread_count > 0 ? "text-foreground" : "text-foreground/90"
                      )}>
                        {contact?.name ?? contact?.phone ?? "—"}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-1 font-medium">
                        {conv.last_message_at ? formatDistanceToNow(new Date(conv.last_message_at), { locale: ptBR, addSuffix: false }).replace('cerca de ', '') : "—"}
                      </span>
                    </div>

                    <p className={cn(
                      "text-xs truncate",
                      conv.unread_count > 0 ? "text-foreground font-medium" : "text-muted-foreground"
                    )}>
                      {conv.last_message ?? "Sem mensagens"}
                    </p>

                    <div className="flex items-center justify-between mt-2 gap-1 flex-wrap">
                      <div className="flex items-center gap-1 flex-wrap">
                        <Badge variant="outline" className={cn("text-[10px] px-2 py-0 h-4 border-none", STATUS_COLORS[conv.status] ?? "")}>
                          {conv.status === 'open' ? 'Aberta' : conv.status === 'pending' ? 'Pendente' : 'Fechada'}
                        </Badge>
                        {sla === "breach" && (
                          <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4 font-bold">
                            SLA
                          </Badge>
                        )}
                        {sla === "soon" && (
                          <Badge className="text-[9px] px-1.5 py-0 h-4 font-bold bg-amber-500 hover:bg-amber-500 text-white border-0">
                            1h
                          </Badge>
                        )}
                      </div>
                      {conv.unread_count > 0 && (
                        <span className="bg-primary text-primary-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] h-[18px] flex items-center justify-center shadow-sm animate-pulse">
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Thread de mensagens */}
      <div className={cn(
        "flex-1 flex flex-col",
        !selectedId && "hidden md:flex"
      )}>
        {!selectedId ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-muted/10">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6 animate-pulse">
              <MessageCircle className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-xl font-bold mb-2">Sua Central de Atendimento</h2>
            <p className="text-muted-foreground max-w-sm mb-8">
              Selecione uma conversa ao lado para começar a interagir com seus clientes em tempo real.
            </p>
            <div className="grid grid-cols-2 gap-4 w-full max-w-md">
              <button 
                onClick={() => toast.info("Selecione uma conversa para ver as sugestões automáticas da nossa IA.")}
                className="p-4 bg-card border rounded-2xl text-left hover:bg-muted/50 transition-colors"
              >
                <Sparkles className="w-5 h-5 text-primary mb-2" />
                <h3 className="text-sm font-bold">Sugestões IA</h3>
                <p className="text-[11px] text-muted-foreground">Respostas inteligentes baseadas no contexto.</p>
              </button>
              <button 
                onClick={() => toast.info("Use os botões de ação rápida no topo da conversa para resolver chamados instantaneamente.")}
                className="p-4 bg-card border rounded-2xl text-left hover:bg-muted/50 transition-colors"
              >
                <ZapIcon className="w-5 h-5 text-primary mb-2" />
                <h3 className="text-sm font-bold">Agilidade</h3>
                <p className="text-[11px] text-muted-foreground">Resolva chamados com apenas um clique.</p>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Header da conversa */}
            <div className="h-14 border-b bg-card px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <button
                  className="md:hidden text-muted-foreground hover:text-foreground"
                  onClick={() => setSelectedId(null)}
                >
                  ←
                </button>
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                  {selectedContact?.name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div>
                  <p className="font-medium text-sm leading-none flex flex-wrap items-center gap-2">
                    <span>{selectedContact?.name ?? selectedContact?.phone ?? "—"}</span>
                    {getSlaBucket((selectedConv as { sla_due_at?: string | null })?.sla_due_at) === "breach" && (
                      <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-5">SLA estourado</Badge>
                    )}
                    {getSlaBucket((selectedConv as { sla_due_at?: string | null })?.sla_due_at) === "soon" && (
                      <Badge className="text-[9px] px-1.5 py-0 h-5 bg-amber-500 hover:bg-amber-500 text-white border-0">SLA em até 1h</Badge>
                    )}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">{selectedContact?.phone}</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={async () => {
                    if (!selectedId) return;
                    const { error } = await supabase.from("conversations").update({ status: "closed" }).eq("id", selectedId);
                    if (!error) {
                      toast.success("Conversa marcada como resolvida");
                      queryClient.invalidateQueries({ queryKey: ["conversations"] });
                    }
                  }}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider text-green-600 hover:bg-green-500/10 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" /> Resolver
                </button>
                <button
                  onClick={async () => {
                    if (!selectedId) return;
                    const { error } = await supabase.from("conversations").update({ status: "pending" }).eq("id", selectedId);
                    if (!error) {
                      toast.success("Conversa marcada como pendente");
                      queryClient.invalidateQueries({ queryKey: ["conversations"] });
                    }
                  }}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider text-yellow-600 hover:bg-yellow-500/10 transition-colors"
                >
                  <Clock className="w-3.5 h-3.5" /> Pendente
                </button>

                <div className="h-6 w-px bg-border mx-1 hidden sm:block" />

                <button
                  onClick={() => setShowSidebar(!showSidebar)}
                  className={cn(
                    "p-2 rounded-lg transition-colors",
                    showSidebar ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                  )}
                  title="Ver informações do contato"
                >
                  <User className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="border-b bg-muted/20 px-4 py-2 grid grid-cols-1 md:grid-cols-4 gap-2 shrink-0">
              <Input
                value={assigneeName}
                onChange={(e) => setAssigneeName(e.target.value)}
                placeholder="Responsável"
                className="h-8 text-xs"
              />
              <Input
                type="datetime-local"
                value={slaDueAt}
                onChange={(e) => setSlaDueAt(e.target.value)}
                className="h-8 text-xs"
              />
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="h-8 text-xs rounded-md border bg-background px-2"
              >
                <option value="low">Prioridade baixa</option>
                <option value="normal">Prioridade normal</option>
                <option value="high">Prioridade alta</option>
                <option value="urgent">Prioridade urgente</option>
              </select>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={saveOpsMeta}>
                Salvar operação
              </Button>
            </div>

            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 flex flex-col overflow-hidden relative">
                {/* Mensagens */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {loadingMsgs && (
                    <div className="space-y-4 py-4">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className={cn("flex", i % 2 === 0 ? "justify-end" : "justify-start")}>
                          <Skeleton className={cn("h-10 rounded-2xl", i % 2 === 0 ? "w-[60%] rounded-br-none" : "w-[40%] rounded-bl-none")} />
                        </div>
                      ))}
                    </div>
                  )}
                  {!loadingMsgs && messages.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground opacity-60 mt-12">
                      <MessageCircle className="w-12 h-12" />
                      <p className="text-sm">Nenhuma mensagem ainda neste canal</p>
                    </div>
                  )}
                  {!loadingMsgs && messages.map((msg, idx) => {
                    const isFirstInGroup = idx === 0 || messages[idx - 1].direction !== msg.direction;
                    const isLastInGroup = idx === messages.length - 1 || messages[idx + 1].direction !== msg.direction;

                    // Date separator logic
                    const currentDate = new Date(msg.created_at);
                    const showDateSeparator = idx === 0 || !isSameDay(new Date(messages[idx - 1].created_at), currentDate);

                    return (
                      <div key={msg.id}>
                        {showDateSeparator && (
                          <div className="flex justify-center my-6">
                            <span className="px-3 py-1 bg-muted/40 text-muted-foreground text-[11px] font-semibold rounded-full uppercase tracking-wider">
                              {formatDateSeparator(currentDate)}
                            </span>
                          </div>
                        )}

                        <div
                          className={cn(
                            "flex group",
                            msg.direction === "outbound" ? "justify-end" : "justify-start",
                            isFirstInGroup ? "mt-4" : "mt-0.5"
                          )}
                        >
                          <div className={cn(
                            "max-w-[75%] px-4 py-2.5 text-sm relative transition-all shadow-sm",
                            msg.direction === "outbound"
                              ? "bg-primary text-primary-foreground rounded-2xl rounded-br-none"
                              : "bg-card border rounded-2xl rounded-bl-none",
                            !isLastInGroup && (msg.direction === "outbound" ? "rounded-br-2xl" : "rounded-bl-2xl"),
                            !isFirstInGroup && (msg.direction === "outbound" ? "rounded-tr-none" : "rounded-tl-none")
                          )}>
                            {/* Tail for LAST message in group for that sender */}
                            {isLastInGroup && (
                              <div className={cn(
                                "absolute bottom-0 w-4 h-4",
                                msg.direction === "outbound" 
                                  ? "-right-1 text-primary" 
                                  : "-left-1 text-card drop-shadow-[0_1px_0.5px_rgba(0,0,0,0.05)]"
                              )}>
                                <svg viewBox="0 0 16 16" fill="currentColor" className="w-full h-full">
                                  {msg.direction === "outbound" 
                                    ? <path d="M0 16h16V0C16 8 8 16 0 16z" />
                                    : <path d="M16 16H0V0C0 8 8 16 16 16z" />
                                  }
                                </svg>
                              </div>
                            )}

                            <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                            <div className="flex items-center justify-end gap-1.5 mt-1 opacity-70">
                              <p className="text-[10px] font-medium uppercase tracking-tighter">
                                {new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                              </p>
                              {msg.direction === "outbound" && (
                                <div className="flex scale-90">
                                  {msg.status === 'sending' && <Loader2 className="w-3 h-3 animate-spin opacity-50" />}
                                  {msg.status === 'sent' && <Check className="w-3.5 h-3.5" />}
                                  {(msg.status === 'delivered' || msg.status === 'read') && (
                                    <div className="flex -space-x-2">
                                      <Check className={cn("w-3.5 h-3.5", msg.status === 'read' ? "text-sky-300" : "")} />
                                      <Check className={cn("w-3.5 h-3.5", msg.status === 'read' ? "text-sky-300" : "")} />
                                    </div>
                                  )}
                                  {msg.status === 'failed' && <AlertCircle className="w-3 h-3 text-destructive animate-pulse" />}
                                </div>
                              )}
                            </div>

                            {msg.status === 'failed' && (
                              <span className="absolute -left-28 top-1/2 -translate-y-1/2 text-[10px] font-bold bg-destructive text-destructive-foreground px-2 py-1 rounded shadow-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                FALHA NO ENVIO
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}                  <div ref={bottomRef} />
                </div>

                {/* WhatsApp not connected banner */}
                {!sender.isLoading && !sender.isReady && (
                  <div className="border-t bg-yellow-500/5 border-yellow-500/20 px-4 py-2 flex items-center gap-2 text-xs text-yellow-700 shrink-0">
                    <WifiOff className="w-3.5 h-3.5 shrink-0" />
                    <span>WhatsApp não conectado — mensagens ficam salvas localmente apenas.</span>
                    <Link to="/dashboard/whatsapp" className="ml-auto flex items-center gap-1 hover:underline font-medium shrink-0">
                      <Settings className="w-3 h-3" /> Configurar
                    </Link>
                  </div>
                )}

                {/* Send error */}
                {sendError && (
                  <div className="px-4 py-1.5 bg-red-500/5 text-red-600 text-xs border-t border-red-500/10 shrink-0">
                    {sendError}
                  </div>
                )}

                {/* Input */}
                <div className="border-t p-4 bg-card shrink-0 space-y-3">
                  <div className="bg-muted/20 border rounded-lg p-2 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Notas internas</p>
                    <div className="flex gap-2">
                      <Input
                        value={internalNote}
                        onChange={(e) => setInternalNote(e.target.value)}
                        placeholder="Adicionar nota para equipe"
                        className="h-8 text-xs"
                      />
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={addInternalNote}>
                        Salvar
                      </Button>
                    </div>
                    {conversationNotes.length > 0 && (
                      <div className="max-h-20 overflow-y-auto space-y-1">
                        {(conversationNotes as any[]).slice(0, 4).map((n) => (
                          <div key={n.id} className="text-[11px] text-muted-foreground bg-background rounded px-2 py-1">
                            {n.note}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setComposerMode("text")}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                        composerMode === "text" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}
                    >
                      Texto
                    </button>
                    <button
                      onClick={() => setComposerMode("template")}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                        composerMode === "template" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}
                    >
                      Botão CTA
                    </button>
                    <button
                      onClick={() => setComposerMode("flow")}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                        composerMode === "flow" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}
                    >
                      Lista/Flow
                    </button>
                  </div>
                  {composerMode === "template" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input
                        value={ctaLabel}
                        onChange={(e) => setCtaLabel(e.target.value)}
                        placeholder="Texto do botão (ex.: Ver oferta)"
                        className="h-8 text-xs"
                      />
                      <Input
                        value={ctaUrl}
                        onChange={(e) => setCtaUrl(e.target.value)}
                        placeholder="URL do botão"
                        className="h-8 text-xs"
                      />
                    </div>
                  )}
                  {composerMode === "flow" && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Input
                        value={ctaLabel}
                        onChange={(e) => setCtaLabel(e.target.value)}
                        placeholder="Texto do botão"
                        className="h-8 text-xs"
                      />
                      <Input
                        value={flowId}
                        onChange={(e) => setFlowId(e.target.value)}
                        placeholder="Flow ID"
                        className="h-8 text-xs"
                      />
                      <Input
                        value={flowScreenId}
                        onChange={(e) => setFlowScreenId(e.target.value)}
                        placeholder="Screen ID"
                        className="h-8 text-xs"
                      />
                    </div>
                  )}
                  {aiSuggestion && !draft && (
                    <div className="flex items-start gap-2 animate-in fade-in slide-in-from-bottom-2">
                      <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <button 
                        onClick={() => setDraft(aiSuggestion)}
                        className="text-left text-[11px] bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors p-2 rounded-xl italic text-primary group"
                      >
                        <span className="font-bold not-italic block mb-0.5 text-[9px] uppercase tracking-widest opacity-60">Sugestão da IA (clique para usar)</span>
                        "{aiSuggestion}"
                      </button>
                    </div>
                  )}
                  
                  <div className="flex flex-col gap-2 bg-muted/30 rounded-2xl p-2 border focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/30 transition-all">
                    <Textarea
                      placeholder={sender.isReady ? "Escreva sua mensagem..." : "Modo offline (salva localmente)..."}
                      className="min-h-[40px] max-h-[200px] border-none bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 resize-none py-2 px-3 text-sm leading-relaxed"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      disabled={sendMutation.isPending}
                    />

                    <div className="flex items-center justify-between px-1 pb-1">
                      <div className="flex items-center gap-0.5">
                        <button className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg transition-colors">
                          <Smile className="w-4 h-4" />
                        </button>
                        <button className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg transition-colors">
                          <Paperclip className="w-4 h-4" />
                        </button>
                        <button className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg transition-colors">
                          <ZapIcon className="w-4 h-4" />
                        </button>
                      </div>

                      <TrialGate action="enviar mensagens">
                        <button
                          onClick={handleSend}
                          disabled={!draft.trim() || sendMutation.isPending}
                          className="h-9 px-4 bg-primary text-primary-foreground rounded-xl text-[13px] font-bold shadow-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
                        >
                          {sendMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>Enviar <Send className="w-3.5 h-3.5" /></>
                          )}
                        </button>
                      </TrialGate>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sidebar do contato */}
              {showSidebar && (
                <ContactInfoSidebar 
                  contact={selectedContact as any} 
                  className="hidden lg:flex border-l border-t-0"
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
