import { Send, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TrialGate } from "@/components/dashboard/TrialGate";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type DbConversationNote = Database["public"]["Tables"]["conversation_notes"]["Row"];

interface MessageComposerProps {
  draft: string;
  setDraft: (v: string) => void;
  composerMode: "text" | "template" | "flow";
  setComposerMode: (v: "text" | "template" | "flow") => void;
  ctaLabel: string;
  setCtaLabel: (v: string) => void;
  ctaUrl: string;
  setCtaUrl: (v: string) => void;
  flowId: string;
  setFlowId: (v: string) => void;
  flowScreenId: string;
  setFlowScreenId: (v: string) => void;
  aiSuggestion: string | null;
  loadingAi: boolean;
  handleSend: () => void;
  isReady: boolean;
  inboxReadOnly: boolean;
  internalNote: string;
  setInternalNote: (v: string) => void;
  addInternalNote: () => void;
  conversationNotes: DbConversationNote[];
  isSending: boolean;
  onAiUsed?: () => void;
}

export function MessageComposer({
  draft,
  setDraft,
  composerMode,
  setComposerMode,
  ctaLabel,
  setCtaLabel,
  ctaUrl,
  setCtaUrl,
  flowId,
  setFlowId,
  flowScreenId,
  setFlowScreenId,
  aiSuggestion,
  loadingAi,
  handleSend,
  isReady,
  inboxReadOnly,
  internalNote,
  setInternalNote,
  addInternalNote,
  conversationNotes,
  isSending,
  onAiUsed,
}: MessageComposerProps) {
  return (
    <div className="border-t p-4 bg-card shrink-0 space-y-3">
      <div className="bg-muted/20 border rounded-lg p-2 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Notas internas</p>
        <div className="flex gap-2">
          <Input
            value={internalNote}
            onChange={(e) => setInternalNote(e.target.value)}
            placeholder="Adicionar nota para equipe"
            className="h-8 text-xs"
            disabled={inboxReadOnly}
          />
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={addInternalNote} disabled={inboxReadOnly}>
            Salvar
          </Button>
        </div>
        {conversationNotes.length > 0 && (
          <div className="max-h-20 overflow-y-auto space-y-1">
            {conversationNotes.slice(0, 4).map((n) => (
              <div key={n.id} className="text-[11px] text-muted-foreground bg-background rounded px-2 py-1">
                {n.note}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {(["text", "template", "flow"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setComposerMode(mode)}
            className={cn(
              "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
              composerMode === mode ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}
          >
            {mode === "text" ? "Texto" : mode === "template" ? "Botão CTA" : "Lista/Flow"}
          </button>
        ))}
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
      {loadingAi && !draft && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-2 px-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          Gerando sugestão de resposta…
        </p>
      )}
      {aiSuggestion && !draft && !loadingAi && (
        <div className="flex items-start gap-2 animate-in fade-in slide-in-from-bottom-2">
          <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </div>
          <button 
            type="button"
            onClick={() => {
              setDraft(aiSuggestion);
              onAiUsed?.();
            }}
            className="text-left text-[11px] bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors p-2 rounded-xl italic text-primary group"
          >
            <span className="font-bold not-italic block mb-0.5 text-[9px] uppercase tracking-widest opacity-60">Sugestão da IA (clique para usar)</span>
            "{aiSuggestion}"
          </button>
        </div>
      )}
      
      <div className="flex flex-col gap-2 bg-muted/30 rounded-2xl p-2 border focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/30 transition-all">
        <Textarea
          placeholder={isReady ? "Escreva sua mensagem..." : "Modo offline (salva localmente)..."}
          className="min-h-[40px] max-h-[200px] border-none bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 resize-none py-2 px-3 text-sm leading-relaxed"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={isSending || inboxReadOnly}
        />

        <div className="flex items-center justify-end px-1 pb-1">
          <TrialGate action="enviar mensagens">
            <button
              type="button"
              onClick={handleSend}
              disabled={!draft.trim() || isSending || inboxReadOnly}
              className="h-9 px-4 bg-primary text-primary-foreground rounded-xl text-[13px] font-bold shadow-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>Enviar <Send className="w-3.5 h-3.5" /></>
              )}
            </button>
          </TrialGate>
        </div>
      </div>
    </div>
  );
}
