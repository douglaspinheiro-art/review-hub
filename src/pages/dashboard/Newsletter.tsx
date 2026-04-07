import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Save, Send, Loader2, Users, Tag, Globe,
  Check, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { BlockCanvas } from "@/components/dashboard/newsletter/BlockCanvas";
import { BlockPalette } from "@/components/dashboard/newsletter/BlockPalette";
import { BlockSettings } from "@/components/dashboard/newsletter/BlockSettings";
import { EmailPreview } from "@/components/dashboard/newsletter/EmailPreview";
import {
  type Block,
  type BlockType,
  createDefaultBlocks,
} from "@/lib/newsletter-renderer";

type RecipientMode = "all" | "tag" | "rfm";

const RFM_SEGMENTS = [
  { value: "champions", label: "Campeões" },
  { value: "loyal",     label: "Fiéis" },
  { value: "at_risk",   label: "Em risco" },
  { value: "lost",      label: "Perdidos" },
  { value: "new",       label: "Novos" },
];

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function Newsletter() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ── Editor state ────────────────────────────────────────────────────────────
  const [campaignId, setCampaignId] = useState<string | null>(id ?? null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [subject, setSubject] = useState("Novidades da nossa loja");
  const [name, setName] = useState("Newsletter");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recipientMode, setRecipientMode] = useState<RecipientMode>("all");
  const [recipientTag, setRecipientTag] = useState("");
  const [recipientRFM, setRecipientRFM] = useState("champions");
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [activePanel, setActivePanel] = useState<"blocks" | "settings">("blocks");
  const initialized = useRef(false);

  // ── Load existing draft ──────────────────────────────────────────────────────
  const { isLoading } = useQuery({
    queryKey: ["newsletter_draft", campaignId],
    queryFn: async () => {
      if (!campaignId) return null;
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .eq("id", campaignId)
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!campaignId && !!user,
  });

  useEffect(() => {
    if (existingCampaign && !initialized.current) {
      initialized.current = true;
      setName(existingCampaign.name ?? "Newsletter");
      setSubject(existingCampaign.subject ?? "");
      const loaded = (existingCampaign as any).blocks as Block[] | null;
      setBlocks(loaded && loaded.length > 0 ? loaded : createDefaultBlocks());
    }
  }, [existingCampaign]);

  // Init seed blocks if new newsletter
  useEffect(() => {
    if (!campaignId && !initialized.current) {
      initialized.current = true;
      setBlocks(createDefaultBlocks());
    }
  }, [campaignId]);

  // ── Autosave ─────────────────────────────────────────────────────────────────
  const debouncedBlocks = useDebounce(blocks, 3000);
  const debouncedSubject = useDebounce(subject, 3000);
  const debouncedName = useDebounce(name, 3000);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        user_id: user!.id,
        name: debouncedName,
        channel: "email",
        subject: debouncedSubject,
        blocks: debouncedBlocks as unknown as Record<string, unknown>[],
        message: debouncedSubject || "Newsletter",
        status: "draft",
      };

      if (campaignId) {
        const { error } = await supabase
          .from("campaigns")
          .update(payload as any)
          .eq("id", campaignId)
          .eq("user_id", user!.id);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase
          .from("campaigns") as any)
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        setCampaignId(data.id);
        window.history.replaceState(null, "", `/dashboard/newsletter/${data.id}`);
      }
      setLastSaved(new Date());
    },
  });

  useEffect(() => {
    if (!initialized.current) return;
    saveMutation.mutate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedBlocks, debouncedSubject, debouncedName]);

  // ── Send ─────────────────────────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!campaignId) throw new Error("Salve antes de enviar.");
      const { data, error } = await supabase.functions.invoke("dispatch-newsletter", {
        body: {
          campaign_id: campaignId,
          recipient_mode: recipientMode,
          recipient_tag: recipientMode === "tag" ? recipientTag : undefined,
          recipient_rfm: recipientMode === "rfm" ? recipientRFM : undefined,
        },
      });
      if (error) throw error;
      return data as { sent: number; failed: number };
    },
    onSuccess: (data) => {
      toast.success(`Newsletter enviada! ${data.sent} destinatários.`);
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      navigate("/dashboard/campanhas");
    },
    onError: (err: Error) => {
      toast.error(`Erro ao enviar: ${err.message}`);
    },
  });

  // ── Block operations ──────────────────────────────────────────────────────────
  const selectedBlock = blocks.find((b) => b.id === selectedId) ?? null;

  const addBlock = useCallback((type: BlockType) => {
    const defaults: Record<BlockType, Block["data"]> = {
      header:  { title: "Novo título", subtitle: "" },
      text:    { content: "Digite seu texto aqui..." },
      image:   { url: "", alt: "", href: "" },
      button:  { label: "Clique aqui", url: "https://", color: "primary" },
      divider: {},
      spacer:  { height: 24 },
    };
    const newBlock = { id: crypto.randomUUID(), type, data: defaults[type] } as Block;
    setBlocks((prev) => [...prev, newBlock]);
    setSelectedId(newBlock.id);
    setActivePanel("settings");
  }, []);

  const updateBlock = useCallback((updated: Block) => {
    setBlocks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
  }, []);

  const deleteBlock = useCallback((id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -m-6 overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-background shrink-0">
        <Button variant="ghost" size="sm" className="gap-1.5 shrink-0" onClick={() => navigate("/dashboard/campanhas")}>
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Button>

        <div className="flex-1 min-w-0 flex items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 text-sm font-semibold w-40 shrink-0"
            placeholder="Nome interno"
          />
          <span className="text-muted-foreground/40 text-sm">·</span>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="h-8 text-sm flex-1"
            placeholder="Assunto do e-mail (o que o destinatário vê)"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {lastSaved && (
            <span className="text-[10px] text-muted-foreground hidden sm:flex items-center gap-1">
              <Check className="w-3 h-3 text-emerald-500" />
              Salvo {lastSaved.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {saveMutation.isPending && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-8"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            <Save className="w-3.5 h-3.5" /> Salvar
          </Button>
          <Button
            size="sm"
            className="gap-1.5 h-8"
            onClick={() => setShowSendConfirm(true)}
          >
            <Send className="w-3.5 h-3.5" /> Enviar
          </Button>
        </div>
      </div>

      {/* ── 3-column layout ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Painel esquerdo — paleta + configurações de envio */}
        <div className="w-56 shrink-0 border-r bg-background overflow-y-auto">
          <div className="flex border-b">
            {(["blocks", "settings"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setActivePanel(p)}
                className={cn(
                  "flex-1 py-2 text-[10px] font-black uppercase tracking-widest transition-colors",
                  activePanel === p ? "border-b-2 border-primary text-primary" : "text-muted-foreground"
                )}
              >
                {p === "blocks" ? "Blocos" : "Envio"}
              </button>
            ))}
          </div>

          <div className="p-3">
            {activePanel === "blocks" ? (
              <BlockPalette onAdd={addBlock} />
            ) : (
              <RecipientPanel
                mode={recipientMode}
                tag={recipientTag}
                rfm={recipientRFM}
                onMode={setRecipientMode}
                onTag={setRecipientTag}
                onRFM={setRecipientRFM}
              />
            )}
          </div>
        </div>

        {/* Canvas central */}
        <div className="flex-1 overflow-y-auto bg-muted/20 p-4">
          <div className="max-w-xl mx-auto">
            <BlockCanvas
              blocks={blocks}
              selectedId={selectedId}
              onSelect={(id) => { setSelectedId(id); setActivePanel("blocks"); }}
              onDelete={deleteBlock}
              onReorder={setBlocks}
              onAddBlock={() => setActivePanel("blocks")}
            />
          </div>
        </div>

        {/* Painel direito — settings do bloco selecionado + preview */}
        <div className="w-80 shrink-0 border-l bg-background flex flex-col overflow-hidden">
          {/* Block settings */}
          {selectedBlock && (
            <div className="border-b p-4 overflow-y-auto max-h-[50%]">
              <BlockSettings block={selectedBlock} onChange={updateBlock} />
            </div>
          )}

          {/* Email preview */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <div className="px-4 pt-3 pb-1 shrink-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Preview</p>
            </div>
            <div className="flex-1 px-4 pb-4 overflow-hidden">
              <EmailPreview blocks={blocks} subject={subject} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Send confirmation modal ── */}
      {showSendConfirm && (
        <SendConfirmModal
          subject={subject}
          recipientMode={recipientMode}
          recipientTag={recipientTag}
          recipientRFM={recipientRFM}
          isSending={sendMutation.isPending}
          onConfirm={() => sendMutation.mutate()}
          onClose={() => setShowSendConfirm(false)}
        />
      )}
    </div>
  );
}

// ─── RecipientPanel ────────────────────────────────────────────────────────────

function RecipientPanel({
  mode, tag, rfm,
  onMode, onTag, onRFM,
}: {
  mode: RecipientMode; tag: string; rfm: string;
  onMode: (m: RecipientMode) => void;
  onTag: (t: string) => void;
  onRFM: (r: string) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        Destinatários
      </p>

      {([
        { value: "all", label: "Toda a base", icon: Globe },
        { value: "rfm", label: "Segmento RFM", icon: Users },
        { value: "tag", label: "Por tag", icon: Tag },
      ] as { value: RecipientMode; label: string; icon: React.ElementType }[]).map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => onMode(value)}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all",
            mode === value
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/40"
          )}
        >
          <Icon className={cn("w-4 h-4 shrink-0", mode === value ? "text-primary" : "text-muted-foreground")} />
          <span className={cn("text-xs font-semibold", mode === value ? "text-primary" : "text-foreground")}>
            {label}
          </span>
          {mode === value && <Check className="w-3.5 h-3.5 text-primary ml-auto" />}
        </button>
      ))}

      {mode === "tag" && (
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Tag</Label>
          <Input
            value={tag}
            onChange={(e) => onTag(e.target.value)}
            placeholder="ex: vip, comprador"
            className="h-8 text-sm"
          />
        </div>
      )}

      {mode === "rfm" && (
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Segmento</Label>
          <div className="space-y-1">
            {RFM_SEGMENTS.map((seg) => (
              <button
                key={seg.value}
                type="button"
                onClick={() => onRFM(seg.value)}
                className={cn(
                  "w-full px-3 py-1.5 rounded-lg text-xs font-medium text-left transition-colors",
                  rfm === seg.value ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground"
                )}
              >
                {seg.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SendConfirmModal ─────────────────────────────────────────────────────────

function SendConfirmModal({
  subject, recipientMode, recipientTag, recipientRFM,
  isSending, onConfirm, onClose,
}: {
  subject: string;
  recipientMode: RecipientMode;
  recipientTag: string;
  recipientRFM: string;
  isSending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const recipientLabel =
    recipientMode === "all" ? "toda a base de contatos" :
    recipientMode === "tag" ? `contatos com tag "${recipientTag}"` :
    `segmento RFM: ${RFM_SEGMENTS.find((s) => s.value === recipientRFM)?.label ?? recipientRFM}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background border rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-black text-base">Confirmar envio</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Esta ação não pode ser desfeita.</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-muted/40 rounded-xl p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Assunto</span>
            <span className="font-semibold truncate max-w-[160px]">{subject || "(sem assunto)"}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground shrink-0">Destinatários</span>
            <span className="font-semibold text-right">{recipientLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Canal</span>
            <span className="font-semibold">E-mail (Resend)</span>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={isSending}>
            Cancelar
          </Button>
          <Button className="flex-1 gap-2" onClick={onConfirm} disabled={isSending}>
            {isSending ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : <><Send className="w-4 h-4" /> Enviar agora</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
