import React from "react";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  trend?: number;
  trendLabel?: string;
  icon?: React.ElementType;
  tooltip?: string;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label, value, subValue, trend, trendLabel, icon: Icon, tooltip, className
}) => {
  const isUp = trend !== undefined && trend >= 0;

  return (
    <div className={cn("bg-card border border-border/50 rounded-2xl p-5 group", className)}>
      <div className="flex items-start justify-between mb-3">
        {Icon && (
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        )}
        <div className="flex flex-col items-end gap-1">
          {trend !== undefined && (
            <div className={cn("flex items-center gap-0.5 text-xs font-bold", isUp ? "text-emerald-500" : "text-red-500")}>
              {isUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
              {Math.abs(trend)}%
            </div>
          )}
          {tooltip && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 text-muted-foreground/40 hover:text-muted-foreground transition-colors cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="bg-[#13131A] border-[#1E1E2E] text-xs max-w-[200px]">
                  {tooltip}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
      <div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-black font-syne tracking-tighter leading-none">{value}</span>
          {subValue && <span className="text-sm font-bold text-muted-foreground">{subValue}</span>}
        </div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mt-1">{label}</p>
        {trendLabel && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{trendLabel}</p>}
      </div>
    </div>
  );
};
