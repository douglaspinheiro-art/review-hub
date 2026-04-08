import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Star, TrendingUp, MessageSquare, ThumbsDown, Send,
  Globe, Loader2, RefreshCw, ExternalLink, Filter, Code, Copy, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { trackMoatEvent } from "@/lib/moat-telemetry";

type Review = {
  id: string;
  user_id: string;
  platform: "google" | "reclame_aqui" | "facebook" | "manual";
  reviewer_name: string;
  rating: number | null;
  content: string;
  url: string | null;
  status: "pending" | "replied" | "ignored";
  ai_reply: string | null;
  replied_at: string | null;
  created_at: string;
};

const PLATFORM_CONFIG = {
  google:       { label: "Google",        color: "bg-blue-50 text-blue-700 border-blue-200" },
  reclame_aqui: { label: "Reclame Aqui",  color: "bg-orange-50 text-orange-700 border-orange-200" },
  facebook:     { label: "Facebook",      color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  manual:       { label: "Manual",        color: "bg-muted text-muted-foreground border-border" },
};

const STATUS_CONFIG = {
  pending: { label: "Aguardando resposta", color: "text-yellow-600" },
  replied: { label: "Respondido",          color: "text-green-600" },
  ignored: { label: "Ignorado",            color: "text-muted-foreground" },
};

function StarRating({ rating }: { rating: number | null }) {
  if (!rating) return null;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            "w-3.5 h-3.5",
            i <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"
          )}
        />
      ))}
    </div>
  );
}


