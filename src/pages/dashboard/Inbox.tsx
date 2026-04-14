import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { MessageCircle, WifiOff, Settings, Sparkles, User, Zap as ZapIcon, RotateCcw, CheckCheck, AlertCircle } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  useConversations,
  useMessages,
  useConversationIdsByMessageSearch,
  useInboxRoutingSettings,
  INBOX_MESSAGES_MAX_LIMIT,
  INBOX_MESSAGES_DEFAULT_LIMIT,
  INBOX_MESSAGES_LOAD_STEP,
  type InboxAssigneeFilter,
} from "@/hooks/useDashboard";
import { useWhatsAppSender } from "@/hooks/useWhatsAppSender";
import { useAuth } from "@/hooks/useAuth";
import { useTeamAccess } from "@/hooks/useTeamAccess";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { assertAiRateLimit, RateLimitError } from "@/lib/rate-limiter";
import { ContactInfoSidebar } from "@/components/dashboard/ContactInfoSidebar";
import { trackMoatEvent } from "@/lib/moat-telemetry";
import type { Database } from "@/integrations/supabase/types";
import { useStoreScopeOptional } from "@/contexts/StoreScopeContext";
import { RouteErrorBoundary } from "@/components/ErrorBoundary";

// Subcomponents
import { ConversationList } from "@/components/dashboard/inbox/ConversationList";
import { ChatHeader } from "@/components/dashboard/inbox/ChatHeader";
import { MessageList } from "@/components/dashboard/inbox/MessageList";
import { MessageComposer } from "@/components/dashboard/inbox/MessageComposer";
import { getSlaBucket } from "@/components/dashboard/ConversationListItem";
import { Button } from "@/components/ui/button";

type DbMessage = Database["public"]["Tables"]["messages"]["Row"];
type DbMessageInsert = Database["public"]["Tables"]["messages"]["Insert"];
type DbConversationNote = Database["public"]["Tables"]["conversation_notes"]["Row"];
type DbConversationNoteInsert = Database["public"]["Tables"]["conversation_notes"]["Insert"];

/** Max IDs per batch for mark-all-read to avoid huge IN (...) clauses in PostgREST. */
const MARK_READ_CHUNK = 100;
/** Max cached AI suggestions per session — oldest entry evicted when full. */
const AI_CACHE_MAX = 20;

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

/** 
 * Optimized bundle query for selected conversation
 */
function useInboxChatBundle(conversationId: string | null, limit: number) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["inbox-chat-bundle", conversationId, limit],
    queryFn: async () => {
      if (!conversationId) return null;
      const { data, error } = await supabase.rpc("get_inbox_chat_bundle_v2", {
        p_conversation_id: conversationId,
        p_message_limit: limit,
      });
      if (error) throw error;
      const res = data as {
        conversation?: InboxConversationRow;
        contact?: InboxContactEmbed;
        messages?: DbMessage[];
        notes?: DbConversationNote[];
      };
      return {
        conversation: res.conversation as InboxConversationRow,
        contact: res.contact as InboxContactEmbed,
        messages: (res.messages || []).reverse() as DbMessage[],
        notes: (res.notes || []) as DbConversationNote[],
      };
    },
    enabled: !!user && !!conversationId,
    staleTime: 10_000,
  });
}

