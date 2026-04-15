
import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight, ChevronLeft, Loader2, Check, Sparkles,
  Zap, Trophy,
  Megaphone, Play, ShoppingCart, Target,
  MousePointer2, Plus, Info, Package, CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/lib/supabase";
import { assertAiRateLimit, RateLimitError } from "@/lib/rate-limiter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { buildMagicLink, EcommercePlatform } from "@/lib/checkout-builder";
// mockProdutos removed — unused
import { useLoja } from "@/hooks/useConvertIQ";
/** Shape of the store record returned by useLoja() */
type LojaExtended = {
  id: string;
  name?: string | null;
  url?: string | null;
  plataforma?: string | null;
  segment?: string | null;
  user_id?: string | null;
  ticket_medio?: number | null;
  meta_conversao?: number | null;
  [key: string]: unknown;
};
import { useProductsV3 as useProdutosV3, type ProductRow } from "@/hooks/useLTVBoost";
import type { Json } from "@/integrations/supabase/types";
import { contactMatchesEnglishRfmSegment, type RfmEnglishSegment } from "@/lib/rfm-segments";
import { CAMPAIGN_LIST_SELECT, CAMPAIGN_MESSAGE_TEMPLATE_SELECT } from "@/lib/supabase-select-fragments";
import { useStoreScopeOptional } from "@/contexts/StoreScopeContext";

export type ProdutoParaCampanha = {
  id: string;
  nome: string;
  sku?: string | null;
  preco?: number | null;
  estoque?: number | null;
};

type AiCopyVariation = { label: string; text: string };

function parseWaContentType(v: unknown): "text" | "image" | "video" | "audio" | "document" | "template" {
  if (v === "image" || v === "video" || v === "audio" || v === "document" || v === "template" || v === "text") {
    return v;
  }
  return "text";
}

