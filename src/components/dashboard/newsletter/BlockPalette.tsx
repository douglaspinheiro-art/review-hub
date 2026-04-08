import { Type, Image, MousePointer2, Minus, AlignLeft, Space, ShoppingBag, Columns2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BlockType } from "@/lib/newsletter-renderer";

const PALETTE: { type: BlockType; label: string; desc: string; icon: React.ElementType }[] = [
  { type: "header",  label: "Cabeçalho",  desc: "Título e subtítulo",         icon: Type },
  { type: "text",    label: "Texto",       desc: "Parágrafo com rich text",    icon: AlignLeft },
  { type: "image",   label: "Imagem",      desc: "URL de imagem",             icon: Image },
  { type: "product", label: "Produto",     desc: "Imagem + preço + CTA",      icon: ShoppingBag },
  { type: "columns", label: "Colunas",     desc: "Layout 2 colunas",          icon: Columns2 },
  { type: "button",  label: "Botão CTA",   desc: "Chamada para ação",         icon: MousePointer2 },
  { type: "divider", label: "Divisor",     desc: "Linha separadora",          icon: Minus },
  { type: "spacer",  label: "Espaço",      desc: "Espaço em branco",          icon: Space },
];

interface BlockPaletteProps {
  onAdd: (type: BlockType) => void;
}

export function BlockPalette({ onAdd }: BlockPaletteProps) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1 mb-3">
        Blocos
      </p>
      {PALETTE.map(({ type, label, desc, icon: Icon }) => (
        <button
          key={type}
          type="button"
          onClick={() => onAdd(type)}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-transparent",
            "text-left hover:bg-muted/60 hover:border-border transition-all group"
          )}
        >
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
            <Icon className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground">{label}</p>
            <p className="text-[10px] text-muted-foreground">{desc}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
