/**
 * dispatch-newsletter — Envia newsletter por e-mail via Resend
 *
 * POST /functions/v1/dispatch-newsletter
 * Body: {
 *   campaign_id: string
 *   recipient_mode: "all" | "tag" | "rfm" | "test" | "non_openers"
 *   recipient_tag?: string
 *   recipient_rfm?: string
 *   test_email?: string
 * }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z, errorResponse, jsonResponse, validateBrowserOrigin, checkDistributedRateLimit, rateLimitedResponse, timingSafeEqual } from "../_shared/edge-utils.ts";
import { emailSchema, rejectIfBodyTooLarge, uuidSchema } from "../_shared/validation.ts";
import {
  type Block,
  renderBlocksToHTML,
  appendUtmParams,
} from "../_shared/newsletter-html.ts";
import { CAMPAIGNS_DISPATCH_NEWSLETTER_SELECT } from "../_shared/db-select-fragments.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const DEFAULT_FROM_EMAIL = Deno.env.get("RESEND_DEFAULT_FROM") ?? "notificacoes@ltvboost.com.br";
const APP_URL = Deno.env.get("APP_URL") ?? "https://app.ltvboost.com.br";
const UNSUBSCRIBE_TOKEN_SECRET = Deno.env.get("UNSUBSCRIBE_TOKEN_SECRET") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const RequestSchema = z.object({
  campaign_id: uuidSchema,
  recipient_mode: z.enum(["all", "tag", "rfm", "test", "non_openers"]).optional(),
  recipient_tag: z.string().trim().min(1).max(80).optional(),
  recipient_rfm: z.string().trim().min(1).max(40).optional(),
  test_email: emailSchema.optional(),
});

type ContactRow = {
  id: string;
  name: string | null;
  email: string | null;
  rfm_segment?: string | null;
  last_purchase_at?: string | null;
  behavioral_profile?: string | null;
  preferred_channel?: string | null;
  tags?: string[] | null;
};

function slugCampaignId(id: string): string {
  return id.replace(/-/g, "").slice(0, 12);
}

function pickAbVariant(contactId: string): "a" | "b" {
  let h = 0;
  for (let i = 0; i < contactId.length; i++) h = (h * 31 + contactId.charCodeAt(i)) | 0;
  return Math.abs(h) % 2 === 0 ? "a" : "b";
}

async function hydrateProductBlocks(
  sb: ReturnType<typeof createClient>,
  userId: string,
  blocks: Block[],
): Promise<Block[]> {
  const ids: string[] = [];
  for (const b of blocks) {
    if (b.type === "product") {
      const pid = (b.data as { productId?: string }).productId;
      if (pid) ids.push(pid);
    }
  }
  if (ids.length === 0) return blocks;

  const { data: products, error } = await sb
    .from("products")
    .select("id,nome,preco,imagem_url")
    .eq("user_id", userId)
    .in("id", [...new Set(ids)]);
  if (error) throw error;
  const byId = Object.fromEntries((products ?? []).map((p: { id: string; nome: string; preco: number | null; imagem_url: string | null }) => [p.id, p]));

  return blocks.map((b) => {
    if (b.type !== "product") return b;
    const pid = b.data.productId;
    if (!pid || !byId[pid]) return b;
    const p = byId[pid] as { nome: string; preco: number | null; imagem_url: string | null };
    const priceFmt = p.preco != null
      ? `R$ ${Number(p.preco).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : b.data.price;
    return {
      ...b,
      data: {
        ...b.data,
        name: p.nome || b.data.name,
        price: priceFmt,
        imageUrl: (b.data.imageUrl && b.data.imageUrl.length > 0) ? b.data.imageUrl : (p.imagem_url ?? ""),
        buttonUrl: b.data.buttonUrl && b.data.buttonUrl !== "https://" ? b.data.buttonUrl : b.data.buttonUrl,
      },
    };
  });
}

function applyUtmsToHtml(html: string, utm: { utm_source: string; utm_medium: string; utm_campaign: string }): string {
  return html.replace(/href="(https?:\/\/[^"]+)"/gi, (_m, url: string) => {
    if (/track-email-(open|click)|\/unsubscribe\?/i.test(url)) return `href="${url}"`;
    const withUtm = appendUtmParams(url, utm);
    return `href="${withUtm}"`;
  });
}

function wrapClickTracking(html: string, supabaseUrl: string, sid: string): string {
  const base = `${supabaseUrl}/functions/v1/track-email-click?sid=${encodeURIComponent(sid)}&url=`;
  return html.replace(/href="(https?:\/\/[^"]+)"/gi, (_m, url: string) => {
    if (/track-email-(open|click)|\/unsubscribe\?/i.test(url)) return `href="${url}"`;
    return `href="${base}${encodeURIComponent(url)}"`;
  });
}

const encoder = new TextEncoder();

async function hmacSha256(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function buildSignedUnsubscribeUrl(appUrl: string, userId: string, contactId: string, sid?: string): Promise<string> {
  if (!UNSUBSCRIBE_TOKEN_SECRET) {
    throw new Error("UNSUBSCRIBE_TOKEN_SECRET não configurado");
  }
  const ts = String(Date.now());
  const sig = await hmacSha256(UNSUBSCRIBE_TOKEN_SECRET, `${userId}:${contactId}:${ts}`);
  const q = new URLSearchParams({ user: userId, contact: contactId, ts, sig });
  if (sid) q.set("sid", sid);
  return `${appUrl}/unsubscribe?${q.toString()}`;
}

async function resolveContacts(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  mode: string,
  campaignId: string,
  tag?: string,
  rfm?: string,
  testEmail?: string,
  campaignStoreId?: string | null,
): Promise<ContactRow[]> {
  if (mode === "test" && testEmail) {
    return [{ id: "test", name: null, email: testEmail }];
  }

  let query = supabase
    .from("customers_v3")
    .select("id,name,email,rfm_segment,last_purchase_at,behavioral_profile,preferred_channel,tags")
    .eq("user_id", userId)
    .not("email", "is", null)
    .is("unsubscribed_at", null);

  query = query.is("email_hard_bounce_at", null).is("email_complaint_at", null) as typeof query;

  if (campaignStoreId) {
    query = query.eq("store_id", campaignStoreId) as typeof query;
  }

  if (mode === "tag" && tag) {
    query = query.contains("tags", [tag]);
  } else if (mode === "rfm" && rfm) {
    query = query.eq("rfm_segment", rfm);
  } else if (mode === "non_openers") {
    const { data: sentRows } = await supabase
      .from("newsletter_send_recipients")
      .select("customer_id")
      .eq("campaign_id", campaignId);
    const allRecipientIds = new Set((sentRows ?? []).map((r: { customer_id: string }) => r.customer_id));
    if (allRecipientIds.size === 0) return [];
    const { data: openRows } = await supabase
      .from("email_engagement_events")
      .select("customer_id")
      .eq("campaign_id", campaignId)
      .eq("event_type", "open");
    const openedIds = new Set((openRows ?? []).map((r: { customer_id: string }) => r.customer_id));
    const nonOpeners = [...allRecipientIds].filter((id) => !openedIds.has(id));
    if (nonOpeners.length === 0) return [];
    query = query.in("id", nonOpeners);
  }

  const PAGE = 1000;
  const all: ContactRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as ContactRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all.filter((c) => c.email);
}

async function getLatestCartContextByCustomer(
  sb: ReturnType<typeof createClient>,
  storeId: string | null | undefined,
  customerIds: string[],
) {
  const byCustomer = new Map<string, {
    cart_value: number | null;
    recovery_url: string | null;
    utm_source: string | null;
    payment_failure_reason: string | null;
    created_at: string | null;
  }>();
  if (!storeId || customerIds.length === 0) return byCustomer;
  const { data: carts } = await sb
    .from("abandoned_carts")
    .select("customer_id,cart_value,recovery_url,utm_source,payment_failure_reason,created_at")
    .eq("store_id", storeId)
    .in("customer_id", customerIds)
    .order("created_at", { ascending: false });
  for (const row of (carts ?? []) as Array<Record<string, unknown>>) {
    if (!byCustomer.has(row.customer_id)) {
      byCustomer.set(row.customer_id, {
        cart_value: row.cart_value ?? null,
        recovery_url: row.recovery_url ?? null,
        utm_source: row.utm_source ?? null,
        payment_failure_reason: row.payment_failure_reason ?? null,
        created_at: row.created_at ?? null,
      });
    }
  }
  return byCustomer;
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  from: string,
  replyTo: string | null | undefined,
  userId: string,
) {
  const body: Record<string, unknown> = {
    from,
    to: [to],
    subject,
    html,
    tags: [{ name: "user_id", value: userId }],
  };
  if (replyTo) body.reply_to = replyTo;

  // 15s timeout — a hanging Resend response would otherwise hold the edge function
  // open until Supabase kills it (~120s), leaving newsletters permanently in "sending".
  const resendCtrl = new AbortController();
  const resendTimer = setTimeout(() => resendCtrl.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: resendCtrl.signal,
    });
  } catch (fetchErr) {
    const isTimeout = (fetchErr as Error)?.name === "AbortError";
    throw new Error(isTimeout ? "Resend API timeout (15s) — retentará na próxima execução" : String(fetchErr));
  } finally {
    clearTimeout(resendTimer);
  }
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Resend error ${res.status}: ${errBody}`);
  }
  return res.json();
}

async function pMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<Array<{ status: "fulfilled"; value: R } | { status: "rejected"; reason: unknown }>> {
  const results: Array<{ status: "fulfilled"; value: R } | { status: "rejected"; reason: unknown }> = [];
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (e) {
        results[i] = { status: "rejected", reason: e };
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

serve(async (req) => {
  // Validate origin before responding to OPTIONS — returning "*" on preflight
  // before the check allows CSRF from any cross-origin page.
  const originCheck = validateBrowserOrigin(req);
  if (originCheck) return originCheck;
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const oversized = rejectIfBodyTooLarge(req, 64 * 1024);
  if (oversized) return oversized;

  // Hoisted so the catch block can reset campaign status on error.
  let campaign_id = "";

  try {
    const rawBody = await req.json();
    const parsedBody = RequestSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return errorResponse("Invalid request payload", 400);
    }
    const body = parsedBody.data;
    const {
      campaign_id: parsedCampaignId,
      recipient_mode: bodyRecipientMode,
      recipient_tag: bodyRecipientTag,
      recipient_rfm: bodyRecipientRfm,
      test_email,
    } = body;
    campaign_id = parsedCampaignId;

    if (!campaign_id) return errorResponse("campaign_id obrigatório", 400);
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY não configurado");

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const internalSecret =
      Deno.env.get("PROCESS_SCHEDULED_MESSAGES_SECRET") ?? Deno.env.get("DISPATCH_NEWSLETTER_INTERNAL_SECRET") ?? "";
    const providedInternal = req.headers.get("x-internal-secret") ?? "";
    const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const internalOk =
      Boolean(internalSecret && timingSafeEqual(providedInternal, internalSecret)) &&
      authHeader === SUPABASE_SERVICE_KEY;

    let userId: string;

    if (internalOk) {
      const { data: campRow, error: cErr } = await sb
        .from("campaigns")
        .select("user_id,channel,status")
        .eq("id", campaign_id)
        .single();
      if (cErr || !campRow) throw new Error("Campanha não encontrada");
      if ((campRow as { channel?: string }).channel !== "email") {
        throw new Error("Campanha não é e-mail");
      }
      userId = (campRow as { user_id: string }).user_id;
      // Audit log every internal dispatch so secret-leak abuse is detectable.
      sb.from("audit_logs").insert({
        action: "newsletter_internal_dispatch",
        resource_type: "campaign",
        resource_id: campaign_id,
        result: "info",
        metadata: { campaign_user_id: userId, triggered_by: "internal_secret" },
      }).then(({ error: logErr }) => {
        if (logErr) console.warn("[dispatch-newsletter] audit_log insert failed:", logErr.message);
      });
    } else {
      const jwt = authHeader;
      const { data: { user }, error: authErr } = await sb.auth.getUser(jwt);
      if (authErr || !user) throw new Error("Não autorizado");
      userId = user.id;
    }

    const { allowed: rlAllowed } = await checkDistributedRateLimit(sb, `dispatch-newsletter:${userId}`, 20, 60_000);
    if (!rlAllowed) return rateLimitedResponse();

    const { data: campaign, error: campErr } = await sb
      .from("campaigns")
      .select(CAMPAIGNS_DISPATCH_NEWSLETTER_SELECT)
      .eq("id", campaign_id)
      .eq("user_id", userId)
      .single();
    if (campErr || !campaign) throw new Error("Campanha não encontrada");

    const camp = campaign as {
      email_recipient_mode?: string | null;
      email_recipient_tag?: string | null;
      email_recipient_rfm?: string | null;
    };
    const recipient_mode = bodyRecipientMode ??
      (camp.email_recipient_mode || "all");
    const recipient_tag = bodyRecipientTag ?? camp.email_recipient_tag ?? undefined;
    const recipient_rfm = bodyRecipientRfm ?? camp.email_recipient_rfm ?? undefined;

    const blocksRaw = ((campaign as { blocks?: unknown }).blocks ?? []) as Block[];
    if (blocksRaw.length === 0) throw new Error("Newsletter sem blocos. Adicione conteúdo antes de enviar.");

    const subjectA = (campaign as { subject?: string }).subject || campaign.name || "Newsletter";
    const subjectB = (campaign as { subject_variant_b?: string }).subject_variant_b || "";
    const abEnabled = !!(campaign as { ab_subject_enabled?: boolean }).ab_subject_enabled && subjectB.length > 0;

    const preheader = (campaign as { preheader?: string }).preheader ?? "";

    const campaignStoreId = (campaign as { store_id?: string | null }).store_id ?? null;

    const storeQuery = sb
      .from("stores")
      .select("id,name,email_from_address,email_reply_to,brand_primary_color")
      .eq("user_id", userId);
    const { data: store } = campaignStoreId
      ? await storeQuery.eq("id", campaignStoreId).maybeSingle()
      : await storeQuery.limit(1).maybeSingle();

    const storeName = store?.name ?? "nossa loja";
    const fromName = store?.name ?? "LTV Boost";
    const fromEmail = (store as { email_from_address?: string } | null)?.email_from_address?.trim() || DEFAULT_FROM_EMAIL;
    const replyTo = (store as { email_reply_to?: string } | null)?.email_reply_to ?? null;
    const brandHex = (store as { brand_primary_color?: string } | null)?.brand_primary_color ?? null;
    const fromHeader = `${fromName} <${fromEmail}>`;

    const contacts = await resolveContacts(
      sb,
      userId,
      recipient_mode,
      campaign_id,
      recipient_tag,
      recipient_rfm,
      test_email,
      campaignStoreId,
    );
    if (contacts.length === 0) throw new Error("Nenhum contato com e-mail encontrado para o segmento selecionado.");

    const isTest = recipient_mode === "test";
    const utmCampaign = slugCampaignId(campaign_id);
    const utmBase = {
      utm_source: "ltvboost",
      utm_medium: "email",
      utm_campaign: utmCampaign,
    };

    const blocksHydrated = await hydrateProductBlocks(sb, userId, blocksRaw);

    const storeId = (store as { id?: string } | null)?.id ?? null;
    const cartContextByCustomer = await getLatestCartContextByCustomer(sb, storeId, contacts.map((c) => c.id));
    const sidAndVariantByCustomer = new Map<string, { sid: string; subject_variant: "a" | "b" }>();
    if (!isTest) {
      const realContacts = contacts.filter((c) => c.id !== "test");
      if (realContacts.length > 0) {
        // Upsert recipients in chunks — idempotent: if dispatch is retried after a partial
        // failure, existing rows are preserved and new ones are added without data loss.
        // (Previous DELETE+INSERT pattern could lose all recipients if INSERT timed out.)
        const CHUNK_SIZE = 1000;
        for (let i = 0; i < realContacts.length; i += CHUNK_SIZE) {
          const chunk = realContacts.slice(i, i + CHUNK_SIZE);
          const { error: upsertErr } = await sb.from("newsletter_send_recipients").upsert(
            chunk.map((c) => ({
              campaign_id,
              customer_id: c.id,
              user_id: userId,
              subject_variant: abEnabled ? pickAbVariant(c.id) : "a",
              status: "pending",
            })),
            { onConflict: "campaign_id,customer_id", ignoreDuplicates: true },
          );
          if (upsertErr) throw upsertErr;
        }
      }

      // 3. Set campaign to running; the background worker will pick it up
      await sb.from("campaigns").update({ 
        status: "running",
        total_contacts: realContacts.length,
        sent_count: 0
      }).eq("id", campaign_id);

      return jsonResponse({
        success: true,
        queued: true,
        message: "Newsletter enfileirada para envio processado em segundo plano.",
        total: realContacts.length,
      });
    }

    // IF TEST: process synchronously (keep the old pMap logic just for test email)
    const results = await pMap(
      contacts,
      async (contact) => {
        const unsubscribeUrl = await buildSignedUnsubscribeUrl(APP_URL, userId, contact.id);
        const subject = subjectA;
        const cartContext = cartContextByCustomer.get(contact.id);
        
        const html = renderBlocksToHTML(blocksHydrated, {
          unsubscribeUrl,
          preheader,
          mergeVars: {
            nome: contact.name ?? "Cliente",
            loja: storeName,
            email: contact.email ?? "",
            valor_carrinho: cartContext?.cart_value != null ? String(cartContext.cart_value) : "",
          },
          brandPrimaryHex: brandHex ?? undefined,
        });

        await sendEmail(contact.email!, subject, html, fromHeader, replyTo, userId);
      },
      1,
    );

    return jsonResponse({ sent: results.length, total: contacts.length });

  } catch (err: unknown) {
    const requestId = crypto.randomUUID();
    console.error(`[${requestId}] dispatch-newsletter error:`, err);
    // Reset campaign status from "running" → "pending" so the user can retry.
    // campaign_id is accessible via the outer closure when the request was valid.
    if (typeof campaign_id === "string" && campaign_id.length > 0) {
      const sb2 = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      await sb2
        .from("campaigns")
        .update({ status: "pending" })
        .eq("id", campaign_id)
        .eq("status", "running"); // Only reset if still "running" — don't disturb completed campaigns.
    }
    return new Response(JSON.stringify({ error: "Internal server error", request_id: requestId }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
