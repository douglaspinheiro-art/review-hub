import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Star, TrendingUp, MessageSquare, ThumbsDown, Send,
  Globe, Loader2, RefreshCw, ExternalLink, Filter, Code, Copy, Check,
  Search, ChevronLeft, ChevronRight, Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { trackMoatEvent } from "@/lib/moat-telemetry";
import type { Database } from "@/integrations/supabase/types";
// review-metrics imported for side effects

type ReviewRow = Database["public"]["Tables"]["reviews"]["Row"];

const PAGE_SIZE = 25;




const PLATFORM_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  google: {
    label: "Google",
    className: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  reclame_aqui: {
    label: "Reclame Aqui",
    className: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  },
  facebook: {
    label: "Facebook",
    className: "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  },
  manual: {
    label: "Manual",
    className: "border-border bg-muted/60 text-muted-foreground",
  },
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: { label: "Aguardando resposta", className: "text-yellow-600 dark:text-yellow-400" },
  replied: { label: "Respondido", className: "text-green-600 dark:text-green-400" },
  ignored: { label: "Ignorado", className: "text-muted-foreground" },
};

function StarRating({ rating }: { rating: number | null }) {
  if (rating == null) return null;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            "w-3.5 h-3.5",
            i <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30",
          )}
        />
      ))}
    </div>
  );
}




