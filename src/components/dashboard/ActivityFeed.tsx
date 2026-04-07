import { useState, useEffect } from "react";
import { ShoppingCart, RefreshCcw, Zap, Heart, Package, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

type FeedItem = {
  icon: React.ElementType;
  colorClass: string;
  desc: string;
  contact: string;
  value: number;
  minutesAgo: number;
};

const BASE_FEED: FeedItem[] = [
  { icon: ShoppingCart, colorClass: "text-emerald-500 bg-emerald-500/10", desc: "Carrinho recuperado", contact: "Ana L.", value: 340, minutesAgo: 4 },
  { icon: RefreshCcw, colorClass: "text-purple-500 bg-purple-500/10", desc: "Cliente reativado", contact: "Carlos M.", value: 189, minutesAgo: 12 },
  { icon: DollarSign, colorClass: "text-blue-500 bg-blue-500/10", desc: "PIX confirmado", contact: "Juliana F.", value: 520, minutesAgo: 27 },
  { icon: ShoppingCart, colorClass: "text-emerald-500 bg-emerald-500/10", desc: "Carrinho recuperado", contact: "Pedro S.", value: 220, minutesAgo: 45 },
  { icon: Zap, colorClass: "text-amber-500 bg-amber-500/10", desc: "Cross-sell convertido", contact: "Mariana K.", value: 890, minutesAgo: 63 },
  { icon: Heart, colorClass: "text-red-500 bg-red-500/10", desc: "Aniversário convertido", contact: "Roberto B.", value: 460, minutesAgo: 95 },
  { icon: Package, colorClass: "text-indigo-500 bg-indigo-500/10", desc: "Recompra ativada", contact: "Fernanda C.", value: 275, minutesAgo: 118 },
  { icon: ShoppingCart, colorClass: "text-emerald-500 bg-emerald-500/10", desc: "Carrinho recuperado", contact: "Lucas A.", value: 330, minutesAgo: 142 },
];

function formatMinutes(min: number): string {
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return h === 1 ? "há 1h" : `há ${h}h`;
}

export function ActivityFeed() {
  const [items, setItems] = useState<FeedItem[]>(BASE_FEED.slice(0, 6));
  const [newEntryIdx, setNewEntryIdx] = useState<number | null>(null);

  // Simulate a new capture every 18 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setItems((prev) => {
        const next = BASE_FEED[Math.floor(Math.random() * BASE_FEED.length)];
        const fresh: FeedItem = { ...next, minutesAgo: Math.floor(Math.random() * 3) + 1 };
        const updated = [fresh, ...prev.slice(0, 5)];
        setNewEntryIdx(0);
        setTimeout(() => setNewEntryIdx(null), 1200);
        return updated;
      });
    }, 18_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-card/50 border border-border/20 rounded-3xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
            Capturas em tempo real
          </h3>
          <p className="text-sm font-black">Ações automáticas da IA</p>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">Ao vivo</span>
        </div>
      </div>

      <div className="space-y-2">
        {items.map((item, idx) => {
          const Icon = item.icon;
          const isNew = idx === newEntryIdx;
          return (
            <div
              key={`${item.contact}-${item.minutesAgo}-${idx}`}
              className={cn(
                "flex items-center gap-3 p-3 rounded-2xl transition-all duration-500",
                isNew
                  ? "bg-primary/10 border border-primary/20 scale-[1.01]"
                  : "bg-muted/20 hover:bg-muted/40"
              )}
            >
              <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", item.colorClass)}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black leading-none truncate">{item.desc}</p>
                <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{item.contact}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-black font-mono text-emerald-500">
                  +R$ {item.value.toLocaleString("pt-BR")}
                </p>
                <p className="text-[9px] text-muted-foreground/50 font-mono">{formatMinutes(item.minutesAgo)}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-2 border-t border-border/20 flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground/60 font-bold">
          Total hoje:{" "}
          <span className="text-emerald-500 font-black">
            R$ {items.reduce((s, i) => s + i.value, 0).toLocaleString("pt-BR")}
          </span>
        </p>
        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40">
          {items.length} capturas
        </p>
      </div>
    </div>
  );
}
