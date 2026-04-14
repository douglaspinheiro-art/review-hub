import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
// Button removed — unused
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bold, Italic, Link2, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { Block, ColumnSlot } from "@/lib/newsletter-renderer";

interface BlockSettingsProps {
  block: Block;
  onChange: (updated: Block) => void;
  storeId?: string | null;
}

// ─── Colour presets ───────────────────────────────────────────────────────────

const HEADER_COLOR_OPTIONS = [
  { value: "#7c3aed", label: "Roxo" },
  { value: "#111827", label: "Preto" },
  { value: "#0f766e", label: "Verde" },
  { value: "#b45309", label: "Âmbar" },
  { value: "#be123c", label: "Vermelho" },
  { value: "#dc2626", label: "Coral" },
] as const;

const BUTTON_COLOR_OPTIONS = [
  { value: "primary", label: "Roxo",   bg: "bg-violet-600" },
  { value: "dark",    label: "Preto",  bg: "bg-gray-900" },
  { value: "light",   label: "Claro",  bg: "bg-gray-100 border border-gray-300" },
] as const;

// ─── Merge tag chips ──────────────────────────────────────────────────────────

const MERGE_TAGS = [
  { tag: "{{nome}}",  label: "Nome" },
  { tag: "{{loja}}",  label: "Loja" },
  { tag: "{{email}}", label: "E-mail" },
];