export default function Reviews() {
  const [filter, setFilter] = useState<"all" | "pending" | "negative">("all");
  const [widgetCopied, setWidgetCopied] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const widgetScript = user
    ? `<script src="https://cdn.ltvboost.com/widget.js" data-key="${user.id.slice(0, 8)}"></script>`
    : `<script src="https://cdn.ltvboost.com/widget.js" data-key="sua-api-key"></script>`;

  function copyWidget() {
    navigator.clipboard.writeText(widgetScript);
    setWidgetCopied(true);
    setTimeout(() => setWidgetCopied(false), 2000);
  }

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["reviews", user?.id, filter],
    queryFn: async () => {
      let q = supabase
        .from("reviews")
        .select("*")
        .order("created_at", { ascending: false });
      if (filter === "pending") q = q.eq("status", "pending");
      if (filter === "negative") q = q.lte("rating", 3);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Review[];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const replyMutation = useMutation({
    mutationFn: async ({ id, reply }: { id: string; reply: string }) => {
      const { error } = await supabase
        .from("reviews")
        .update({ status: "replied", replied_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Resposta marcada!", description: "Avaliação marcada como respondida." });
      queryClient.invalidateQueries({ queryKey: ["reviews", user?.id] });
    },
    onError: () => toast({ title: "Erro ao salvar resposta", variant: "destructive" }),
  });

  async function generateAiReply(review: Review) {
    setGeneratingId(review.id);
    try {
      const { data, error } = await supabase.functions.invoke("ai-reply-suggest", {
        body: {
          review_id: review.id,
          content: review.content,
          rating: review.rating,
          reviewer_name: review.reviewer_name,
        },
      });
      if (error) throw error;
      const reply = (data as { suggestion?: string; reply?: string })?.suggestion
        ?? (data as { suggestion?: string; reply?: string })?.reply;
      if (!reply) throw new Error("AI reply missing");
      void trackMoatEvent("review_ai_generated", {
        review_id: review.id,
        rating: review.rating ?? 0,
      });
      await supabase.from("reviews").update({ ai_reply: reply }).eq("id", review.id);
      queryClient.setQueryData(["reviews", user?.id, filter], (old: Review[] = []) =>
        old.map((r) => (r.id === review.id ? { ...r, ai_reply: reply } : r))
      );
    } catch {
      toast({ title: "Erro ao gerar resposta com IA", variant: "destructive" });
    } finally {
      setGeneratingId(null);
    }
  }

  // KPIs
  const avgRating = reviews.filter((r) => r.rating).reduce((s, r, _, a) =>
    s + (r.rating! / a.filter((x) => x.rating).length), 0
  );
  const negative = reviews.filter((r) => r.rating && r.rating <= 3).length;
  const pending = reviews.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Avaliações & Reputação</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitore e responda avaliações com IA em segundos
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2">
          <RefreshCw className="w-3.5 h-3.5" />
          Sincronizar Google
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Avaliação média", value: avgRating.toFixed(1), icon: Star, color: "text-yellow-500", sub: "Google Reviews" },
          { label: "Avaliações negativas", value: negative, icon: ThumbsDown, color: "text-red-500", sub: "Notas 1-3" },
          { label: "Aguardando resposta", value: pending, icon: MessageSquare, color: "text-orange-500", sub: "Precisam de ação" },
          { label: "Plataformas monitoradas", value: 2, icon: Globe, color: "text-primary", sub: "Google + Reclame Aqui" },
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

      {/* Setup banner */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-3">
        <TrendingUp className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-sm">Colete reviews automaticamente pós-compra</p>
          <p className="text-sm text-muted-foreground">
            Ative a automação "Pós-compra (NPS)" para enviar um WhatsApp pedindo avaliação Google logo após a entrega.
            Clientes satisfeitos avaliam em segundos.
          </p>
          <Button size="sm" variant="outline" className="mt-1 gap-1.5">
            <Send className="w-3.5 h-3.5" />
            Ir para Automações
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(["all", "pending", "negative"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              filter === f
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:bg-muted"
            )}
          >
            {f === "all" ? "Todas" : f === "pending" ? "Aguardando resposta" : "Negativas (1-3★)"}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Filter className="w-3.5 h-3.5" />
          {reviews.length} avaliações
        </div>
      </div>

      {/* Reviews list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : reviews.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <Star className="w-12 h-12 opacity-20" />
          <p className="text-sm">Nenhuma avaliação encontrada.</p>
          <p className="text-xs text-center max-w-xs">
            Avaliações aparecerão aqui após configurar a integração com Google Reviews ou Reclame Aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => {
            const platform = PLATFORM_CONFIG[review.platform] ?? PLATFORM_CONFIG.manual;
            const statusCfg = STATUS_CONFIG[review.status] ?? STATUS_CONFIG.pending;
            const isNegative = review.rating && review.rating <= 3;

            return (
              <div
                key={review.id}
                className={cn(
                  "bg-card border rounded-xl p-5 space-y-3",
                  isNegative && "border-red-200/60"
                )}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{review.reviewer_name}</p>
                      <Badge variant="outline" className={cn("text-xs", platform.color)}>
                        {platform.label}
                      </Badge>
                      {isNegative && (
                        <Badge variant="outline" className="text-xs bg-red-50 text-red-600 border-red-200">
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
                  <div className="flex items-center gap-1.5">
                    <span className={cn("text-xs font-medium", statusCfg.color)}>
                      {statusCfg.label}
                    </span>
                    {review.url && (
                      <a
                        href={review.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>

                <p className="text-sm text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                  "{review.content}"
                </p>

                {review.ai_reply && review.status === "pending" && (
                  <div className="border border-primary/20 bg-primary/5 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                      <Star className="w-3.5 h-3.5" />
                      Resposta sugerida pela IA
                    </div>
                    <p className="text-sm text-muted-foreground">{review.ai_reply}</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="gap-1.5 h-8"
                        onClick={() => replyMutation.mutate({ id: review.id, reply: review.ai_reply! })}
                        disabled={replyMutation.isPending}
                      >
                        {replyMutation.isPending
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Send className="w-3.5 h-3.5" />
                        }
                        Usar esta resposta
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs">
                        Editar
                      </Button>
                    </div>
                  </div>
                )}

                {review.status === "pending" && !review.ai_reply && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-8"
                    disabled={generatingId === review.id}
                    onClick={() => generateAiReply(review)}
                  >
                    {generatingId === review.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <MessageSquare className="w-3.5 h-3.5" />
                    }
                    {generatingId === review.id ? "Gerando..." : "Gerar resposta com IA"}
                  </Button>
                )}

                {review.status === "replied" && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <Star className="w-3.5 h-3.5" />
                    Respondido em {new Date(review.replied_at!).toLocaleDateString("pt-BR")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Widget embed */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b">
          <Code className="w-4 h-4 text-primary" />
          <h2 className="font-semibold">Widget de avaliações no seu site</h2>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Cole o código abaixo antes do <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">&lt;/body&gt;</code> do seu site para exibir um carrossel de avaliações Google.
          </p>
          <div className="relative">
            <pre className="bg-muted rounded-lg p-4 text-xs font-mono overflow-x-auto text-muted-foreground pr-14">
              {widgetScript}
            </pre>
            <button
              onClick={copyWidget}
              className="absolute top-3 right-3 p-1.5 rounded-md bg-background border hover:bg-muted transition-colors"
            >
              {widgetCopied
                ? <Check className="w-3.5 h-3.5 text-green-600" />
                : <Copy className="w-3.5 h-3.5 text-muted-foreground" />
              }
            </button>
          </div>
          <div className="grid sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
            {[
              { icon: Star, text: "Exibe suas últimas avaliações Google em carrossel" },
              { icon: TrendingUp, text: "Aumenta conversão mostrando prova social" },
              { icon: Globe, text: "Funciona em qualquer plataforma (Shopify, WordPress, etc.)" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-start gap-2">
                <Icon className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