export default function Reviews() {
  const [filter, setFilter] = useState<"all" | "pending" | "negative">("all");
  const [page, setPage] = useState(0);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [widgetCopied, setWidgetCopied] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    setSelectedIds([]);
  }, [filter, page, debouncedSearch]);

  const bulkReplyMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error: upErr } = await supabase
        .from("reviews")
        .update({
          status: "replied",
          replied_at: new Date().toISOString(),
        })
        .in("id", ids)
        .eq("user_id", user!.id)
        .not("ai_reply", "is", null);
      if (upErr) throw upErr;
    },
    onSuccess: () => {
      toast({ title: "Avaliações aprovadas com sucesso" });
      setSelectedIds([]);
      void queryClient.invalidateQueries({ queryKey: ["reviews"] });
    },
    onError: (e: Error) => toast({ title: "Erro ao aprovar em lote", description: e.message, variant: "destructive" }),
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const approvable = reviews.filter(r => r.status === 'pending' && !!r.ai_reply).map(r => r.id);
    if (selectedIds.length === approvable.length && approvable.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(approvable);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(0);
    setCursors([null]);
  }, [filter, debouncedSearch]);

  const apiBaseExample = useMemo(() => {
    const u = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    if (!u) return "https://SEU_PROJETO.supabase.co";
    return u.replace(/\/$/, "");
  }, []);

  const widgetSnippet = useMemo(
    () =>
      [
        `# Exemplo: solicitar avaliação (ajuste o corpo ao seu fluxo).`,
        `# Crie uma chave em: /dashboard/api-keys`,
        `curl -X POST "${apiBaseExample}/functions/v1/integration-gateway?platform=shopify&loja_id=SEU_STORE_ID" \\`,
        `  -H "Authorization: Bearer SUA_API_KEY" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -d '{}'`,
      ].join("\n"),
    [apiBaseExample],
  );

  function copyWidget() {
    void navigator.clipboard.writeText(widgetSnippet);
    setWidgetCopied(true);
    setTimeout(() => setWidgetCopied(false), 2000);
  }

  const {
    data: bundleData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching: _isFetching,
  } = useQuery({
    queryKey: ["reviews", user?.id, filter, page, cursors[page], debouncedSearch],
    queryFn: async () => {
      const { data, error: qErr } = await supabase.rpc("get_reviews_bundle_v2", {
        p_user_id: user!.id,
        p_filter: filter,
        p_search: debouncedSearch.trim(),
        p_cursor_created_at: cursors[page] ?? undefined,
        p_limit: PAGE_SIZE,
      });
      if (qErr) throw qErr;
      const res = data as {
        rows?: ReviewRow[];
        total_count?: number;
        stats?: { avg_rating: number; negative_count: number; pending_count: number; platform_count: number };
      };
      return {
        rows: (res.rows ?? []) as ReviewRow[],
        total: Number(res.total_count ?? 0),
        stats: res.stats ?? { avg_rating: 0, negative_count: 0, pending_count: 0, platform_count: 0 },
      };
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const reviews = bundleData?.rows ?? [];
  const totalList = bundleData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalList / PAGE_SIZE));
  const stats = bundleData?.stats;

  const avg = stats?.avg_rating ?? null;
  const negative = stats?.negative_count ?? 0;
  const pending = stats?.pending_count ?? 0;
  const platformCount = stats?.platform_count ?? 0;

  const replyMutation = useMutation({
    mutationFn: async ({ id, reply }: { id: string; reply: string }) => {
      const { error: upErr } = await supabase
        .from("reviews")
        .update({
          status: "replied",
          replied_at: new Date().toISOString(),
          ai_reply: reply,
        })
        .eq("id", id)
        .eq("user_id", user!.id);
      if (upErr) throw upErr;
    },
    onSuccess: () => {
      toast({
        title: "Marcado como respondido",
        description: "A resposta foi salva na avaliação. Publique também na plataforma (Google, etc.) se ainda não fez.",
      });
      void queryClient.invalidateQueries({ queryKey: ["reviews"] });
      void queryClient.invalidateQueries({ queryKey: ["reviews-stats"] });
    },
    onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
  });

  const ignoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error: upErr } = await supabase
        .from("reviews")
        .update({ status: "ignored" })
        .eq("id", id)
        .eq("user_id", user!.id);
      if (upErr) throw upErr;
    },
    onSuccess: () => {
      toast({ title: "Avaliação ignorada" });
      void queryClient.invalidateQueries({ queryKey: ["reviews"] });
      void queryClient.invalidateQueries({ queryKey: ["reviews-stats"] });
    },
    onError: () => toast({ title: "Erro ao ignorar", variant: "destructive" }),
  });

  const saveDraftMutation = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      const { error: upErr } = await supabase.from("reviews").update({ ai_reply: text }).eq("id", id).eq("user_id", user!.id);
      if (upErr) throw upErr;
    },
    onSuccess: () => {
      toast({ title: "Rascunho salvo" });
      setEditingReplyId(null);
      void queryClient.invalidateQueries({ queryKey: ["reviews"] });
    },
    onError: () => toast({ title: "Erro ao salvar rascunho", variant: "destructive" }),
  });

  async function generateAiReply(review: ReviewRow) {
    const content = (review.content ?? "").trim();
    if (!content) {
      toast({ title: "Sem texto", description: "Esta avaliação não tem conteúdo para a IA usar.", variant: "destructive" });
      return;
    }
    setGeneratingId(review.id);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke<
        { suggestion?: string; reply?: string; error?: string; status?: number }
      >("ai-reply-suggest", {
        body: {
          review_id: review.id,
          content,
          rating: review.rating,
          reviewer_name: review.reviewer_name,
        },
      });
      if (fnErr) {
        toast({
          title: "Erro ao chamar IA",
          description: fnErr.message || "Tente novamente em instantes.",
          variant: "destructive",
        });
        return;
      }
      if (data && typeof data === "object" && "error" in data && data.error) {
        toast({
          title: "Não foi possível gerar",
          description: String(data.error),
          variant: "destructive",
        });
        return;
      }
      const reply =
        (data as { suggestion?: string; reply?: string })?.suggestion
        ?? (data as { suggestion?: string; reply?: string })?.reply;
      if (!reply) {
        toast({ title: "Resposta vazia", description: "A API não retornou texto.", variant: "destructive" });
        return;
      }
      void trackMoatEvent("review_ai_generated", {
        review_id: review.id,
        rating: review.rating ?? 0,
      });
      const { error: upErr } = await supabase.from("reviews").update({ ai_reply: reply }).eq("id", review.id).eq("user_id", user!.id);
      if (upErr) {
        toast({ title: "Erro ao gravar sugestão", variant: "destructive" });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["reviews"] });
    } catch (e) {
      toast({
        title: "Erro ao gerar resposta com IA",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setGeneratingId(null);
    }
  }

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Avaliações & Reputação</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Monitore e responda avaliações com IA em segundos
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block">
                <Button variant="outline" size="sm" className="gap-2" type="button" disabled>
                  <RefreshCw className="w-3.5 h-3.5" />
                  Sincronizar Google
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Em breve: sincronização automática com Google Business.</TooltipContent>
          </Tooltip>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: "Avaliação média",
              value: avg == null ? "—" : avg.toFixed(1),
              icon: Star,
              color: "text-yellow-500",
              sub: "Todas as avaliações com nota",
            },
            {
              label: "Avaliações negativas",
              value: negative,
              icon: ThumbsDown,
              color: "text-red-500",
              sub: "Notas 1 a 3",
            },
            {
              label: "Aguardando resposta",
              value: pending,
              icon: MessageSquare,
              color: "text-orange-500",
              sub: "Precisam de ação",
            },
            {
              label: "Plataformas (dados)",
              value: platformCount,
              icon: Globe,
              color: "text-primary",
              sub: "Fontes distintas na conta",
            },
          ].map(({ label, value, icon: Icon, color, sub }) => (
            <div key={label} className="bg-card border rounded-xl p-4 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{label}</p>
                <Icon className={cn("w-4 h-4", color)} />
              </div>
              <p className={cn("text-2xl font-bold", color)}>{value}</p>
              <p className="text-xs text-muted-foreground">{sub}</p>
            </div>
          ))}
        </div>

        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-3">
          <TrendingUp className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-sm">Colete reviews automaticamente pós-compra</p>
            <p className="text-sm text-muted-foreground">
              Ative a automação &quot;Pós-compra (NPS)&quot; para enviar um WhatsApp pedindo avaliação logo após a entrega.
            </p>
            <Button size="sm" variant="outline" className="mt-1 gap-1.5" asChild>
              <Link to="/dashboard/automacoes">
                <Send className="w-3.5 h-3.5" />
                Ir para Automações
              </Link>
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-9 text-sm"
              placeholder="Buscar por nome ou texto…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2 sm:ml-auto sm:items-center">
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs"
              onClick={toggleSelectAll}
              disabled={!reviews.some(r => r.status === 'pending' && !!r.ai_reply)}
            >
              {selectedIds.length > 0 && selectedIds.length === reviews.filter(r => r.status === 'pending' && !!r.ai_reply).length ? "Desmarcar todos" : "Selecionar pendentes"}
            </Button>
            {(["all", "pending", "negative"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                  filter === f
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:bg-muted",
                )}
              >
                {f === "all" ? "Todas" : f === "pending" ? "Aguardando resposta" : "Negativas (1-3★)"}
              </button>
            ))}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Filter className="w-3.5 h-3.5" />
              {totalList} avaliações
            </div>
          </div>
        </div>

        {selectedIds.length > 0 && (
          <div className="sticky top-0 z-20 bg-primary text-primary-foreground p-3 rounded-xl flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-2 border border-primary-foreground/20">
            <div className="flex items-center gap-2">
              <div className="bg-primary-foreground/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Lote</div>
              <span className="text-sm font-bold">{selectedIds.length} selecionados</span>
            </div>
            <div className="flex gap-2">
              <Button 
                size="sm" 
                variant="secondary" 
                className="h-8 font-bold"
                onClick={() => bulkReplyMutation.mutate(selectedIds)}
                disabled={bulkReplyMutation.isPending}
              >
                {bulkReplyMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5 mr-1.5" />
                )}
                Aprovar Sugestões
              </Button>
              <Button 
                size="sm" 
                variant="ghost" 
                className="h-8 text-primary-foreground hover:bg-primary-foreground/10" 
                onClick={() => setSelectedIds([])}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {isError && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-sm text-destructive flex-1">
              {error instanceof Error ? error.message : "Não foi possível carregar as avaliações."}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} className="gap-2 shrink-0">
              <RefreshCw className="w-3.5 h-3.5" />
              Tentar novamente
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !isError && reviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Star className="w-12 h-12 opacity-20" />
            <p className="text-sm">Nenhuma avaliação encontrada.</p>
            <p className="text-xs text-center max-w-xs">
              {debouncedSearch.trim().length >= 2
                ? "Tente outro termo de busca ou limpe o filtro."
                : "Avaliações aparecerão aqui após integração ou importação manual."}
            </p>
          </div>
        ) : !isError ? (
          <>
            <div className="space-y-3">
              {reviews.map((review) => {
                const platform = PLATFORM_CONFIG[review.platform] ?? PLATFORM_CONFIG.manual;
                const statusCfg = STATUS_CONFIG[review.status] ?? STATUS_CONFIG.pending;
                const isNegative = review.rating != null && review.rating <= 3;
                const isEditing = editingReplyId === review.id;
                const isSelected = selectedIds.includes(review.id);
                const canSelect = review.status === 'pending' && !!review.ai_reply;

                return (
                  <div
                    key={review.id}
                    className={cn(
                      "bg-card border rounded-xl p-5 space-y-3 relative transition-all",
                      isNegative && "border-destructive/30",
                      isSelected && "ring-2 ring-primary border-primary bg-primary/5",
                    )}
                  >
                    {canSelect && (
                      <div className="absolute left-3 top-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(review.id)}
                          className="h-4 w-4 rounded border-muted-foreground/30 text-primary focus:ring-primary cursor-pointer"
                        />
                      </div>
                    )}
                    <div className={cn("flex items-start justify-between gap-3 flex-wrap", canSelect && "pl-7")}>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm">{review.reviewer_name}</p>
                          <Badge variant="outline" className={cn("text-xs", platform.className)}>
                            {platform.label}
                          </Badge>
                          {isNegative && (
                            <Badge variant="outline" className="text-xs border-destructive/40 bg-destructive/10 text-destructive">
                              Atenção
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <StarRating rating={review.rating} />
                          <span className="text-xs text-muted-foreground">
                            {new Date(review.created_at).toLocaleDateString("pt-BR")}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        <span className={cn("text-xs font-medium", statusCfg.className)}>{statusCfg.label}</span>
                        {review.url && (
                          <a
                            href={review.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Abrir na plataforma"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                      {review.content?.trim() ? `“${review.content}”` : "— Sem texto —"}
                    </p>

                    {review.status === "pending" && review.ai_reply && !isEditing && (
                      <div className="border border-primary/20 bg-primary/5 rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                          <Star className="w-3.5 h-3.5" />
                          Resposta sugerida pela IA
                        </div>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{review.ai_reply}</p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            className="gap-1.5 h-8"
                            type="button"
                            onClick={() => replyMutation.mutate({ id: review.id, reply: review.ai_reply! })}
                            disabled={replyMutation.isPending}
                          >
                            {replyMutation.isPending ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                            Marcar como respondido
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-8 text-xs"
                            type="button"
                            onClick={() => {
                              setEditingReplyId(review.id);
                              setEditDraft(review.ai_reply ?? "");
                            }}
                          >
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs"
                            type="button"
                            onClick={() => ignoreMutation.mutate(review.id)}
                            disabled={ignoreMutation.isPending}
                          >
                            <Ban className="w-3.5 h-3.5 mr-1" />
                            Ignorar
                          </Button>
                        </div>
                      </div>
                    )}

                    {review.status === "pending" && review.ai_reply && isEditing && (
                      <div className="border border-primary/20 bg-primary/5 rounded-lg p-3 space-y-2">
                        <p className="text-xs font-medium text-primary">Editar resposta</p>
                        <Textarea
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          rows={4}
                          className="text-sm resize-y min-h-[96px]"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            type="button"
                            className="h-8"
                            onClick={() => saveDraftMutation.mutate({ id: review.id, text: editDraft })}
                            disabled={saveDraftMutation.isPending || !editDraft.trim()}
                          >
                            {saveDraftMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Salvar rascunho"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            type="button"
                            onClick={() => {
                              setEditingReplyId(null);
                              setEditDraft("");
                            }}
                          >
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            variant="default"
                            className="h-8"
                            type="button"
                            onClick={() => replyMutation.mutate({ id: review.id, reply: editDraft.trim() })}
                            disabled={replyMutation.isPending || !editDraft.trim()}
                          >
                            Salvar e marcar respondido
                          </Button>
                        </div>
                      </div>
                    )}

                    {review.status === "pending" && !review.ai_reply && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 h-8"
                          type="button"
                          disabled={generatingId === review.id || !(review.content ?? "").trim()}
                          onClick={() => generateAiReply(review)}
                        >
                          {generatingId === review.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <MessageSquare className="w-3.5 h-3.5" />
                          )}
                          {generatingId === review.id ? "Gerando..." : "Gerar resposta com IA"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs"
                          type="button"
                          onClick={() => ignoreMutation.mutate(review.id)}
                          disabled={ignoreMutation.isPending}
                        >
                          Ignorar
                        </Button>
                      </div>
                    )}

                    {review.status === "replied" && (
                      <div className="space-y-2">
                        {review.ai_reply && (
                          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground whitespace-pre-wrap">
                            {review.ai_reply}
                          </div>
                        )}
                        <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                          <Star className="w-3.5 h-3.5" />
                          Respondido em{" "}
                          {review.replied_at
                            ? new Date(review.replied_at).toLocaleDateString("pt-BR")
                            : "—"}
                        </p>
                      </div>
                    )}

                    {review.status === "ignored" && (
                      <p className="text-xs text-muted-foreground">Marcada como ignorada (sem resposta pública planejada).</p>
                    )}
                  </div>
                );
              })}
            </div>

            {totalList > PAGE_SIZE && (
              <div className="flex items-center justify-between gap-2 pt-2">
                <p className="text-xs text-muted-foreground">
                  Página {page + 1} de {totalPages} ({totalList} itens)
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className="gap-1"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Anterior
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages - 1}
                    onClick={() => {
                      const lastRow = reviews[reviews.length - 1];
                      if (lastRow?.created_at) {
                        const nextCursor = lastRow.created_at;
                        setCursors((prev) => {
                          const next = [...prev];
                          next[page + 1] = nextCursor;
                          return next;
                        });
                        setPage((p) => p + 1);
                      }
                    }}
                    className="gap-1"
                  >
                    Próxima
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : null}

        <div className="bg-card border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b">
            <Code className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">API e convites de avaliação</h2>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-sm text-muted-foreground">
              O widget em <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">cdn</code> ainda não está disponível.
              Para integrações server-to-server, crie uma chave em{" "}
              <Link to="/dashboard/api-keys" className="text-primary underline font-medium">
                API e Integrações
              </Link>{" "}
              e use os endpoints documentados lá (ex.: convites pós-compra). Abaixo, um exemplo genérico de chamada autenticada — ajuste URL, query e corpo ao seu caso.
            </p>
            <div className="relative">
              <pre className="bg-muted rounded-lg p-4 text-xs font-mono overflow-x-auto text-muted-foreground pr-14 whitespace-pre-wrap">
                {widgetSnippet}
              </pre>
              <button
                type="button"
                onClick={copyWidget}
                className="absolute top-3 right-3 p-1.5 rounded-md bg-background border hover:bg-muted transition-colors"
                aria-label="Copiar exemplo"
              >
                {widgetCopied ? (
                  <Check className="w-3.5 h-3.5 text-green-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

