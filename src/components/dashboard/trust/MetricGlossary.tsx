import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface GlossaryEntry {
  term: string;
  definition: string;
}

export interface MetricGlossaryProps {
  entries: GlossaryEntry[];
  triggerLabel?: string;
  className?: string;
}

export function MetricGlossary({
  entries,
  triggerLabel = "Glossário",
  className,
}: MetricGlossaryProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground", className)}
        >
          <BookOpen className="w-3.5 h-3.5" />
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-2">
          <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Como interpretamos
          </h4>
        </div>
        <ul className="max-h-80 overflow-y-auto divide-y">
          {entries.map((entry) => (
            <li key={entry.term} className="px-4 py-3 space-y-1">
              <p className="text-xs font-bold text-foreground">{entry.term}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{entry.definition}</p>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Glossário compartilhado de termos comuns no dashboard. */
export const COMMON_GLOSSARY: GlossaryEntry[] = [
  {
    term: "Receita influenciada",
    definition:
      "Soma das compras de clientes que receberam pelo menos uma mensagem nossa antes da conversão (janela padrão de 3 dias). Inclui efeito assistido — não é causalidade comprovada.",
  },
  {
    term: "Receita atribuída",
    definition:
      "Subset da receita influenciada em que conseguimos vincular o pedido a uma campanha/automação específica via UTM, telefone ou cart_id.",
  },
  {
    term: "Last-touch",
    definition:
      "Modelo padrão: 100% do crédito vai para a última mensagem antes da compra. Modelos linear/first-touch são simulações ilustrativas.",
  },
  {
    term: "Amostra vs universo",
    definition:
      "Quando o gráfico mostra 'amostra', os dados representam um subconjunto carregado em memória — totais agregados vêm separadamente do banco.",
  },
  {
    term: "Estimado",
    definition:
      "Indicador com fallback heurístico (ex.: tendência amortecida, projeção linear) quando a fonte autoritativa não está disponível.",
  },
];

export default MetricGlossary;