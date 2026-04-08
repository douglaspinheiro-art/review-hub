import { useMemo, useState } from "react";
import { Maximize2, Minimize2, Mail, Monitor, Smartphone } from "lucide-react";
import { renderBlocksToHTML, PREVIEW_MERGE_VARS } from "@/lib/newsletter-renderer";
import type { Block } from "@/lib/newsletter-renderer";
import { cn } from "@/lib/utils";

interface EmailPreviewProps {
  blocks: Block[];
  subject: string;
  preheader?: string;
  previewFromEmail?: string;
  brandPrimaryHex?: string | null;
}

export function EmailPreview({ blocks, subject, preheader, previewFromEmail, brandPrimaryHex }: EmailPreviewProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const html = useMemo(
    () => renderBlocksToHTML(blocks, {
      preheader,
      mergeVars: PREVIEW_MERGE_VARS,
      brandPrimaryHex: brandPrimaryHex ?? undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(blocks), preheader, brandPrimaryHex]
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
            <p className="text-[10px] text-muted-foreground truncate">
              {previewFromEmail?.trim() || "notificacoes@ltvboost.com.br"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            title="Desktop (600px)"
            onClick={() => setIsMobile(false)}
            className={cn(
              "w-7 h-7 flex items-center justify-center rounded-lg transition-colors",
              !isMobile ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted"
            )}
          >
            <Monitor className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Mobile (375px)"
            onClick={() => setIsMobile(true)}
            className={cn(
              "w-7 h-7 flex items-center justify-center rounded-lg transition-colors",
              isMobile ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted"
            )}
          >
            <Smartphone className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors"
          >
            {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Preview area */}
      <div className="flex-1 overflow-auto p-4 min-h-0">
        {blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground py-16">
            <Mail className="w-8 h-8 opacity-20" />
            <p className="text-sm">Adicione blocos para ver o preview</p>
          </div>
        ) : (
          <div className={cn("mx-auto transition-all duration-300", isMobile ? "max-w-[375px]" : "max-w-full")}>
            <iframe
              srcDoc={html}
              title="Preview do e-mail"
              className="w-full rounded-lg border bg-white"
              style={{ minHeight: 400, height: "100%" }}
              sandbox="allow-same-origin"
            />
          </div>
        )}
      </div>
    </div>
  );
}
