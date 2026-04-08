/**
 * Shared newsletter HTML renderer — used by Vite (alias) and dispatch-newsletter (Deno).
 * Keep in sync with block types in the dashboard editor.
 */

export type BlockType =
  | "header" | "text" | "image" | "button"
  | "divider" | "spacer" | "product" | "columns";

export type ColumnSlot = {
  imageUrl?: string;
  title?: string;
  text?: string;
  buttonLabel?: string;
  buttonUrl?: string;
};

export type Block =
  | { id: string; type: "header"; data: { title: string; subtitle?: string; bgColor?: string } }
  | { id: string; type: "text"; data: { content: string } }
  | { id: string; type: "image"; data: { url: string; alt?: string; href?: string } }
  | { id: string; type: "button"; data: { label: string; url: string; color?: string } }
  | { id: string; type: "divider"; data: Record<string, never> }
  | { id: string; type: "spacer"; data: { height: number } }
  | { id: string; type: "product"; data: { imageUrl: string; name: string; price: string; oldPrice?: string; buttonLabel: string; buttonUrl: string; productId?: string } }
  | { id: string; type: "columns"; data: { left: ColumnSlot; right: ColumnSlot } };

export type RenderOpts = {
  unsubscribeUrl?: string;
  preheader?: string;
  openPixelUrl?: string;
  mergeVars?: Record<string, string>;
  /** Overrides primary / product CTA accent (hex) */
  brandPrimaryHex?: string;
};

