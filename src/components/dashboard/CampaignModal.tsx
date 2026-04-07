import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X, ChevronRight, ChevronLeft, Loader2, Check, Sparkles,
  MessageCircle, Mail, Smartphone, Zap, Trophy, Clock,
  Megaphone, CalendarDays, Play, ShoppingCart, Target,
  MousePointer2, Plus, Info, User, Package, CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { buildMagicLink, EcommercePlatform } from "@/lib/checkout-builder";
import { mockProdutos } from "@/lib/mock-data";
import { useLoja } from "@/hooks/useConvertIQ";
import { useProductsV3 as useProdutosV3 } from "@/hooks/useLTVBoost";

export type ProdutoParaCampanha = {
  id: string;
  nome: string;
  sku?: string | null;
  preco?: number | null;
  estoque?: number | null;
};

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
  segment: z.enum(["all", "active", "inactive", "vip", "cart_abandoned"]),
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

export type CampaignPrefill = {
  name?: string;
  message?: string;
  objective?: "recovery" | "rebuy" | "loyalty" | "lancamento";
  channel?: "whatsapp" | "email" | "sms";
  segment?: "all" | "active" | "inactive" | "vip" | "cart_abandoned";
  /** Se true, pula o passo 0 (objetivo) e vai direto para mensagem */
  skipObjective?: boolean;
  /** Badge exibido no topo do modal */
  source?: string;
};