export default function Inbox() {
  const storeScope = useStoreScopeOptional();
  const activeStoreHint = storeScope?.activeStoreId ?? null;
  const storeScopeReady = storeScope?.ready ?? true;

  const [searchParams] = useSearchParams();
  const initialSearchFromUrl = searchParams.get("q") ?? searchParams.get("phone") ?? "";

  const [statusFilter, setStatusFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState<InboxAssigneeFilter>("all");
  const [messageFetchLimit, setMessageFetchLimit] = useState(INBOX_MESSAGES_DEFAULT_LIMIT);
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
  // Ref that always holds the current selectedId — used inside realtime callbacks
  // to guard against stale closures that would update the wrong query cache key.
  const selectedIdRef = useRef<string | null>(selectedId);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

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

  // Must be declared before the polling useEffects below that reference it.
  const queryClient = useQueryClient();

  // Polling fallback: when realtime is degraded, poll conversations and messages every 30s
  // so users don't silently miss incoming messages during Supabase realtime outages.
  useEffect(() => {
    if (!convRealtimeDegraded) return;
    const id = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }, 30_000);
    return () => window.clearInterval(id);
  }, [convRealtimeDegraded, queryClient]);

  useEffect(() => {
    if (!messagesRealtimeDegraded || !selectedId) return;
    const id = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ["messages", selectedId] });
    }, 30_000);
    return () => window.clearInterval(id);
  }, [messagesRealtimeDegraded, selectedId, queryClient]);

  const { user, profile } = useAuth();
  const { data: teamAccess } = useTeamAccess();
  const sender = useWhatsAppSender();
  
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
    search: debouncedSearch,
  });
  const conversations = useMemo(
    () => (convQuery.data?.pages.flatMap((p) => p) ?? []) as InboxConversationRow[],
    [convQuery.data],
  );

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
      const userId = storeScope?.userId ?? null;
      const effectiveUserId = storeScope?.effectiveUserId ?? null;
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

  const messageLimitCapped = useMemo(
    () => Math.min(INBOX_MESSAGES_MAX_LIMIT, Math.max(20, messageFetchLimit)),
    [messageFetchLimit],
  );

  const { data: chatBundle, isLoading: bundleLoading, isError: bundleError } = useInboxChatBundle(selectedId, messageLimitCapped);

  const conversation = chatBundle?.conversation ?? null;
  const contactEmbed = chatBundle?.contact ?? null;
  const conversationNotes = chatBundle?.notes ?? [];

  const messagesQueryKey = ["messages", selectedId, messageLimitCapped, messagesRealtimeDegraded ? 1 : 0];
  const {
    data: liveMessages = [],
    isLoading: loadingMsgs,
    isError: messagesError,
    refetch: refetchMessages,
  } = useMessages(selectedId, messageLimitCapped, { realtimeDegraded: messagesRealtimeDegraded });

  const messages = liveMessages.length > 0 ? liveMessages : (chatBundle?.messages ?? []);

  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const aiSuggestionCacheRef = useRef<Map<string, { suggestion: string; timestamp: number }>>(new Map());

  useEffect(() => {
    setMessageFetchLimit(INBOX_MESSAGES_DEFAULT_LIMIT);
  }, [selectedId]);

  useEffect(() => {
    setAiSuggestion(null);
    setLoadingAi(false);
  }, [selectedId]);

  const requestAiSuggestion = useCallback(async () => {
    if (!selectedId || messages.length === 0) return;
    if (loadingAi) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.direction !== "inbound") {
      toast.info("A sugestão de IA está disponível quando a última mensagem é do cliente.");
      return;
    }
    // Prefix cache key with user id to prevent cross-user suggestion leakage on shared devices.
    const cacheKey = `${user?.id ?? "anon"}:${selectedId}`;
    const cached = aiSuggestionCacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 120_000) {
      setAiSuggestion(cached.suggestion);
      return;
    }
    setLoadingAi(true);
    setAiSuggestion(null);
    try {
      assertAiRateLimit(user?.id ?? "anon");
      const { data, error } = await supabase.functions.invoke("ai-reply-suggest", {
        body: { conversation_id: selectedId },
      });
      if (error) throw error;
      const suggestion = data?.suggestion ?? data?.suggestions?.[0] ?? null;
      setAiSuggestion(suggestion);
      if (suggestion) {
        if (aiSuggestionCacheRef.current.size >= AI_CACHE_MAX) {
          const oldestKey = aiSuggestionCacheRef.current.keys().next().value;
          if (oldestKey) aiSuggestionCacheRef.current.delete(oldestKey);
        }
        aiSuggestionCacheRef.current.set(cacheKey, { suggestion, timestamp: Date.now() });
      } else {
        toast.info("A IA não devolveu sugestão para este contexto.");
      }
    } catch (err) {
      setAiSuggestion(null);
      if (err instanceof RateLimitError) {
        toast.error(`Limite de chamadas à IA atingido. Tente em ${Math.ceil(err.retryAfterMs / 1000)}s.`);
      } else {
        toast.error("Não foi possível obter sugestão da IA.");
      }
    } finally {
      setLoadingAi(false);
    }
  }, [selectedId, messages, loadingAi]);

  useEffect(() => {
    setLiveMessagesRt("unknown");
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const degradedFlag = messagesRealtimeDegraded ? 1 : 0;
    const channel = supabase
      .channel(`messages:${selectedId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${selectedId}` },
        (payload) => {
          const row = payload.new as DbMessage;
          if (!row?.id) return;
          // Guard: validate the payload belongs to the conversation currently in view.
          // Without this, rapidly switching conversations can corrupt the cache with
          // messages from the previously-subscribed conversation (stale closure risk).
          if (row.conversation_id !== selectedIdRef.current) return;
          queryClient.setQueryData(
            ["messages", selectedId, messageLimitCapped, degradedFlag],
            (prev: DbMessage[] | undefined) => {
              const list = prev ?? [];
              if (list.some((m) => m.id === row.id)) return list;
              const next = [...list, row].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
              );
              if (next.length > messageLimitCapped) return next.slice(-messageLimitCapped);
              return next;
            },
          );
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setLiveMessagesRt("ok");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setLiveMessagesRt("err");
      });
    return () => { void channel.unsubscribe().then(() => supabase.removeChannel(channel)); };
  }, [selectedId, queryClient, messageLimitCapped, messagesRealtimeDegraded]);

  useEffect(() => {
    if (!storeScopeReady) return;
    let cancelled = false;
    void (async () => {
      const storeId = activeStoreHint;
      const effectiveUserId = storeScope?.effectiveUserId ?? null;
      if (cancelled || !effectiveUserId) return;
      const filter = storeId ? `store_id=eq.${storeId}` : `user_id=eq.${effectiveUserId}`;
      const channelName = `store-inbox:${storeId ?? effectiveUserId}`;
      const channel = supabase
        .channel(channelName)
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
      if (conversationsListChannelRef.current) {
        const ch = conversationsListChannelRef.current;
        void ch.unsubscribe().then(() => supabase.removeChannel(ch));
      }
    };
  }, [queryClient, activeStoreHint, storeScopeReady]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const selectedConv = useMemo(
    () => conversations.find((c) => c.id === selectedId) || conversation,
    [conversations, selectedId, conversation],
  );

  useEffect(() => {
    if (!selectedId || selectedConv == null || (selectedConv.unread_count ?? 0) === 0) return;
    supabase.from("conversations").update({ unread_count: 0 }).eq("id", selectedId).then(() => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }).catch((err: unknown) => {
      console.error("[Inbox] Failed to mark conversation as read:", err);
    });
  }, [selectedId, selectedConv, queryClient]);

  const sendMutation = useMutation({
    mutationFn: async (payload: { content: string; mode: "text" | "template" | "flow"; ctaLabel?: string; ctaUrl?: string; flowId?: string; flowScreenId?: string }) => {
      if (!selectedId) return;
      setSendError(null);
      const msgType: DbMessageInsert["type"] =
        payload.mode === "template" || payload.mode === "flow" ? "template" : "text";
      const insertRow: DbMessageInsert = {
        conversation_id: selectedId,
        content: payload.content,
        direction: "outbound",
        status: "sending",
        type: msgType,
        external_id: null,
      };
      const { data: inserted, error: insertError } = await supabase
        .from("messages")
        .insert(insertRow)
        .select("id")
        .single();
      if (insertError) throw insertError;

      let externalId: string | undefined;
      let deliveryFailed = false;
      const selectedContact = contactEmbed || (selectedConv?.contacts as InboxContactEmbed);
      if (sender.isReady && selectedContact?.phone) {
        const result =
          payload.mode === "template" && payload.ctaLabel && payload.ctaUrl
            ? await sender.sendTemplateButton(selectedContact.phone, payload.content, { label: payload.ctaLabel, url: payload.ctaUrl })
            : payload.mode === "flow" && payload.flowId && payload.flowScreenId
              ? await sender.sendFlowMessage(selectedContact.phone, { text: payload.content, buttonText: payload.ctaLabel || "Abrir menu", flowId: payload.flowId, screenId: payload.flowScreenId })
              : await sender.sendMessage(selectedContact.phone, payload.content);
        if (!result.success) {
          setSendError(result.error ?? "Falha ao enviar");
          deliveryFailed = true;
        } else {
          externalId = result.external_id;
        }
      }

      const finalStatus = externalId ? "sent" : deliveryFailed ? "failed" : "failed";
      await supabase
        .from("messages")
        .update({ status: finalStatus, external_id: externalId ?? null })
        .eq("id", inserted.id);

      await supabase
        .from("conversations")
        .update({ last_message: payload.content, last_message_at: new Date().toISOString() })
        .eq("id", selectedId);
    },
    onSuccess: () => {
      setDraft("");
      setComposerMode("text");
      setCtaUrl("");
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: [...messagesQueryKey] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar mensagem.");
    },
  });

  const handleSend = () => {
    if (inboxReadOnly || !draft.trim() || sendMutation.isPending) return;
    handleSendMutation();
  };

  const handleSendMutation = () => {
    sendMutation.mutate({ content: draft.trim(), mode: composerMode, ctaLabel, ctaUrl, flowId, flowScreenId });
  };

  const saveOpsMetaMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) return;
      const { error } = await supabase
        .from("conversations")
        .update({
          assigned_to_name: assigneeName || null,
          priority,
          sla_due_at: slaDueAt ? new Date(slaDueAt).toISOString() : null,
        })
        .eq("id", selectedId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ops atualizados");
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: () => toast.error("Erro ao salvar operações."),
  });
  const saveOpsMeta = useCallback(() => saveOpsMetaMutation.mutate(), [saveOpsMetaMutation]);

  const addInternalNoteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId || !internalNote.trim() || !user?.id) return;
      const noteInsert: DbConversationNoteInsert = {
        conversation_id: selectedId,
        user_id: user.id,
        note: internalNote.trim(),
      };
      const { error } = await supabase.from("conversation_notes").insert(noteInsert);
      if (error) throw error;
    },
    onSuccess: () => {
      setInternalNote("");
      queryClient.invalidateQueries({ queryKey: ["conversation_notes", selectedId] });
      toast.success("Nota salva");
    },
    onError: () => toast.error("Erro ao salvar nota."),
  });
  const addInternalNote = useCallback(() => addInternalNoteMutation.mutate(), [addInternalNoteMutation]);

  useEffect(() => {
    if (!selectedId) { setAssigneeName(""); setSlaDueAt(""); setPriority("normal"); lastOpsSyncedForConversationId.current = null; return; }
    if (!selectedConv || lastOpsSyncedForConversationId.current === selectedId) return;
    lastOpsSyncedForConversationId.current = selectedId;
    setAssigneeName(selectedConv.assigned_to_name ?? "");
    setSlaDueAt(selectedConv.sla_due_at ? new Date(selectedConv.sla_due_at).toISOString().slice(0, 16) : "");
    setPriority(parsePriorityLevel(selectedConv.priority));
  }, [selectedId, selectedConv]);

  const refreshInboxData = () => { refetchConversations(); refetchMessageSearch(); if (selectedId) refetchMessages(); };

  const retryMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase
        .from("messages")
        .update({ status: "pending", error_message: null })
        .eq("id", messageId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mensagem reenfileirada.");
      queryClient.invalidateQueries({ queryKey: [...messagesQueryKey] });
    },
    onError: () => toast.error("Erro ao reenviar mensagem."),
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const unreadIds = conversations
        .filter((c) => (c.unread_count ?? 0) > 0)
        .map((c) => c.id);
      if (unreadIds.length === 0) return;
      for (let i = 0; i < unreadIds.length; i += MARK_READ_CHUNK) {
        const chunk = unreadIds.slice(i, i + MARK_READ_CHUNK);
        const { error } = await supabase
          .from("conversations")
          .update({ unread_count: 0 })
          .in("id", chunk);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Todas marcadas como lidas.");
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: () => {
      toast.error("Erro ao marcar como lidas.");
      // Invalidate so UI reflects real unread state after partial failure.
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const uniqueTags = useMemo(() => {
    const s = new Set<string>();
    for (const c of conversations) {
      for (const t of c.contacts?.tags ?? []) s.add(t);
    }
    return Array.from(s).sort();
  }, [conversations]);

  const prioritized = useMemo(() => {
    const list = debouncedSearch.length > 0
      ? conversations.filter((c) => c.contacts?.name.toLowerCase().includes(debouncedSearch.toLowerCase()) || c.contacts?.phone.includes(debouncedSearch) || messageSearchSet.has(c.id))
      : conversations;
    
    if (tagFilter !== "all") {
      return list.filter((c) => c.contacts?.tags?.includes(tagFilter));
    }
    return list;
  }, [conversations, debouncedSearch, tagFilter, messageSearchSet]);

  const slaBreaches = useMemo(() => conversations.filter(c => c.sla_due_at && new Date(c.sla_due_at) < new Date() && c.status === "open").length, [conversations]);
  const urgentCount = useMemo(() => conversations.filter(c => c.priority === "urgent" && c.status === "open").length, [conversations]);

  const selectedContact = contactEmbed || (selectedConv?.contacts as InboxContactEmbed);

  const canRequestAiSuggestion = messages.length > 0 && messages[messages.length - 1].direction === "inbound" && !aiSuggestion && !loadingAi;

  const inboxIssueParts = useMemo(() => {
    const p: string[] = [];
    if (convListError) p.push("lista");
    if (messagesError && selectedId) p.push("mensagens");
    if (liveConvListRt === "err") p.push("realtime-lista");
    if (liveMessagesRt === "err" && selectedId) p.push("realtime-mensagens");
    return p;
  }, [convListError, messagesError, selectedId, liveConvListRt, liveMessagesRt]);

  const showRealtimeDegradedBanner = assumeRealtimeDown || convRealtimeDegraded || messagesRealtimeDegraded;

  return (
    <RouteErrorBoundary routeLabel="Inbox">
    <div className="flex flex-col h-full -m-4 md:-m-6 overflow-hidden">
      {(inboxIssueParts.length > 0 || showRealtimeDegradedBanner) && (
        <div className="shrink-0 px-4 pt-3 md:px-6">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
            <WifiOff className="w-4 h-4 shrink-0 opacity-80" />
            <span className="min-w-0 flex-1">
              {inboxIssueParts.length > 0
                ? <>Problema de conexão: <strong>{inboxIssueParts.join(" · ")}</strong></>
                : "Conexão em tempo real instável — mensagens podem atrasar. Usando atualização automática a cada 12s."}
            </span>
            <button onClick={refreshInboxData} className="text-[11px] underline">Atualizar</button>
          </div>
        </div>
      )}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="w-full md:w-80 lg:w-96 flex flex-col border-r bg-card relative shrink-0 overflow-hidden">
          {convListError ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
              <AlertCircle className="w-10 h-10 text-destructive opacity-50" />
              <div>
                <p className="font-bold text-sm">Falha ao carregar conversas</p>
                <p className="text-xs text-muted-foreground mt-1">Não foi possível conectar ao servidor.</p>
              </div>
              <Button size="sm" variant="outline" className="gap-2" onClick={() => void refetchConversations()}>
                <RotateCcw className="w-3.5 h-3.5" /> Tentar novamente
              </Button>
            </div>
          ) : (
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
              onMarkAllRead={() => markAllReadMutation.mutate()}
              markAllReadPending={markAllReadMutation.isPending}
            />
          )}
        </div>

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
                  {bundleError && (
                    <div className="flex items-center justify-center h-24 text-sm text-destructive gap-2">
                      <span>Erro ao carregar conversa.</span>
                    </div>
                  )}
                  <MessageList
                    messages={messages}
                    loadingMsgs={loadingMsgs}
                    messageFetchLimit={messageLimitCapped}
                    setMessageFetchLimit={setMessageFetchLimit}
                    loadStep={INBOX_MESSAGES_LOAD_STEP}
                    maxMessages={INBOX_MESSAGES_MAX_LIMIT}
                    bottomRef={bottomRef}
                    onRetryMessage={(id) => retryMessageMutation.mutate(id)}
                    retryingMessageId={undefined}
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
                    onRequestAiSuggestion={requestAiSuggestion}
                    canRequestAiSuggestion={canRequestAiSuggestion}
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
    </RouteErrorBoundary>
  );
}
