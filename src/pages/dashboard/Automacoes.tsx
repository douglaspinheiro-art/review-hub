import { useState } from "react";
import { 
  Zap, MessageCircle, Mail, Send, 
  Plus, Play, Pause, ChevronRight,
  UserPlus, ShoppingCart, CreditCard, 
  RefreshCcw, Gift, Heart, Sparkles,
  BarChart3, Settings2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

const JORNADAS = [
  {
    id: "j1",
    titulo: "Jornada do Novo Cliente",
    desc: "Transforme a primeira compra em recorrência.",
    gatilho: "Primeira compra finalizada",
    icon: UserPlus,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    kpi: "Taxa 2ª Compra",
    kpiValue: "18.4%",
    status: true,
    fluxo: ["WA Confirmação (D0)", "Email Rastreio (D3)", "WA Satisfação (D7)", "Email Cross-sell (D14)"]
  },
  {
    id: "j2",
    titulo: "Carrinho Abandonado",
    desc: "Recupere vendas perdidas automaticamente.",
    gatilho: "Carrinho sem compra em 1h",
    icon: ShoppingCart,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    kpi: "Recuperação",
    kpiValue: "14.2%",
    status: true,
    fluxo: ["WA (1h)", "Email (4h)", "SMS + Cupom (24h)"]
  },
  {
    id: "j3",
    titulo: "Boleto/PIX Vencido",
    desc: "Lembrete suave para pagamentos pendentes.",
    gatilho: "Pedido aguardando pagamento",
    icon: CreditCard,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    kpi: "Pagos",
    kpiValue: "42.1%",
    status: true,
    fluxo: ["WA (2h)", "Email (24h)", "WA Final (48h)"]
  },
  {
    id: "j4",
    titulo: "Reativação Automática",
    desc: "Recupere clientes que não compram há 60 dias.",
    gatilho: "Sem compra em nenhum canal",
    icon: RefreshCcw,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    kpi: "Reativados",
    kpiValue: "8.7%",
    status: false,
    fluxo: ["Email Saudade (D60)", "WA Oferta (D65)", "SMS Cupom Final (D70)"]
  },
  {
    id: "j5",
    titulo: "Pós-compra e Cross-sell",
    desc: "Sugira produtos complementares após o envio.",
    gatilho: "Pedido entregue",
    icon: Sparkles,
    color: "text-pink-500",
    bg: "bg-pink-500/10",
    kpi: "Ticket Médio",
    kpiValue: "+R$ 42",
    status: true,
    fluxo: ["WA Obrigado (D1)", "Email Uso (D5)", "WA Sugestão (D15)"]
  },
  {
    id: "j6",
    titulo: "Fidelidade — Pontos",
    desc: "Notifique sobre pontos e recompensas.",
    gatilho: "Mudança de saldo de pontos",
    icon: Gift,
    color: "text-indigo-500",
    bg: "bg-indigo-500/10",
    kpi: "Uso Pontos",
    kpiValue: "22%",
    status: true,
    fluxo: ["WA Saldo (D0)", "WA Recompensa (D-3 expira)"]
  },
  {
    id: "j7",
    titulo: "Aniversário",
    desc: "Presenteie seus clientes no dia especial.",
    gatilho: "3 dias antes do aniversário",
    icon: Heart,
    color: "text-red-500",
    bg: "bg-red-500/10",
    kpi: "Conversão",
    kpiValue: "31.5%",
    status: true,
    fluxo: ["WA Oferta (D-3)", "Email Parabéns (D0)"]
  }
];

export default function Automacoes() {
  const [jornadas, setJornadas] = useState(JORNADAS);

  const toggleJornada = (id: string) => {
    setJornadas(prev => prev.map(j => j.id === id ? { ...j, status: !j.status } : j));
  };

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black font-syne tracking-tighter uppercase">Jornadas Permanentes</h1>
          <p className="text-muted-foreground text-sm mt-1">Automações inteligentes que trabalham 24/7 pela sua conversão.</p>
        </div>
        <Button className="font-bold gap-2 rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
          <Plus className="w-4 h-4" /> Criar Jornada Customizada
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {jornadas.map((j) => (
          <div key={j.id} className={cn(
            "bg-card border rounded-2xl overflow-hidden transition-all duration-300 flex flex-col",
            j.status ? "border-primary/20 shadow-sm" : "border-border/50 opacity-70 grayscale"
          )}>
            <div className="p-6 space-y-4 flex-1">
              <div className="flex items-start justify-between">
                <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", j.bg)}>
                  <j.icon className={cn("w-6 h-6", j.color)} />
                </div>
                <Switch checked={j.status} onCheckedChange={() => toggleJornada(j.id)} />
              </div>

              <div>
                <h3 className="font-bold text-lg leading-tight">{j.titulo}</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{j.desc}</p>
              </div>

              <div className="bg-muted/30 rounded-xl p-3 border border-border/50">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase text-muted-foreground mb-2">
                  <Zap className="w-3 h-3 text-primary fill-primary" /> Gatilho
                </div>
                <p className="text-xs font-bold leading-none">{j.gatilho}</p>
              </div>

              <div className="space-y-2">
                <span className="text-[10px] font-black uppercase text-muted-foreground block">Fluxo da Jornada</span>
                <div className="flex flex-wrap gap-1">
                  {j.fluxo.map((f, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[9px] py-0 h-5 font-medium border-border/60">{f}</Badge>
                      {i < j.fluxo.length - 1 && <ChevronRight className="w-2 h-2 text-muted-foreground" />}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-muted/20 border-t border-border/50 p-4 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[9px] font-black uppercase text-muted-foreground">{j.kpi}</span>
                <div className="text-sm font-black font-syne text-emerald-500">{j.kpiValue}</div>
              </div>
              <Button variant="ghost" size="sm" className="h-8 text-[10px] font-black uppercase tracking-tighter gap-1 hover:bg-primary/10 hover:text-primary">
                Configurar <Settings2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}

        {/* Builder Placeholder Card */}
        <div className="border-2 border-dashed border-border/60 rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-4 hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer group">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
            <Plus className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <div>
            <h4 className="font-bold text-sm">Nova Automação</h4>
            <p className="text-xs text-muted-foreground">Arraste e solte blocos para criar fluxos customizados.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
