import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { MessageCircle, WifiOff, Settings, Sparkles, User, Zap as ZapIcon } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  useConversations,
  useMessages,
  useConversationIdsByMessageSearch,
  useInboxRoutingSettings,
  getCurrentUserAndStore,
  type InboxAssigneeFilter,
} from "@/hooks/useDashboard";
import { useWhatsAppSender } from "@/hooks/useWhatsAppSender";
import { useAuth } from "@/hooks/useAuth";
import { useTeamAccess } from "@/hooks/useTeamAccess";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { ContactInfoSidebar } from "@/components/dashboard/ContactInfoSidebar";
import { trackMoatEvent } from "@/lib/moat-telemetry";
import type { Database } from "@/integrations/supabase/types";

// Subcomponents
import { ConversationList } from "@/components/dashboard/inbox/ConversationList";
import { ChatHeader } from "@/components/dashboard/inbox/ChatHeader";
import { MessageList } from "@/components/dashboard/inbox/MessageList";
import { MessageComposer } from "@/components/dashboard/inbox/MessageComposer";
import { getSlaBucket } from "@/components/dashboard/ConversationListItem";

type DbMessage = Database["public"]["Tables"]["messages"]["Row"];
type DbMessageInsert = Database["public"]["Tables"]["messages"]["Insert"];
type DbConversationNote = Database["public"]["Tables"]["conversation_notes"]["Row"];
type DbConversationNoteInsert = Database["public"]["Tables"]["conversation_notes"]["Insert"];

type InboxContactEmbed = {
  id: string;
  name: string;
  phone: string;
  tags?: string[] | null;
  total_orders?: number | null;
  total_spent?: number | null;
};

type InboxConversationRow = {
  id: string;
  status: string;
  last_message?: string | null;
  last_message_at?: string | null;
  unread_count?: number | null;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  priority?: string | null;
  sla_due_at?: string | null;
  contacts?: InboxContactEmbed | null;
};

type PriorityLevel = "low" | "normal" | "high" | "urgent";

function parsePriorityLevel(value: string | null | undefined): PriorityLevel {
  if (value === "low" || value === "high" || value === "urgent") return value;
  return "normal";
}

function inboxSidebarContact(
  embed: InboxContactEmbed | null | undefined,
): { id: string; name: string; phone: string; tags?: string[]; total_orders?: number; total_spent?: number } | null {
  if (!embed?.id || !embed.phone) return null;
  return {
    id: embed.id,
    name: embed.name,
    phone: embed.phone,
    tags: embed.tags ?? undefined,
    total_orders: embed.total_orders ?? undefined,
    total_spent: embed.total_spent ?? undefined,
  };
}

