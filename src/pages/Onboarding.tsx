// @ts-nocheck Supabase types.ts is read-only and misaligned with the live DB schema
import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  CheckCircle2, Globe, ShoppingBag, Smartphone,
  ArrowRight, Loader2, Shield,
  Sparkles, Info, Zap, QrCode, DollarSign, TrendingUp, Bell, Users, MessageCircle, Facebook,
  ChevronDown, ExternalLink, HelpCircle, AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { launchEmbeddedSignup } from "@/lib/whatsapp/meta-embedded-signup";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { OBJECTIVES, VERTICALS, saveStrategyProfile, type EcommerceVertical, type PrimaryObjective } from "@/lib/strategy-profile";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export default function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const perda = searchParams.get("perda");

  // Onboarding flow is active — no more blind redirect

  const [channels, setChannels] = useState<string[]>([]);
  const [_isSyncing, setIsSyncing] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [objective, setObjective] = useState<PrimaryObjective | null>(null);
  const [vertical, setVertical] = useState<EcommerceVertical | null>(null);
  const [pulseNum, setPulseNum] = useState("");
  const [isLaunching, setIsLaunching] = useState(false);
  const [waConnecting, setWaConnecting] = useState(false);
  const [waConnected, setWaConnected] = useState<{ phone?: string } | null>(null);
  const [userStoreId, setUserStoreId] = useState<string | null>(null);
  const showCommunity = sessionStorage.getItem("ltv_show_community") === "1";
  const companyName = sessionStorage.getItem("ltv_company") || "";

  const metaAppId = import.meta.env.VITE_META_APP_ID as string | undefined;

  // Fetch user's store_id when entering step 2
  useEffect(() => {
    if (step !== 2 || !user?.id) return;
    supabase
      .from("stores")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setUserStoreId(data.id);
      });
  }, [step, user?.id]);

  const handleConnectWhatsApp = useCallback(async () => {
    if (!metaAppId) {
      toast.error("META_APP_ID não configurado. Configure VITE_META_APP_ID.");
      return;
    }
    if (!userStoreId) {
      toast.error("Complete o passo 1 primeiro para criar sua loja.");
      return;
    }
    setWaConnecting(true);
    try {
      const result = await launchEmbeddedSignup({
        appId: metaAppId,
        storeId: userStoreId,
        instanceName: "onboarding",
      });
      if (result.ok) {
        setWaConnected({ phone: result.display_phone_number });
        toast.success("✅ WhatsApp conectado com sucesso!");
        setTimeout(() => setStep(3), 2000);
      } else {
        toast.error(result.error || "Não foi possível conectar.");
      }
    } catch (err) {
      toast.error("Erro ao conectar WhatsApp. Tente novamente.");
    } finally {
      setWaConnecting(false);
    }
  }, [metaAppId, userStoreId]);

  const ownStores = [
    { id: "shopify", label: "Shopify", icon: Globe, help: "Conexão via App Oficial. Sincroniza pedidos, clientes e carrinhos em tempo real." },
    { id: "vtex", label: "VTEX", icon: Globe, help: "Integração via App Key/Token. Suporte total a Master Data e pedidos." },
    { id: "nuvemshop", label: "Nuvemshop", icon: Globe, help: "Conexão nativa via OAuth. Ideal para e-commerces brasileiros." },
    { id: "woocommerce", label: "WooCommerce", icon: Globe, help: "Via Plugin LTV Boost. Requer permissões de leitura na API REST." },
  ];

  const marketplaces = [
    { id: "ml", label: "Mercado Livre", icon: ShoppingBag, color: "bg-yellow-400", help: "Sincroniza vendas e reputação. Identifica clientes que também compram na loja própria." },
    { id: "shopee", label: "Shopee", icon: ShoppingBag, color: "bg-orange-500", help: "Acompanhe pedidos e métricas de conversão do marketplace Shopee." },
    { id: "tiktok", label: "TikTok Shop", icon: Smartphone, color: "bg-black", badge: "BETA", help: "Integração com a nova frente de vendas do TikTok." },
  ];

  const toggleChannel = (id: string) => {
    setChannels(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const BR_PHONE_RE = /^\+?55\s?\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4}$/;

  const handleNextStep = () => {
    if (step === 1 && (!objective || !vertical)) {
      toast.error("Selecione objetivo e vertical antes de continuar.");
      return;
    }
    if (step === 1) setStep(2);
    else if (step === 2) setStep(3);
  };

  const handleLaunch = async () => {
    // Validate pulse number if provided
    const trimmedPulse = pulseNum.trim();
    if (trimmedPulse && !BR_PHONE_RE.test(trimmedPulse)) {
      toast.error("Número de WhatsApp inválido. Use o formato +55 11 99999-9999.");
      return;
    }

    setIsLaunching(true);
    try {
      if (objective && vertical) {
        saveStrategyProfile({ objective, vertical });
        if (user?.id) {
          const updatePayload: Record<string, unknown> = { segment: vertical };
          if (trimmedPulse) updatePayload.notification_phone = trimmedPulse;
          const { error: storeErr } = await supabase
            .from("stores")
            .update(updatePayload)
            .eq("user_id", user.id);
          if (storeErr) {
            console.warn("Onboarding: dados não persistidos na loja:", storeErr.message);
          } else if (trimmedPulse) {
            toast.success(`Pulse semanal ativado para ${trimmedPulse}!`);
          }
        }
      }
      sessionStorage.removeItem("ltv_show_community");
      sessionStorage.removeItem("ltv_company");
      navigate(`/dashboard?setup=complete&firstweek=true`);
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível concluir. Tente novamente.");
    } finally {
      setIsLaunching(false);
    }
  };

  const handleDemoMode = () => {
    navigate('/dashboard?demo=true');
  };

  // Mock prescription for step 3 — clamp perda to prevent URL manipulation
  const perdaNum = Math.min(Math.max(0, Number(perda) || 0), 999_999);
  const mockPrescription = perdaNum > 0
    ? { valor: Math.round(perdaNum * 0.18), tipo: "Carrinho Abandonado", clientes: Math.floor(perdaNum / 120) }
    : { valor: 4200, tipo: "Boletos Expirados", clientes: 34 };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white flex flex-col items-center p-6 md:p-20 overflow-x-hidden">
      <TooltipProvider>
        <div className="max-w-4xl w-full space-y-12">
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

          {/* STEP 1: Canais */}
          {step === 1 && (
            <>
              <div className="text-center space-y-4">
                {perdaNum > 0 ? (
                  <div className="inline-flex items-center gap-2 bg-red-500/10 text-red-500 text-[10px] font-black px-3 py-1 rounded-full border border-red-500/20 uppercase tracking-[0.2em] mb-2">
                    Meta: Recuperar R$ {perdaNum.toLocaleString('pt-BR')}/mês
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-[10px] font-black px-3 py-1 rounded-full border border-primary/20 uppercase tracking-[0.2em] mb-2">
                    Passo 1 — Conectar Canais
                  </div>
                )}
                <h1 className="text-4xl md:text-5xl font-black font-syne tracking-tighter">Conectar canais de venda</h1>
                <p className="text-muted-foreground max-w-lg mx-auto font-medium">Conecte sua loja para que a IA identifique seus clientes reais em todos os canais.</p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-[#13131A] border border-[#1E1E2E] rounded-2xl p-4 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Objetivo principal</p>
                  <div className="grid gap-2">
                    {OBJECTIVES.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setObjective(item.id)}
                        className={cn(
                          "text-left rounded-xl border p-3 transition-all",
                          objective === item.id
                            ? "border-primary bg-primary/10"
                            : "border-[#2A2A38] hover:border-primary/40"
                        )}
                      >
                        <p className="text-sm font-bold">{item.label}</p>
                        <p className="text-[11px] text-muted-foreground">{item.hint}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-[#13131A] border border-[#1E1E2E] rounded-2xl p-4 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Vertical da loja</p>
                  <div className="grid grid-cols-2 gap-2">
                    {VERTICALS.map((item) => (
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
                {/* Section A: Own Store */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Loja Própria (Obrigatório)</h3>
                    <Badge variant="outline" className="text-[8px] font-black text-primary border-primary/30">ATIVAR FUNIL</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {ownStores.map(s => (
                      <Tooltip key={s.id}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => toggleChannel(s.id)}
                            disabled={!!isSyncing}
                            className={cn(
                              "p-4 rounded-2xl border transition-all text-left relative group overflow-hidden",
                              channels.includes(s.id) ? "border-primary bg-primary/5" : "border-[#1E1E2E] bg-[#13131A] hover:border-primary/30"
                            )}
                          >
                            <div className={cn("absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity")} />
                            {channels.includes(s.id) && <CheckCircle2 className="w-4 h-4 text-primary absolute top-3 right-3 animate-in zoom-in" />}
                            {isSyncing === s.id && <Loader2 className="w-4 h-4 text-primary animate-spin absolute top-3 right-3" />}
                            <s.icon className={cn("w-6 h-6 mb-3", channels.includes(s.id) ? "text-primary" : "text-muted-foreground")} />
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-bold block">{s.label}</span>
                              <Info className="w-3 h-3 text-muted-foreground/40" />
                            </div>
                            {channels.includes(s.id) && <span className="text-[9px] text-primary font-bold uppercase mt-1 block">Selecionado — configure em Integrações</span>}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="bg-[#13131A] border-[#1E1E2E] text-xs max-w-[200px]">
                          {s.help}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                  <button className="text-xs font-bold text-muted-foreground hover:text-white transition-colors underline underline-offset-4 decoration-muted-foreground/30">
                    Minha plataforma não está aqui →
                  </button>

                  {channels.length > 0 && (
                    <div className="bg-[#13131A] border border-[#1E1E2E] rounded-2xl p-4 space-y-2 animate-in fade-in slide-in-from-bottom-2">
                      <p className="text-[10px] font-black uppercase text-primary">Próximo passo</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        O URL de webhook e as credenciais são gerados por loja após o cadastro. Em{" "}
                        <Link to="/dashboard/integracoes" className="text-primary font-bold underline underline-offset-2">
                          Integrações
                        </Link>{" "}
                        você copia o endpoint seguro e conclui OAuth ou chaves conforme a plataforma.
                      </p>
                    </div>
                  )}
                </div>

                {/* Section B: Marketplaces */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Marketplaces (Recomendado)</h3>
                    <Badge variant="outline" className="text-[8px] font-black text-purple-400 border-purple-400/30">VISÃO UNIFICADA</Badge>
                  </div>
                  <div className="space-y-3">
                    {marketplaces.map(m => (
                      <Tooltip key={m.id}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => toggleChannel(m.id)}
                            disabled={!!isSyncing}
                            className={cn(
                              "w-full p-4 rounded-2xl border transition-all flex items-center justify-between group relative overflow-hidden",
                              channels.includes(m.id) ? "border-primary bg-primary/5" : "border-[#1E1E2E] bg-[#13131A] hover:border-primary/30"
                            )}
                          >
                            <div className="flex items-center gap-4 relative z-10">
                              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shadow-lg", m.color)}>
                                <m.icon className="w-5 h-5 text-white" />
                              </div>
                              <div className="text-left">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold">{m.label}</span>
                                  <Info className="w-3 h-3 text-muted-foreground/40" />
                                  {m.badge && <Badge className="bg-primary/20 text-primary border-0 text-[8px] font-black">{m.badge}</Badge>}
                                </div>
                                <span className="text-[10px] text-muted-foreground font-medium">{channels.includes(m.id) ? "✓ Selecionado — configure em Integrações" : "Clique para selecionar"}</span>
                              </div>
                            </div>
                            {channels.includes(m.id) ? (
                              <CheckCircle2 className="w-5 h-5 text-primary relative z-10 animate-in zoom-in" />
                            ) : (
                              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-white transition-all relative z-10" />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="bg-[#13131A] border-[#1E1E2E] text-xs max-w-[200px]">
                          {m.help}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                  <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex gap-3 italic">
                    <Sparkles className="w-5 h-5 text-primary shrink-0" />
                    <p className="text-[11px] text-primary/80 leading-relaxed font-medium">
                      Com marketplaces conectados, a IA identifica compras multicanal e evita mensagens repetitivas para o mesmo cliente.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* STEP 2: WhatsApp */}
          {step === 2 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="text-center space-y-4">
                <div className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-500 text-[10px] font-black px-3 py-1 rounded-full border border-emerald-500/20 uppercase tracking-[0.2em] mb-2">
                  Passo 2 — Motor de Recuperação
                </div>
                <h1 className="text-4xl md:text-5xl font-black font-syne tracking-tighter">Conectar seu WhatsApp</h1>
                <p className="text-muted-foreground max-w-lg mx-auto font-medium">Este é o canal onde as prescrições de IA serão executadas automaticamente.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center bg-[#13131A] border border-[#1E1E2E] rounded-3xl p-8 md:p-12">
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <Smartphone className="w-5 h-5 text-emerald-500" />
                      </div>
                      <div>
                        <h3 className="font-bold">Conexão via Meta Cloud API</h3>
                        <p className="text-xs text-muted-foreground">WhatsApp Business oficial (Graph API) no dashboard.</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                        <Zap className="w-5 h-5 text-blue-500" />
                      </div>
                      <div>
                        <h3 className="font-bold">Recuperação Instantânea</h3>
                        <p className="text-xs text-muted-foreground">Carrinhos e boletos recuperados em tempo real.</p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 space-y-3">
                    {waConnected ? (
                      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-center gap-3 animate-in fade-in zoom-in">
                        <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
                        <div>
                          <p className="font-bold text-emerald-400 text-sm">WhatsApp conectado!</p>
                          {waConnected.phone && (
                            <p className="text-xs text-muted-foreground font-mono">{waConnected.phone}</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <Button
                        onClick={() => void handleConnectWhatsApp()}
                        disabled={waConnecting}
                        className="w-full h-12 bg-[#1877F2] hover:bg-[#1877F2]/90 text-white font-bold rounded-xl gap-2"
                      >
                        {waConnecting ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Conectando...</>
                        ) : (
                          <><Facebook className="w-4 h-4" /> Conectar com Facebook</>
                        )}
                      </Button>
                    )}
                    <Button
                      onClick={() => setStep(3)}
                      variant="ghost"
                      className="w-full text-xs text-muted-foreground hover:text-white"
                    >
                      {waConnected ? "Continuar →" : "Configurar manualmente depois"}
                    </Button>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full" />
                  <div className="relative bg-black rounded-2xl p-6 border border-white/10 shadow-2xl flex flex-col items-center gap-4">
                    {waConnected ? (
                      <>
                        <div className="w-48 h-48 rounded-xl flex items-center justify-center bg-emerald-500/10">
                          <CheckCircle2 className="w-24 h-24 text-emerald-500 animate-in zoom-in" />
                        </div>
                        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Conectado ✓</p>
                      </>
                    ) : (
                      <>
                        <div className="w-48 h-48 rounded-xl flex items-center justify-center bg-[#1877F2]/10 border border-[#1877F2]/20">
                          <div className="text-center space-y-3">
                            <Facebook className="w-16 h-16 text-[#1877F2] mx-auto" />
                            <p className="text-xs text-muted-foreground font-medium">Conexão automática<br />via Meta Business</p>
                          </div>
                        </div>
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                          {waConnecting ? "Conectando..." : "Aguardando Conexão..."}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Primeira Prescrição */}
          {step === 3 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="text-center space-y-4">
                <div className="inline-flex items-center gap-2 bg-amber-500/10 text-amber-500 text-[10px] font-black px-3 py-1 rounded-full border border-amber-500/20 uppercase tracking-[0.2em] mb-2">
                  <Sparkles className="w-3 h-3" /> Passo 3 — Primeira Prescrição
                </div>
                <h1 className="text-4xl md:text-5xl font-black font-syne tracking-tighter">
                  A IA já detectou <span className="text-primary">R$ {mockPrescription.valor.toLocaleString('pt-BR')}</span> parados
                </h1>
                <p className="text-muted-foreground max-w-lg mx-auto font-medium">
                  Em menos de 60 segundos de análise, identificamos sua primeira oportunidade de recuperação.
                </p>
              </div>

              {/* Mock Prescription Card */}
              <div className="bg-[#0A0A0F] border border-amber-500/20 rounded-3xl p-8 relative overflow-hidden shadow-2xl shadow-amber-500/5">
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full -mr-32 -mt-32 blur-[80px]" />
                <div className="relative z-10 space-y-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <Badge className="bg-amber-500 text-black border-none font-black text-[9px] uppercase px-2">Oportunidade de Ouro — Detectada Agora</Badge>
                      <h3 className="text-2xl font-black text-white font-syne tracking-tight leading-tight">
                        {mockPrescription.tipo}: <span className="text-amber-400">{mockPrescription.clientes} clientes</span> aguardam contato
                      </h3>
                      <p className="text-white/60 text-sm leading-relaxed">
                        O Agente IA identificou clientes com alta probabilidade de conversão agora. Uma mensagem personalizada pode recuperar esses pedidos em minutos.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white/5 rounded-2xl p-4 text-center">
                      <DollarSign className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
                      <p className="text-xl font-black text-emerald-400">R$ {mockPrescription.valor.toLocaleString('pt-BR')}</p>
                      <p className="text-[9px] text-white/40 uppercase font-bold tracking-widest mt-1">Impacto Estimado</p>
                    </div>
                    <div className="bg-white/5 rounded-2xl p-4 text-center">
                      <TrendingUp className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                      <p className="text-xl font-black text-blue-400">14.2%</p>
                      <p className="text-[9px] text-white/40 uppercase font-bold tracking-widest mt-1">Taxa de Recuperação</p>
                    </div>
                    <div className="bg-white/5 rounded-2xl p-4 text-center">
                      <Zap className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                      <p className="text-xl font-black text-amber-400">2 seg</p>
                      <p className="text-[9px] text-white/40 uppercase font-bold tracking-widest mt-1">Para Executar</p>
                    </div>
                  </div>

                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 text-sm text-emerald-300 italic font-medium">
                    💡 Esta prescrição expira em 24h. Lojistas que aprovam nas primeiras 2h têm <strong>3.2x mais conversões</strong>.
                  </div>
                </div>
              </div>

              {/* Weekly Pulse opt-in */}
              <div className="bg-[#13131A] border border-[#1E1E2E] rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Bell className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">Ativar Pulse Semanal (recomendado)</h3>
                    <p className="text-xs text-muted-foreground">Receba todo domingo um resumo de ROI e oportunidades detectadas via WhatsApp.</p>
                  </div>
                  <Badge className="ml-auto bg-primary/10 text-primary border-none text-[8px] font-black shrink-0">GRÁTIS</Badge>
                </div>
                <div className="flex gap-3">
                  <Input
                    placeholder="+55 11 99999-9999"
                    value={pulseNum}
                    onChange={e => setPulseNum(e.target.value)}
                    className="h-11 rounded-xl font-mono bg-background/50 border-[#2E2E3E] flex-1"
                  />
                  <Label className="sr-only">Número para o Pulse</Label>
                </div>
                <p className="text-[10px] text-muted-foreground italic">Deixe em branco para ativar depois em Configurações → Pulse Semanal.</p>
              </div>

              {/* Community CTA */}
              {showCommunity && (
                <div className="bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/20 rounded-2xl p-6 space-y-4 animate-in fade-in duration-500">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                      <Users className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-emerald-300">Elite E-commerce Brasil</h3>
                      <p className="text-xs text-muted-foreground">1.200+ lojistas · benchmarks semanais · suporte entre pares</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Bem-vindo(a) ao LTV Boost{companyName ? `, ${companyName}` : ""}! Nossa comunidade exclusiva é onde lojistas compartilham táticas reais que movem o ponteiro.
                  </p>
                  <div className="flex gap-3 flex-wrap">
                    <button
                      type="button"
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors"
                      onClick={() => toast.info("Link da comunidade disponível em breve no dashboard.")}
                    >
                      <MessageCircle className="w-4 h-4" /> Entrar na Comunidade
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action Footer */}
          <div className="pt-12 border-t border-[#1E1E2E] flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-6">
              {step === 1 && (
                <div className="flex items-center gap-4 text-sm font-bold">
                  <div className="flex flex-col">
                    <span className="text-primary font-black font-syne text-xl leading-none">{channels.length}</span>
                    <span className="text-[9px] text-muted-foreground uppercase font-black tracking-widest mt-1">Canais</span>
                  </div>
                  <div className="w-px h-8 bg-[#1E1E2E]" />
                  <div className="flex flex-col">
                    <span className="font-black font-syne text-xl leading-none">{channels.length > 0 ? channels.length * 42 : 0}+</span>
                    <span className="text-[9px] text-muted-foreground uppercase font-black tracking-widest mt-1">Pedidos</span>
                  </div>
                </div>
              )}
              {step === 1 && (
                <Button
                  variant="ghost"
                  onClick={handleDemoMode}
                  className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-white"
                >
                  Explorar com dados demo
                </Button>
              )}
            </div>

            <div className="flex flex-col items-center gap-3">
              {step < 3 ? (
                <Button
                  size="lg"
                  onClick={handleNextStep}
                  disabled={step === 1 && channels.length === 0}
                  className="h-14 px-12 text-lg font-black bg-gradient-to-r from-emerald-500 to-blue-600 rounded-xl shadow-xl shadow-emerald-500/20 hover:scale-105 hover:shadow-emerald-500/40 transition-all gap-2 group"
                >
                  {step === 1 ? "Próximo: WhatsApp" : "Próximo: Ver Prescrição"} <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              ) : (
                <Button
                  size="lg"
                  onClick={() => void handleLaunch()}
                  disabled={isLaunching}
                  className="h-14 px-12 text-lg font-black bg-primary hover:bg-primary/90 rounded-xl shadow-xl shadow-primary/20 hover:scale-105 transition-all gap-2 group"
                >
                  {isLaunching ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Iniciando...</>
                  ) : (
                    <><Zap className="w-5 h-5 fill-white" /> Aprovar e Ver Dashboard</>
                  )}
                </Button>
              )}
              <p className="text-[9px] font-black text-muted-foreground flex items-center gap-1.5 uppercase tracking-[0.2em]">
                <Shield className="w-3.5 h-3.5 text-emerald-500" /> Criptografia ponta a ponta ativa
              </p>
            </div>
          </div>
        </div>
      </TooltipProvider>
    </div>
  );
}
