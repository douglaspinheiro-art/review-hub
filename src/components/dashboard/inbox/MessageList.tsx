import { useRef, useEffect, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { MessageCircle, Check, Loader2, AlertCircle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { isSameDay, format, isYesterday, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Database } from "@/integrations/supabase/types";
import { RefObject } from "react";

type DbMessage = Database["public"]["Tables"]["messages"]["Row"];

interface MessageListProps {
  messages: DbMessage[];
  loadingMsgs: boolean;
  /** Limite efectivo usado na query (últimas N mensagens). */
  messageFetchLimit: number;
  setMessageFetchLimit: React.Dispatch<React.SetStateAction<number>>;
  /** Incremento ao carregar histórico (default 100). */
  loadStep?: number;
  /** Teto de mensagens a pedir ao servidor (default 2000). */
  maxMessages?: number;
  bottomRef: RefObject<HTMLDivElement>;
  /** H6: callback to retry a failed message by its ID */
  onRetryMessage?: (messageId: string) => void;
  /** H6: message ID currently being retried */
  retryingMessageId?: string;
}

function formatDateSeparator(date: Date) {
  if (isToday(date)) return "Hoje";
  if (isYesterday(date)) return "Ontem";
  return format(date, "d 'de' MMMM", { locale: ptBR });
}

/** Renders a single message bubble + optional date separator above it. */
function MessageItem({
  msg,
  idx,
  messages,
  onRetryMessage,
  retryingMessageId,
}: {
  msg: DbMessage;
  idx: number;
  messages: DbMessage[];
  onRetryMessage?: (id: string) => void;
  retryingMessageId?: string;
}) {
  const isFirstInGroup = idx === 0 || messages[idx - 1].direction !== msg.direction;
  const isLastInGroup = idx === messages.length - 1 || messages[idx + 1].direction !== msg.direction;
  const currentDate = new Date(msg.created_at);
  const showDateSeparator = idx === 0 || !isSameDay(new Date(messages[idx - 1].created_at), currentDate);

  return (
    <div>
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

          {msg.status === 'failed' && onRetryMessage && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[10px] font-bold text-destructive uppercase tracking-wide">
                Falha no envio
              </span>
              <button
                type="button"
                onClick={() => onRetryMessage(msg.id)}
                disabled={retryingMessageId === msg.id}
                className="inline-flex items-center gap-1 text-[10px] font-bold text-destructive-foreground/80 bg-destructive/20 hover:bg-destructive/30 px-2 py-0.5 rounded transition-colors disabled:opacity-50"
              >
                {retryingMessageId === msg.id
                  ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  : <RotateCcw className="w-2.5 h-2.5" />}
                Tentar novamente
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// M5: Virtual scroll threshold — only virtualise when thread is long
const VIRTUAL_THRESHOLD = 100;

/** Virtualised message list for threads > 100 messages. */
function VirtualMessageList({
  messages,
  loadingMsgs,
  messageFetchLimit,
  setMessageFetchLimit,
  loadStep,
  maxMessages,
  bottomRef,
  onRetryMessage,
  retryingMessageId,
}: MessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 90,
    overscan: 10,
  });

  const items = virtualizer.getVirtualItems();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  const canLoadOlder =
    !loadingMsgs &&
    messages.length > 0 &&
    messages.length === messageFetchLimit &&
    messageFetchLimit < (maxMessages ?? 2000);

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto p-4">
      {canLoadOlder && (
        <div className="flex justify-center pb-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => setMessageFetchLimit((n) => Math.min(n + (loadStep ?? 100), maxMessages ?? 2000))}
          >
            Carregar mensagens anteriores
          </Button>
        </div>
      )}

      {/* Virtual scroll container — total height tells browser the scroll extent */}
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
        {items.map((vItem) => {
          const msg = messages[vItem.index];
          return (
            <div
              key={msg.id}
              data-index={vItem.index}
              ref={virtualizer.measureElement}
              style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${vItem.start}px)` }}
            >
              <MessageItem
                msg={msg}
                idx={vItem.index}
                messages={messages}
                onRetryMessage={onRetryMessage}
                retryingMessageId={retryingMessageId}
              />
            </div>
          );
        })}
      </div>
      {/* bottomRef compatibility — stays at logical end */}
      <div ref={bottomRef} />
    </div>
  );
}

function MessageListInner({
  messages,
  loadingMsgs,
  messageFetchLimit,
  setMessageFetchLimit,
  loadStep = 100,
  maxMessages = 2000,
  bottomRef,
  onRetryMessage,
  retryingMessageId,
}: MessageListProps) {
  const canLoadOlder =
    !loadingMsgs &&
    messages.length > 0 &&
    messages.length === messageFetchLimit &&
    messageFetchLimit < maxMessages;

  // M5: delegate to virtual renderer for long threads
  if (!loadingMsgs && messages.length > VIRTUAL_THRESHOLD) {
    return (
      <VirtualMessageList
        messages={messages}
        loadingMsgs={loadingMsgs}
        messageFetchLimit={messageFetchLimit}
        setMessageFetchLimit={setMessageFetchLimit}
        loadStep={loadStep}
        maxMessages={maxMessages}
        bottomRef={bottomRef}
        onRetryMessage={onRetryMessage}
        retryingMessageId={retryingMessageId}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {canLoadOlder && (
        <div className="flex justify-center pb-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => setMessageFetchLimit((n) => Math.min(n + loadStep, maxMessages))}
          >
            Carregar mensagens anteriores
          </Button>
        </div>
      )}
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
      {!loadingMsgs && messages.map((msg, idx) => (
        <MessageItem
          key={msg.id}
          msg={msg}
          idx={idx}
          messages={messages}
          onRetryMessage={onRetryMessage}
          retryingMessageId={retryingMessageId}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

export const MessageList = memo(MessageListInner);
