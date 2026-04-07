import React from "react";
import { cn } from "@/lib/utils";

interface HistoricoPoint {
  data: string;
  score: number;
  label?: string;
}

interface CHSGaugeProps {
  score: number;
  label: string;
  breakdown?: {
    conversao: number;
    funil: number;
    produtos: number;
    mobile: number;
  };
  historico?: HistoricoPoint[];
  className?: string;
}

export const CHSGauge: React.FC<CHSGaugeProps> = ({ score, label, breakdown, historico, className }) => {
  const radius = 80;
  const stroke = 12;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const semiCircumference = circumference / 2;
  const strokeDashoffset = semiCircumference - (score / 100) * semiCircumference;

  const getColor = (s: number) => {
    if (s < 30) return "stroke-red-500";
    if (s < 50) return "stroke-orange-500";
    if (s < 70) return "stroke-amber-500";
    if (s < 85) return "stroke-emerald-500";
    return "stroke-emerald-400";
  };

  const getTextColor = (s: number) => {
    if (s < 30) return "text-red-500";
    if (s < 50) return "text-orange-500";
    if (s < 70) return "text-amber-500";
    if (s < 85) return "text-emerald-500";
    return "text-emerald-400";
  };

  const renderSparkline = () => {
    if (!historico || historico.length < 2) return null;
    const scores = historico.map(h => h.score);
    const min = Math.min(...scores) - 2;
    const max = Math.max(...scores) + 2;
    const range = max - min || 1;
    const W = 100;
    const H = 20;

    const points = historico
      .map((h, i) => {
        const x = (i / (historico.length - 1)) * W;
        const y = H - ((h.score - min) / range) * H;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    const firstScore = scores[0];
    const lastScore = scores[scores.length - 1];
    const diff = lastScore - firstScore;
    const lastPointStr = points.split(" ").pop() ?? "0,0";
    const lastY = parseFloat(lastPointStr.split(",")[1]);

    return (
      <div className="flex items-center gap-4 mt-6 pt-4 border-t border-border/10 w-full">
        <div className="flex-1 min-w-0">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full overflow-visible"
            style={{ height: 24 }}
          >
            <polyline
              points={points}
              fill="none"
              strokeWidth="1.5"
              className="stroke-primary/60"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx={W} cy={lastY} r="2.5" className="fill-primary" />
          </svg>
        </div>
        <div className="text-right shrink-0">
          <p className={cn("text-[11px] font-black", diff >= 0 ? "text-emerald-500" : "text-red-500")}>
            {diff >= 0 ? "↑" : "↓"} {Math.abs(diff)} pts
          </p>
          <p className="text-[9px] text-muted-foreground/50 uppercase font-bold tracking-wider">6 semanas</p>
        </div>
      </div>
    );
  };

  return (
    <div className={cn("bg-card/50 backdrop-blur-sm border border-border/50 rounded-3xl p-8 flex flex-col items-center hover:border-primary/30 transition-all duration-500 group", className)}>
      <div className="relative w-56 h-28 overflow-hidden">
        <svg height={radius * 2} width={radius * 2} className="absolute left-1/2 -translate-x-1/2 drop-shadow-[0_0_15px_rgba(16,185,129,0.1)]">
          <circle
            stroke="currentColor"
            fill="transparent"
            strokeWidth={stroke}
            strokeDasharray={`${semiCircumference} ${circumference}`}
            style={{ strokeDashoffset: 0 }}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
            className="text-muted/10"
          />
          <circle
            fill="transparent"
            strokeWidth={stroke}
            strokeDasharray={`${semiCircumference} ${circumference}`}
            style={{
              strokeDashoffset,
              transition: "stroke-dashoffset 2s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
            className={cn("transition-all duration-1000", getColor(score))}
          />
        </svg>
        <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center">
          <span className="text-5xl font-black font-mono tracking-tighter group-hover:scale-110 transition-transform duration-500">
            {score}
          </span>
          <span className={cn("text-[10px] font-bold uppercase tracking-[0.2em] mt-1", getTextColor(score))}>
            {label}
          </span>
        </div>
      </div>

      <div className="w-full mt-8 grid grid-cols-2 gap-x-8 gap-y-6">
        {breakdown && (
          <>
            <div className="space-y-2">
              <div className="flex justify-between text-[9px] uppercase font-bold tracking-wider text-muted-foreground/70">
                <span>Conversão</span>
                <span className="font-mono">{breakdown.conversao}/55</span>
              </div>
              <div className="h-1 bg-muted/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary/80 group-hover:bg-primary transition-colors"
                  style={{ width: `${(breakdown.conversao / 55) * 100}%` }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[9px] uppercase font-bold tracking-wider text-muted-foreground/70">
                <span>Funil</span>
                <span className="font-mono">{breakdown.funil}/20</span>
              </div>
              <div className="h-1 bg-muted/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary/80 group-hover:bg-primary transition-colors"
                  style={{ width: `${(breakdown.funil / 20) * 100}%` }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[9px] uppercase font-bold tracking-wider text-muted-foreground/70">
                <span>Produtos</span>
                <span className="font-mono">{breakdown.produtos}/15</span>
              </div>
              <div className="h-1 bg-muted/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary/80 group-hover:bg-primary transition-colors"
                  style={{ width: `${(breakdown.produtos / 15) * 100}%` }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[9px] uppercase font-bold tracking-wider text-muted-foreground/70">
                <span>Mobile</span>
                <span className="font-mono">{breakdown.mobile}/10</span>
              </div>
              <div className="h-1 bg-muted/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary/80 group-hover:bg-primary transition-colors"
                  style={{ width: `${(breakdown.mobile / 10) * 100}%` }}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {renderSparkline()}
    </div>
  );
};
