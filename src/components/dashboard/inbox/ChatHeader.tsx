import { User, Check, Clock, User as UserIcon, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSlaBucket } from "@/components/dashboard/ConversationListItem";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface ChatHeaderProps {
  selectedId: string;
  setSelectedId: (id: string | null) => void;
  selectedContact: any;
  selectedConv: any;
  inboxReadOnly: boolean;
  showSidebar: boolean;
  setShowSidebar: (v: boolean) => void;
  assigneeName: string;
  setAssigneeName: (v: string) => void;
  slaDueAt: string;
  setSlaDueAt: (v: string) => void;
  priority: string;
  setPriority: (v: any) => void;
  saveOpsMeta: () => void;
}

export function ChatHeader({
  selectedId,
  setSelectedId,
  selectedContact,
  selectedConv,
  inboxReadOnly,
  showSidebar,
  setShowSidebar,
  assigneeName,
  setAssigneeName,
  slaDueAt,
  setSlaDueAt,
  priority,
  setPriority,
  saveOpsMeta,
}: ChatHeaderProps) {
  const queryClient = useQueryClient();

  const updateStatus = async (status: "closed" | "pending") => {
    if (!selectedId || inboxReadOnly) return;
    const { error } = await supabase.from("conversations").update({ status }).eq("id", selectedId);
    if (!error) {
      toast.success(`Conversa marcada como ${status === "closed" ? "resolvida" : "pendente"}`);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }
  };

  return (
    <>
      <div className="h-14 border-b bg-card px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="md:hidden text-muted-foreground hover:text-foreground"
            aria-label="Voltar à lista de conversas"
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
              {getSlaBucket(selectedConv?.sla_due_at) === "breach" && (
                <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-5">SLA estourado</Badge>
              )}
              {getSlaBucket(selectedConv?.sla_due_at) === "soon" && (
                <Badge className="text-[9px] px-1.5 py-0 h-5 bg-amber-500 hover:bg-amber-500 text-white border-0">SLA em até 1h</Badge>
              )}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">{selectedContact?.phone}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={inboxReadOnly}
            onClick={() => updateStatus("closed")}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider text-green-600 hover:bg-green-500/10 transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            <Check className="w-3.5 h-3.5" /> Resolver
          </button>
          <button
            type="button"
            disabled={inboxReadOnly}
            onClick={() => updateStatus("pending")}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider text-yellow-600 hover:bg-yellow-500/10 transition-colors disabled:opacity-40 disabled:pointer-events-none"
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
            <UserIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="border-b bg-muted/20 px-4 py-2 grid grid-cols-1 md:grid-cols-4 gap-2 shrink-0">
        <Input
          value={assigneeName}
          onChange={(e) => setAssigneeName(e.target.value)}
          placeholder="Responsável"
          className="h-8 text-xs"
          disabled={inboxReadOnly}
        />
        <Input
          type="datetime-local"
          value={slaDueAt}
          onChange={(e) => setSlaDueAt(e.target.value)}
          className="h-8 text-xs"
          disabled={inboxReadOnly}
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="h-8 text-xs rounded-md border bg-background px-2"
          disabled={inboxReadOnly}
        >
          <option value="low">Prioridade baixa</option>
          <option value="normal">Prioridade normal</option>
          <option value="high">Prioridade alta</option>
          <option value="urgent">Prioridade urgente</option>
        </select>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={saveOpsMeta} disabled={inboxReadOnly}>
          Salvar operação
        </Button>
      </div>
    </>
  );
}
