import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X, Type, Image, MousePointer2, Minus, AlignLeft, Space } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Block } from "@/lib/newsletter-renderer";

const BLOCK_ICONS: Record<string, React.ElementType> = {
  header:  Type,
  text:    AlignLeft,
  image:   Image,
  button:  MousePointer2,
  divider: Minus,
  spacer:  Space,
};

const BLOCK_LABELS: Record<string, string> = {
  header:  "Cabeçalho",
  text:    "Texto",
  image:   "Imagem",
  button:  "Botão CTA",
  divider: "Divisor",
  spacer:  "Espaço",
};

interface BlockItemProps {
  block: Block;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export function BlockItem({ block, isSelected, onSelect, onDelete }: BlockItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const Icon = BLOCK_ICONS[block.type] ?? Type;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex items-stretch border rounded-xl overflow-hidden bg-card transition-all cursor-pointer select-none",
        isSelected
          ? "border-primary ring-2 ring-primary/20 shadow-sm"
          : "border-border hover:border-primary/40",
        isDragging && "shadow-2xl"
      )}
      onClick={onSelect}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center px-2 text-muted-foreground/40 hover:text-muted-foreground bg-muted/30 border-r border-border cursor-grab active:cursor-grabbing shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Block preview */}
      <div className="flex-1 px-4 py-3 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            {BLOCK_LABELS[block.type]}
          </span>
        </div>
        <BlockPreview block={block} />
      </div>

      {/* Delete button */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="shrink-0 self-start mt-2 mr-2 w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground/0 group-hover:text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function BlockPreview({ block }: { block: Block }) {
  switch (block.type) {
    case "header":
      return (
        <div className="bg-violet-600 rounded-lg px-3 py-2 text-center">
          <p className="text-xs font-black text-white truncate">{block.data.title || "Título"}</p>
          {block.data.subtitle && (
            <p className="text-[10px] text-violet-200 truncate mt-0.5">{block.data.subtitle}</p>
          )}
        </div>
      );

    case "text":
      return (
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {block.data.content || "Texto do parágrafo..."}
        </p>
      );

    case "image":
      return block.data.url ? (
        <img
          src={block.data.url}
          alt={block.data.alt}
          className="w-full h-16 object-cover rounded-lg"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      ) : (
        <div className="h-12 bg-muted rounded-lg flex items-center justify-center">
          <Image className="w-5 h-5 text-muted-foreground/30" />
        </div>
      );

    case "button": {
      const colors: Record<string, string> = {
        primary: "bg-violet-600 text-white",
        dark:    "bg-gray-900 text-white",
        light:   "bg-gray-100 text-gray-900 border border-gray-300",
      };
      return (
        <div className="flex justify-center">
          <span className={cn("text-xs font-bold px-4 py-1.5 rounded-lg", colors[block.data.color ?? "primary"])}>
            {block.data.label || "Botão"}
          </span>
        </div>
      );
    }

    case "divider":
      return <hr className="border-t border-border my-1" />;

    case "spacer":
      return (
        <div
          className="bg-muted/50 rounded border border-dashed border-border flex items-center justify-center"
          style={{ height: Math.max(20, (block.data.height ?? 24) / 2) }}
        >
          <span className="text-[9px] text-muted-foreground/50">{block.data.height}px</span>
        </div>
      );

    default:
      return null;
  }
}
