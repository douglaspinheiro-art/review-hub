import React from "react";
import { cn } from "@/lib/utils";

interface CHSGaugeProps {
  score: number;
  label: string;
  breakdown?: {
    conversao: number;
    funil: number;
    produtos: number;
    mobile: number;
  };
  className?: string;
}

export const CHSGauge: React.FC<CHSGaugeProps> = ({ score, label, breakdown, className }) => {
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

  return (
    <div className={cn("bg-card border rounded-2xl p-6 flex flex-col items-center", className)}>
      <div className="relative w-48 h-24 overflow-hidden">
        <svg height={radius * 2} width={radius * 2} className="absolute left-1/2 -translate-x-1/2">
          <circle
            stroke="currentColor"
            fill="transparent"
            strokeWidth={stroke}
            strokeDasharray={`${semiCircumference} ${circumference}`}
            style={{ strokeDashoffset: 0 }}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
            className="text-muted/20"
          />
          <circle
            fill="transparent"
            strokeWidth={stroke}
            strokeDasharray={`${semiCircumference} ${circumference}`}
            style={{ 
              strokeDashoffset,
              transition: "stroke-dashoffset 1.5s ease-in-out"
            }}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
            className={cn("transition-all duration-1000", getColor(score))}
          />
        </svg>
        <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center">
          <span className="text-4xl font-bold font-syne tracking-tighter">{score}</span>
          <span className={cn("text-[10px] font-bold uppercase tracking-widest", getTextColor(score))}>
            {label}
          </span>
        </div>
      </div>

      <div className="w-full mt-6 grid grid-cols-2 gap-4">
        {breakdown && (
          <>
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] uppercase font-bold text-muted-foreground">
                <span>Conversão</span>
                <span>{breakdown.conversao}/55</span>
              </div>
              <div className="h-1 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${(breakdown.conversao / 55) * 100}%` }} />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] uppercase font-bold text-muted-foreground">
                <span>Funil</span>
                <span>{breakdown.funil}/20</span>
              </div>
              <div className="h-1 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${(breakdown.funil / 20) * 100}%` }} />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] uppercase font-bold text-muted-foreground">
                <span>Produtos</span>
                <span>{breakdown.produtos}/15</span>
              </div>
              <div className="h-1 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${(breakdown.produtos / 15) * 100}%` }} />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] uppercase font-bold text-muted-foreground">
                <span>Mobile</span>
                <span>{breakdown.mobile}/10</span>
              </div>
              <div className="h-1 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${(breakdown.mobile / 10) * 100}%` }} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
