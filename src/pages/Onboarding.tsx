import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { 
  CheckCircle2, Globe, ShoppingBag, Smartphone, 
  ArrowRight, Shield, AlertTriangle, Loader2,
  Sparkles, Monitor, Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  
  const [channels, setChannels] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);

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
    if (channels.includes(id)) {
      setChannels(channels.filter(c => c !== id));
    } else {
      setIsSyncing(id);
      // Simulação de OAuth Pop-up
      const popup = window.open('about:blank', 'OAuth', 'width=600,height=600');
      if (popup) {
        popup.document.write('<body style="background:#0A0A0F;color:white;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">' +
          '<h2>Autenticando com ' + id.toUpperCase() + '...</h2>' +
          '<div style="width:40px;height:40px;border:4px solid #10b981;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;"></div>' +
          '<style>@keyframes spin{to{transform:rotate(360deg)}}</style>' +
          '<script>setTimeout(() => window.close(), 2000)</script>' +
          '</body>');
      }

      setTimeout(() => {
        setChannels([...channels, id]);
        setIsSyncing(null);
        toast.success(`Canal ${id.toUpperCase()} conectado nativamente!`);
      }, 2500);
    }
  };

  const getWebhookUrl = (platform: string) => {
    return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/integration-gateway?platform=${platform}&loja_id=SUA_LOJA_ID`;
  };

  const handleAnalyze = () => {
    navigate(`/analisando${perda ? `?perda=${perda}` : ""}`);
  };

  const handleDemoMode = () => {
    navigate('/dashboard?demo=true');
  };

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
            <div className="flex gap-2">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className={cn("w-2 h-2 rounded-full", i <= 2 ? "bg-primary" : "bg-muted")} />
              ))}
            </div>
          </div>

          {/* Momentum Headline */}
          <div className="text-center space-y-4">
            {perda ? (
              <div className="inline-flex items-center gap-2 bg-red-500/10 text-red-500 text-[10px] font-black px-3 py-1 rounded-full border border-red-500/20 uppercase tracking-[0.2em] mb-2">
                Meta: Recuperar R$ {Number(perda).toLocaleString('pt-BR')}/mês
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-[10px] font-black px-3 py-1 rounded-full border border-primary/20 uppercase tracking-[0.2em] mb-2">
                Setup de Inteligência
              </div>
            )}
            <h1 className="text-4xl md:text-5xl font-black font-syne tracking-tighter">Conectar canais de venda</h1>
            <p className="text-muted-foreground max-w-lg mx-auto font-medium">Conecte sua loja e marketplaces para que a IA identifique seus clientes reais em todos os canais.</p>
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

          {/* Action Footer */}
          <div className="pt-12 border-t border-[#1E1E2E] flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-6">
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
              <Button 
                variant="ghost" 
                onClick={handleDemoMode}
                className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-white"
              >
                Explorar com dados demo
              </Button>
            </div>

            <div className="flex flex-col items-center gap-3">
              <Button 
                size="lg" 
                onClick={handleAnalyze}
                disabled={channels.length === 0}
                className="h-14 px-12 text-lg font-black bg-gradient-to-r from-emerald-500 to-blue-600 rounded-xl shadow-xl shadow-emerald-500/20 hover:scale-105 hover:shadow-emerald-500/40 transition-all gap-2 group"
              >
                Analisar minha loja <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
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