export function interpolateMerge(text: string, vars: Record<string, string>): string {
  return String(text).replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

function escHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function parseRichText(raw: string): string {
  const lines = raw.split("\n");
  const out: string[] = [];
  let inList = false;

  for (const line of lines) {
    const isBullet = /^- /.test(line);
    if (isBullet && !inList) {
      out.push("<ul style=\"margin:0;padding-left:20px;\">");
      inList = true;
    }
    if (!isBullet && inList) {
      out.push("</ul>");
      inList = false;
    }
    const content = isBullet ? line.slice(2) : line;
    const formatted = inlineFormat(content);
    if (isBullet) out.push(`<li style="margin-bottom:4px;">${formatted}</li>`);
    else out.push(formatted || "<br>");
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

function inlineFormat(text: string): string {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2" style="color:#7c3aed;text-decoration:underline;">$1</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");
}

const BASE_BUTTON_COLORS: Record<string, { bg: string; text: string }> = {
  primary: { bg: "#7c3aed", text: "#ffffff" },
  dark: { bg: "#111827", text: "#ffffff" },
  light: { bg: "#f3f4f6", text: "#111827" },
};

function buttonPalette(primaryHex: string): Record<string, { bg: string; text: string }> {
  return { ...BASE_BUTTON_COLORS, primary: { bg: primaryHex, text: "#ffffff" } };
}

/** Append UTM params to http(s) URLs for attribution */
export function appendUtmParams(
  url: string,
  params: { utm_source: string; utm_medium: string; utm_campaign: string; utm_content?: string },
): string {
  let u = String(url).trim();
  if (!/^https?:\/\//i.test(u)) return u;
  try {
    const parsed = new URL(u);
    if (!parsed.searchParams.has("utm_source")) parsed.searchParams.set("utm_source", params.utm_source);
    if (!parsed.searchParams.has("utm_medium")) parsed.searchParams.set("utm_medium", params.utm_medium);
    if (!parsed.searchParams.has("utm_campaign")) parsed.searchParams.set("utm_campaign", params.utm_campaign);
    if (params.utm_content && !parsed.searchParams.has("utm_content")) {
      parsed.searchParams.set("utm_content", params.utm_content);
    }
    return parsed.toString();
  } catch {
    return u;
  }
}

function renderHeader(
  data: { title: string; subtitle?: string; bgColor?: string },
  vars: Record<string, string>,
): string {
  const bg = data.bgColor ?? "#7c3aed";
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="background:${bg};padding:40px 32px 32px;text-align:center;border-radius:8px 8px 0 0;">
          <h1 style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:28px;font-weight:800;color:#ffffff;line-height:1.2;">${escHtml(interpolateMerge(data.title, vars))}</h1>
          ${data.subtitle ? `<p style="margin:12px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;color:rgba(255,255,255,0.85);line-height:1.5;">${escHtml(interpolateMerge(data.subtitle, vars))}</p>` : ""}
        </td>
      </tr>
    </table>`;
}

function renderText(data: { content: string }, vars: Record<string, string>): string {
  const rich = parseRichText(interpolateMerge(data.content, vars));
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:24px 32px;">
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.7;color:#374151;">${rich}</div>
        </td>
      </tr>
    </table>`;
}

function renderImage(data: { url: string; alt?: string; href?: string }, vars: Record<string, string>): string {
  const url = escHtml(interpolateMerge(data.url, vars));
  const img = `<img src="${url}" alt="${escHtml(interpolateMerge(data.alt ?? "", vars))}" width="100%" style="display:block;border-radius:6px;max-width:100%;height:auto;" />`;
  const href = data.href ? escHtml(interpolateMerge(data.href, vars)) : "";
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:16px 32px;text-align:center;">
          ${href ? `<a href="${href}" style="display:block;">${img}</a>` : img}
        </td>
      </tr>
    </table>`;
}

function renderButton(
  data: { label: string; url: string; color?: string },
  vars: Record<string, string>,
  palette: Record<string, { bg: string; text: string }>,
): string {
  const { bg, text } = palette[data.color ?? "primary"] ?? palette.primary;
  const href = escHtml(interpolateMerge(data.url, vars));
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:16px 32px;text-align:center;">
          <a href="${href}" style="display:inline-block;background:${bg};color:${text};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:8px;letter-spacing:0.02em;">${escHtml(interpolateMerge(data.label, vars))}</a>
        </td>
      </tr>
    </table>`;
}

function renderDivider(): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="padding:8px 32px;"><hr style="border:none;border-top:1px solid #e5e7eb;margin:0;" /></td></tr>
    </table>`;
}

function renderSpacer(data: { height: number }): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:${data.height}px;"></td></tr></table>`;
}

function renderProduct(
  data: { imageUrl: string; name: string; price: string; oldPrice?: string; buttonLabel: string; buttonUrl: string },
  vars: Record<string, string>,
  primaryHex: string,
): string {
  const discount = data.oldPrice
    ? `<span style="display:inline-block;background:#fee2e2;color:#dc2626;font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px;margin-left:6px;">De ${escHtml(interpolateMerge(data.oldPrice, vars))}</span>`
    : "";
  const imgUrl = escHtml(interpolateMerge(data.imageUrl, vars));
  const href = escHtml(interpolateMerge(data.buttonUrl, vars));
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:16px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border-radius:10px;overflow:hidden;">
            <tr>
              <td width="140" valign="top" style="padding:16px 0 16px 16px;">
                ${data.imageUrl
                  ? `<img src="${imgUrl}" alt="${escHtml(interpolateMerge(data.name, vars))}" width="124" height="124" style="display:block;border-radius:8px;object-fit:cover;" />`
                  : `<div style="width:124px;height:124px;background:#e5e7eb;border-radius:8px;"></div>`}
              </td>
              <td valign="top" style="padding:16px;">
                <p style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:700;color:#111827;">${escHtml(interpolateMerge(data.name, vars))}</p>
                <p style="margin:0 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:20px;font-weight:800;color:${primaryHex};">${escHtml(interpolateMerge(data.price, vars))}${discount}</p>
                <a href="${href}" style="display:inline-block;background:${primaryHex};color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;font-weight:700;text-decoration:none;padding:8px 18px;border-radius:6px;">${escHtml(interpolateMerge(data.buttonLabel, vars))}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

function renderColumn(slot: ColumnSlot, vars: Record<string, string>, primaryHex: string): string {
  const parts: string[] = [];
  if (slot.imageUrl) {
    parts.push(`<img src="${escHtml(interpolateMerge(slot.imageUrl, vars))}" alt="" width="100%" style="display:block;border-radius:6px;max-width:100%;height:auto;margin-bottom:10px;" />`);
  }
  if (slot.title) {
    parts.push(`<p style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:700;color:#111827;">${escHtml(interpolateMerge(slot.title, vars))}</p>`);
  }
  if (slot.text) {
    parts.push(`<p style="margin:0 0 10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;line-height:1.6;color:#6b7280;">${escHtml(interpolateMerge(slot.text, vars))}</p>`);
  }
  if (slot.buttonLabel && slot.buttonUrl) {
    parts.push(`<a href="${escHtml(interpolateMerge(slot.buttonUrl, vars))}" style="display:inline-block;background:${primaryHex};color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:12px;font-weight:700;text-decoration:none;padding:7px 14px;border-radius:6px;">${escHtml(interpolateMerge(slot.buttonLabel, vars))}</a>`);
  }
  return parts.join("\n");
}

function renderColumns(data: { left: ColumnSlot; right: ColumnSlot }, vars: Record<string, string>, primaryHex: string): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:16px 32px;">
          <!--[if mso]><table width="100%" cellpadding="0" cellspacing="0"><tr><td width="260" valign="top"><![endif]-->
          <div style="display:inline-block;width:48%;vertical-align:top;min-width:200px;">
            ${renderColumn(data.left, vars, primaryHex)}
          </div>
          <!--[if mso]></td><td width="16"></td><td width="260" valign="top"><![endif]-->
          <div style="display:inline-block;width:4%;vertical-align:top;min-width:16px;">&nbsp;</div>
          <div style="display:inline-block;width:48%;vertical-align:top;min-width:200px;">
            ${renderColumn(data.right, vars, primaryHex)}
          </div>
          <!--[if mso]></td></tr></table><![endif]-->
        </td>
      </tr>
    </table>`;
}

function renderFooter(unsubscribeUrl: string, primaryHex: string): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:32px;text-align:center;background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 8px 8px;">
          <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:12px;color:#9ca3af;line-height:1.6;">
            Você está recebendo este e-mail porque é cliente cadastrado.<br />
            <a href="${unsubscribeUrl}" style="color:${primaryHex};text-decoration:underline;">Cancelar inscrição</a>
          </p>
        </td>
      </tr>
    </table>`;
}

export function renderBlocksToHTML(blocks: Block[], opts: RenderOpts = {}): string {
  const {
    unsubscribeUrl = "{{UNSUBSCRIBE_URL}}",
    preheader,
    openPixelUrl,
    mergeVars = {},
    brandPrimaryHex,
  } = opts;

  const primaryHex = brandPrimaryHex && /^#[0-9A-Fa-f]{6}$/.test(brandPrimaryHex) ? brandPrimaryHex : "#7c3aed";
  const palette = buttonPalette(primaryHex);
  const vars: Record<string, string> = { ...mergeVars };

  const blocksHtml = blocks.map((block) => {
    switch (block.type) {
      case "header": return renderHeader(block.data, vars);
      case "text": return renderText(block.data, vars);
      case "image": return renderImage(block.data, vars);
      case "button": return renderButton(block.data, vars, palette);
      case "divider": return renderDivider();
      case "spacer": return renderSpacer(block.data);
      case "product": return renderProduct(block.data, vars, primaryHex);
      case "columns": return renderColumns(block.data, vars, primaryHex);
      default: return "";
    }
  }).join("\n");

  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>`
    : "";

  const pixelHtml = openPixelUrl
    ? `<img src="${escHtml(openPixelUrl)}" width="1" height="1" style="display:none;border:0;" alt="" />`
    : "";

  const footerHref = unsubscribeUrl.includes("{{") ? unsubscribeUrl : escHtml(unsubscribeUrl);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  ${preheaderHtml}
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr><td>
            ${blocksHtml}
            ${renderFooter(footerHref, primaryHex)}
            ${pixelHtml}
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