export default function CampaignModal({
  onClose,
  initialProducts,
  initialObjective,
  prefill,
}: {
  onClose: () => void;
  initialProducts?: ProdutoParaCampanha[];
  initialObjective?: "recovery" | "rebuy" | "lancamento" | "loyalty";
  prefill?: CampaignPrefill;
}) {
  const [step, setStep] = useState(prefill?.skipObjective ? 1 : 0);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiVariations, setAiVariations] = useState<any[]>([]);
  const [segmentCounts, setSegmentCounts] = useState<any>({ all: 1240, active: 450, vip: 120, cart_abandoned: 87 });
  const [showMagicLink, setShowMagicLink] = useState(false);
  const [magicSku, setMagicSku] = useState("");
  const [magicQty, setMagicQty] = useState("1");
  const [magicCoupon, setMagicCoupon] = useState("");

  // Product campaign state
  const [campaignMode, setCampaignMode] = useState<"single" | "collection">(
    initialProducts && initialProducts.length > 1 ? "collection" : "single"
  );
  const [selectedProducts, setSelectedProducts] = useState<ProdutoParaCampanha[]>(initialProducts ?? []);
  const [collectionName, setCollectionName] = useState("");
  const [prodCoupon, setProdCoupon] = useState("");

  const { user, profile } = useAuth();
  const loja = useLoja();
  const produtos = useProdutosV3(loja.data?.id ?? undefined);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { register, handleSubmit, watch, setValue, trigger, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      channel: prefill?.channel ?? "whatsapp",
      segment: prefill?.segment ?? "all",
      objective: prefill?.objective ?? initialObjective ?? "recovery",
      message: prefill?.message ?? "",
      name: prefill?.name ?? "",
      send_now: true,
      ai_tone: "friendly",
    },
  });

  const channel = watch("channel");
  const message = watch("message") ?? "";
  const objective = watch("objective");
  const watchedName = watch("name");

  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const { error } = await supabase.from("campaigns").insert({
        user_id: user!.id,
        name: data.name || `Campanha ${new Date().toLocaleDateString("pt-BR")}`,
        message: data.message,
        channel: data.channel,
        subject: data.subject ?? null,
        tags: data.segment !== "all" ? [data.segment] : [],
        status: "draft",
        total_contacts: 0,
        sent_count: 0,
        delivered_count: 0,
        read_count: 0,
        reply_count: 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Campanha criada!", description: "Salva como rascunho. Dispare quando quiser." });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
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
    // Simulando chamada ao Claude 3.5
    setTimeout(() => {
      setAiVariations([
        { label: "FOMO (Urgência)", text: "Oi {{nome}}, notei que você deixou algo especial no carrinho. 😱 Restam apenas 3 unidades! Use o cupom VOLTE10 e garanta o seu aqui: {{link}}" },
        { label: "Amigável", text: "Tudo bem, {{nome}}? Vi que você não finalizou seu pedido. 💖 Liberei frete grátis pra você fechar agora! Clica aqui: {{link}}" },
      ]);
      setAiLoading(false);
    }, 1500);
  }

  function handleInsertMagicLink() {
    if (!loja.data?.url) {
      toast({ title: "Configure a URL da loja", description: "Acesse Funil → Configurar loja e informe a URL da sua loja.", variant: "destructive" });
      return;
    }
    if (!magicSku.trim()) {
      toast({ title: "Informe o SKU/ID do produto", variant: "destructive" });
      return;
    }
    const platform = (loja.data.plataforma === "outro" ? "custom" : loja.data.plataforma) as EcommercePlatform;
    const url = buildMagicLink({
      platform,
      storeUrl: loja.data.url,
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
      const valid = await trigger(["name", "channel", "objective"] as any);
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
        loja.data?.url ?? "", loja.data?.plataforma ?? "custom"
      );
      if (msg) setValue("message", msg);
      setStep(s => s + 1);
      return;
    }
    if (step === STEP_MENSAGEM) {
      const valid = await trigger(["message"] as any);
      if (!valid) return;
    }
    setStep(s => s + 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#050508]/80 backdrop-blur-md" onClick={onClose} />
      
      <div className="relative bg-background border border-white/10 rounded-[2.5rem] shadow-2xl w-full max-w-5xl overflow-hidden max-h-[90vh] flex flex-col md:flex-row">
        
        {/* Sidebar Stepper */}
        <div className="hidden md:flex flex-col w-72 bg-muted/20 border-r border-white/5 p-8 shrink-0">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
              <Megaphone className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-black text-xs uppercase tracking-widest leading-none">Nova</span>
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
                    <div className="flex bg-muted/30 p-1 rounded-2xl">
                      {["whatsapp", "email", "sms"].map((ch) => (
                        <button key={ch} type="button" onClick={() => setValue("channel", ch as any)} className={cn(
                          "flex-1 h-12 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                          channel === ch ? "bg-primary text-white shadow-lg" : "text-muted-foreground hover:bg-background/50"
                        )}>
                          {ch}
                        </button>
                      ))}
                    </div>
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
                {produtos.isLoading ? (
                  <div className="flex items-center justify-center h-40">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : !produtos.data?.length ? (
                  <div className="border-2 border-dashed border-border/50 rounded-[2rem] p-10 text-center">
                    <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-bold text-muted-foreground">Nenhum produto encontrado</p>
                    <p className="text-xs text-muted-foreground mt-1">Produtos aparecem aqui após configurar a integração com sua plataforma.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-72 overflow-y-auto pr-1">
                    {(produtos.data as any[]).map((p) => {
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
                      <Button variant="outline" size="sm" className="rounded-xl h-10 text-[9px] font-black uppercase tracking-widest gap-2 border-2 text-primary border-primary/20 bg-primary/5" onClick={() => setShowMagicLink(v => !v)}>
                        <ShoppingCart className="w-3.5 h-3.5" /> Inserir Link Mágico
                      </Button>
                    </div>

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
                        <Bot className="w-12 h-12 text-muted-foreground opacity-20" />
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
                      <div className="grid grid-cols-1 gap-3">
                        {["all", "active", "vip", "cart_abandoned"].map((seg) => (
                          <label key={seg} className={cn(
                            "flex items-center justify-between p-4 rounded-2xl border-2 cursor-pointer transition-all",
                            watch("segment") === seg ? "border-primary bg-primary/5" : "border-border/50 hover:bg-muted/30"
                          )}>
                            <div className="flex items-center gap-3">
                              <input type="radio" value={seg} {...register("segment")} className="sr-only" />
                              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", watch("segment") === seg ? "bg-primary text-white" : "bg-muted")}>
                                {seg === 'vip' ? <Trophy className="w-5 h-5" /> : <Users className="w-5 h-5" />}
                              </div>
                              <span className="text-xs font-black uppercase tracking-widest">{seg.replace('_', ' ')}</span>
                            </div>
                            <span className="text-xs font-bold font-mono opacity-60">{segmentCounts[seg]} contatos</span>
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
            <Button variant="ghost" onClick={step === 0 ? onClose : () => setStep(s => s - 1)} className="rounded-xl font-black text-[10px] uppercase tracking-widest gap-2">
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
  );
}
