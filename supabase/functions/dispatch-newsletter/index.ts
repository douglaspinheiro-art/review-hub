/**
 * dispatch-newsletter — Envia newsletter por e-mail via Resend
 *
 * POST /functions/v1/dispatch-newsletter
 * Body: {
 *   campaign_id: string
 *   recipient_mode: "all" | "tag" | "rfm"
 *   recipient_tag?: string
 *   recipient_rfm?: string
 * }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = "notificacoes@ltvboost.com.br";
const ANTI_SPAM_DELAY_MS = 300;
const APP_URL = Deno.env.get("APP_URL") ?? "https://app.ltvboost.com.br";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── HTML renderer (inline — same logic as src/lib/newsletter-renderer.ts) ───

type Block = {
  id: string;
  type: string;
  data: Record<string, unknown>;
};

function escHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const BUTTON_COLORS: Record<string, { bg: string; text: string }> = {
  primary: { bg: "#7c3aed", text: "#ffffff" },
  dark:    { bg: "#111827", text: "#ffffff" },
  light:   { bg: "#f3f4f6", text: "#111827" },
};

function renderBlock(block: Block): string {
  const d = block.data;
  switch (block.type) {
    case "header":
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#7c3aed;padding:40px 32px 32px;text-align:center;border-radius:8px 8px 0 0;"><h1 style="margin:0;font-family:-apple-system,sans-serif;font-size:28px;font-weight:800;color:#fff;">${escHtml(String(d.title ?? ""))}</h1>${d.subtitle ? `<p style="margin:12px 0 0;font-family:-apple-system,sans-serif;font-size:15px;color:rgba(255,255,255,0.85);">${escHtml(String(d.subtitle))}</p>` : ""}</td></tr></table>`;

    case "text": {
      const html = escHtml(String(d.content ?? "")).replace(/\n/g, "<br>");
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:24px 32px;"><p style="margin:0;font-family:-apple-system,sans-serif;font-size:15px;line-height:1.7;color:#374151;">${html}</p></td></tr></table>`;
    }

    case "image": {
      const img = `<img src="${escHtml(String(d.url ?? ""))}" alt="${escHtml(String(d.alt ?? ""))}" width="100%" style="display:block;border-radius:6px;max-width:100%;height:auto;" />`;
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:16px 32px;text-align:center;">${d.href ? `<a href="${escHtml(String(d.href))}" style="display:block;">${img}</a>` : img}</td></tr></table>`;
    }

    case "button": {
      const { bg, text } = BUTTON_COLORS[String(d.color ?? "primary")] ?? BUTTON_COLORS.primary;
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:16px 32px;text-align:center;"><a href="${escHtml(String(d.url ?? "#"))}" style="display:inline-block;background:${bg};color:${text};font-family:-apple-system,sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:8px;">${escHtml(String(d.label ?? "Clique aqui"))}</a></td></tr></table>`;
    }

    case "divider":
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:8px 32px;"><hr style="border:none;border-top:1px solid #e5e7eb;margin:0;" /></td></tr></table>`;

    case "spacer":
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:${Number(d.height ?? 24)}px;"></td></tr></table>`;

    default:
      return "";
  }
}

function renderBlocksToHTML(blocks: Block[], unsubscribeUrl: string): string {
  const blocksHtml = blocks.map(renderBlock).join("\n");
  const footer = `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:32px;text-align:center;background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 8px 8px;"><p style="margin:0;font-family:-apple-system,sans-serif;font-size:12px;color:#9ca3af;line-height:1.6;">Você está recebendo este e-mail porque é cliente cadastrado.<br /><a href="${unsubscribeUrl}" style="color:#7c3aed;text-decoration:underline;">Cancelar inscrição</a></p></td></tr></table>`;

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="margin:0;padding:0;background:#f3f4f6;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:32px 16px;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.08);"><tr><td>${blocksHtml}${footer}</td></tr></table></td></tr></table></body></html>`;
}

// ─── Contact resolution ────────────────────────────────────────────────────────

async function resolveContacts(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  mode: string,
  tag?: string,
  rfm?: string,
): Promise<Array<{ id: string; name: string | null; email: string | null }>> {
  let query = supabase
    .from("customers_v3")
    .select("id,name,email")
    .eq("user_id", userId)
    .not("email", "is", null);

  if (mode === "tag" && tag) {
    // tags stored as array in contacts or customers_v3 — try both approaches
    query = query.contains("tags", [tag]);
  } else if (mode === "rfm" && rfm) {
    query = query.eq("rfm_segment", rfm);
  }

  const { data, error } = await query.limit(2000);
  if (error) throw error;
  return (data ?? []).filter((c) => c.email);
}

// ─── Send via Resend ──────────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string, fromName: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: `${fromName} <${FROM_EMAIL}>`,
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
  return res.json();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const {
      campaign_id,
      recipient_mode = "all",
      recipient_tag,
      recipient_rfm,
    } = await req.json();

    if (!campaign_id) throw new Error("campaign_id obrigatório");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY não configurado");

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Auth: get user from JWT
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await sb.auth.getUser(jwt ?? "");
    if (authErr || !user) throw new Error("Não autorizado");

    // Load campaign
    const { data: campaign, error: campErr } = await sb
      .from("campaigns")
      .select("*")
      .eq("id", campaign_id)
      .eq("user_id", user.id)
      .single();
    if (campErr || !campaign) throw new Error("Campanha não encontrada");

    const blocks = ((campaign as any).blocks ?? []) as Block[];
    if (blocks.length === 0) throw new Error("Newsletter sem blocos. Adicione conteúdo antes de enviar.");

    const subject = (campaign as any).subject || campaign.name || "Newsletter";

    // Load store name
    const { data: store } = await sb
      .from("stores")
      .select("name")
      .eq("user_id", user.id)
      .limit(1)
      .single();
    const fromName = store?.name ?? "LTV Boost";

    // Resolve contacts
    const contacts = await resolveContacts(sb, user.id, recipient_mode, recipient_tag, recipient_rfm);

    if (contacts.length === 0) throw new Error("Nenhum contato com e-mail encontrado para o segmento selecionado.");

    // Update campaign status
    await sb.from("campaigns").update({ status: "running" }).eq("id", campaign_id);

    let sent = 0;
    let failed = 0;

    for (const contact of contacts) {
      if (!contact.email) continue;

      const unsubscribeUrl = `${APP_URL}/unsubscribe?user=${user.id}&contact=${contact.id}`;
      const html = renderBlocksToHTML(blocks, unsubscribeUrl);

      try {
        await sendEmail(contact.email, subject, html, fromName);
        sent++;
      } catch (err) {
        console.error(`Falha ao enviar para ${contact.email}:`, err);
        failed++;
      }

      await sleep(ANTI_SPAM_DELAY_MS);
    }

    // Update campaign metrics
    await sb.from("campaigns").update({
      status: "completed",
      sent_count: sent,
      total_contacts: contacts.length,
    }).eq("id", campaign_id);

    return new Response(JSON.stringify({ sent, failed, total: contacts.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
