import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Save, Send, Loader2, Users, Tag, Globe,
  Check, X, Bookmark, Library,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  type ColumnSlot,
  createDefaultBlocks,
  NEWSLETTER_TEMPLATES,
  type NewsletterTemplate,
} from "@/lib/newsletter-renderer";
import { trackMoatEvent } from "@/lib/moat-telemetry";

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
  const [preheader, setPreheader] = useState("");
  const [subjectVariantB, setSubjectVariantB] = useState("");
  const [abSubjectEnabled, setAbSubjectEnabled] = useState(false);
  const [name, setName] = useState("Newsletter");
  const [savedBlockName, setSavedBlockName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recipientMode, setRecipientMode] = useState<RecipientMode>("all");
  const [recipientTag, setRecipientTag] = useState("");
  const [recipientRFM, setRecipientRFM] = useState("champions");
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(!id);
  const [activePanel, setActivePanel] = useState<"blocks" | "settings">("blocks");
  const initialized = useRef(false);

  const { data: storeRow } = useQuery({
    queryKey: ["newsletter-store", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id,email_from_address,email_reply_to,brand_primary_color")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const [emailFromAddress, setEmailFromAddress] = useState("");
  const [emailReplyTo, setEmailReplyTo] = useState("");
  const [brandPrimaryColor, setBrandPrimaryColor] = useState("");
  const abSubjectEnabledRef = useRef(abSubjectEnabled);
  abSubjectEnabledRef.current = abSubjectEnabled;

  useEffect(() => {
    if (!storeRow) return;
    setEmailFromAddress(storeRow.email_from_address ?? "");
    setEmailReplyTo(storeRow.email_reply_to ?? "");
    setBrandPrimaryColor(storeRow.brand_primary_color ?? "");
  }, [storeRow]);

  const saveStoreIdentity = useMutation({
    mutationFn: async () => {
      if (!storeRow?.id) throw new Error("Loja não encontrada");
      const { error } = await supabase
        .from("stores")
        .update({
          email_from_address: emailFromAddress.trim() || null,
          email_reply_to: emailReplyTo.trim() || null,
          brand_primary_color: brandPrimaryColor.trim() || null,
        })
        .eq("id", storeRow.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Identidade de e-mail salva.");
      queryClient.invalidateQueries({ queryKey: ["newsletter-store"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: savedBlockRows = [] } = useQuery({
    queryKey: ["newsletter-saved-blocks", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("newsletter_saved_blocks")
        .select("id,name,blocks,created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const saveBlocksLibrary = useMutation({
    mutationFn: async (nameTrim: string) => {
      const { error } = await supabase.from("newsletter_saved_blocks").insert({
        user_id: user!.id,
        store_id: storeRow?.id ?? null,
        name: nameTrim,
        blocks: blocks as never,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Blocos salvos na biblioteca.");
      setSavedBlockName("");
      queryClient.invalidateQueries({ queryKey: ["newsletter-saved-blocks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Load existing draft ──────────────────────────────────────────────────────
  const { data: existingCampaign, isLoading } = useQuery({
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
      setPreheader((existingCampaign as any).preheader ?? "");
      setSubjectVariantB((existingCampaign as any).subject_variant_b ?? "");
      setAbSubjectEnabled(!!(existingCampaign as any).ab_subject_enabled);
      const mode = (existingCampaign as any).email_recipient_mode as RecipientMode | undefined;
      if (mode === "all" || mode === "tag" || mode === "rfm") setRecipientMode(mode);
      setRecipientTag((existingCampaign as any).email_recipient_tag ?? "");
      setRecipientRFM((existingCampaign as any).email_recipient_rfm ?? "champions");
      const loaded = (existingCampaign as any).blocks as Block[] | null;
      setBlocks(loaded && loaded.length > 0 ? loaded : createDefaultBlocks());
      setShowTemplateModal(false);
    }
  }, [existingCampaign]);

  // New newsletter: wait for template selection — blocks set in modal
  useEffect(() => {
    if (!campaignId && !initialized.current && !showTemplateModal) {
      initialized.current = true;
      setBlocks(createDefaultBlocks());
    }
  }, [campaignId, showTemplateModal]);

  // ── Autosave ─────────────────────────────────────────────────────────────────
  const debouncedBlocks = useDebounce(blocks, 3000);
  const debouncedSubject = useDebounce(subject, 3000);
  const debouncedName = useDebounce(name, 3000);
  const debouncedPreheader = useDebounce(preheader, 3000);
  const debouncedSubjectB = useDebounce(subjectVariantB, 3000);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (): Promise<string> => {
      const payload: Record<string, unknown> = {
        user_id: user!.id,
        store_id: storeRow?.id ?? null,
        name: debouncedName,
        channel: "email",
        subject: debouncedSubject,
        preheader: debouncedPreheader,
        subject_variant_b: abSubjectEnabledRef.current ? debouncedSubjectB : null,
        ab_subject_enabled: abSubjectEnabledRef.current && debouncedSubjectB.trim().length > 0,
        blocks: debouncedBlocks as unknown as Record<string, unknown>[],
        message: debouncedSubject || "Newsletter",
        email_recipient_mode: recipientMode,
        email_recipient_tag: recipientMode === "tag" ? (recipientTag || null) : null,
        email_recipient_rfm: recipientMode === "rfm" ? recipientRFM : null,
      };

      if (campaignId) {
        const { error } = await supabase
          .from("campaigns")
          .update(payload as never)
          .eq("id", campaignId)
          .eq("user_id", user!.id);
        if (error) throw error;
        setLastSaved(new Date());
        return campaignId;
      }
      const { data, error } = await supabase
        .from("campaigns")
        .insert({ ...payload, status: "draft" } as never)
        .select("id")
        .single();
      if (error) throw error;
      const newId = data.id as string;
      setCampaignId(newId);
      window.history.replaceState(null, "", `/dashboard/newsletter/${newId}`);
      setLastSaved(new Date());
      return newId;
    },
  });

  useEffect(() => {
    if (!initialized.current) return;
    saveMutation.mutate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debouncedBlocks, debouncedSubject, debouncedName, debouncedPreheader, debouncedSubjectB,
    abSubjectEnabled, storeRow?.id, recipientMode, recipientTag, recipientRFM,
  ]);

  // ── Recipient count ──────────────────────────────────────────────────────────
  const debouncedTag = useDebounce(recipientTag, 600);

  const { data: recipientCount, isFetching: countFetching } = useQuery({
    queryKey: ["newsletter_recipient_count", recipientMode, debouncedTag, recipientRFM, user?.id],
    queryFn: async () => {
      let query = (supabase as any)
        .from("customers_v3")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .not("email", "is", null)
        .is("unsubscribed_at", null)
        .is("email_hard_bounce_at", null)
        .is("email_complaint_at", null);

      if (recipientMode === "tag" && debouncedTag) {
        query = query.contains("tags", [debouncedTag]);
      } else if (recipientMode === "rfm") {
        query = query.eq("rfm_segment", recipientRFM);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count as number ?? 0;
    },
    enabled: !!user,
  });

  // ── Send ─────────────────────────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: async (scheduledAt?: string) => {
      const id = await saveMutation.mutateAsync();
      if (!id) throw new Error("Erro ao salvar.");

      if (scheduledAt) {
        const { error } = await supabase
          .from("campaigns")
          .update({
            status: "scheduled",
            scheduled_at: scheduledAt,
            email_recipient_mode: recipientMode,
            email_recipient_tag: recipientMode === "tag" ? (recipientTag || null) : null,
            email_recipient_rfm: recipientMode === "rfm" ? recipientRFM : null,
          } as never)
          .eq("id", id);
        if (error) throw error;
        return { scheduled: true };
      }

      const { data, error } = await supabase.functions.invoke("dispatch-newsletter", {
        body: {
          campaign_id: id,
          recipient_mode: recipientMode,
          recipient_tag: recipientMode === "tag" ? recipientTag : undefined,
          recipient_rfm: recipientMode === "rfm" ? recipientRFM : undefined,
        },
      });
      if (error) throw error;
      return data as { sent: number; failed: number };
    },
    onSuccess: (data: any) => {
      void trackMoatEvent("newsletter_sent", {
        mode: recipientMode,
        scheduled: Boolean(data?.scheduled),
        recipients: recipientCount ?? 0,
      });
      if (data?.scheduled) {
        toast.success("Newsletter agendada com sucesso!");
      } else {
        toast.success(`Newsletter enviada! ${data.sent} destinatários.`);
      }
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      navigate("/dashboard/campanhas");
    },
    onError: (err: Error) => {
      toast.error(`Erro ao enviar: ${err.message}`);
    },
  });

  const testSendMutation = useMutation({
    mutationFn: async (testEmail: string) => {
      const id = await saveMutation.mutateAsync();
      if (!id) throw new Error("Erro ao salvar antes do envio de teste.");
      const { data, error } = await supabase.functions.invoke("dispatch-newsletter", {
        body: { campaign_id: id, recipient_mode: "test", test_email: testEmail },
      });
      if (error) throw error;
      return data as { sent: number };
    },
    onSuccess: () => {
      void trackMoatEvent("newsletter_sent", { mode: "test" });
      toast.success("E-mail de teste enviado!");
    },
    onError: (err: Error) => toast.error(`Erro no teste: ${err.message}`),
  });

  // ── Block operations ──────────────────────────────────────────────────────────
  const selectedBlock = blocks.find((b) => b.id === selectedId) ?? null;

  const addBlock = useCallback((type: BlockType) => {
    const emptySlot: ColumnSlot = { imageUrl: "", title: "", text: "", buttonLabel: "", buttonUrl: "" };
    const defaults: Record<BlockType, Block["data"]> = {
      header:  { title: "Novo título", subtitle: "" },
      text:    { content: "Digite seu texto aqui..." },
      image:   { url: "", alt: "", href: "" },
      button:  { label: "Clique aqui", url: "https://", color: "primary" },
      divider: {} as Record<string, never>,
      spacer:  { height: 24 },
      product: { imageUrl: "", name: "Produto", price: "R$ 99,90", oldPrice: "", buttonLabel: "Comprar", buttonUrl: "https://" },
      columns: { left: { ...emptySlot, title: "Coluna 1" }, right: { ...emptySlot, title: "Coluna 2" } },
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

        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-7 text-xs font-semibold w-36 shrink-0"
              placeholder="Nome interno"
            />
            <span className="text-muted-foreground/40 text-sm">·</span>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-7 text-xs flex-1"
              placeholder="Assunto do e-mail"
            />
          </div>
            <Input
              value={preheader}
              onChange={(e) => setPreheader(e.target.value)}
              className="h-6 text-[11px] text-muted-foreground"
              placeholder="Preheader — texto de prévia que aparece após o assunto no Gmail/iOS..."
            />
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <div className="flex items-center gap-2">
              <Switch id="ab-subject" checked={abSubjectEnabled} onCheckedChange={setAbSubjectEnabled} />
              <Label htmlFor="ab-subject" className="text-[11px] font-medium cursor-pointer">Teste A/B de assunto</Label>
            </div>
            {abSubjectEnabled && (
              <Input
                value={subjectVariantB}
                onChange={(e) => setSubjectVariantB(e.target.value)}
                className="h-6 text-[11px] flex-1 min-w-[200px]"
                placeholder="Assunto variante B (metade da lista recebe cada um)"
              />
            )}
          </div>
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

          <div className="p-3 space-y-4">
            {activePanel === "blocks" ? (
              <>
                <BlockPalette onAdd={addBlock} />
                <div className="pt-2 border-t space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                    <Library className="w-3 h-3" /> Biblioteca
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={savedBlockName}
                      onChange={(e) => setSavedBlockName(e.target.value)}
                      placeholder="Nome do conjunto"
                      className="h-8 text-xs flex-1"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0 px-2"
                      disabled={!savedBlockName.trim() || blocks.length === 0 || saveBlocksLibrary.isPending}
                      onClick={() => saveBlocksLibrary.mutate(savedBlockName.trim())}
                    >
                      {saveBlocksLibrary.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bookmark className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                  {savedBlockRows.length > 0 && (
                    <Select
                      onValueChange={(id) => {
                        const row = savedBlockRows.find((r: { id: string }) => r.id === id);
                        if (!row?.blocks) return;
                        const loaded = row.blocks as unknown as Block[];
                        if (Array.isArray(loaded) && loaded.length > 0) {
                          setBlocks(loaded);
                          toast.success(`Blocos “${row.name}” aplicados.`);
                        }
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Carregar blocos salvos…" />
                      </SelectTrigger>
                      <SelectContent>
                        {savedBlockRows.map((r: { id: string; name: string }) => (
                          <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <RecipientPanel
                  mode={recipientMode}
                  tag={recipientTag}
                  rfm={recipientRFM}
                  onMode={setRecipientMode}
                  onTag={setRecipientTag}
                  onRFM={setRecipientRFM}
                  count={recipientCount}
                  countFetching={countFetching}
                />
                <div className="pt-3 border-t space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Identidade do remetente</p>
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    Configure o domínio no Resend. Endereço completo (ex.: boasvindas@sualoja.com).
                  </p>
                  <Label className="text-[10px] uppercase text-muted-foreground">From (e-mail)</Label>
                  <Input
                    value={emailFromAddress}
                    onChange={(e) => setEmailFromAddress(e.target.value)}
                    placeholder="notificacoes@sualoja.com"
                    className="h-8 text-xs"
                  />
                  <Label className="text-[10px] uppercase text-muted-foreground">Reply-To</Label>
                  <Input
                    value={emailReplyTo}
                    onChange={(e) => setEmailReplyTo(e.target.value)}
                    placeholder="suporte@sualoja.com"
                    className="h-8 text-xs"
                  />
                  <Label className="text-[10px] uppercase text-muted-foreground">Cor primária (hex)</Label>
                  <Input
                    value={brandPrimaryColor}
                    onChange={(e) => setBrandPrimaryColor(e.target.value)}
                    placeholder="#7c3aed"
                    className="h-8 text-xs font-mono"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="w-full h-8 text-xs"
                    disabled={saveStoreIdentity.isPending || !storeRow?.id}
                    onClick={() => saveStoreIdentity.mutate()}
                  >
                    {saveStoreIdentity.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Salvar identidade"}
                  </Button>
                </div>
              </div>
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
              <BlockSettings block={selectedBlock} onChange={updateBlock} storeId={storeRow?.id ?? null} />
            </div>
          )}

          {/* Email preview */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <div className="px-4 pt-3 pb-1 shrink-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Preview</p>
            </div>
            <div className="flex-1 px-4 pb-4 overflow-hidden">
              <EmailPreview
                blocks={blocks}
                subject={subject}
                preheader={preheader}
                previewFromEmail={emailFromAddress}
                brandPrimaryHex={brandPrimaryColor}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Template picker modal ── */}
      {showTemplateModal && (
        <TemplateModal
          onSelect={(tpl) => {
            void trackMoatEvent("playbook_applied", { playbook: `newsletter_template:${tpl.id}` });
            initialized.current = true;
            setBlocks(tpl.blocks());
            setShowTemplateModal(false);
          }}
          onClose={() => setShowTemplateModal(false)}
        />
      )}

      {/* ── Send confirmation modal ── */}
      {showSendConfirm && (
        <SendConfirmModal
          subject={subject}
          recipientMode={recipientMode}
          recipientTag={recipientTag}
          recipientRFM={recipientRFM}
          recipientCount={recipientCount}
          isSending={sendMutation.isPending}
          isTestSending={testSendMutation.isPending}
          onConfirm={(scheduledAt) => sendMutation.mutate(scheduledAt)}
          onTestSend={(email) => testSendMutation.mutate(email)}
          onClose={() => setShowSendConfirm(false)}
        />
      )}
    </div>
  );
}

// ─── TemplateModal ────────────────────────────────────────────────────────────

function TemplateModal({
  onSelect,
  onClose,
}: {
  onSelect: (tpl: NewsletterTemplate) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background border rounded-2xl shadow-2xl w-full max-w-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-black text-base">Escolha um template</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Comece com uma estrutura pronta ou em branco.</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {NEWSLETTER_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => onSelect(tpl)}
              className="flex flex-col items-start gap-2 p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-all text-left group"
            >
              <span className="text-2xl">{tpl.emoji}</span>
              <div>
                <p className="text-sm font-bold group-hover:text-primary transition-colors">{tpl.name}</p>
                <p className="text-[11px] text-muted-foreground">{tpl.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── RecipientPanel ────────────────────────────────────────────────────────────

function RecipientPanel({
  mode, tag, rfm,
  onMode, onTag, onRFM,
  count, countFetching,
}: {
  mode: RecipientMode; tag: string; rfm: string;
  onMode: (m: RecipientMode) => void;
  onTag: (t: string) => void;
  onRFM: (r: string) => void;
  count?: number;
  countFetching?: boolean;
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

      {/* Contagem estimada */}
      <div className="pt-2 border-t border-border">
        {countFetching ? (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Calculando...
          </p>
        ) : (
          <p className="text-[10px] text-muted-foreground">
            <span className="font-bold text-foreground">{count?.toLocaleString("pt-BR") ?? "—"}</span>{" "}
            contatos receberão
          </p>
        )}
      </div>
    </div>
  );
}

// ─── SendConfirmModal ─────────────────────────────────────────────────────────

function SendConfirmModal({
  subject, recipientMode, recipientTag, recipientRFM,
  recipientCount, isSending, isTestSending, onConfirm, onTestSend, onClose,
}: {
  subject: string;
  recipientMode: RecipientMode;
  recipientTag: string;
  recipientRFM: string;
  recipientCount?: number;
  isSending: boolean;
  isTestSending: boolean;
  onConfirm: (scheduledAt?: string) => void;
  onTestSend: (email: string) => void;
  onClose: () => void;
}) {
  const [testEmail, setTestEmail] = useState("");
  const [sendMode, setSendMode] = useState<"now" | "schedule">("now");
  const [scheduledAt, setScheduledAt] = useState("");

  // Min datetime = now + 5 min
  const minDatetime = new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16);

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
            <p className="text-xs text-muted-foreground mt-0.5">Revise antes de disparar.</p>
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
          {recipientCount !== undefined && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total estimado</span>
              <span className="font-semibold">{recipientCount.toLocaleString("pt-BR")} contatos</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Canal</span>
            <span className="font-semibold">E-mail (Resend)</span>
          </div>
        </div>

        {/* Test send */}
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Enviar teste</p>
          <div className="flex gap-2">
            <Input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)}
              placeholder="seu@email.com" className="h-8 text-sm flex-1" />
            <Button size="sm" variant="outline" className="h-8 shrink-0"
              disabled={!testEmail || isTestSending} onClick={() => onTestSend(testEmail)}>
              {isTestSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Testar"}
            </Button>
          </div>
        </div>

        {/* Send mode toggle */}
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Quando enviar</p>
          <div className="flex rounded-xl border overflow-hidden">
            {(["now", "schedule"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setSendMode(m)}
                className={cn("flex-1 py-2 text-xs font-bold transition-colors",
                  sendMode === m ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")}>
                {m === "now" ? "Agora" : "Agendar"}
              </button>
            ))}
          </div>
          {sendMode === "schedule" && (
            <Input type="datetime-local" value={scheduledAt} min={minDatetime}
              onChange={(e) => setScheduledAt(e.target.value)} className="h-8 text-sm" />
          )}
        </div>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={isSending}>Cancelar</Button>
          <Button className="flex-1 gap-2" disabled={isSending || (sendMode === "schedule" && !scheduledAt)}
            onClick={() => onConfirm(sendMode === "schedule" ? scheduledAt : undefined)}>
            {isSending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> {sendMode === "schedule" ? "Agendando..." : "Enviando..."}</>
              : <><Send className="w-4 h-4" /> {sendMode === "schedule" ? "Agendar" : "Enviar agora"}</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
