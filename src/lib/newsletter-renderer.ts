/**
 * Newsletter Renderer
 * Converts Block[] → email-safe HTML string (table-based, inline CSS).
 * Works in both browser and Deno (no external dependencies).
 */

export type BlockType = "header" | "text" | "image" | "button" | "divider" | "spacer";

export type Block =
  | { id: string; type: "header";  data: { title: string; subtitle?: string } }
  | { id: string; type: "text";    data: { content: string } }
  | { id: string; type: "image";   data: { url: string; alt?: string; href?: string } }
  | { id: string; type: "button";  data: { label: string; url: string; color?: string } }
  | { id: string; type: "divider"; data: Record<string, never> }
  | { id: string; type: "spacer";  data: { height: number } };

export type ButtonColor = "primary" | "dark" | "light";

const BUTTON_COLORS: Record<string, { bg: string; text: string }> = {
  primary: { bg: "#7c3aed", text: "#ffffff" },
  dark:    { bg: "#111827", text: "#ffffff" },
  light:   { bg: "#f3f4f6", text: "#111827" },
};

// ─── Block renderers ──────────────────────────────────────────────────────────

function renderHeader(data: { title: string; subtitle?: string }): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="background:#7c3aed;padding:40px 32px 32px;text-align:center;border-radius:8px 8px 0 0;">
          <h1 style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:28px;font-weight:800;color:#ffffff;line-height:1.2;">${escHtml(data.title)}</h1>
          ${data.subtitle ? `<p style="margin:12px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;color:rgba(255,255,255,0.85);line-height:1.5;">${escHtml(data.subtitle)}</p>` : ""}
        </td>
      </tr>
    </table>`;
}

function renderText(data: { content: string }): string {
  // Preserve line breaks
  const html = escHtml(data.content).replace(/\n/g, "<br>");
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:24px 32px;">
          <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.7;color:#374151;">${html}</p>
        </td>
      </tr>
    </table>`;
}

function renderImage(data: { url: string; alt?: string; href?: string }): string {
  const img = `<img src="${data.url}" alt="${escHtml(data.alt ?? "")}" width="100%" style="display:block;border-radius:6px;max-width:100%;height:auto;" />`;
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:16px 32px;text-align:center;">
          ${data.href ? `<a href="${data.href}" style="display:block;">${img}</a>` : img}
        </td>
      </tr>
    </table>`;
}

function renderButton(data: { label: string; url: string; color?: string }): string {
  const { bg, text } = BUTTON_COLORS[data.color ?? "primary"] ?? BUTTON_COLORS.primary;
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:16px 32px;text-align:center;">
          <a href="${data.url}" style="display:inline-block;background:${bg};color:${text};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:8px;letter-spacing:0.02em;">${escHtml(data.label)}</a>
        </td>
      </tr>
    </table>`;
}

function renderDivider(): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:8px 32px;">
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:0;" />
        </td>
      </tr>
    </table>`;
}

function renderSpacer(data: { height: number }): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:${data.height}px;"></td></tr></table>`;
}

function renderFooter(unsubscribeUrl: string): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:32px;text-align:center;background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 8px 8px;">
          <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:12px;color:#9ca3af;line-height:1.6;">
            Você está recebendo este e-mail porque é cliente cadastrado.<br />
            <a href="${unsubscribeUrl}" style="color:#7c3aed;text-decoration:underline;">Cancelar inscrição</a>
          </p>
        </td>
      </tr>
    </table>`;
}

// ─── Util ─────────────────────────────────────────────────────────────────────

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Main renderer ────────────────────────────────────────────────────────────

export function renderBlocksToHTML(
  blocks: Block[],
  opts: { unsubscribeUrl?: string } = {},
): string {
  const unsubscribeUrl = opts.unsubscribeUrl ?? "{{unsubscribe_url}}";

  const blocksHtml = blocks.map((block) => {
    switch (block.type) {
      case "header":  return renderHeader(block.data);
      case "text":    return renderText(block.data);
      case "image":   return renderImage(block.data);
      case "button":  return renderButton(block.data);
      case "divider": return renderDivider();
      case "spacer":  return renderSpacer(block.data);
      default:        return "";
    }
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr><td>
            ${blocksHtml}
            ${renderFooter(unsubscribeUrl)}
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Default seed blocks ──────────────────────────────────────────────────────

export function createDefaultBlocks(storeName = "Minha Loja"): Block[] {
  return [
    {
      id: crypto.randomUUID(),
      type: "header",
      data: { title: `Novidades da ${storeName}`, subtitle: "Confira o que preparamos para você" },
    },
    {
      id: crypto.randomUUID(),
      type: "text",
      data: { content: "Olá! Estamos com novidades incríveis esta semana. Escreva aqui o conteúdo da sua newsletter e compartilhe o que há de mais interessante para seus clientes." },
    },
    {
      id: crypto.randomUUID(),
      type: "button",
      data: { label: "Ver ofertas", url: "https://", color: "primary" },
    },
  ];
}
