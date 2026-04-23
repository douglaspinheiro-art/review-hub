import { Clock, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatRelativeTime, isStale } from "@/lib/data-provenance";

export interface FreshnessIndicatorProps {
  updatedAt: string | number | Date | null | undefined;
  /** SLA em minutos. Acima disso, exibe ícone de stale. Default: 60min. */
  slaMinutes?: number;
  label?: string;
  className?: string;
}

export function FreshnessIndicator({
  updatedAt,
  slaMinutes = 60,
  label = "Atualizado",
  className,
}: FreshnessIndicatorProps) {
  const stale = isStale(updatedAt, slaMinutes);
  const Icon = stale ? AlertTriangle : Clock;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[10px] font-medium",
              stale ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
              className,
            )}
          >
            <Icon className="w-3 h-3" />
            {label} {formatRelativeTime(updatedAt)}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {stale
            ? `Dado acima do SLA de ${slaMinutes}min — pode estar desatualizado.`
            : `Dado dentro do SLA de ${slaMinutes}min.`}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default FreshnessIndicator;