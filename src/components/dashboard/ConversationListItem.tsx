/**
 * Single conversation row in the Inbox conversation list.
 * Extracted from Inbox.tsx to keep the parent component lean.
 */
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-green-500/10 text-green-600 border-green-500/20",
  pending: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  closed: "bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Aberta",
  pending: "Pendente",
  closed: "Fechada",
};

const AVATAR_COLORS = [
  "bg-blue-500/10 text-blue-600",
  "bg-emerald-500/10 text-emerald-600",
  "bg-violet-500/10 text-violet-600",
  "bg-amber-500/10 text-amber-600",
];

function getAvatarColor(name = "") {
  if (!name) return AVATAR_COLORS[0];
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

export type SlaBucket = "none" | "breach" | "soon" | "ok";

export function getSlaBucket(slaDueAt: string | null | undefined): SlaBucket {
  if (!slaDueAt) return "none";
  const t = new Date(slaDueAt).getTime();
  if (Number.isNaN(t)) return "none";
  const now = Date.now();
  if (t < now) return "breach";
  if (t - now <= 60 * 60 * 1000) return "soon";
  return "ok";
}

export interface ConversationRow {
  id: string;
  status: string;
  unread_count: number;
  last_message?: string | null;
  last_message_at?: string | null;
  sla_due_at?: string | null;
  contacts?: { name: string; phone: string } | null;
}

interface ConversationListItemProps {
  conv: ConversationRow;
  isSelected: boolean;
  onClick: (id: string) => void;
}

export function ConversationListItem({ conv, isSelected, onClick }: ConversationListItemProps) {
  const contact = conv.contacts;
  const isOnline =
    !!conv.last_message_at &&
    Date.now() - new Date(conv.last_message_at).getTime() < 1000 * 60 * 5;
  const avatarColor = getAvatarColor(contact?.name ?? contact?.phone ?? "");
  const sla = getSlaBucket(conv.sla_due_at);

  return (
    <button
      key={conv.id}
      onClick={() => onClick(conv.id)}
      className={cn(
        "w-full text-left p-4 border-b transition-all relative group",
        isSelected ? "bg-primary/5 dark:bg-primary/10" : "hover:bg-muted/50",
      )}
    >
      {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />}

      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <div
            className={cn(
              "w-11 h-11 rounded-full flex items-center justify-center font-semibold text-base transition-transform group-hover:scale-105",
              avatarColor,
            )}
          >
            {contact?.name?.[0]?.toUpperCase() ?? contact?.phone?.[0] ?? "?"}
          </div>
          {isOnline && (
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-background rounded-full" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span
              className={cn(
                "font-semibold text-sm truncate",
                conv.unread_count > 0 ? "text-foreground" : "text-foreground/90",
              )}
            >
              {contact?.name ?? contact?.phone ?? "—"}
            </span>
            <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-1 font-medium">
              {conv.last_message_at
                ? formatDistanceToNow(new Date(conv.last_message_at), {
                    locale: ptBR,
                    addSuffix: false,
                  }).replace("cerca de ", "")
                : "—"}
            </span>
          </div>

          <p
            className={cn(
              "text-xs truncate",
              conv.unread_count > 0 ? "text-foreground font-medium" : "text-muted-foreground",
            )}
          >
            {conv.last_message ?? "Sem mensagens"}
          </p>

          <div className="flex items-center justify-between mt-2 gap-1 flex-wrap">
            <div className="flex items-center gap-1 flex-wrap">
              <Badge
                variant="outline"
                className={cn("text-[10px] px-2 py-0 h-4 border-none", STATUS_COLORS[conv.status] ?? "")}
              >
                {STATUS_LABELS[conv.status] ?? conv.status}
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
}