function gerarMensagemProdutos(
  mode: "single" | "collection",
  products: ProdutoParaCampanha[],
  collectionName: string,
  coupon: string,
  lojaUrl: string,
  lojaPlatforma: string,
): string {
  const fmt = (preco?: number | null) =>
    preco != null ? `R$ ${preco.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "Consulte o preço";

  const link = (p: ProdutoParaCampanha) => {
    if (!p.sku || !lojaUrl) return lojaUrl || "";
    try {
      return buildMagicLink({
        platform: (lojaPlatforma === "outro" ? "custom" : lojaPlatforma.toLowerCase()) as EcommercePlatform,
        storeUrl: lojaUrl,
        cartItems: [{ id: p.sku, quantity: 1 }],
        utmSource: "ltv_boost",
      });
    } catch { return lojaUrl; }
  };

  if (mode === "single" && products.length > 0) {
    const p = products[0];
    const estoqueAviso = (p.estoque ?? 999) < 20 && p.estoque != null
      ? `🔥 Apenas ${p.estoque} no estoque!\n\n` : "";
    return `✨ *${p.nome}*\n\n${estoqueAviso}Preço: *${fmt(p.preco)}*\n\n👉 Comprar agora:\n${link(p)}`;
  }

  if (mode === "collection" && products.length > 0) {
    const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];
    const header = `🛍️ *${collectionName || "Nova Coleção"}*\n\n`;
    const items = products
      .map((p, i) => `${emojis[i]} *${p.nome}* — ${fmt(p.preco)}\n   👉 ${link(p)}`)
      .join("\n\n");
    const couponLine = coupon ? `\n\nUse *${coupon}* e ganhe desconto exclusivo 🎁` : "";
    return header + items + couponLine;
  }

  return "";
}

const schema = z.object({
  name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
  channel: z.enum(["whatsapp", "email", "sms"]).default("whatsapp"),
  objective: z.enum(["recovery", "rebuy", "loyalty", "lancamento"]).default("recovery"),
  subject: z.string().optional(),
  message: z.string().min(10, "Mensagem deve ter pelo menos 10 caracteres"),
  segment: z.enum([
    "all", "active", "inactive", "vip", "cart_abandoned",
    "rfm_champions", "rfm_loyal", "rfm_at_risk", "rfm_lost", "rfm_new",
  ]),
  scheduled_at: z.string().optional(),
  send_now: z.boolean().default(true),
  ai_context: z.string().optional(),
  ai_tone: z.string().default("friendly"),
  magic_link_product: z.string().optional(),
  magic_link_coupon: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const OBJECTIVES = [
  { value: "recovery",  label: "Recuperar Vendas",  desc: "Carrinhos e boletos abandonados.",          icon: Zap,      color: "text-amber-500" },
  { value: "rebuy",     label: "Gerar Recompra",    desc: "Estimular clientes a voltarem.",             icon: ShoppingCart, color: "text-primary" },
  { value: "loyalty",   label: "Fidelizar VIPs",   desc: "Ofertas exclusivas para melhores clientes.", icon: Trophy,   color: "text-purple-500" },
  { value: "lancamento",label: "Lançar Produto",    desc: "Divulgue produtos e novas coleções.",        icon: Package,  color: "text-pink-500" },
] as const;

const QUICK_TEMPLATES: Record<"recovery" | "rebuy" | "loyalty" | "lancamento", string[]> = {
  recovery: [
    "Oi {{nome}}! Seu carrinho ainda está reservado. Quer que eu te envie um atalho para finalizar agora? {{link}}",
    "Percebi que você quase concluiu seu pedido. Posso te ajudar com frete, prazo ou pagamento? {{link}}",
  ],
  rebuy: [
    "{{nome}}, seu último pedido fez sucesso? Tenho uma sugestão para reposição com entrega rápida.",
    "Hora de repor seus favoritos? Separei uma seleção com melhor custo-benefício para você.",
  ],
  loyalty: [
    "{{nome}}, você está no grupo VIP da loja e liberamos uma condição exclusiva por 24h.",
    "Oferta VIP para você: atendimento prioritário e benefício especial no próximo pedido.",
  ],
  lancamento: [
    "Chegou novidade por aqui! {{nome}}, veja a nova coleção antes de todo mundo.",
    "Lançamento liberado com estoque limitado. Quer o link de compra rápida?",
  ],
};

export type CampaignPrefill = {
  name?: string;
  message?: string;
  objective?: "recovery" | "rebuy" | "loyalty" | "lancamento";
  channel?: "whatsapp" | "email" | "sms";
  segment?: "all" | "active" | "inactive" | "vip" | "cart_abandoned";
  /** Segmento RFM em inglês (champions, loyal, …) — preenche o formulário com o radio RFM correspondente */
  rfmSegment?: RfmEnglishSegment;
  /** Se true, pula o passo 0 (objetivo) e vai direto para mensagem */
  skipObjective?: boolean;
  /** Badge exibido no topo do modal */
  source?: string;
  /** Prescrição da Central — atualizada para "aprovada" após salvar rascunho da campanha */
  prescriptionId?: string;
};

const EMPTY_SEGMENT_COUNTS = {
  all: 0, active: 0, inactive: 0, vip: 0, cart_abandoned: 0,
  rfm_champions: 0, rfm_loyal: 0, rfm_at_risk: 0, rfm_lost: 0, rfm_new: 0,
};

const LAUNCH_SEGMENT_META: { value: FormData["segment"]; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
  { value: "vip", label: "VIP (campeões + fiéis)" },
  { value: "cart_abandoned", label: "Carrinho abandonado" },
  { value: "rfm_champions", label: "RFM — Campeões" },
  { value: "rfm_loyal", label: "RFM — Fiéis" },
  { value: "rfm_at_risk", label: "RFM — Em risco" },
  { value: "rfm_lost", label: "RFM — Perdidos" },
  { value: "rfm_new", label: "RFM — Novos" },
];

const RFM_DB_TO_FORM: Record<string, FormData["segment"]> = {
  champions: "rfm_champions",
  loyal: "rfm_loyal",
  at_risk: "rfm_at_risk",
  lost: "rfm_lost",
  new: "rfm_new",
};

function segmentFromServerRow(seg: { type?: string; filters?: Record<string, unknown> } | null | undefined): FormData["segment"] {
  if (!seg?.filters) return "all";
  const f = seg.filters;
  if (seg.type === "rfm" && typeof f.rfm_segment === "string") {
    const mapped = RFM_DB_TO_FORM[f.rfm_segment];
    if (mapped) return mapped;
  }
  const key = String(f.segment_key ?? "all");
  if (key === "vip" || key === "active" || key === "inactive" || key === "cart_abandoned" || key === "all") {
    return key as FormData["segment"];
  }
  return "all";
}

export default function CampaignModal({
  onClose,
  initialProducts,
  initialObjective,
  prefill,
  whatsappOnly,
  editingCampaignId,
}: {
  onClose: () => void;
  initialProducts?: ProdutoParaCampanha[];
  initialObjective?: "recovery" | "rebuy" | "lancamento" | "loyalty";
  prefill?: CampaignPrefill;
  /** Na página Campanhas só WhatsApp (e-mail = Newsletter). */
  whatsappOnly?: boolean;
  editingCampaignId?: string;
}) {
  const [step, setStep] = useState(prefill?.skipObjective ? 1 : 0);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiVariations, setAiVariations] = useState<AiCopyVariation[]>([]);
  const [showMagicLink, setShowMagicLink] = useState(false);
  const [magicSku, setMagicSku] = useState("");
  const [magicQty, setMagicQty] = useState("1");
  const [magicCoupon, setMagicCoupon] = useState("");
  const [waContentType, setWaContentType] = useState<"text" | "image" | "video" | "audio" | "document" | "template">("text");
  const [waMediaUrl, setWaMediaUrl] = useState("");
  const [waButtonLabel, setWaButtonLabel] = useState("");
  const [waButtonUrl, setWaButtonUrl] = useState("");
  /** Nome exato do template aprovado na Meta (Cloud API), para campanhas fora da janela de 24h */
  const [waMetaTemplateName, setWaMetaTemplateName] = useState("");
  const [templateName, setTemplateName] = useState("");

  // Product campaign state
  const [campaignMode, setCampaignMode] = useState<"single" | "collection">(
    initialProducts && initialProducts.length > 1 ? "collection" : "single"
  );
  const [selectedProducts, setSelectedProducts] = useState<ProdutoParaCampanha[]>(initialProducts ?? []);
  const [collectionName, setCollectionName] = useState("");
  const [prodCoupon, setProdCoupon] = useState("");

  const { user, profile } = useAuth();
  const scope = useStoreScopeOptional();
  const loja = useLoja();
  const lojaData = (loja.data as LojaExtended | null) ?? null;
  const produtosQuery = useProdutosV3(loja.data?.id ?? undefined, { pageSize: 150 });
  const editHydratedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!editingCampaignId) editHydratedRef.current = null;
  }, [editingCampaignId]);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [confirmClose, setConfirmClose] = useState(false);

  const { register, handleSubmit, watch, setValue, trigger, reset, formState: { errors, isDirty } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      channel: whatsappOnly ? "whatsapp" : (prefill?.channel ?? "whatsapp"),
      segment: prefill?.rfmSegment
        ? (`rfm_${prefill.rfmSegment}` as FormData["segment"])
        : (prefill?.segment ?? "all"),
      objective: prefill?.objective ?? initialObjective ?? "recovery",
      message: prefill?.message ?? "",
      name: prefill?.name ?? "",
      send_now: true,
      ai_tone: "friendly",
    },
  });

  const { data: editBundle, isLoading: editLoading } = useQuery({
    queryKey: ["campaign_edit_bundle", editingCampaignId],
    enabled: !!editingCampaignId && !!user?.id,
    queryFn: async () => {
      const { data: camp, error } = await supabase.from("campaigns").select(CAMPAIGN_LIST_SELECT).eq("id", editingCampaignId).single();
      if (error) throw error;
      const { data: seg } = await supabase.from("campaign_segments").select("type,filters").eq("campaign_id", editingCampaignId).maybeSingle();
      return { camp, seg } as {
        camp: Record<string, unknown>;
        seg: { type?: string; filters?: Record<string, unknown> } | null;
      };
    },
  });

  useEffect(() => {
    if (!whatsappOnly) return;
    setValue("channel", "whatsapp");
  }, [whatsappOnly, setValue]);

  useEffect(() => {
    if (!editingCampaignId || !editBundle?.camp) return;
    if (editHydratedRef.current === editingCampaignId) return;
    editHydratedRef.current = editingCampaignId;
    const c = editBundle.camp;
    const seg = segmentFromServerRow(editBundle.seg ?? null);
    const blocks = (c.blocks as { whatsapp?: Record<string, unknown> } | null)?.whatsapp ?? {};
    setWaContentType((String(blocks.content_type ?? "text") || "text") as typeof waContentType);
    setWaMediaUrl(String(blocks.media_url ?? ""));
    const btnArr = Array.isArray(blocks.buttons) ? (blocks.buttons as Array<{ label?: string; value?: string }>) : [];
    const b0 = btnArr[0];
    setWaButtonLabel(b0?.label ?? "");
    setWaButtonUrl(b0?.value ?? "");
    setWaMetaTemplateName(String(blocks.meta_template_name ?? ""));
    reset({
      name: String(c.name ?? ""),
      message: String(c.message ?? ""),
      channel: "whatsapp",
      objective: (prefill?.objective ?? initialObjective ?? "recovery") as FormData["objective"],
      segment: seg,
      subject: String(c.subject ?? ""),
      scheduled_at: (c.scheduled_at as string) ?? "",
      send_now: true,
      ai_context: "",
      ai_tone: "friendly",
      magic_link_product: "",
      magic_link_coupon: "",
    });
    setStep(1);
  }, [editingCampaignId, editBundle, initialObjective, prefill?.objective, reset]);

  // C7: Draft auto-save — persist form values to localStorage every 30 s (new campaigns only)
  const draftKey = user?.id && !editingCampaignId ? `campaignDraft:${user.id}` : null;
  const watchedValues = watch();

  useEffect(() => {
    if (!draftKey || !isDirty) return;
    const saved = JSON.parse(localStorage.getItem(draftKey) ?? "null") as FormData | null;
    if (saved && Object.keys(saved).length > 0) {
      reset(saved, { keepDefaultValues: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]); // only on mount

  useEffect(() => {
    if (!draftKey || !isDirty) return;
    const id = setInterval(() => {
      localStorage.setItem(draftKey, JSON.stringify(watchedValues));
    }, 30_000);
    return () => clearInterval(id);
  }, [draftKey, isDirty, watchedValues]);

  // C7: Guard close — show confirmation if form is dirty
  const handleClose = () => {
    if (isDirty && step > 0) {
      setConfirmClose(true);
    } else {
      if (draftKey) localStorage.removeItem(draftKey);
      onClose();
    }
  };

  const { data: segmentCounts = EMPTY_SEGMENT_COUNTS } = useQuery({
    queryKey: ["campaign_modal_segment_counts", loja.data?.id, user?.id],
    queryFn: async () => {
      const hintStoreId = loja.data?.id;
      if (!hintStoreId) return EMPTY_SEGMENT_COUNTS;
      const storeId = scope?.activeStoreId ?? hintStoreId;
      const effectiveUserId = scope?.effectiveUserId ?? null;
      if (!storeId || !effectiveUserId) return EMPTY_SEGMENT_COUNTS;

      const [{ data: rpcData, error: rpcErr }, { count: cartCount, error: cartErr }] = await Promise.all([
        supabase.rpc("get_rfm_report_counts", { p_store_id: storeId, p_owner_user_id: effectiveUserId }),
        supabase.from("abandoned_carts").select("id", { count: "exact", head: true }).eq("store_id", storeId).in("status", ["pending", "open"]),
      ]);
      if (cartErr) throw cartErr;

      if (!rpcErr && rpcData && typeof rpcData === "object") {
        const j = rpcData as Record<string, unknown>;
        const champions = Number(j.champions ?? 0);
        const loyal = Number(j.loyal ?? 0);
        const atRisk = Number(j.at_risk ?? 0);
        const lost = Number(j.lost ?? 0);
        const newSeg = Number(j.new ?? 0);
        return {
          ...EMPTY_SEGMENT_COUNTS,
          all: Number(j.total ?? 0),
          cart_abandoned: cartCount ?? 0,
          rfm_champions: champions,
          rfm_loyal: loyal,
          rfm_at_risk: atRisk,
          rfm_lost: lost,
          rfm_new: newSeg,
          active: champions + loyal + newSeg,
          inactive: atRisk + lost,
          vip: champions + loyal,
        };
      }

      console.warn(
        "[CampaignModal] get_rfm_report_counts indisponível — fallback por linha (aplique migrações no Supabase).",
        rpcErr?.message ?? rpcErr,
      );
      const { data: rows, error } = await supabase.from("customers_v3").select("rfm_segment").eq("store_id", storeId);
      if (error) throw error;
      const list = rows ?? [];
      const c = { ...EMPTY_SEGMENT_COUNTS };
      c.all = list.length;
      c.cart_abandoned = cartCount ?? 0;
      for (const r of list) {
        const raw = (r as { rfm_segment: string | null }).rfm_segment;
        if (contactMatchesEnglishRfmSegment(raw, "champions")) c.rfm_champions++;
        if (contactMatchesEnglishRfmSegment(raw, "loyal")) c.rfm_loyal++;
        if (contactMatchesEnglishRfmSegment(raw, "at_risk")) c.rfm_at_risk++;
        if (contactMatchesEnglishRfmSegment(raw, "lost")) c.rfm_lost++;
        if (contactMatchesEnglishRfmSegment(raw, "new")) c.rfm_new++;
      }
      c.active = list.filter((r) => {
        const raw = (r as { rfm_segment: string | null }).rfm_segment;
        return (["champions", "loyal", "new"] as RfmEnglishSegment[]).some((k) => contactMatchesEnglishRfmSegment(raw, k));
      }).length;
      c.inactive = list.filter((r) => {
        const raw = (r as { rfm_segment: string | null }).rfm_segment;
        return (["at_risk", "lost"] as RfmEnglishSegment[]).some((k) => contactMatchesEnglishRfmSegment(raw, k));
      }).length;
      c.vip = list.filter((r) => {
        const raw = (r as { rfm_segment: string | null }).rfm_segment;
        return contactMatchesEnglishRfmSegment(raw, "champions") || contactMatchesEnglishRfmSegment(raw, "loyal");
      }).length;
      return c;
    },
    enabled: !!loja.data?.id && !!user,
    staleTime: 30_000,
  });

  const channel = watch("channel");
  const message = watch("message") ?? "";
  const objective = watch("objective");
  const watchedName = watch("name");

  const { data: savedTemplates = [] } = useQuery({
    queryKey: ["campaign_message_templates", user?.id, channel, objective],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("campaign_message_templates")
        .select(CAMPAIGN_MESSAGE_TEMPLATE_SELECT)
        .eq("user_id", user.id)
        .eq("channel", channel)
        .eq("objective", objective)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!channel && !!objective,
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Não autenticado");
      if (!templateName.trim()) throw new Error("Informe um nome para o template");
      if (!message.trim()) throw new Error("Escreva uma mensagem antes de salvar");
      const { error } = await supabase.from("campaign_message_templates").insert({
        user_id: user.id,
        store_id: lojaData?.id ?? null,
        name: templateName.trim(),
        objective,
        channel,
        message,
        whatsapp_config: channel === "whatsapp"
          ? {
            content_type: waContentType,
            media_url: waMediaUrl || null,
            meta_template_name: waMetaTemplateName.trim() || null,
            buttons: waContentType === "template" && waButtonLabel && waButtonUrl
              ? [{ type: "url", label: waButtonLabel, value: waButtonUrl }]
              : [],
          }
          : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Template salvo!" });
      setTemplateName("");
      queryClient.invalidateQueries({ queryKey: ["campaign_message_templates"] });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao salvar template", description: err.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const isEdit = !!editingCampaignId;
      if (!user) throw new Error("Não autenticado");
      if (!lojaData?.id) {
        throw new Error("Associe uma loja antes de salvar (configure em Funil / dados da loja).");
      }
      const prescriptionId = prefill?.prescriptionId;
      const channelSave = whatsappOnly ? "whatsapp" : data.channel;
      const tags = (() => {
        if (data.segment === "all") return [];
        if (data.segment.startsWith("rfm_")) {
          const key = data.segment.replace("rfm_", "");
          return ["rfm", key];
        }
        return [data.segment];
      })();
      const blocksPayload = channelSave === "whatsapp"
        ? {
          whatsapp: {
            content_type: waContentType,
            media_url: waMediaUrl || null,
            meta_template_name: waMetaTemplateName.trim() || null,
            buttons: waContentType === "template" && waButtonLabel && waButtonUrl
              ? [{ type: "url", label: waButtonLabel, value: waButtonUrl }]
              : [],
          },
        }
        : null;

      let campaignId: string | undefined;

      if (isEdit && editingCampaignId) {
        const { error: upErr } = await supabase.from("campaigns").update({
          store_id: lojaData.id,
          name: data.name || `Campanha ${new Date().toLocaleDateString("pt-BR")}`,
          message: data.message,
          channel: channelSave,
          subject: data.subject ?? null,
          tags,
          blocks: blocksPayload,
        }).eq("id", editingCampaignId).eq("user_id", user.id);
        if (upErr) throw upErr;
        campaignId = editingCampaignId;
      } else {
        const { data: inserted, error } = await supabase.from("campaigns").insert([{
          user_id: user.id,
          store_id: lojaData.id,
          name: data.name || `Campanha ${new Date().toLocaleDateString("pt-BR")}`,
          message: data.message,
          channel: channelSave,
          subject: data.subject ?? null,
          source_prescription_id: prescriptionId ?? null,
          tags,
          status: "draft",
          total_contacts: 0,
          sent_count: 0,
          delivered_count: 0,
          read_count: 0,
          reply_count: 0,
          blocks: blocksPayload,
        }]).select("id").single();
        if (error) throw error;
        campaignId = inserted?.id as string | undefined;
      }

      if (!campaignId) return { isEdit };

      if (!isEdit && prescriptionId) {
        const { error: prErr } = await supabase
          .from("prescriptions")
          .update({ status: "aprovada" })
          .eq("id", prescriptionId)
          .eq("user_id", user!.id);
        if (prErr) console.warn("prescription status update:", prErr.message);
        try {
          const n = parseInt(localStorage.getItem("ltv_prescricoes_aprovadas") ?? "0", 10);
          localStorage.setItem("ltv_prescricoes_aprovadas", String(n + 1));
        } catch { /* ignore */ }
      }

      const segmentPayload = (() => {
        switch (data.segment) {
          case "rfm_champions":
            return { type: "rfm", filters: { rfm_segment: "champions", holdout_pct: 10 } };
          case "rfm_loyal":
            return { type: "rfm", filters: { rfm_segment: "loyal", holdout_pct: 10 } };
          case "rfm_at_risk":
            return { type: "rfm", filters: { rfm_segment: "at_risk", holdout_pct: 10 } };
          case "rfm_lost":
            return { type: "rfm", filters: { rfm_segment: "lost", holdout_pct: 10 } };
          case "rfm_new":
            return { type: "rfm", filters: { rfm_segment: "new", holdout_pct: 10 } };
          case "vip":
            return { type: "rfm", filters: { segment_key: "vip", rfm_segment: "champions", holdout_pct: 10 } };
          case "active":
            return { type: "custom", filters: { segment_key: "active", cooldown_hours: 48, min_expected_value: 15 } };
          case "inactive":
            return { type: "custom", filters: { segment_key: "inactive", cooldown_hours: 24, min_expected_value: 0 } };
          case "cart_abandoned":
            return { type: "custom", filters: { segment_key: "cart_abandoned", require_abandoned_cart: true, holdout_pct: 15 } };
          default:
            return { type: "custom", filters: { segment_key: "all" } };
        }
      })();

      await supabase.from("campaign_segments").delete().eq("campaign_id", campaignId);
      const { error: segErr } = await supabase.from("campaign_segments").insert({
        campaign_id: campaignId,
        type: segmentPayload.type,
        filters: segmentPayload.filters as Json,
      });
      if (segErr) throw segErr;
      return { isEdit };
    },
    onSuccess: (res) => {
      const isEdit = Boolean(res?.isEdit);
      toast({
        title: isEdit ? "Campanha atualizada!" : "Campanha criada!",
        description: isEdit ? "Alterações salvas no rascunho." : "Salva como rascunho. Dispare quando quiser.",
      });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      void queryClient.invalidateQueries({ queryKey: ["campaign_edit_bundle", editingCampaignId] });
      void queryClient.invalidateQueries({ queryKey: ["prescriptions_v3"] });
      if (draftKey) localStorage.removeItem(draftKey);
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao salvar campanha", description: err.message, variant: "destructive" });
    },
  });

  // Dynamic steps based on objective
  const isLancamento = objective === "lancamento";
  const STEPS = isLancamento
    ? ["Objetivo", "Produtos", "Mensagem", "Lançamento"]
    : ["Objetivo", "Inteligência", "Lançamento"];
  const STEP_PRODUTOS   = isLancamento ? 1 : -1;
  const STEP_MENSAGEM   = isLancamento ? 2 : 1;
  const STEP_LANCAMENTO = isLancamento ? 3 : 2;

  async function generateAiCopy() {
    setAiLoading(true);
    try {
      assertAiRateLimit(user?.id ?? "anon");
      const objectiveMap: Record<FormData["objective"], "recuperar_carrinho" | "boas_vindas" | "reativacao" | "upsell"> = {
        recovery: "recuperar_carrinho",
        rebuy: "reativacao",
        loyalty: "upsell",
        lancamento: "upsell",
      };
      const toneRaw = watch("ai_tone") ?? "friendly";
      const toneMap: Record<string, "persuasivo" | "amigavel" | "urgente"> = {
        friendly: "amigavel",
        urgent: "urgente",
        professional: "persuasivo",
      };
      const { data, error } = await supabase.functions.invoke("ai-copy", {
        body: {
          type: channel === "email" ? "email" : "whatsapp",
          objective: objectiveMap[objective] ?? "reativacao",
          tone: toneMap[toneRaw] ?? "amigavel",
          brand_context: watch("ai_context") ?? "",
        },
      });
      if (error) throw error;
      const raw = String((data as { copy?: string })?.copy ?? "").trim();
      if (!raw) throw new Error("Resposta vazia da IA");
      const parts = raw.split(/\n---+\n|\n{2,}/).map((s) => s.trim()).filter((s) => s.length > 12);
      const chunks = parts.length > 0 ? parts.slice(0, 5) : [raw];
      const labels = ["Variação A", "Variação B", "Variação C", "Variação D", "Variação E"];
      setAiVariations(chunks.slice(0, 5).map((text, i) => ({ label: labels[i] ?? `Opção ${i + 1}`, text })));
      toast({ title: "Sugestões prontas", description: "Toque numa variação para colar na mensagem." });
    } catch (e) {
      const msg = e instanceof RateLimitError
        ? `Rate limit exceeded. Try again in ${Math.ceil(e.retryAfterMs / 1000)}s.`
        : e instanceof Error ? e.message : "Unknown error";
      toast({ title: "Could not generate with AI", description: msg, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  }

  function generateAbVariant(base: string): string {
    if (!base.trim()) return "";
    return base
      .replace("Oi ", "Tudo bem, ")
      .replace("Quer", "Topa")
      .replace("agora", "hoje")
      .replace("exclusiva", "especial")
      .replace("novidade", "lancamento")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function handleInsertMagicLink() {
    if (!lojaData?.url) {
      toast({ title: "Configure a URL da loja", description: "Acesse Funil → Configurar loja e informe a URL da sua loja.", variant: "destructive" });
      return;
    }
    if (!magicSku.trim()) {
      toast({ title: "Informe o SKU/ID do produto", variant: "destructive" });
      return;
    }
    const platform = ((lojaData?.plataforma === "outro" ? "custom" : lojaData?.plataforma) ?? "custom") as EcommercePlatform;
    const url = buildMagicLink({
      platform,
      storeUrl: lojaData.url,
      cartItems: [{ id: magicSku.trim(), quantity: Number(magicQty) || 1 }],
      couponCode: magicCoupon.trim() || undefined,
    });
    setValue("message", message + (message ? "\n\n" : "") + `🛒 Finalize sua compra: ${url}`);
    setShowMagicLink(false);
    setMagicSku("");
    setMagicQty("1");
    setMagicCoupon("");
  }

  const nextStep = async () => {
    if (step === 0) {
      const valid = await trigger(["name", "channel", "objective"] as const);
      if (!valid) return;
      setStep(s => s + 1);
      return;
    }
    if (isLancamento && step === STEP_PRODUTOS) {
      if (selectedProducts.length === 0) {
        toast({ title: "Selecione pelo menos um produto", variant: "destructive" });
        return;
      }
      // Auto-generate message and advance
      const msg = gerarMensagemProdutos(
        campaignMode, selectedProducts, collectionName, prodCoupon,
        lojaData?.url ?? "", lojaData?.plataforma ?? "custom"
      );
      if (msg) setValue("message", msg);
      setStep(s => s + 1);
      return;
    }
    if (step === STEP_MENSAGEM) {
      const valid = await trigger(["message"] as const);
      if (!valid) return;
    }
    setStep(s => s + 1);
  };

  return (
    <>
    {/* C7: Unsaved changes guard */}
    <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
          <AlertDialogDescription>
            Há alterações não salvas nesta campanha. Se fechar agora, o progresso será perdido
            {draftKey ? " (um rascunho automático pode ser restaurado na próxima vez que abrir o modal)" : ""}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel type="button">Continuar editando</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              if (draftKey) localStorage.removeItem(draftKey);
              onClose();
            }}
          >
            Descartar e fechar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#050508]/80 backdrop-blur-md" onClick={handleClose} />
      
      <div className="relative bg-background border border-white/10 rounded-[2.5rem] shadow-2xl w-full max-w-5xl overflow-hidden max-h-[90vh] flex flex-col md:flex-row">
        {editLoading && (
          <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-background/85 backdrop-blur-sm rounded-[2.5rem]">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Carregando campanha…</span>
          </div>
        )}
        
        {/* Sidebar Stepper */}
        <div className="hidden md:flex flex-col w-72 bg-muted/20 border-r border-white/5 p-8 shrink-0">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
              <Megaphone className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-black text-xs uppercase tracking-widest leading-none">{editingCampaignId ? "Editar" : "Nova"}</span>
              <span className="font-black text-lg tracking-tighter text-primary">Campanha</span>
              {prefill?.source && (
                <span className="text-[9px] font-black uppercase tracking-widest text-primary/60 mt-0.5">via {prefill.source}</span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {STEPS.map((label, idx) => (
              <div key={label} className={cn(
                "flex items-center gap-4 px-4 py-4 rounded-2xl transition-all border-2",
                step === idx ? "bg-background border-primary shadow-xl scale-105" : "border-transparent opacity-40"
              )}>
                <div className={cn(
                  "w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black",
                  step === idx ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                )}>
                  {idx + 1}
                </div>
                <span className={cn("text-xs font-black uppercase tracking-widest", step === idx ? "text-foreground" : "text-muted-foreground")}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-auto bg-primary/5 rounded-2xl p-5 border border-primary/10">
            <div className="flex items-center gap-2 text-primary mb-2">
              <Sparkles className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">Dica Estratégica</span>
            </div>
            <p className="text-[10px] text-muted-foreground font-medium leading-relaxed italic">
              "Campanhas de recompra enviadas <span className="font-bold text-foreground underline decoration-primary">30 dias</span> após a última compra têm 42% mais conversão."
            </p>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
          <div className="flex-1 overflow-y-auto p-8 md:p-12 scrollbar-hide">
            
            {/* Step 0: Goal Selection */}
            {step === 0 && (
              <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-2 text-center md:text-left">
                  <h2 className="text-3xl font-black font-syne uppercase tracking-tighter italic">Qual o seu <span className="text-primary underline">Objetivo?</span></h2>
                  <p className="text-muted-foreground text-sm">O Claude 3.5 adaptará a inteligência com base na sua escolha.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {OBJECTIVES.map((obj) => (
                    <button
                      key={obj.value}
                      onClick={() => setValue("objective", obj.value)}
                      className={cn(
                        "flex flex-col gap-4 p-6 rounded-[2rem] border-2 text-left transition-all group relative overflow-hidden",
                        objective === obj.value ? "border-primary bg-primary/5 ring-8 ring-primary/5" : "border-border/50 hover:border-primary/30"
                      )}
                    >
                      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center transition-all", objective === obj.value ? "bg-primary text-white scale-110 shadow-lg" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary")}>
                        <obj.icon className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className={cn("font-black text-sm uppercase tracking-tight", objective === obj.value ? "text-primary" : "text-foreground")}>{obj.label}</h4>
                        <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed font-medium">{obj.desc}</p>
                      </div>
                      {objective === obj.value && <div className="absolute top-0 right-0 p-4"><Check className="w-4 h-4 text-primary" /></div>}
                    </button>
                  ))}
                </div>

                <div className="space-y-4 pt-6">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground italic">Nome da Campanha & Canal</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input placeholder="ex: Recuperação de Inverno" {...register("name")} className="h-14 rounded-2xl bg-muted/30 border-none font-bold text-sm px-6" />
                    {whatsappOnly ? (
                      <div className="rounded-2xl border border-green-500/20 bg-green-500/5 px-4 py-3 text-left space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-widest text-green-600">Canal: WhatsApp</p>
                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                          E-mail é enviado pela área <strong className="text-foreground">Newsletter</strong>. SMS seguirá em versões futuras.
                        </p>
                      </div>
                    ) : (
                      <div className="flex bg-muted/30 p-1 rounded-2xl">
                        {(["whatsapp", "email", "sms"] as const).map((ch) => (
                          <button key={ch} type="button" onClick={() => setValue("channel", ch)} className={cn(
                            "flex-1 h-12 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                            channel === ch ? "bg-primary text-white shadow-lg" : "text-muted-foreground hover:bg-background/50"
                          )}>
                            {ch}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Step Produtos — só para objetivo "lancamento" */}
            {isLancamento && step === STEP_PRODUTOS && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="space-y-2">
                  <h2 className="text-3xl font-black font-syne uppercase tracking-tighter italic">
                    Selecionar <span className="text-primary underline">Produtos</span>
                  </h2>
                  <p className="text-muted-foreground text-sm">Escolha os produtos que serão divulgados nesta campanha.</p>
                </div>

                {/* Modo: único vs coleção */}
                <div className="flex bg-muted/30 p-1 rounded-2xl w-fit">
                  {(["single", "collection"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setCampaignMode(m); if (m === "single") setSelectedProducts(p => p.slice(0,1)); }}
                      className={cn(
                        "px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                        campaignMode === m ? "bg-primary text-white shadow-lg" : "text-muted-foreground hover:bg-background/50"
                      )}
                    >
                      {m === "single" ? "✨ Produto único" : "🛍️ Coleção"}
                    </button>
                  ))}
                </div>

                {/* Campo nome da coleção */}
                {campaignMode === "collection" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nome da coleção</Label>
                      <Input
                        placeholder="ex: Nova Coleção Verão 2025"
                        value={collectionName}
                        onChange={e => setCollectionName(e.target.value)}
                        className="mt-2 h-12 rounded-2xl bg-muted/30 border-none font-bold"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Cupom (opcional)</Label>
                      <Input
                        placeholder="ex: COLECAO10"
                        value={prodCoupon}
                        onChange={e => setProdCoupon(e.target.value)}
                        className="mt-2 h-12 rounded-2xl bg-muted/30 border-none font-bold uppercase"
                      />
                    </div>
                  </div>
                )}

                {/* Grid de produtos */}
                {produtosQuery.isLoading ? (
                  <div className="flex items-center justify-center h-40">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : !(produtosQuery.data?.rows ?? []).length ? (
                  <div className="border-2 border-dashed border-border/50 rounded-[2rem] p-10 text-center">
                    <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-bold text-muted-foreground">Nenhum produto encontrado</p>
                    <p className="text-xs text-muted-foreground mt-1">Produtos aparecem aqui após configurar a integração com sua plataforma.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-72 overflow-y-auto pr-1">
                    {(produtosQuery.data?.rows ?? ([] as ProductRow[])).map((p) => {
                      const isSelected = selectedProducts.some(s => s.id === p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            if (campaignMode === "single") {
                              setSelectedProducts([p]);
                            } else {
                              setSelectedProducts(prev =>
                                isSelected
                                  ? prev.filter(s => s.id !== p.id)
                                  : prev.length < 5 ? [...prev, p] : prev
                              );
                            }
                          }}
                          className={cn(
                            "p-4 rounded-2xl border-2 text-left transition-all relative",
                            isSelected
                              ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
                              : "border-border/50 hover:border-primary/30"
                          )}
                        >
                          {isSelected && (
                            <div className="absolute top-2 right-2">
                              <CheckCircle2 className="w-4 h-4 text-primary" />
                            </div>
                          )}
                          <p className="font-bold text-sm leading-tight pr-5">{p.nome}</p>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">{p.categoria || p.sku || "—"}</p>
                          <div className="flex items-center justify-between mt-3">
                            <span className="text-sm font-black text-primary">
                              {p.preco != null ? `R$ ${Number(p.preco).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
                            </span>
                            {(p.estoque ?? 999) < 20 && p.estoque != null && (
                              <span className="text-[9px] font-black text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">
                                {p.estoque} un
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {selectedProducts.length > 0 && (
                  <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex items-center justify-between">
                    <span className="text-sm font-bold text-primary">
                      {selectedProducts.length} produto{selectedProducts.length > 1 ? "s" : ""} selecionado{selectedProducts.length > 1 ? "s" : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      A mensagem será gerada automaticamente →
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Step Mensagem (Inteligência) */}
            {step === STEP_MENSAGEM && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h2 className="text-3xl font-black font-syne uppercase tracking-tighter italic">Criação <span className="text-primary underline">Inteligente</span></h2>
                    <p className="text-muted-foreground text-sm">Use o cérebro da plataforma para gerar sua cópia de alta conversão.</p>
                  </div>
                  <Button type="button" onClick={generateAiCopy} disabled={aiLoading} className="bg-orange-500 hover:bg-orange-600 text-white font-black text-[10px] uppercase tracking-widest h-11 px-6 rounded-xl gap-2 shadow-lg shadow-orange-500/20">
                    {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Sugerir com Claude 3.5
                  </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <div className="bg-muted/30 border rounded-2xl p-4 space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Biblioteca de templates</p>
                      <div className="flex flex-wrap gap-2">
                        {(QUICK_TEMPLATES[objective] ?? []).map((tpl, idx) => (
                          <button
                            key={`quick-${idx}`}
                            type="button"
                            onClick={() => setValue("message", tpl)}
                            className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-primary/5 border border-primary/20 hover:border-primary/40"
                          >
                            Template rapido {idx + 1}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {savedTemplates.slice(0, 6).map((tpl) => (
                          <button
                            key={tpl.id}
                            type="button"
                            onClick={() => {
                              setValue("message", tpl.message ?? "");
                              const waCfg = (tpl.whatsapp_config ?? {}) as Record<string, unknown>;
                              setWaContentType(parseWaContentType(waCfg.content_type));
                              setWaMediaUrl(waCfg.media_url ?? "");
                              const b = Array.isArray(waCfg.buttons) && waCfg.buttons.length > 0 ? waCfg.buttons[0] : null;
                              setWaButtonLabel(b?.label ?? "");
                              setWaButtonUrl(b?.value ?? "");
                            }}
                            className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-background border hover:border-primary/40"
                          >
                            {tpl.name}
                          </button>
                        ))}
                        {savedTemplates.length === 0 && (
                          <span className="text-[11px] text-muted-foreground">Nenhum template salvo ainda.</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          value={templateName}
                          onChange={(e) => setTemplateName(e.target.value)}
                          placeholder="Nome do template"
                          className="h-9 text-xs"
                        />
                        <Button
                          type="button"
                          size="sm"
                          className="h-9 text-[10px] font-black uppercase"
                          onClick={() => saveTemplateMutation.mutate()}
                          disabled={saveTemplateMutation.isPending}
                        >
                          {saveTemplateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Salvar"}
                        </Button>
                      </div>
                    </div>

                    <div className="relative group">
                      <Textarea 
                        {...register("message")}
                        placeholder="Sua mensagem..."
                        className="min-h-[250px] rounded-[2rem] border-2 border-border focus-visible:ring-primary/20 p-6 text-sm leading-relaxed"
                      />
                      <div className="absolute top-4 right-4 p-2 bg-muted/50 rounded-full flex items-center gap-2">
                        <MousePointer2 className="w-3 h-3 text-primary" />
                        <span className="text-[10px] font-black text-muted-foreground uppercase">{message.length}/1024</span>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="rounded-xl h-10 text-[9px] font-black uppercase tracking-widest gap-2 border-2" onClick={() => setValue("message", message + (message ? " " : "") + "{{nome}}")}>
                        <Plus className="w-3.5 h-3.5" /> Variável {"{{nome}}"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl h-10 text-[9px] font-black uppercase tracking-widest gap-2 border-2"
                        onClick={() => {
                          const variant = generateAbVariant(message);
                          if (!variant) return;
                          setAiVariations((prev) => [{ label: "A/B (variação)", text: variant }, ...prev].slice(0, 6));
                          toast({ title: "Variação A/B gerada", description: "A variação foi adicionada nas sugestões para teste." });
                        }}
                      >
                        <Sparkles className="w-3.5 h-3.5" /> Gerar variação A/B
                      </Button>
                      <Button variant="outline" size="sm" className="rounded-xl h-10 text-[9px] font-black uppercase tracking-widest gap-2 border-2 text-primary border-primary/20 bg-primary/5" onClick={() => setShowMagicLink(v => !v)}>
                        <ShoppingCart className="w-3.5 h-3.5" /> Inserir Link Mágico
                      </Button>
                    </div>

                    {channel === "whatsapp" && (
                      <div className="bg-muted/30 border rounded-2xl p-4 space-y-3">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                            <Info className="w-3 h-3" /> Template Meta (Cloud API)
                          </Label>
                          <Input
                            placeholder="nome_do_template_aprovado — opcional; obrigatório se a conexão for Meta e o contato estiver fora da janela de 24h"
                            value={waMetaTemplateName}
                            onChange={(e) => setWaMetaTemplateName(e.target.value)}
                            className="h-10 rounded-xl text-xs"
                          />
                          <p className="text-[10px] text-muted-foreground leading-relaxed">
                            Se a loja usa WhatsApp oficial (Meta), o disparo em massa usa este nome ou o template padrão salvo na conexão. A mensagem da campanha é enviada como parâmetro do corpo do template (primeira variável).
                          </p>
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Formato WhatsApp</p>
                        <div className="flex bg-muted/40 p-1 rounded-xl flex-wrap gap-1">
                          {(["text", "image", "video", "audio", "document", "template"] as const).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setWaContentType(t)}
                              className={cn(
                                "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                                waContentType === t ? "bg-primary text-white" : "text-muted-foreground hover:bg-background/60"
                              )}
                            >
                              {t}
                            </button>
                          ))}
                        </div>

                        {waContentType !== "text" && waContentType !== "template" && (
                          <div>
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">URL da mídia</Label>
                            <Input
                              placeholder="https://..."
                              value={waMediaUrl}
                              onChange={(e) => setWaMediaUrl(e.target.value)}
                              className="mt-2 h-10 rounded-xl"
                            />
                          </div>
                        )}

                        {waContentType === "template" && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Texto do botão</Label>
                              <Input
                                placeholder="Ver oferta"
                                value={waButtonLabel}
                                onChange={(e) => setWaButtonLabel(e.target.value)}
                                className="mt-2 h-10 rounded-xl"
                              />
                            </div>
                            <div>
                              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">URL do botão</Label>
                              <Input
                                placeholder="https://..."
                                value={waButtonUrl}
                                onChange={(e) => setWaButtonUrl(e.target.value)}
                                className="mt-2 h-10 rounded-xl"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {showMagicLink && (
                      <div className="bg-muted/40 border-2 border-primary/20 rounded-2xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary">Configurar Link Mágico</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[10px] text-muted-foreground">SKU / ID do produto</Label>
                            <Input placeholder="ex: 123456" value={magicSku} onChange={e => setMagicSku(e.target.value)} className="mt-1 h-8 text-sm" />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Quantidade</Label>
                            <Input type="number" min="1" value={magicQty} onChange={e => setMagicQty(e.target.value)} className="mt-1 h-8 text-sm" />
                          </div>
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Cupom de desconto (opcional)</Label>
                          <Input placeholder="ex: VOLTE10" value={magicCoupon} onChange={e => setMagicCoupon(e.target.value)} className="mt-1 h-8 text-sm" />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="flex-1 h-8 text-[10px] font-black uppercase rounded-xl gap-1" onClick={handleInsertMagicLink}>
                            <ShoppingCart className="w-3.5 h-3.5" /> Inserir na mensagem
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 text-[10px]" onClick={() => setShowMagicLink(false)}>Cancelar</Button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sugestões do Claude</h3>
                    {aiVariations.length === 0 && !aiLoading && (
                      <div className="h-full min-h-[250px] border-2 border-dashed border-border/50 rounded-[2rem] flex flex-col items-center justify-center p-8 text-center space-y-4">
                        <Sparkles className="w-12 h-12 text-muted-foreground opacity-20" />
                        <p className="text-xs text-muted-foreground font-medium">Clique no botão acima para que o Claude analise seu público e sugira a melhor mensagem.</p>
                      </div>
                    )}
                    {aiVariations.map((v, i) => (
                      <button key={i} onClick={() => setValue("message", v.text)} className="w-full text-left p-5 rounded-2xl border-2 border-border/50 bg-card hover:border-primary/50 transition-all group relative overflow-hidden">
                        <Badge className="bg-primary/10 text-primary border-none text-[8px] font-black uppercase mb-3 px-2">{v.label}</Badge>
                        <p className="text-xs text-muted-foreground leading-relaxed italic">"{v.text}"</p>
                        <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity"><Plus className="w-4 h-4 text-primary" /></div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step Lançamento */}
            {step === STEP_LANCAMENTO && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="space-y-2">
                  <h2 className="text-3xl font-black font-syne uppercase tracking-tighter italic">Quase <span className="text-primary underline">Pronto</span></h2>
                  <p className="text-muted-foreground text-sm">Defina para quem e quando o lucro deve ser gerado.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Segmentação Alvo</Label>
                      <div className="grid grid-cols-1 gap-3 max-h-[320px] overflow-y-auto pr-1">
                        {LAUNCH_SEGMENT_META.map(({ value: seg, label }) => (
                          <label key={seg} className={cn(
                            "flex items-center justify-between p-4 rounded-2xl border-2 cursor-pointer transition-all",
                            watch("segment") === seg ? "border-primary bg-primary/5" : "border-border/50 hover:bg-muted/30"
                          )}>
                            <div className="flex items-center gap-3 min-w-0">
                              <input type="radio" value={seg} {...register("segment")} className="sr-only" />
                              <div className={cn("w-10 h-10 shrink-0 rounded-xl flex items-center justify-center", watch("segment") === seg ? "bg-primary text-white" : "bg-muted")}>
                                {seg === "vip" || seg.startsWith("rfm_") ? <Trophy className="w-5 h-5" /> : <Target className="w-5 h-5" />}
                              </div>
                              <span className="text-xs font-black uppercase tracking-widest leading-tight">{label}</span>
                            </div>
                            <span className="text-xs font-bold font-mono opacity-60 shrink-0">{segmentCounts[seg] ?? 0} contatos</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="p-6 bg-[#0A0A0F] rounded-[2.5rem] border border-white/5 space-y-6 shadow-2xl">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-primary italic border-b border-white/5 pb-4">Revisão Final</h4>
                      <div className="space-y-4">
                        <div className="flex justify-between">
                          <span className="text-[10px] font-bold text-white/40 uppercase">Objetivo</span>
                          <span className="text-[10px] font-black text-white uppercase">{watch("objective")}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[10px] font-bold text-white/40 uppercase">Alcance</span>
                          <span className="text-[10px] font-black text-emerald-500 uppercase">{segmentCounts[watch("segment")]} pessoas</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[10px] font-bold text-white/40 uppercase">Investimento</span>
                          <span className="text-[10px] font-black text-white uppercase">R$ {(segmentCounts[watch("segment")] * 0.05).toFixed(2)}</span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-primary/20 gap-3"
                        disabled={saveMutation.isPending}
                        onClick={handleSubmit((data) => saveMutation.mutate(data))}
                      >
                        {saveMutation.isPending
                          ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
                          : <><Play className="w-4 h-4 fill-primary-foreground" /> Lançar Campanha</>}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Wizard Footer */}
          <div className="p-8 border-t border-white/5 bg-muted/10 flex items-center justify-between shrink-0">
            <Button variant="ghost" onClick={step === 0 ? handleClose : () => setStep(s => s - 1)} className="rounded-xl font-black text-[10px] uppercase tracking-widest gap-2">
              <ChevronLeft className="w-4 h-4" /> {step === 0 ? "Cancelar" : "Voltar"}
            </Button>
            {step < STEPS.length - 1 && (
              <Button onClick={nextStep} className="rounded-xl font-black text-[10px] uppercase tracking-widest gap-2 px-8 h-12 shadow-xl shadow-primary/20 transition-all hover:scale-105">
                {isLancamento && step === STEP_PRODUTOS ? (
                  <><Sparkles className="w-4 h-4" /> Gerar mensagem</>
                ) : (
                  <>Próximo <ChevronRight className="w-4 h-4" /></>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
