import { Search, Loader2, MessageCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ConversationListItem } from "@/components/dashboard/ConversationListItem";

interface ConversationListProps {
  conversations: any[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  isLoading: boolean;
  search: string;
  setSearch: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  assigneeFilter: string;
  setAssigneeFilter: (v: any) => void;
  tagFilter: string;
  setTagFilter: (v: string) => void;
  uniqueTags: string[];
  hasNextConvPage: boolean;
  fetchNextConvPage: () => void;
  fetchingNextConvPage: boolean;
  agentsDraft: string;
  setAgentsDraft: (v: string) => void;
  inboxRoutingReadOnly: boolean;
  saveRoutingMutation: any;
  slaBreaches: number;
  urgentCount: number;
  searchingHistory: boolean;
  debouncedSearch: string;
  profileName: string;
}

const STATUS_FILTERS = [
  { label: "Todas", value: "all" },
  { label: "Abertas", value: "open" },
  { label: "Pendentes", value: "pending" },
  { label: "Fechadas", value: "closed" },
];

const ASSIGNEE_FILTERS = [
  { label: "Todas", value: "all" },
  { label: "Minhas", value: "mine" },
  { label: "Sem responsável", value: "unassigned" },
];

export function ConversationList({
  conversations,
  selectedId,
  setSelectedId,
  isLoading,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  assigneeFilter,
  setAssigneeFilter,
  tagFilter,
  setTagFilter,
  uniqueTags,
  hasNextConvPage,
  fetchNextConvPage,
  fetchingNextConvPage,
  agentsDraft,
  setAgentsDraft,
  inboxRoutingReadOnly,
  saveRoutingMutation,
  slaBreaches,
  urgentCount,
  searchingHistory,
  debouncedSearch,
  profileName,
}: ConversationListProps) {
  return (
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
            onChange={(e) => setAgentsDraft(e.target.value)}
            placeholder="Maria, João, Pedro…"
            className="h-8 text-xs"
            disabled={inboxRoutingReadOnly}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 text-[11px] w-full"
            disabled={saveRoutingMutation.isPending || inboxRoutingReadOnly}
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
        <div className="flex gap-1 flex-wrap items-center">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase shrink-0">Fila</span>
          {ASSIGNEE_FILTERS.map((f) => {
            const mineDisabled = f.value === "mine" && !profileName.trim();
            return (
              <button
                key={f.value}
                type="button"
                title={mineDisabled ? "Defina seu nome completo no perfil para usar \"Minhas\"." : undefined}
                disabled={mineDisabled}
                onClick={() => setAssigneeFilter(f.value)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors",
                  assigneeFilter === f.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                  mineDisabled && "opacity-40 cursor-not-allowed",
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        {!isLoading && conversations.length > 0 && (
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
        )}
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
        {conversations.map((conv) => (
          <ConversationListItem
            key={conv.id}
            conv={conv}
            isSelected={selectedId === conv.id}
            onClick={setSelectedId}
          />
        ))}
        {!isLoading && hasNextConvPage && (
          <div className="p-3 border-t">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full text-xs"
              disabled={fetchingNextConvPage}
              onClick={fetchNextConvPage}
            >
              {fetchingNextConvPage ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Carregar mais conversas"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
