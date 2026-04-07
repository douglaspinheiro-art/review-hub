import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CheckCircle2, Globe, ShoppingBag, Smartphone,
  ArrowRight, Shield, AlertTriangle, Loader2,
  Sparkles, Info, Zap, QrCode, DollarSign, TrendingUp, Bell, Users, MessageCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function Onboarding() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const perda = searchParams.get("perda");

  // This wizard has been replaced by the /diagnostico flow — redirect immediately
  useEffect(() => {
    navigate("/signup", { replace: true });
  }, [navigate]);

  const [channels, setChannels] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const [step, setStep] = useState(1); // 1: Channels, 2: WhatsApp, 3: Primeira Prescrição
  const [pulseNum, setPulseNum] = useState("");
  const [isLaunching, setIsLaunching] = useState(false);
  const showCommunity = sessionStorage.getItem("ltv_show_community") === "1";
  const companyName = sessionStorage.getItem("ltv_company") || "";

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

  // NOTE: real OAuth integration should be implemented via Supabase edge functions
  // This page redirects immediately (see useEffect above), so this code is not executed
  const toggleChannel = (id: string) => {
    if (channels.includes(id)) {
      setChannels(channels.filter(c => c !== id));
    } else {
      toast.info(`Integração com ${id.toUpperCase()} em breve. Configure via Configurações > Integrações.`);
    }
  };

  const getWebhookUrl = (platform: string) => {
    return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/integration-gateway?platform=${platform}&loja_id=SUA_LOJA_ID`;
  };

  const handleNextStep = () => {
    if (step === 1) setStep(2);
    else if (step === 2) setStep(3);
  };

  const handleLaunch = () => {
    setIsLaunching(true);
    if (pulseNum) {
      toast.success(`Pulse semanal ativado para ${pulseNum}!`);
    }
    sessionStorage.removeItem("ltv_show_community");
    sessionStorage.removeItem("ltv_company");
    setTimeout(() => {
      navigate(`/dashboard?setup=complete&firstweek=true`);
    }, 1200);
  };

  const handleDemoMode = () => {
    navigate('/dashboard?demo=true');
  };

  // Mock prescription for step 3
  const mockPrescription = perda
    ? { valor: Math.round(Number(perda) * 0.18), tipo: "Carrinho Abandonado", clientes: Math.floor(Number(perda) / 120) }
    : { valor: 4200, tipo: "Boletos Expirados", clientes: 34 };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white flex flex-col items-center p-6 md:p-20 overflow-x-hidden">
      <TooltipProvider>
        <div className="max-w-4xl w-full space-y-12">
          {/* Progress Header */}
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

          {/* STEP 1: Canais */}
          {step === 1 && (
            <>
              <div className="text-center space-y-4">
                {perda ? (
                  <div className="inline-flex items-center gap-2 bg-red-500/10 text-red-500 text-[10px] font-black px-3 py-1 rounded-full border border-red-500/20 uppercase tracking-[0.2em] mb-2">
                    Meta: Recuperar R$ {Number(perda).toLocaleString('pt-BR')}/mês
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-[10px] font-black px-3 py-1 rounded-full border border-primary/20 uppercase tracking-[0.2em] mb-2">
                    Passo 1 — Conectar Canais
                  </div>
                )}
                <h1 className="text-4xl md:text-5xl font-black font-syne tracking-tighter">Conectar canais de venda</h1>
                <p className="text-muted-foreground max-w-lg mx-auto font-medium">Conecte sua loja para que a IA identifique seus clientes reais em todos os canais.</p>
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
                            {channels.includes(s.id) && <span className="text-[9px] text-primary font-bold uppercase mt-1 block">Conectado</span>}
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
                    <div className="bg-[#13131A] border border-[#1E1E2E] rounded-2xl p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2">
                      <p className="text-[10px] font-black uppercase text-primary">Webhook de Integração</p>
                      <div className="flex gap-2">
                        <Input readOnly value={getWebhookUrl(channels[0])} className="h-9 text-[10px] font-mono bg-black/50 border-[#1E1E2E]" />
                        <Button variant="outline" size="sm" className="h-9 text-[10px] font-bold" onClick={() => {
                          navigator.clipboard.writeText(getWebhookUrl(channels[0]));
                          toast.success("URL copiada!");
                        }}>Copiar</Button>
                      </div>
                      <p className="text-[9px] text-muted-foreground italic">Cole esta URL nas configurações de Webhook da sua loja.</p>
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
                                <span className="text-[10px] text-muted-foreground font-medium">{channels.includes(m.id) ? "✓ Sincronizado com sucesso" : "Clique para autenticar"}</span>
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
                        <h3 className="font-bold">Conexão via Evolution API</h3>
                        <p className="text-xs text-muted-foreground">Instância estável e segura para WhatsApp Business.</p>
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

                  <div className="pt-4">
                    <Button
                      onClick={() => { toast.success("WhatsApp conectado!"); setStep(3); }}
                      variant="outline"
                      className="w-full h-12 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500 hover:text-white font-bold rounded-xl gap-2"
                    >
                      <QrCode className="w-4 h-4" /> Escanear QR Code agora
                    </Button>
                    <p className="text-[10px] text-muted-foreground text-center mt-3 italic">
                      Você também pode configurar isso depois no dashboard.
                    </p>
                  </div>
                </div>

                <div className="relative group cursor-pointer" onClick={() => { toast.success("WhatsApp conectado!"); setStep(3); }}>
                  <div className="absolute inset-0 bg-emerald-500/20 blur-2xl group-hover:bg-emerald-500/30 transition-all rounded-full" />
                  <div className="relative bg-black rounded-2xl p-6 border border-white/10 shadow-2xl flex flex-col items-center gap-4">
                    <div className="w-48 h-48 bg-white rounded-xl p-2 flex items-center justify-center relative overflow-hidden">
                      <QrCode className="w-40 h-40 text-black" />
                      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] font-black uppercase text-white tracking-widest bg-emerald-500 px-3 py-1 rounded-full">Clique para Gerar</span>
                      </div>
                    </div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Aguardando Conexão...</p>
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
                    <a
                      href={`https://wa.me/5511999999999?text=${encodeURIComponent(`Olá! Acabei de criar minha conta no LTV Boost${companyName ? ` (${companyName})` : ""}. Quero entrar na comunidade Elite E-commerce Brasil!`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors"
                    >
                      <MessageCircle className="w-4 h-4" /> Entrar no WhatsApp
                    </a>
                    <a
                      href="https://t.me/eliteecommercebr"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 border border-white/10 hover:bg-white/5 text-white/70 text-xs font-bold px-4 py-2.5 rounded-xl transition-colors"
                    >
                      Telegram →
                    </a>
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
                  onClick={handleLaunch}
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
