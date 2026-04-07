import { useMemo, useState } from "react";
import { Maximize2, Minimize2, Mail } from "lucide-react";
import { renderBlocksToHTML } from "@/lib/newsletter-renderer";
import type { Block } from "@/lib/newsletter-renderer";
import { cn } from "@/lib/utils";

interface EmailPreviewProps {
  blocks: Block[];
  subject: string;
}

export function EmailPreview({ blocks, subject }: EmailPreviewProps) {
  const [fullscreen, setFullscreen] = useState(false);

  const html = useMemo(
    () => renderBlocksToHTML(blocks),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(blocks)]
  );

  return (
    <div className={cn(
      "flex flex-col bg-muted/30 rounded-2xl border overflow-hidden transition-all",
      fullscreen && "fixed inset-4 z-50 bg-background shadow-2xl"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-background shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate">{subject || "(sem assunto)"}</p>
            <p className="text-[10px] text-muted-foreground">notificacoes@ltvboost.com.br</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setFullscreen((v) => !v)}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors shrink-0"
        >
          {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Preview area */}
      <div className="flex-1 overflow-auto p-4 min-h-0">
        {blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground py-16">
            <Mail className="w-8 h-8 opacity-20" />
            <p className="text-sm">Adicione blocos para ver o preview</p>
          </div>
        ) : (
          <iframe
            srcDoc={html}
            title="Preview do e-mail"
            className="w-full rounded-lg border bg-white"
            style={{ minHeight: 400, height: "100%" }}
            sandbox="allow-same-origin"
          />
        )}
      </div>
    </div>
  );
}