function MergeTagChips({ onInsert }: { onInsert: (tag: string) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {MERGE_TAGS.map(({ tag, label }) => (
        <button
          key={tag}
          type="button"
          onClick={() => onInsert(tag)}
          className="text-[10px] font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full hover:bg-primary/20 transition-colors"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Rich-text toolbar ────────────────────────────────────────────────────────

function RichToolbar({ textareaRef }: { textareaRef: React.RefObject<HTMLTextAreaElement> }) {
  function wrap(before: string, after = before) {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    const selected = value.slice(s, e) || "texto";
    const newVal = value.slice(0, s) + before + selected + after + value.slice(e);
    // Dispatch synthetic change so React state updates
    const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
    nativeInputSetter.call(el, newVal);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
    el.setSelectionRange(s + before.length, s + before.length + selected.length);
  }

  function insertLink() {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    const selected = value.slice(s, e) || "clique aqui";
    const snippet = `[${selected}](https://)`;
    const newVal = value.slice(0, s) + snippet + value.slice(e);
    const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
    nativeInputSetter.call(el, newVal);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
  }

  function insertBullet() {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart: s, value } = el;
    const insert = "\n- item";
    const newVal = value.slice(0, s) + insert + value.slice(s);
    const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
    nativeInputSetter.call(el, newVal);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
    el.setSelectionRange(s + insert.length, s + insert.length);
  }

  return (
    <div className="flex gap-1 mb-1.5">
      {[
        { icon: Bold,  title: "Negrito (Ctrl+B)",  action: () => wrap("**") },
        { icon: Italic, title: "Itálico (Ctrl+I)", action: () => wrap("_") },
        { icon: Link2,  title: "Link",             action: insertLink },
        { icon: List,   title: "Lista",            action: insertBullet },
      ].map(({ icon: Icon, title, action }) => (
        <button
          key={title}
          type="button"
          title={title}
          onClick={action}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );
}

// ─── Column slot editor ───────────────────────────────────────────────────────

function ColumnSlotEditor({
  label, slot, onChange,
}: { label: string; slot: ColumnSlot; onChange: (s: ColumnSlot) => void }) {
  return (
    <div className="space-y-2 p-3 rounded-xl bg-muted/40 border">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <Field label="URL da imagem (opcional)">
        <Input value={slot.imageUrl ?? ""} onChange={(e) => onChange({ ...slot, imageUrl: e.target.value })} placeholder="https://..." className="h-7 text-xs" />
      </Field>
      <Field label="Título">
        <Input value={slot.title ?? ""} onChange={(e) => onChange({ ...slot, title: e.target.value })} placeholder="Título" className="h-7 text-xs" />
      </Field>
      <Field label="Texto">
        <Input value={slot.text ?? ""} onChange={(e) => onChange({ ...slot, text: e.target.value })} placeholder="Descrição" className="h-7 text-xs" />
      </Field>
      <Field label="Botão">
        <Input value={slot.buttonLabel ?? ""} onChange={(e) => onChange({ ...slot, buttonLabel: e.target.value })} placeholder="Rótulo" className="h-7 text-xs mb-1" />
        <Input value={slot.buttonUrl ?? ""} onChange={(e) => onChange({ ...slot, buttonUrl: e.target.value })} placeholder="https://..." className="h-7 text-xs" />
      </Field>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BlockSettings({ block, onChange, storeId }: BlockSettingsProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: catalogProducts = [] } = useQuery({
    queryKey: ["newsletter-catalog-products", storeId],
    queryFn: async () => {
      if (!storeId) return [];
      const { data, error } = await supabase
        .from("products")
        .select("id,nome,preco,imagem_url")
        .eq("store_id", storeId)
        .order("nome", { ascending: true })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!storeId && block.type === "product",
  });

  function patch(data: Partial<typeof block.data>) {
    onChange({ ...block, data: { ...block.data, ...data } } as Block);
  }

  function insertMergeTag(tag: string) {
    const el = textareaRef.current;
    if (el) {
      const { selectionStart: s, selectionEnd: e, value } = el;
      const newVal = value.slice(0, s) + tag + value.slice(e);
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(el, newVal);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.focus();
      el.setSelectionRange(s + tag.length, s + tag.length);
    } else {
      // header/other inputs: append to relevant field
      if (block.type === "header") patch({ title: (block.data.title ?? "") + tag });
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        Configurar — {BLOCK_LABELS[block.type]}
      </p>

      {/* ── Header ── */}
      {block.type === "header" && (
        <>
          <Field label="Título">
            <Input value={block.data.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Título do e-mail" />
          </Field>
          <Field label="Subtítulo (opcional)">
            <Input value={block.data.subtitle ?? ""} onChange={(e) => patch({ subtitle: e.target.value })} placeholder="Uma frase de apoio" />
          </Field>
          <Field label="Personalização">
            <MergeTagChips onInsert={insertMergeTag} />
          </Field>
          <Field label="Cor de fundo">
            <div className="flex gap-2 flex-wrap">
              {HEADER_COLOR_OPTIONS.map((opt) => (
                <button key={opt.value} type="button" title={opt.label}
                  onClick={() => patch({ bgColor: opt.value })}
                  className={cn("w-8 h-8 rounded-lg border-2 transition-all",
                    (block.data.bgColor ?? "#7c3aed") === opt.value
                      ? "border-foreground ring-2 ring-foreground/20 scale-110"
                      : "border-transparent hover:scale-105")}
                  style={{ background: opt.value }}
                />
              ))}
            </div>
          </Field>
        </>
      )}

      {/* ── Text ── */}
      {block.type === "text" && (
        <Field label="Conteúdo">
          <RichToolbar textareaRef={textareaRef} />
          <Textarea
            ref={textareaRef}
            value={block.data.content}
            onChange={(e) => patch({ content: e.target.value })}
            placeholder="Digite o texto... Use **negrito**, _itálico_, [link](url), - lista"
            rows={8}
            className="resize-none text-sm font-mono text-xs leading-relaxed"
          />
          <div className="mt-2">
            <p className="text-[10px] text-muted-foreground mb-1.5">Inserir variável:</p>
            <MergeTagChips onInsert={insertMergeTag} />
          </div>
        </Field>
      )}

      {/* ── Image ── */}
      {block.type === "image" && (
        <>
          <Field label="URL da imagem">
            <Input value={block.data.url} onChange={(e) => patch({ url: e.target.value })} placeholder="https://..." />
          </Field>
          <Field label="Texto alternativo (alt)">
            <Input value={block.data.alt ?? ""} onChange={(e) => patch({ alt: e.target.value })} placeholder="Descrição da imagem" />
          </Field>
          <Field label="Link ao clicar (opcional)">
            <Input value={block.data.href ?? ""} onChange={(e) => patch({ href: e.target.value })} placeholder="https://...?cupom={{nome}}" />
          </Field>
          <p className="text-[10px] text-muted-foreground">
            Variáveis {"{{nome}}"}, {"{{loja}}"}, {"{{email}}"} funcionam nos links.
          </p>
          {block.data.url && (
            <img src={block.data.url} alt={block.data.alt} className="w-full rounded-lg object-cover max-h-40 border"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          )}
        </>
      )}

      {/* ── Product ── */}
      {block.type === "product" && (
        <>
          {storeId && catalogProducts.length > 0 && (
            <Field label="Catálogo da loja">
              <Select
                value={(block.data as { productId?: string }).productId ?? "__manual__"}
                onValueChange={(v) => {
                  if (v === "__manual__") {
                    patch({ productId: undefined } as never);
                    return;
                  }
                  const p = catalogProducts.find((row: { id: string }) => row.id === v);
                  if (!p) return;
                  const priceStr = p.preco != null
                    ? `R$ ${Number(p.preco).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : block.data.price;
                  patch({
                    productId: v,
                    name: p.nome,
                    price: priceStr,
                    imageUrl: p.imagem_url || block.data.imageUrl,
                  } as never);
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Escolher produto sincronizado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__manual__">Entrada manual</SelectItem>
                  {catalogProducts.map((p: { id: string; nome: string }) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="URL da imagem do produto">
            <Input value={block.data.imageUrl} onChange={(e) => patch({ imageUrl: e.target.value })} placeholder="https://..." />
          </Field>
          {block.data.imageUrl && (
            <img src={block.data.imageUrl} alt={block.data.name} className="w-24 h-24 rounded-lg object-cover border"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          )}
          <Field label="Nome do produto">
            <Input value={block.data.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Nome do produto" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Preço">
              <Input value={block.data.price} onChange={(e) => patch({ price: e.target.value })} placeholder="R$ 99,90" />
            </Field>
            <Field label="De (opcional)">
              <Input value={block.data.oldPrice ?? ""} onChange={(e) => patch({ oldPrice: e.target.value })} placeholder="R$ 149,90" />
            </Field>
          </div>
          <Field label="Rótulo do botão">
            <Input value={block.data.buttonLabel} onChange={(e) => patch({ buttonLabel: e.target.value })} placeholder="Comprar agora" />
          </Field>
          <Field label="URL do botão">
            <Input value={block.data.buttonUrl} onChange={(e) => patch({ buttonUrl: e.target.value })} placeholder="https://...?ref={{email}}" />
          </Field>
        </>
      )}

      {/* ── Columns ── */}
      {block.type === "columns" && (
        <div className="space-y-3">
          <ColumnSlotEditor label="Coluna esquerda" slot={block.data.left}
            onChange={(s) => onChange({ ...block, data: { ...block.data, left: s } })} />
          <ColumnSlotEditor label="Coluna direita" slot={block.data.right}
            onChange={(s) => onChange({ ...block, data: { ...block.data, right: s } })} />
        </div>
      )}

      {/* ── Button ── */}
      {block.type === "button" && (
        <>
          <Field label="Texto do botão">
            <Input value={block.data.label} onChange={(e) => patch({ label: e.target.value })} placeholder="Ver ofertas" />
          </Field>
          <Field label="URL de destino">
            <Input value={block.data.url} onChange={(e) => patch({ url: e.target.value })} placeholder="https://... (merge tags nos links)" />
          </Field>
          <Field label="Cor">
            <div className="flex gap-2">
              {BUTTON_COLOR_OPTIONS.map((opt) => (
                <button key={opt.value} type="button"
                  onClick={() => patch({ color: opt.value })}
                  className={cn("flex-1 py-2 rounded-lg text-xs font-bold transition-all border-2",
                    (block.data.color ?? "primary") === opt.value ? "border-primary ring-2 ring-primary/30" : "border-transparent",
                    opt.bg, opt.value === "light" ? "text-gray-900" : "text-white")}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>
        </>
      )}

      {/* ── Divider ── */}
      {block.type === "divider" && (
        <p className="text-xs text-muted-foreground">Linha separadora sem configurações adicionais.</p>
      )}

      {/* ── Spacer ── */}
      {block.type === "spacer" && (
        <Field label={`Altura: ${block.data.height}px`}>
          <Slider value={[block.data.height]} onValueChange={([v]) => patch({ height: v })} min={8} max={80} step={4} className="mt-2" />
        </Field>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">{label}</Label>
      {children}
    </div>
  );
}

const BLOCK_LABELS: Record<string, string> = {
  header:  "Cabeçalho",
  text:    "Texto",
  image:   "Imagem",
  button:  "Botão CTA",
  divider: "Divisor",
  spacer:  "Espaço",
  product: "Produto",
  columns: "Colunas",
};