export default function Inbox() {
  const [searchParams] = useSearchParams();
  const initialSearchFromUrl = searchParams.get("q") ?? searchParams.get("phone") ?? "";

  const [statusFilter, setStatusFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState<InboxAssigneeFilter>("all");
  const [messageFetchLimit, setMessageFetchLimit] = useState(200);
  const [search, setSearch] = useState(initialSearchFromUrl);
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
  const [priority, setPriority] = useState<PriorityLevel>("normal");
  const [internalNote, setInternalNote] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState(() => initialSearchFromUrl.trim());
  const [agentsDraft, setAgentsDraft] = useState("");
  const agentsFieldTouched = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastOpsSyncedForConversationId = useRef<string | null>(null);
  const conversationsListChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  
  const [liveConvListRt, setLiveConvListRt] = useState<"unknown" | "ok" | "err">("unknown");
  const [liveMessagesRt, setLiveMessagesRt] = useState<"unknown" | "ok" | "err">("unknown");
  const [assumeRealtimeDown, setAssumeRealtimeDown] = useState(false);

  useEffect(() => {
    if (liveConvListRt !== "unknown" && liveMessagesRt !== "unknown") {
      setAssumeRealtimeDown(false);
      return;
    }
    const id = window.setTimeout(() => setAssumeRealtimeDown(true), 12_000);
    return () => window.clearTimeout(id);
  }, [liveConvListRt, liveMessagesRt]);

  const convRealtimeDegraded = liveConvListRt === "err" || assumeRealtimeDown;
  const messagesRealtimeDegraded = liveMessagesRt === "err" || assumeRealtimeDown;
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const { data: teamAccess } = useTeamAccess();
  
  const inboxReadOnly = teamAccess?.mode === "collaborator" && teamAccess.role === "viewer";
  const inboxRoutingReadOnly =
    teamAccess?.mode === "collaborator" &&
    (teamAccess.role === "viewer" || teamAccess.role === "operator");

  useEffect(() => {
    const h = window.setTimeout(() => setDebouncedSearch(search.trim()), 320);
    return () => window.clearTimeout(h);
  }, [search]);

  const convQuery = useConversations(statusFilter, {
    assigneeFilter,
    mineAssigneeLabel: profile?.full_name ?? null,
    realtimeDegraded: convRealtimeDegraded,
  });
  const conversations = useMemo(
    () => (convQuery.data?.pages.flatMap((p) => p) ?? []) as InboxConversationRow[],
    [convQuery.data],
  );
  const selectedConv = conversations.find((c) => c.id === selectedId);
  const selectedContact = selectedConv?.contacts ?? null;

  const isLoading = convQuery.isLoading;
  const convListError = convQuery.isError;
  const refetchConversations = convQuery.refetch;
  const fetchNextConvPage = convQuery.fetchNextPage;
  const hasNextConvPage = convQuery.hasNextPage;
  const fetchingNextConvPage = convQuery.isFetchingNextPage;

  const { data: routingSettings } = useInboxRoutingSettings();
  const {
    data: messageSearchIds = [],
    isFetching: searchingHistory,
    isError: messageSearchError,
    refetch: refetchMessageSearch,
  } = useConversationIdsByMessageSearch(debouncedSearch);
  const messageSearchSet = useMemo(() => new Set(messageSearchIds), [messageSearchIds]);

  useEffect(() => {
    if (!routingSettings || agentsFieldTouched.current) return;
    setAgentsDraft((routingSettings.agent_names ?? []).join(", "));
  }, [routingSettings]);

  const saveRoutingMutation = useMutation({
    mutationFn: async () => {
      const { userId, effectiveUserId } = await getCurrentUserAndStore();
      if (!userId || !effectiveUserId) throw new Error("no user");
      const names = agentsDraft
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const { error } = await supabase.from("inbox_routing_settings").upsert(
        {
          user_id: effectiveUserId,
          agent_names: names,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      agentsFieldTouched.current = false;
      toast.success("Fila salva");
      queryClient.invalidateQueries({ queryKey: ["inbox_routing_settings"] });
    },
    onError: () => toast.error("Erro ao salvar fila"),
  });

  const {
    data: messages = [],
    isLoading: loadingMsgs,
    isError: messagesError,
    refetch: refetchMessages,
  } = useMessages(selectedId, messageFetchLimit, { realtimeDegraded: messagesRealtimeDegraded });
  
  const messagesQueryKey = useMemo(
    () => ["messages", selectedId, messageFetchLimit, messagesRealtimeDegraded ? 1 : 0] as const,
    [selectedId, messageFetchLimit, messagesRealtimeDegraded],
  );
  
  const sender = useWhatsAppSender();
  const { data: conversationNotes = [] } = useQuery<DbConversationNote[]>({
    queryKey: ["conversation_notes", selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      const { data, error } = await supabase
        .from("conversation_notes")
        .select("*")
        .eq("conversation_id", selectedId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as DbConversationNote[];
    },
    enabled: !!selectedId,
  });

  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  useEffect(() => {
    setMessageFetchLimit(200);
  }, [selectedId]);

  const lastInboundSignature = useMemo(() => {
    const inbound = [...messages].reverse().find((m) => m.direction === "inbound");
    if (!inbound) return "";
    return `${inbound.id}:${inbound.created_at}:${String(inbound.content ?? "").slice(0, 120)}`;
  }, [messages]);

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

    let cancelled = false;
    async function getSuggestion() {
      setLoadingAi(true);
      try {
        const { data, error } = await supabase.functions.invoke("ai-reply-suggest", {
          body: { conversation_id: selectedId },
        });
        if (error) throw error;
        const suggestion = data?.suggestion ?? data?.suggestions?.[0] ?? null;
        if (!cancelled) setAiSuggestion(suggestion);
      } catch (e) {
        if (!cancelled) setAiSuggestion(null);
      } finally {
        if (!cancelled) setLoadingAi(false);
      }
    }
    void getSuggestion();
    return () => { cancelled = true; };
  }, [selectedId, lastInboundSignature, messages]);

  useEffect(() => {
    setLiveMessagesRt("unknown");
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const channel = supabase
      .channel(`messages:${selectedId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${selectedId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["messages", selectedId] });
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setLiveMessagesRt("ok");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setLiveMessagesRt("err");
      });
    return () => { void supabase.removeChannel(channel); };
  }, [selectedId, queryClient]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { storeId, effectiveUserId } = await getCurrentUserAndStore();
      if (cancelled || !effectiveUserId) return;
      const filter = storeId ? `store_id=eq.${storeId}` : `user_id=eq.${effectiveUserId}`;
      const channel = supabase
        .channel(`conversations-list:${storeId ?? effectiveUserId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter }, () => {
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        });
      if (cancelled) return;
      conversationsListChannelRef.current = channel;
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") setLiveConvListRt("ok");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setLiveConvListRt("err");
      });
    })();
    return () => {
      cancelled = true;
      if (conversationsListChannelRef.current) void supabase.removeChannel(conversationsListChannelRef.current);
    };
  }, [queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (!selectedId) return;
    const conv = conversations.find((c) => c.id === selectedId);
    if (!conv || conv.unread_count === 0) return;
    void supabase.from("conversations").update({ unread_count: 0 }).eq("id", selectedId).then(() => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    });
  }, [selectedId, conversations, queryClient]);

  const sendMutation = useMutation({
    mutationFn: async (payload: { content: string; mode: "text" | "template" | "flow"; ctaLabel?: string; ctaUrl?: string; flowId?: string; flowScreenId?: string }) => {
      if (!selectedId) return;
      setSendError(null);
      let externalId: string | undefined;
      if (sender.isReady && selectedContact?.phone) {
        const result = payload.mode === "template" && payload.ctaLabel && payload.ctaUrl
          ? await sender.sendTemplateButton(selectedContact.phone, payload.content, { label: payload.ctaLabel, url: payload.ctaUrl })
          : payload.mode === "flow" && payload.flowId && payload.flowScreenId
            ? await sender.sendFlowMessage(selectedContact.phone, { text: payload.content, buttonText: payload.ctaLabel || "Abrir menu", flowId: payload.flowId, screenId: payload.flowScreenId })
            : await sender.sendMessage(selectedContact.phone, payload.content);
        if (!result.success) setSendError(result.error ?? "Falha ao enviar");
        else externalId = result.external_id;
      }
      const insertRow: DbMessageInsert = { conversation_id: selectedId, content: payload.content, direction: "outbound", status: externalId ? "sent" : "failed", type: payload.mode === "template" || payload.mode === "flow" ? "template" : "text", external_id: externalId ?? null };
      const { error } = await supabase.from("messages").insert(insertRow);
      if (error) throw error;
      await supabase.from("conversations").update({ last_message: payload.content, last_message_at: new Date().toISOString() }).eq("id", selectedId);
    },
    onSuccess: () => { setDraft(""); setComposerMode("text"); setCtaUrl(""); queryClient.invalidateQueries({ queryKey: ["conversations"] }); queryClient.invalidateQueries({ queryKey: [...messagesQueryKey] }); },
  });

  const handleSend = () => {
    if (inboxReadOnly || !draft.trim() || sendMutation.isPending) return;
    sendMutation.mutate({ content: draft.trim(), mode: composerMode, ctaLabel, ctaUrl, flowId, flowScreenId });
  };

  const saveOpsMeta = async () => {
    if (!selectedId) return;
    const { error } = await supabase.from("conversations").update({ assigned_to_name: assigneeName || null, priority, sla_due_at: slaDueAt ? new Date(slaDueAt).toISOString() : null }).eq("id", selectedId);
    if (!error) { toast.success("Ops atualizados"); queryClient.invalidateQueries({ queryKey: ["conversations"] }); }
  };

  const addInternalNote = async () => {
    if (!selectedId || !internalNote.trim() || !user?.id) return;
    const { error } = await supabase.from("conversation_notes").insert({ conversation_id: selectedId, user_id: user.id, note: internalNote.trim() });
    if (!error) { setInternalNote(""); queryClient.invalidateQueries({ queryKey: ["conversation_notes", selectedId] }); toast.success("Nota salva"); }
  };

  useEffect(() => {
    if (!selectedId) { setAssigneeName(""); setSlaDueAt(""); setPriority("normal"); lastOpsSyncedForConversationId.current = null; return; }
    const conv = conversations.find((c) => c.id === selectedId);
    if (!conv || lastOpsSyncedForConversationId.current === selectedId) return;
    lastOpsSyncedForConversationId.current = selectedId;
    setAssigneeName(conv.assigned_to_name ?? "");
    setSlaDueAt(conv.sla_due_at ? new Date(conv.sla_due_at).toISOString().slice(0, 16) : "");
    setPriority(parsePriorityLevel(conv.priority));
  }, [selectedId, conversations]);

  const uniqueTags = Array.from(new Set(conversations.flatMap((c) => c.contacts?.tags ?? [])));
  const filtered = conversations.filter((c) => {
    const contact = c.contacts;
    const matchesTag = tagFilter === "all" || !!contact?.tags?.includes(tagFilter);
    const term = search.trim().toLowerCase();
    const matchesSnippet = !term || contact?.name?.toLowerCase().includes(term) || contact?.phone?.includes(search.trim()) || !!c.last_message?.toLowerCase().includes(term);
    const matchesHistory = term.length >= 2 && messageSearchSet.has(c.id);
    return matchesTag && (matchesSnippet || matchesHistory);
  });
  const prioritized = [...filtered].sort((a, b) => {
    const score = (row: InboxConversationRow) => {
      const sla = getSlaBucket(row.sla_due_at);
      const pr = row.priority === "urgent" ? 4 : row.priority === "high" ? 3 : row.priority === "normal" ? 2 : 1;
      const slaScore = sla === "breach" ? 3 : sla === "soon" ? 2 : 0;
      return slaScore * 100 + pr * 10 + (Number(row.unread_count ?? 0) > 0 ? 1 : 0);
    };
    return score(b) - score(a);
  });

  const slaBreaches = prioritized.filter((c) => getSlaBucket(c.sla_due_at) === "breach").length;
  const urgentCount = prioritized.filter((c) => c.priority === "urgent" || c.priority === "high").length;

  const refreshInboxData = () => { refetchConversations(); refetchMessageSearch(); if (selectedId) refetchMessages(); };

  const inboxIssueParts = useMemo(() => {
    const p: string[] = [];
    if (convListError) p.push("lista");
    if (messagesError && selectedId) p.push("mensagens");
    if (liveConvListRt === "err") p.push("realtime-lista");
    if (liveMessagesRt === "err" && selectedId) p.push("realtime-mensagens");
    return p;
  }, [convListError, messagesError, selectedId, liveConvListRt, liveMessagesRt]);

  return (
    <div className="flex flex-col h-full -m-4 md:-m-6 overflow-hidden">
      {inboxIssueParts.length > 0 && (
        <div className="shrink-0 px-4 pt-3 md:px-6">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
            <WifiOff className="w-4 h-4 shrink-0 opacity-80" />
            <span className="min-w-0 flex-1">Problema de conexão: <strong>{inboxIssueParts.join(" · ")}</strong></span>
            <button onClick={refreshInboxData} className="text-[11px] underline">Atualizar</button>
          </div>
        </div>
      )}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <ConversationList
          conversations={prioritized}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          isLoading={isLoading}
          search={search}
          setSearch={setSearch}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          assigneeFilter={assigneeFilter}
          setAssigneeFilter={setAssigneeFilter}
          tagFilter={tagFilter}
          setTagFilter={setTagFilter}
          uniqueTags={uniqueTags}
          hasNextConvPage={hasNextConvPage}
          fetchNextConvPage={fetchNextConvPage}
          fetchingNextConvPage={fetchingNextConvPage}
          agentsDraft={agentsDraft}
          setAgentsDraft={setAgentsDraft}
          inboxRoutingReadOnly={inboxRoutingReadOnly}
          saveRoutingMutation={saveRoutingMutation}
          slaBreaches={slaBreaches}
          urgentCount={urgentCount}
          searchingHistory={searchingHistory}
          debouncedSearch={debouncedSearch}
          profileName={profile?.full_name ?? ""}
        />

        <div className={cn("flex-1 flex flex-col", !selectedId && "hidden md:flex")}>
          {!selectedId ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-muted/10">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6 animate-pulse"><MessageCircle className="w-10 h-10 text-primary" /></div>
              <h2 className="text-xl font-bold mb-2">Central de Atendimento</h2>
              <p className="text-muted-foreground max-w-sm mb-8">Selecione uma conversa para interagir em tempo real.</p>
              <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                <div className="p-4 bg-card border rounded-2xl text-left"><Sparkles className="w-5 h-5 text-primary mb-2" /><h3 className="text-sm font-bold">IA</h3><p className="text-[11px] text-muted-foreground">Sugestões inteligentes.</p></div>
                <div className="p-4 bg-card border rounded-2xl text-left"><ZapIcon className="w-5 h-5 text-primary mb-2" /><h3 className="text-sm font-bold">Agilidade</h3><p className="text-[11px] text-muted-foreground">Resolução rápida.</p></div>
              </div>
            </div>
          ) : (
            <>
              <ChatHeader
                selectedId={selectedId}
                setSelectedId={setSelectedId}
                selectedContact={selectedContact}
                selectedConv={selectedConv}
                inboxReadOnly={inboxReadOnly}
                showSidebar={showSidebar}
                setShowSidebar={setShowSidebar}
                assigneeName={assigneeName}
                setAssigneeName={setAssigneeName}
                slaDueAt={slaDueAt}
                setSlaDueAt={setSlaDueAt}
                priority={priority}
                setPriority={setPriority}
                saveOpsMeta={saveOpsMeta}
              />

              <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 flex flex-col overflow-hidden relative">
                  <MessageList
                    messages={messages}
                    loadingMsgs={loadingMsgs}
                    messageFetchLimit={messageFetchLimit}
                    setMessageFetchLimit={setMessageFetchLimit}
                    bottomRef={bottomRef}
                  />

                  {!sender.isLoading && !sender.isReady && (
                    <div className="border-t bg-yellow-500/5 px-4 py-2 flex items-center gap-2 text-xs text-yellow-700">
                      <WifiOff className="w-3.5 h-3.5" /> <span>Offline — mensagens salvas localmente.</span>
                      <Link to="/dashboard/whatsapp" className="ml-auto underline font-medium">Configurar</Link>
                    </div>
                  )}

                  {sendError && <div className="px-4 py-1.5 bg-red-500/5 text-red-600 text-xs border-t">{sendError}</div>}

                  <MessageComposer
                    draft={draft}
                    setDraft={setDraft}
                    composerMode={composerMode}
                    setComposerMode={setComposerMode}
                    ctaLabel={ctaLabel}
                    setCtaLabel={setCtaLabel}
                    ctaUrl={ctaUrl}
                    setCtaUrl={setCtaUrl}
                    flowId={flowId}
                    setFlowId={setFlowId}
                    flowScreenId={flowScreenId}
                    setFlowScreenId={setFlowScreenId}
                    aiSuggestion={aiSuggestion}
                    loadingAi={loadingAi}
                    handleSend={handleSend}
                    isReady={sender.isReady}
                    inboxReadOnly={inboxReadOnly}
                    internalNote={internalNote}
                    setInternalNote={setInternalNote}
                    addInternalNote={addInternalNote}
                    conversationNotes={conversationNotes}
                    isSending={sendMutation.isPending}
                    onAiUsed={() => trackMoatEvent("inbox_ai_used", { conversation_id: selectedId })}
                  />
                </div>

                {showSidebar && (
                  <ContactInfoSidebar
                    contact={inboxSidebarContact(selectedContact)}
                    className="hidden lg:flex border-l"
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
