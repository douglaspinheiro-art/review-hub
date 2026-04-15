// @ts-nocheck Supabase types.ts is read-only and misaligned with the live DB schema
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight, Loader2, Shield, Sparkles, Info,
  Store, BarChart3, Globe, TrendingUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { VERTICALS, type EcommerceVertical } from "@/lib/strategy-profile";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

const SEGMENTS = VERTICALS;

export default function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1 — Store info
  const [storeName, setStoreName] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [vertical, setVertical] = useState<EcommerceVertical | null>(null);
  const [plataforma, setPlataforma] = useState("");

  // Step 2 — Funnel data
  const [faturamento, setFaturamento] = useState("");
  const [ticketMedio, setTicketMedio] = useState("250");
  const [numClientes, setNumClientes] = useState("");
  const [visitantes, setVisitantes] = useState("");
  const [carrinho, setCarrinho] = useState("");
  const [checkout, setCheckout] = useState("");
  const [pedidos, setPedidos] = useState("");
  const [metaConversao, setMetaConversao] = useState("2.5");

  // Step 3 — GA4 optional
  const [ga4PropertyId, setGa4PropertyId] = useState("");
  const [ga4Token, setGa4Token] = useState("");
  const [ga4Testing, setGa4Testing] = useState(false);
  const [ga4Result, setGa4Result] = useState<{ ok: boolean; visitors?: number } | null>(null);

  // Compute estimated funnel from faturamento if manual fields not filled
  const estimatedVisitors = visitantes ? Number(visitantes) : Math.round(Number(faturamento || 0) / Number(ticketMedio || 250) / 0.014);
  const estimatedCarrinho = carrinho ? Number(carrinho) : Math.round(estimatedVisitors * 0.28);
  const estimatedCheckout = checkout ? Number(checkout) : Math.round(estimatedVisitors * 0.14);
  const estimatedPedidos = pedidos ? Number(pedidos) : Math.round(Number(faturamento || 0) / Number(ticketMedio || 250));

  const handleStep1Next = () => {
    if (!storeName.trim()) {
      toast.error("Informe o nome da loja.");
      return;
    }
    if (!vertical) {
      toast.error("Selecione o segmento da loja.");
      return;
    }
    setStep(2);
  };

  const handleStep2Next = () => {
    if (!faturamento || Number(faturamento) <= 0) {
      toast.error("Informe seu faturamento mensal aproximado.");
      return;
    }
    setStep(3);
  };

  const handleTestGA4 = async () => {
    if (!ga4PropertyId.trim() || !ga4Token.trim()) {
      toast.error("Preencha o Property ID e o Access Token.");
      return;
    }
    setGa4Testing(true);
    try {
      const { data, error } = await supabase.functions.invoke("buscar-ga4", {
        body: { ga4_property_id: ga4PropertyId, access_token: ga4Token, periodo: "30d" },
      });
      if (error || !data?.success) {
        setGa4Result({ ok: false });
        toast.error("Não foi possível conectar ao GA4. Verifique as credenciais.");
      } else {
        setGa4Result({ ok: true, visitors: data.metricas?.visitantes });
        // Auto-fill funnel data from GA4
        if (data.metricas) {
          const m = data.metricas;
          setVisitantes(String(m.visitantes || ""));
          setCarrinho(String(m.carrinho || ""));
          setCheckout(String(m.checkout || ""));
          setPedidos(String(m.pedido || ""));
        }
        toast.success(`✅ GA4 conectado! ${data.metricas?.visitantes?.toLocaleString("pt-BR")} visitantes encontrados.`);
      }
    } catch {
      setGa4Result({ ok: false });
      toast.error("Erro ao testar conexão GA4.");
    } finally {
      setGa4Testing(false);
    }
  };

  const handleFinish = async () => {
    setIsSubmitting(true);
    try {
      if (!user?.id) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }

      // 1. Update store
      const { error: storeErr } = await supabase
        .from("stores")
        .update({
          nome: storeName,
          url: storeUrl || null,
          segment: vertical,
          plataforma: plataforma || null,
          ga4_property_id: ga4PropertyId || null,
        })
        .eq("user_id", user.id);

      if (storeErr) console.warn("Store update error:", storeErr.message);

      // 2. Get store_id
      const { data: storeData } = await supabase
        .from("stores")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      const storeId = storeData?.id;

      // 3. Save funnel metrics
      const funnelVisitors = visitantes ? Number(visitantes) : estimatedVisitors;
      const funnelCarrinho = carrinho ? Number(carrinho) : estimatedCarrinho;
      const funnelCheckout = checkout ? Number(checkout) : estimatedCheckout;
      const funnelPedidos = pedidos ? Number(pedidos) : estimatedPedidos;
      const funnelProdutoVisto = Math.round(funnelVisitors * 0.72);

      if (storeId) {
        await supabase.from("funnel_metrics").insert({
          store_id: storeId,
          user_id: user.id,
          visitantes: funnelVisitors,
          visualizacoes_produto: funnelProdutoVisto,
          adicionou_carrinho: funnelCarrinho,
          iniciou_checkout: funnelCheckout,
          compras: funnelPedidos,
          receita: Number(faturamento) || 0,
        });
      }

      // 4. Store funnel data in sessionStorage for Analisando page
      const funnelPayload = {
        visitantes: funnelVisitors,
        produto_visto: funnelProdutoVisto,
        carrinho: funnelCarrinho,
        checkout: funnelCheckout,
        pedido: funnelPedidos,
        ticket_medio: Number(ticketMedio) || 250,
        meta_conversao: Number(metaConversao) || 2.5,
        store_id: storeId,
      };
      sessionStorage.setItem("ltv_funnel_data", JSON.stringify(funnelPayload));

      navigate("/analisando");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao salvar dados. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white flex flex-col items-center p-6 md:p-20 overflow-x-hidden">
      <div className="max-w-2xl w-full space-y-12">
        {/* Progress Header */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-black">L</div>
              <span className="font-bold tracking-tighter">LTV BOOST</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex gap-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className={cn("w-2 h-2 rounded-full transition-all", i <= step ? "bg-primary" : "bg-muted")} />
                ))}
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Passo {step} de 3
              </span>
            </div>
          </div>
          <Progress value={Math.round((step / 3) * 100)} className="h-1 bg-muted/40" />
        </div>

        {/* STEP 1: Store Info */}
        {step === 1 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="text-center space-y-4">
              <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-[10px] font-black px-3 py-1 rounded-full border border-primary/20 uppercase tracking-[0.2em]">
                <Store className="w-3 h-3" /> Passo 1 — Sua Loja
              </div>
              <h1 className="text-4xl md:text-5xl font-black font-syne tracking-tighter">
                Conte sobre sua loja
              </h1>
              <p className="text-muted-foreground max-w-lg mx-auto font-medium">
                Essas informações vão personalizar seu diagnóstico e benchmarks do setor.
              </p>
            </div>

            <div className="bg-[#13131A] border border-[#1E1E2E] rounded-2xl p-6 space-y-5">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Nome da loja *</Label>
                <Input
                  placeholder="Ex: Studio Moda Feminina"
                  value={storeName}
                  onChange={e => setStoreName(e.target.value)}
                  className="h-12 rounded-xl bg-background/50 border-[#2E2E3E]"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">URL da loja</Label>
                <Input
                  placeholder="https://minhaloja.com.br"
                  value={storeUrl}
                  onChange={e => setStoreUrl(e.target.value)}
                  className="h-12 rounded-xl bg-background/50 border-[#2E2E3E]"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Plataforma</Label>
                <Select value={plataforma} onValueChange={setPlataforma}>
                  <SelectTrigger className="h-12 rounded-xl bg-background/50 border-[#2E2E3E]">
                    <SelectValue placeholder="Selecione sua plataforma" />
                  </SelectTrigger>
                  <SelectContent>
                    {["Shopify", "VTEX", "WooCommerce", "Nuvemshop", "Tray", "Yampi", "Loja Integrada", "Outro"].map(p => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Segmento *</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {SEGMENTS.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setVertical(item.id)}
                      className={cn(
                        "text-left rounded-xl border p-3 transition-all",
                        vertical === item.id
                          ? "border-primary bg-primary/10"
                          : "border-[#2A2A38] hover:border-primary/40"
                      )}
                    >
                      <p className="text-sm font-bold">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground">{item.benchmarkHint}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Funnel Data */}
        {step === 2 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="text-center space-y-4">
              <div className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-500 text-[10px] font-black px-3 py-1 rounded-full border border-emerald-500/20 uppercase tracking-[0.2em]">
                <BarChart3 className="w-3 h-3" /> Passo 2 — Dados do Funil
              </div>
              <h1 className="text-4xl md:text-5xl font-black font-syne tracking-tighter">
                Métricas do seu negócio
              </h1>
              <p className="text-muted-foreground max-w-lg mx-auto font-medium">
                Com esses dados, a IA calcula seu Conversion Health Score e identifica gargalos.
              </p>
            </div>

            <div className="bg-[#13131A] border border-[#1E1E2E] rounded-2xl p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Faturamento mensal (R$) *</Label>
                  <Input
                    type="number"
                    placeholder="Ex: 50000"
                    value={faturamento}
                    onChange={e => setFaturamento(e.target.value)}
                    className="h-12 rounded-xl bg-background/50 border-[#2E2E3E] font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Ticket médio (R$)</Label>
                  <Input
                    type="number"
                    placeholder="250"
                    value={ticketMedio}
                    onChange={e => setTicketMedio(e.target.value)}
                    className="h-12 rounded-xl bg-background/50 border-[#2E2E3E] font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Nº clientes ativos</Label>
                  <Input
                    type="number"
                    placeholder="Ex: 1200"
                    value={numClientes}
                    onChange={e => setNumClientes(e.target.value)}
                    className="h-12 rounded-xl bg-background/50 border-[#2E2E3E] font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Meta de conversão (%)</Label>
                  <Input
                    type="number"
                    placeholder="2.5"
                    value={metaConversao}
                    onChange={e => setMetaConversao(e.target.value)}
                    className="h-12 rounded-xl bg-background/50 border-[#2E2E3E] font-mono"
                    step="0.1"
                  />
                </div>
              </div>

              {/* Optional detailed funnel */}
              <div className="border-t border-[#1E1E2E] pt-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Info className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground font-medium">
                    Opcional: preencha os dados do funil para um diagnóstico mais preciso. Se não souber, a IA estima com base no faturamento.
                  </p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Visitantes/mês</Label>
                    <Input
                      type="number"
                      placeholder={String(estimatedVisitors || "—")}
                      value={visitantes}
                      onChange={e => setVisitantes(e.target.value)}
                      className="h-10 rounded-lg bg-background/50 border-[#2E2E3E] font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Add to cart</Label>
                    <Input
                      type="number"
                      placeholder={String(estimatedCarrinho || "—")}
                      value={carrinho}
                      onChange={e => setCarrinho(e.target.value)}
                      className="h-10 rounded-lg bg-background/50 border-[#2E2E3E] font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Checkout</Label>
                    <Input
                      type="number"
                      placeholder={String(estimatedCheckout || "—")}
                      value={checkout}
                      onChange={e => setCheckout(e.target.value)}
                      className="h-10 rounded-lg bg-background/50 border-[#2E2E3E] font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Pedidos/mês</Label>
                    <Input
                      type="number"
                      placeholder={String(estimatedPedidos || "—")}
                      value={pedidos}
                      onChange={e => setPedidos(e.target.value)}
                      className="h-10 rounded-lg bg-background/50 border-[#2E2E3E] font-mono text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: GA4 Optional */}
        {step === 3 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="text-center space-y-4">
              <div className="inline-flex items-center gap-2 bg-blue-500/10 text-blue-400 text-[10px] font-black px-3 py-1 rounded-full border border-blue-500/20 uppercase tracking-[0.2em]">
                <Globe className="w-3 h-3" /> Passo 3 — Dados em Tempo Real (Opcional)
              </div>
              <h1 className="text-4xl md:text-5xl font-black font-syne tracking-tighter">
                Conectar Google Analytics 4
              </h1>
              <p className="text-muted-foreground max-w-lg mx-auto font-medium">
                Com GA4, o diagnóstico usa dados reais do seu funil. Sem ele, a IA estima com base no faturamento informado.
              </p>
            </div>

            <div className="bg-[#13131A] border border-[#1E1E2E] rounded-2xl p-6 space-y-5">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">GA4 Property ID</Label>
                <Input
                  placeholder="Ex: 123456789"
                  value={ga4PropertyId}
                  onChange={e => setGa4PropertyId(e.target.value)}
                  className="h-12 rounded-xl bg-background/50 border-[#2E2E3E] font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Access Token</Label>
                <Input
                  type="password"
                  placeholder="ya29.a0..."
                  value={ga4Token}
                  onChange={e => setGa4Token(e.target.value)}
                  className="h-12 rounded-xl bg-background/50 border-[#2E2E3E] font-mono"
                />
              </div>

              {ga4Result && (
                <div className={cn(
                  "rounded-xl p-4 flex items-center gap-3",
                  ga4Result.ok ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-red-500/10 border border-red-500/30"
                )}>
                  {ga4Result.ok ? (
                    <>
                      <Sparkles className="w-5 h-5 text-emerald-500" />
                      <div>
                        <p className="text-sm font-bold text-emerald-400">Conectado!</p>
                        <p className="text-xs text-muted-foreground">{ga4Result.visitors?.toLocaleString("pt-BR")} visitantes encontrados nos últimos 30 dias.</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Info className="w-5 h-5 text-red-400" />
                      <p className="text-sm text-red-400">Falha na conexão. Verifique as credenciais.</p>
                    </>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  onClick={handleTestGA4}
                  disabled={ga4Testing || !ga4PropertyId.trim() || !ga4Token.trim()}
                  variant="outline"
                  className="flex-1 h-11 rounded-xl border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                >
                  {ga4Testing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <TrendingUp className="w-4 h-4 mr-2" />}
                  Testar Conexão
                </Button>
              </div>
            </div>

            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex gap-3">
              <Sparkles className="w-5 h-5 text-primary shrink-0" />
              <p className="text-xs text-primary/80 leading-relaxed font-medium">
                Se preferir, pule esta etapa. A IA vai gerar o diagnóstico com os dados que você já informou e estimativas do benchmark do seu segmento.
              </p>
            </div>
          </div>
        )}

        {/* Action Footer */}
        <div className="pt-12 border-t border-[#1E1E2E] flex flex-col items-center gap-4">
          {step === 1 && (
            <Button
              size="lg"
              onClick={handleStep1Next}
              className="h-14 px-12 text-lg font-black bg-gradient-to-r from-emerald-500 to-blue-600 rounded-xl shadow-xl shadow-emerald-500/20 hover:scale-105 transition-all gap-2 group"
            >
              Próximo: Dados do funil <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          )}
          {step === 2 && (
            <div className="flex flex-col items-center gap-3">
              <Button
                size="lg"
                onClick={handleStep2Next}
                className="h-14 px-12 text-lg font-black bg-gradient-to-r from-emerald-500 to-blue-600 rounded-xl shadow-xl shadow-emerald-500/20 hover:scale-105 transition-all gap-2 group"
              >
                Próximo: Conectar GA4 <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              <button
                onClick={() => { setStep(3); }}
                className="text-xs text-muted-foreground hover:text-white transition-colors"
              >
                Pular GA4 e gerar diagnóstico
              </button>
            </div>
          )}
          {step === 3 && (
            <div className="flex flex-col items-center gap-3">
              <Button
                size="lg"
                onClick={() => void handleFinish()}
                disabled={isSubmitting}
                className="h-14 px-12 text-lg font-black bg-primary hover:bg-primary/90 rounded-xl shadow-xl shadow-primary/20 hover:scale-105 transition-all gap-2 group"
              >
                {isSubmitting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Salvando...</>
                ) : (
                  <><Sparkles className="w-5 h-5" /> Gerar Diagnóstico com IA</>
                )}
              </Button>
              {!ga4PropertyId && (
                <button
                  onClick={() => void handleFinish()}
                  disabled={isSubmitting}
                  className="text-xs text-muted-foreground hover:text-white transition-colors"
                >
                  Pular GA4 e usar estimativas
                </button>
              )}
              <p className="text-[9px] font-black text-muted-foreground flex items-center gap-1.5 uppercase tracking-[0.2em]">
                <Shield className="w-3.5 h-3.5 text-emerald-500" /> Dados criptografados e protegidos
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
