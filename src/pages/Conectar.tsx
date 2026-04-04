import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  CheckCircle2, Globe, ShoppingBag, Smartphone, 
  ArrowRight, Shield, AlertTriangle, Loader2 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function Conectar() {
  const navigate = useNavigate();
  const [channels, setChannels] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);

  const ownStores = [
    { id: "shopify", label: "Shopify", icon: Globe },
    { id: "vtex", label: "VTEX", icon: Globe },
    { id: "nuvemshop", label: "Nuvemshop", icon: Globe },
    { id: "woocommerce", label: "WooCommerce", icon: Globe },
  ];

  const marketplaces = [
    { id: "ml", label: "Mercado Livre", icon: ShoppingBag, color: "bg-yellow-400" },
    { id: "shopee", label: "Shopee", icon: ShoppingBag, color: "bg-orange-500" },
    { id: "tiktok", label: "TikTok Shop", icon: Smartphone, color: "bg-black", badge: "BETA" },
  ];

  const toggleChannel = (id: string) => {
    if (channels.includes(id)) {
      setChannels(channels.filter(c => c !== id));
    } else {
      setIsSyncing(id);
      setTimeout(() => {
        setChannels([...channels, id]);
        setIsSyncing(null);
      }, 1500);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white flex flex-col items-center p-6 md:p-20">
      <div className="max-w-4xl w-full space-y-12">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-black">L</div>
            <span className="font-bold tracking-tighter">LTV BOOST</span>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className={cn("w-2 h-2 rounded-full", i === 2 ? "bg-primary" : "bg-muted")} />
            ))}
          </div>
        </div>

        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-black font-syne tracking-tighter">Conectar canais de venda</h1>
          <p className="text-muted-foreground max-w-lg mx-auto">Conecte sua loja e marketplaces para que a IA identifique seus clientes reais em todos os canais.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div className="space-y-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Loja Própria (Obrigatório)</h3>
            <div className="grid grid-cols-2 gap-3">
              {ownStores.map(s => (
                <button
                  key={s.id}
                  onClick={() => toggleChannel(s.id)}
                  disabled={!!isSyncing}
                  className={cn(
                    "p-4 rounded-2xl border transition-all text-left relative group",
                    channels.includes(s.id) ? "border-primary bg-primary/5" : "border-[#1E1E2E] bg-[#13131A] hover:border-primary/30"
                  )}
                >
                  {channels.includes(s.id) && <CheckCircle2 className="w-4 h-4 text-primary absolute top-3 right-3" />}
                  {isSyncing === s.id && <Loader2 className="w-4 h-4 text-primary animate-spin absolute top-3 right-3" />}
                  <s.icon className={cn("w-6 h-6 mb-3", channels.includes(s.id) ? "text-primary" : "text-muted-foreground")} />
                  <span className="text-sm font-bold block">{s.label}</span>
                  {channels.includes(s.id) && <span className="text-[9px] text-primary font-bold uppercase mt-1 block">Conectado</span>}
                </button>
              ))}
            </div>
            <button className="text-xs font-bold text-muted-foreground hover:text-white transition-colors underline underline-offset-4">
              Inserir dados manualmente →
            </button>
          </div>

          <div className="space-y-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Marketplaces (Recomendado)</h3>
            <div className="space-y-3">
              {marketplaces.map(m => (
                <button
                  key={m.id}
                  onClick={() => toggleChannel(m.id)}
                  disabled={!!isSyncing}
                  className={cn(
                    "w-full p-4 rounded-2xl border transition-all flex items-center justify-between group",
                    channels.includes(m.id) ? "border-primary bg-primary/5" : "border-[#1E1E2E] bg-[#13131A] hover:border-primary/30"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", m.color)}>
                      <m.icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{m.label}</span>
                        {m.badge && <Badge className="bg-primary/20 text-primary border-0 text-[8px] font-black">{m.badge}</Badge>}
                      </div>
                      <span className="text-[10px] text-muted-foreground">{channels.includes(m.id) ? "✓ Sincronizado" : "Clique para conectar"}</span>
                    </div>
                  </div>
                  {channels.includes(m.id) ? <CheckCircle2 className="w-5 h-5 text-primary" /> : <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-white transition-all" />}
                </button>
              ))}
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex gap-3 italic">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
              <p className="text-[11px] text-amber-200/80 leading-relaxed">
                Com marketplaces conectados, a IA identifica seus clientes reais — mesmo que comprem em canais diferentes.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-12 border-t border-[#1E1E2E] flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4 text-sm font-bold">
            <div className="flex flex-col">
              <span className="text-primary">{channels.length} Canais</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Selecionados</span>
            </div>
            <div className="w-px h-8 bg-[#1E1E2E]" />
            <div className="flex flex-col">
              <span>{channels.length * 42}+ Pedidos</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Identificados</span>
            </div>
          </div>

          <div className="flex flex-col items-center gap-3">
            <Button 
              size="lg" 
              onClick={() => navigate('/analisando')}
              disabled={channels.length === 0}
              className="h-14 px-12 text-lg font-black bg-gradient-to-r from-emerald-500 to-blue-600 rounded-xl shadow-xl shadow-emerald-500/20 hover:scale-105 transition-all gap-2"
            >
              Analisar minha loja <ArrowRight className="w-5 h-5" />
            </Button>
            <p className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 uppercase tracking-widest">
              <Shield className="w-3 h-3" /> Dados usados apenas para seu diagnóstico
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
