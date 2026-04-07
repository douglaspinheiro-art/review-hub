import React from "react";
import { DollarSign, TrendingUp, Zap, ArrowUpRight, BarChart3, PieChart } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface ROIAttributionProps {
  revenue: number;
  growth: number;
  period: number;
  cost?: number;
  directPct?: number;
  assistedPct?: number;
  breakdown?: { recovery: number; rebuy: number; upsell: number };
  className?: string;
}

export function ROIAttribution({ revenue, growth, period, cost = 297, directPct = 82, assistedPct = 18, breakdown, className }: ROIAttributionProps) {
  const roas = cost > 0 ? (revenue / cost).toFixed(1) : "0";
  const bk = breakdown ?? {
    recovery: revenue * 0.65,
    rebuy: revenue * 0.25,
    upsell: revenue * 0.10,
  };
  
  return (
    <Card className={cn("p-6 overflow-hidden relative border-primary/20 bg-card/50 backdrop-blur-xl shadow-2xl shadow-primary/5 rounded-3xl", className)}>
      <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform">
        <DollarSign className="w-32 h-32 text-primary" />
      </div>

      <div className="relative z-10 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Badge className="bg-primary/10 text-primary border-none font-black text-[9px] uppercase tracking-widest px-2 py-0.5">
              Atribuição de ROI (V4)
            </Badge>
            <h3 className="text-xl font-black font-syne tracking-tighter uppercase italic">Retorno sobre <span className="text-primary">Investimento</span></h3>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Últimos {period} dias</p>
            <div className={cn("flex items-center gap-1 text-xs font-bold", growth >= 0 ? "text-emerald-500" : "text-red-500")}>
              {growth >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <TrendingUp className="w-3 h-3 rotate-180" />}
              {Math.abs(growth)}% vs anterior
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main Metric */}
          <div className="md:col-span-1 space-y-2">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Receita Influenciada</p>
            <p className="text-4xl font-black font-syne tracking-tighter text-foreground">
              R$ {revenue.toLocaleString("pt-BR")}
            </p>
            <p className="text-xs text-muted-foreground">Vendas atribuídas ao canal WhatsApp e Automações.</p>
          </div>

          {/* Efficiency Metric */}
          <div className="md:col-span-1 space-y-2 border-l border-border/10 pl-6">
            <p className="text-[10px] font-black text-primary uppercase tracking-widest">ROI / ROAS</p>
            <p className="text-4xl font-black font-syne tracking-tighter text-primary italic">
              {roas}x
            </p>
            <p className="text-xs text-muted-foreground">Cada R$ 1 investido retornou R$ {roas} em vendas.</p>
          </div>

          {/* Channel Health */}
          <div className="md:col-span-1 space-y-4 border-l border-border/10 pl-6">
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                <span>Atribuição Direta (WA)</span>
                <span className="text-primary">{directPct}%</span>
              </div>
              <Progress value={directPct} className="h-1.5 bg-primary/10" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                <span>Atribuição Assistida</span>
                <span className="text-muted-foreground">{assistedPct}%</span>
              </div>
              <Progress value={assistedPct} className="h-1.5 bg-muted/20" />
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-border/10">
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2 bg-background/50 px-3 py-2 rounded-xl border border-border/50">
              <Zap className="w-4 h-4 text-amber-500" />
              <div className="space-y-0.5">
                <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Recuperação</p>
                <p className="text-xs font-bold">R$ {bk.recovery.toLocaleString("pt-BR")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-background/50 px-3 py-2 rounded-xl border border-border/50">
              <BarChart3 className="w-4 h-4 text-indigo-500" />
              <div className="space-y-0.5">
                <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Recompra (LTV)</p>
                <p className="text-xs font-bold">R$ {bk.rebuy.toLocaleString("pt-BR")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-background/50 px-3 py-2 rounded-xl border border-border/50">
              <PieChart className="w-4 h-4 text-emerald-500" />
              <div className="space-y-0.5">
                <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Upsell/Cross</p>
                <p className="text-xs font-bold">R$ {bk.upsell.toLocaleString("pt-BR")}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
