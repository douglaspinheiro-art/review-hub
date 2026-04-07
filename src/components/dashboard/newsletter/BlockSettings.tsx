import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { Block } from "@/lib/newsletter-renderer";

interface BlockSettingsProps {
  block: Block;
  onChange: (updated: Block) => void;
}

const BUTTON_COLOR_OPTIONS = [
  { value: "primary", label: "Roxo",   bg: "bg-violet-600" },
  { value: "dark",    label: "Preto",  bg: "bg-gray-900" },
  { value: "light",   label: "Claro",  bg: "bg-gray-100 border border-gray-300" },
] as const;

export function BlockSettings({ block, onChange }: BlockSettingsProps) {
  function patch(data: Partial<typeof block.data>) {
    onChange({ ...block, data: { ...block.data, ...data } } as Block);
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
            <Input
              value={block.data.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="Título do e-mail"
            />
          </Field>
          <Field label="Subtítulo (opcional)">
            <Input
              value={block.data.subtitle ?? ""}
              onChange={(e) => patch({ subtitle: e.target.value })}
              placeholder="Uma frase de apoio"
            />
          </Field>
        </>
      )}

      {/* ── Text ── */}
      {block.type === "text" && (
        <Field label="Conteúdo">
          <Textarea
            value={block.data.content}
            onChange={(e) => patch({ content: e.target.value })}
            placeholder="Digite o texto aqui..."
            rows={7}
            className="resize-none text-sm"
          />
        </Field>
      )}

      {/* ── Image ── */}
      {block.type === "image" && (
        <>
          <Field label="URL da imagem">
            <Input
              value={block.data.url}
              onChange={(e) => patch({ url: e.target.value })}
              placeholder="https://..."
            />
          </Field>
          <Field label="Texto alternativo (alt)">
            <Input
              value={block.data.alt ?? ""}
              onChange={(e) => patch({ alt: e.target.value })}
              placeholder="Descrição da imagem"
            />
          </Field>
          <Field label="Link ao clicar (opcional)">
            <Input
              value={block.data.href ?? ""}
              onChange={(e) => patch({ href: e.target.value })}
              placeholder="https://..."
            />
          </Field>
          {block.data.url && (
            <img
              src={block.data.url}
              alt={block.data.alt}
              className="w-full rounded-lg object-cover max-h-40 border"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
        </>
      )}

      {/* ── Button ── */}
      {block.type === "button" && (
        <>
          <Field label="Texto do botão">
            <Input
              value={block.data.label}
              onChange={(e) => patch({ label: e.target.value })}
              placeholder="Ver ofertas"
            />
          </Field>
          <Field label="URL de destino">
            <Input
              value={block.data.url}
              onChange={(e) => patch({ url: e.target.value })}
              placeholder="https://..."
            />
          </Field>
          <Field label="Cor">
            <div className="flex gap-2">
              {BUTTON_COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => patch({ color: opt.value })}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-xs font-bold transition-all border-2",
                    (block.data.color ?? "primary") === opt.value
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-transparent",
                    opt.bg,
                    opt.value === "light" ? "text-gray-900" : "text-white"
                  )}
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
        <p className="text-xs text-muted-foreground">
          Linha separadora sem configurações adicionais.
        </p>
      )}

      {/* ── Spacer ── */}
      {block.type === "spacer" && (
        <Field label={`Altura: ${block.data.height}px`}>
          <Slider
            value={[block.data.height]}
            onValueChange={([v]) => patch({ height: v })}
            min={8}
            max={80}
            step={4}
            className="mt-2"
          />
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
};
