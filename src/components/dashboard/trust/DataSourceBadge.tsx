import { CheckCircle2, GitBranch, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  DATA_SOURCE_DESCRIPTION,
  DATA_SOURCE_LABEL,
  type DataSource,
  formatRelativeTime,
} from "@/lib/data-provenance";

const VARIANT_CLASSES: Record<DataSource, string> = {
  real: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  derived: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  estimated: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

const ICONS: Record<DataSource, typeof CheckCircle2> = {
  real: CheckCircle2,
  derived: GitBranch,
  estimated: Sparkles,
};

export interface DataSourceBadgeProps {
  source: DataSource;
  /** Origem técnica curta (ex.: "RPC get_dashboard_snapshot", "webhook orders", "fallback local"). */
  origin?: string;
  /** Última atualização do dado (ISO ou Date). */
  updatedAt?: string | number | Date | null;
  /** Texto adicional opcional dentro do tooltip. */
  note?: string;
  className?: string;
  /** Quando true, mostra apenas o ícone (uso em listas densas). */
  compact?: boolean;
}

export function DataSourceBadge({
  source,
  origin,
  updatedAt,
  note,
  className,
  compact = false,
}: DataSourceBadgeProps) {
  const Icon = ICONS[source];
  const tooltipLines = [
    DATA_SOURCE_DESCRIPTION[source],
    origin ? `Fonte: ${origin}` : null,
    updatedAt ? `Atualizado ${formatRelativeTime(updatedAt)}` : null,
    note,
  ].filter(Boolean) as string[];

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "gap-1 px-1.5 py-0 text-[10px] font-bold uppercase tracking-wide cursor-help",
              VARIANT_CLASSES[source],
              className,
            )}
          >
            <Icon className="w-3 h-3" />
            {!compact && DATA_SOURCE_LABEL[source]}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs space-y-1 text-xs">
          {tooltipLines.map((line, i) => (
            <p key={i} className={i === 0 ? "font-medium" : "text-muted-foreground"}>
              {line}
            </p>
          ))}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default DataSourceBadge;