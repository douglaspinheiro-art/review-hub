/**
 * LTV Boost v4 — Worker: Process Queued Messages (WhatsApp & Email)
 * Invocado por cron com `x-internal-secret` / Bearer = PROCESS_SCHEDULED_MESSAGES_SECRET.
 *
 * Filas (cada uma até cap por execução):
 * 1. webhook_queue   — ingestão de carrinho / webhooks
 * 2. scheduled_messages — WhatsApp (campanhas/jornadas); claim atómico pending→processing
 *    ↳ Paralelismo: mensagens agrupadas por store_id; lojas processadas em paralelo.
 *    ↳ Retry Meta API: até 3 tentativas com backoff exponencial em 429/5xx.
 * 3. newsletter_send_recipients — e-mail em massa; claim atómico pending→processing
 *
 * Observabilidade: resposta JSON inclui `request_id`, `elapsed_ms`, contagens agregadas.
 * Throughput alvo: ~1 000 msg/run (10 lojas × 100 msg) vs 100 msg/run anterior.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, timingSafeEqual } from "../_shared/edge-utils.ts";
import { outboundSendText, outboundSendMetaTemplate } from "../_shared/whatsapp-outbound.ts";
import { sendEmail } from "../_shared/resend-email.ts";
import { renderBlocksToHTML } from "../_shared/newsletter-html.ts";
import { invokeFlowEngine } from "../_shared/flow-engine-invoke.ts";

// ── Constants ──────────────────────────────────────────────────────────────────

/** Messages claimed per cron run per queue. */
const BATCH_SIZE = 500; // raised from 100 → 500 (parallel processing makes this safe)

/** Max concurrent stores processed simultaneously in the WA queue.
 *  Capped at 10 to prevent PgBouncer saturation at 100+ stores.
 *  Rationale: 10 stores × 5 concurrent DB queries = 50 connections per instance.
 *  PgBouncer default pool is 60 connections per edge function instance; at 20 parallel
 *  stores two overlapping cron invocations would exhaust the pool (20×5×2 = 200 > 60).
 *  At 10 stores × 2 overlapping = 100 connections — within the safe range.
 *  Throughput: 10 stores × avg 50 msgs = 500 msgs/batch → ~1,000 msgs/min at 2-min cron. */
const MAX_PARALLEL_STORES = 10;

/** Max concurrent webhook jobs processed in parallel per batch.
 *  Each job may call flow-engine (network I/O) so parallelism improves throughput.
 *  Capped to prevent PgBouncer exhaustion (each job uses ~2 DB calls). */
const MAX_PARALLEL_WEBHOOKS = 10;

/** Max retry attempts for Meta Cloud API calls (429 / 5xx). */
const META_MAX_RETRIES = 3;

// ── Helpers ────────────────────────────────────────────────────────────────────

function readQueueCap(envName: string, fallback: number, hardMax: number): number {
  const raw = Deno.env.get(envName);
  const n = raw == null || raw === "" ? fallback : Number(raw);
  if (!Number.isFinite(n)) return Math.min(hardMax, fallback);
  return Math.min(hardMax, Math.max(1, Math.floor(n)));
}

function readWebhookMaxAttempts(): number {
  const n = Number(Deno.env.get("WEBHOOK_QUEUE_MAX_ATTEMPTS") ?? "5");
  return Number.isFinite(n) && n >= 1 ? Math.min(50, Math.floor(n)) : 5;
}

function readAntiSpamDelayMs(): number {
  const raw = Deno.env.get("PROCESS_SCHEDULED_MESSAGES_ANTI_SPAM_MS");
  const n = raw == null || raw === "" ? 350 : Number(raw);
  if (!Number.isFinite(n) || n < 0) return 350;
  return Math.min(8000, n);
}

async function invokeFlowEngineWithRetry(
  appUrl: string,
  body: Parameters<typeof invokeFlowEngine>[1],
): Promise<Response> {
  const max = Math.min(5, Math.max(1, Number(Deno.env.get("FLOW_ENGINE_INVOKE_RETRIES") ?? "3") || 3));
  let last: Response | null = null;
  for (let i = 0; i < max; i++) {
    last = await invokeFlowEngine(appUrl, body);
    if (last.ok) return last;
    const retryable = last.status === 429 || last.status >= 500;
    if (!retryable || i === max - 1) return last;
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  return last!;
}

/**
 * Send a WhatsApp message with exponential backoff retry on 429 / 5xx.
 * Returns the result or throws on terminal failure.
 */
async function sendWaWithRetry(
  waRow: Parameters<typeof outboundSendText>[0],
  e164: string,
  content: string,
  metadata: Record<string, unknown>,
): Promise<unknown> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < META_MAX_RETRIES; attempt++) {
    try {
      if (metadata.content_type === "template" && metadata.meta_template_name) {
        const lang = String(metadata.meta_template_language ?? "pt_BR");
        // Parameters were resolved (variable substitution) at scheduling time and
        // serialized in metadata.meta_template_parameters as string[]. Fallback to
        // the message content as the single body parameter for legacy rows.
        const rawParams = Array.isArray(metadata.meta_template_parameters)
          ? (metadata.meta_template_parameters as unknown[]).map((v) => String(v ?? ""))
          : (content ? [content] : []);
        return await outboundSendMetaTemplate(
          waRow,
          e164,
          String(metadata.meta_template_name),
          lang,
          rawParams,
        );
      }
      return await outboundSendText(waRow, e164, content);
    } catch (e) {
      lastErr = e as Error;
      const msg = lastErr.message ?? "";
      // Determine if this error is retryable (rate limit or server error from Meta)
      const isRateLimit = msg.includes("429") || msg.toLowerCase().includes("rate");
      const isServerErr = /\b5\d{2}\b/.test(msg);
      if (!isRateLimit && !isServerErr) throw lastErr; // non-retryable (e.g. bad phone number)
      if (attempt < META_MAX_RETRIES - 1) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt), 8_000);
        console.warn(`[wa-retry] attempt ${attempt + 1}/${META_MAX_RETRIES}, delay ${delayMs}ms — ${msg.slice(0, 120)}`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr ?? new Error("Max retries exceeded");
}

// ── Types ──────────────────────────────────────────────────────────────────────

type WaMessage = {
  id: string;
  store_id: string;
  message_content: string;
  metadata: Record<string, unknown> | null;
  campaign_id: string | null;
  status: string;
  scheduled_for: string;
  customers_v3: { phone: string; name: string | null; email: string | null };
};

/** Substitute {{nome}}, {{name}}, {{email}}, {{phone}} placeholders in a string. */
function substituteContactVars(
  s: string,
  customer: { name: string | null; email: string | null; phone: string },
): string {
  return s
    .replace(/\{\{\s*(nome|name)\s*\}\}/gi, customer.name?.trim() || "")
    .replace(/\{\{\s*email\s*\}\}/gi, customer.email?.trim() || "")
    .replace(/\{\{\s*(telefone|phone)\s*\}\}/gi, customer.phone || "");
}

type WaConnection = {
  id: string;
  instance_name: string | null;
  meta_phone_number_id: string | null;
  meta_access_token: string | null;
  meta_api_version: string | null;
  store_id: string;
  status: string;
};

// ── Per-store WA processor ─────────────────────────────────────────────────────

async function processStoreWaMessages(
  supabase: ReturnType<typeof createClient>,
  storeId: string,
  msgs: WaMessage[],
  antiSpamDelayMs: number,
): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  // Fetch WhatsApp connection once per store (not once per message)
  const { data: conn } = await supabase
    .from("whatsapp_connections")
    .select("id, instance_name, meta_phone_number_id, meta_access_token, meta_api_version, store_id, status")
    .eq("store_id", storeId)
    .eq("status", "connected")
    .limit(1)
    .maybeSingle() as { data: WaConnection | null };

  for (const msg of msgs) {
    try {
      // Atomic claim — skip if already claimed by another worker
      const { data: claim } = await supabase
        .from("scheduled_messages")
        .update({ status: "processing", processed_at: new Date().toISOString() })
        .eq("id", msg.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (!claim) continue;

      if (!conn) throw new Error("No active WhatsApp connection");

      const phone = (msg.customers_v3.phone || "").replace(/\D/g, "");
      const e164 = phone.startsWith("55") ? phone : `55${phone}`;
      const waRow = {
        provider: "meta_cloud",
        instance_name: conn.instance_name,
        meta_phone_number_id: conn.meta_phone_number_id,
        meta_access_token: conn.meta_access_token,
        meta_api_version: conn.meta_api_version,
      };

      const metadata = (msg.metadata || {}) as Record<string, unknown>;
      await sendWaWithRetry(waRow, e164, msg.message_content, metadata);

      await supabase
        .from("scheduled_messages")
        .update({ status: "sent", sent_at: new Date().toISOString(), processed_at: new Date().toISOString() })
        .eq("id", msg.id);

      if (msg.campaign_id) {
        await supabase.rpc("increment_campaign_sent_count", { p_campaign_id: msg.campaign_id });
      }

      processed++;
      if (antiSpamDelayMs > 0) await new Promise((r) => setTimeout(r, antiSpamDelayMs));
    } catch (e) {
      const err = e as Error;
      console.error(`[wa] msg ${msg.id} store ${storeId} error:`, err.message);
      await supabase
        .from("scheduled_messages")
        .update({ status: "failed", error_message: err.message.slice(0, 500) })
        .eq("id", msg.id);
      errors++;
    }
  }

  return { processed, errors };
}

// ── Main handler ───────────────────────────────────────────────────────────────

serve(async (req) => {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const internalSecret = Deno.env.get("PROCESS_SCHEDULED_MESSAGES_SECRET");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const providedSecret =
    req.headers.get("x-internal-secret") ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  const okInternal = internalSecret && timingSafeEqual(providedSecret ?? "", internalSecret);
  const okServiceRole = serviceRoleKey && timingSafeEqual(providedSecret ?? "", serviceRoleKey);
  if (!okInternal && !okServiceRole) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  // ── Optional queue selector ────────────────────────────────────────────────
  // Body: { "queues": ["webhooks", "wa", "email"] } — default: all queues.
  // Allows independent cron schedules per queue to prevent timeout at scale.
  // Example pg_cron: high-frequency "wa" + "webhooks" every 1 min,
  //                  lower-frequency "email" every 5 min.
  let enabledQueues = new Set(["webhooks", "wa", "email"]);
  try {
    const bodyText = await req.text();
    if (bodyText) {
      const body = JSON.parse(bodyText) as { queues?: unknown };
      if (Array.isArray(body.queues) && body.queues.length > 0) {
        enabledQueues = new Set(body.queues.map((q) => String(q).toLowerCase()));
      }
    }
  } catch { /* no body or invalid JSON — process all queues */ }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const APP_URL = Deno.env.get("APP_URL") || "https://app.ltvboost.com.br";
  const ANTI_SPAM_DELAY_MS = readAntiSpamDelayMs();

  const now = new Date().toISOString();
  let totalProcessed = 0;
  let totalErrors = 0;
  let campaignsFinalized = 0;

  // ── 0. STUCK MESSAGE RECOVERY ─────────────────────────────────────────────────
  // Reset rows stuck in "processing" for >15 min (worker killed mid-run by timeout).
  // Without this, killed batches leave messages undelivered forever.
  // 5 min was too aggressive at high load — at peak (20 stores × burst), legitimate
  // in-progress messages were prematurely retried, causing duplicate sends.
  const stuckCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const [stuckWaRes, stuckEmailRes, stuckWebhookRes] = await Promise.allSettled([
    supabase
      .from("scheduled_messages")
      .update({ status: "pending", error_message: "recovered: stuck in processing" })
      .eq("status", "processing")
      .lt("processed_at", stuckCutoff),
    supabase
      .from("newsletter_send_recipients")
      .update({ status: "pending" })
      .eq("status", "processing")
      .lt("processed_at", stuckCutoff),
    supabase
      .from("webhook_queue")
      .update({ status: "pending" })
      .eq("status", "processing")
      .lt("updated_at", stuckCutoff),
  ]);
  const stuckWaErr = stuckWaRes.status === "rejected" ? String(stuckWaRes.reason) : null;
  const stuckEmailErr = stuckEmailRes.status === "rejected" ? String(stuckEmailRes.reason) : null;
  if (stuckWaErr || stuckEmailErr) {
    console.warn(JSON.stringify({ tag: "CRON_ALERT", component: "stuck-recovery", wa_err: stuckWaErr, email_err: stuckEmailErr }));
  } else {
    console.log(JSON.stringify({ tag: "process-scheduled-messages", component: "stuck-recovery", ok: true, stuck_cutoff: stuckCutoff }));
  }
  void stuckWebhookRes; // best-effort; webhook_queue may not have processed_at column

  const capWebhooks = readQueueCap("PROCESS_SCHEDULED_MAX_WEBHOOK_JOBS", BATCH_SIZE, 1000);
  const capWa = readQueueCap("PROCESS_SCHEDULED_MAX_WA_MESSAGES", BATCH_SIZE, 2000);
  const capEmail = readQueueCap("PROCESS_SCHEDULED_MAX_EMAIL_RECIPIENTS", BATCH_SIZE, 1000);
  let webhookProcessed = 0;
  let webhookDeadLetter = 0;
  let waProcessed = 0;
  let emailProcessed = 0;
  let parallelStores = 0;

  console.log(JSON.stringify({ tag: "process-scheduled-messages", component: "start", queues: [...enabledQueues], request_id: requestId }));

  // ── 1. WEBHOOK QUEUE ─────────────────────────────────────────────────────────
  if (enabledQueues.has("webhooks")) {
  const webhookMaxAttempts = readWebhookMaxAttempts();

  const { data: pendingWebhooks } = await supabase
    .from("webhook_queue")
    .select("id, store_id, user_id, platform, payload_normalized, status, attempts, created_at, updated_at, next_retry_at")
    .eq("status", "pending")
    .lte("next_retry_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(capWebhooks);

  // Process webhook jobs in parallel batches of MAX_PARALLEL_WEBHOOKS
  const allJobs = pendingWebhooks ?? [];
  for (let batchStart = 0; batchStart < allJobs.length; batchStart += MAX_PARALLEL_WEBHOOKS) {
    const batch = allJobs.slice(batchStart, batchStart + MAX_PARALLEL_WEBHOOKS);
    const results = await Promise.allSettled(batch.map(async (job) => {
      const { data: claim } = await supabase
        .from("webhook_queue")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", job.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (!claim) return "skipped";

      const normalized = job.payload_normalized as Record<string, unknown> | null;
      const storeId = job.store_id;
      const userId = job.user_id;

      const phoneRaw = normalized?.customer_phone;
      const extRaw = normalized?.external_id;
      const phoneOk = typeof phoneRaw === "string" && phoneRaw.replace(/\D/g, "").length >= 8;
      const extOk = extRaw != null && String(extRaw).trim().length > 0;
      if (!phoneOk || !extOk) {
        await supabase.from("webhook_queue").update({
          status: "dead_letter",
          error_message: `invalid_payload: phone_ok=${phoneOk} external_id_ok=${extOk}`,
          attempts: webhookMaxAttempts,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);
        webhookDeadLetter++;
        throw new Error("invalid_payload");
      }

      const { data: customerId, error: upsertErr } = await supabase.rpc("upsert_cart_with_customer", {
        p_user_id:                userId,
        p_store_id:               storeId,
        p_phone:                  normalized.customer_phone as string,
        p_email:                  (normalized.customer_email as string | null) ?? null,
        p_name:                   (normalized.customer_name as string | null) ?? null,
        p_external_id:            String(normalized.external_id),
        p_source:                 job.platform,
        p_cart_value:             normalized.cart_value ?? null,
        p_cart_items:             normalized.cart_items ?? null,
        p_recovery_url:           normalized.recovery_url ?? null,
        p_raw_payload:            normalized,
        p_utm_source:             normalized.utm_source ?? null,
        p_utm_medium:             normalized.utm_medium ?? null,
        p_utm_campaign:           normalized.utm_campaign ?? null,
        p_shipping_value:         normalized.shipping_value ?? null,
        p_shipping_zip_code:      normalized.shipping_zip_code ?? null,
        p_payment_failure_reason: normalized.payment_failure_reason ?? null,
        p_inventory_status:       normalized.inventory_status ?? null,
        p_abandon_step:           normalized.abandon_step ?? null,
      });

      if (upsertErr) throw upsertErr;
      if (!customerId) throw new Error("upsert_cart_with_customer returned no customer id");
      const customer = { id: customerId as string };

      const paymentLike =
        normalized.abandon_step === "payment" ||
        (typeof normalized.payment_failure_reason === "string" &&
          normalized.payment_failure_reason.trim().length > 0);
      const event = paymentLike ? "payment_pending" : "cart_abandoned";

      const flowRes = await invokeFlowEngineWithRetry(APP_URL, {
        event,
        store_id: storeId,
        customer_id: customer.id,
        payload: {
          recovery_url: normalized.recovery_url ?? "",
          cart_value: normalized.cart_value,
          shipping_value: normalized.shipping_value,
        },
      });
      if (!flowRes.ok) {
        const detail = await flowRes.text().catch(() => "");
        throw new Error(`flow-engine ${flowRes.status}: ${detail.slice(0, 400)}`);
      }

      await supabase.from("webhook_queue").update({
        status: "completed",
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);

      return "ok";
    }));

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled" && r.value === "ok") {
        totalProcessed++;
        webhookProcessed++;
      } else if (r.status === "rejected") {
        const job = batch[i];
        const err = r.reason as Error;
        if (err.message !== "invalid_payload") {
          console.error(`Webhook job ${job.id} error:`, err.message);
          const prev = Number((job as { attempts?: number }).attempts ?? 0);
          const next = prev + 1;
          if (next >= webhookMaxAttempts) {
            await supabase.from("webhook_queue").update({
              status: "dead_letter",
              error_message: err.message,
              attempts: next,
              updated_at: new Date().toISOString(),
            }).eq("id", job.id);
          } else {
            const backoffMs = Math.min(Math.pow(2, next) * 30_000, 3_600_000);
            const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
            await supabase.from("webhook_queue").update({
              status: "pending",
              error_message: err.message,
              attempts: next,
              next_retry_at: nextRetryAt,
              updated_at: new Date().toISOString(),
            }).eq("id", job.id);
          }
        }
        totalErrors++;
      }
    }
  }
  } // end enabledQueues.has("webhooks")

  // ── 2. WHATSAPP QUEUE — parallel per-store processing ────────────────────────
  if (enabledQueues.has("wa")) {
  const { data: pendingWA } = await supabase
    .from("scheduled_messages")
    .select("id, store_id, message_content, metadata, campaign_id, status, scheduled_for, customers_v3(phone, name, email)")
    .eq("status", "pending")
    .is("sent_at", null)
    .lte("scheduled_for", now)
    .order("store_id", { ascending: true })
    .order("scheduled_for", { ascending: true })
    .limit(capWa);

  // Group messages by store_id to enable parallel processing
  const storeGroups = new Map<string, WaMessage[]>();
  for (const msg of (pendingWA ?? []) as WaMessage[]) {
    const list = storeGroups.get(msg.store_id) ?? [];
    list.push(msg);
    storeGroups.set(msg.store_id, list);
  }
  parallelStores = storeGroups.size;

  // Process stores in parallel batches of MAX_PARALLEL_STORES
  const storeEntries = Array.from(storeGroups.entries());
  for (let i = 0; i < storeEntries.length; i += MAX_PARALLEL_STORES) {
    const batch = storeEntries.slice(i, i + MAX_PARALLEL_STORES);
    const results = await Promise.allSettled(
      batch.map(([sid, msgs]) =>
        processStoreWaMessages(supabase, sid, msgs, ANTI_SPAM_DELAY_MS)
      ),
    );
    for (const result of results) {
      if (result.status === "fulfilled") {
        waProcessed += result.value.processed;
        totalProcessed += result.value.processed;
        totalErrors += result.value.errors;
      } else {
        console.error("[wa-batch] store batch error:", result.reason);
        totalErrors++;
      }
    }
  }
  } // end enabledQueues.has("wa")

  // ── 3. EMAIL QUEUE ────────────────────────────────────────────────────────────
  if (enabledQueues.has("email")) {
  const { data: pendingEmail } = await supabase
    .from("newsletter_send_recipients")
    .select(
      "id, campaign_id, subject_variant, customers_v3(email, name), campaigns(id, store_id, blocks, subject, subject_variant_b)",
    )
    .eq("status", "pending")
    .limit(capEmail);

  for (const row of (pendingEmail ?? [])) {
    try {
      const { data: claim } = await supabase
        .from("newsletter_send_recipients")
        .update({ status: "processing", processed_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (!claim) continue;

      const campaign = row.campaigns;
      const customer = row.customers_v3;
      const { data: store } = await supabase
        .from("stores")
        .select("id, name, email_from_address, email_reply_to")
        .eq("id", campaign.store_id)
        .single();

      const unsubscribeUrl = `https://app.ltvboost.com.br/unsubscribe?sid=${row.id}`;
      const html = renderBlocksToHTML(campaign.blocks || [], {
        unsubscribeUrl,
        mergeVars: { nome: customer.name || "Cliente", loja: store.name },
      });

      await sendEmail({
        from: `${store.name} <${store.email_from_address || "contato@ltvboost.com.br"}>`,
        to: customer.email,
        subject: row.subject_variant === "b" ? campaign.subject_variant_b : campaign.subject,
        html,
        reply_to: store.email_reply_to,
        tags: [{ name: "campaign_id", value: campaign.id }],
      });

      await supabase
        .from("newsletter_send_recipients")
        .update({ status: "sent", processed_at: new Date().toISOString() })
        .eq("id", row.id);
      await supabase.rpc("increment_campaign_sent_count", { p_campaign_id: campaign.id });

      totalProcessed++;
      emailProcessed++;
    } catch (e) {
      const err = e as Error;
      console.error(`Email row ${row.id} error:`, err.message);
      await supabase
        .from("newsletter_send_recipients")
        .update({ status: "failed", error_message: err.message })
        .eq("id", row.id);
      totalErrors++;
    }
  }
  } // end enabledQueues.has("email")

  // ── 4. POST-PROCESSING (Campaign Cleanup) ─────────────────────────────────────
  const { data: finalizedN, error: finalizeErr } = await supabase.rpc("finalize_completed_campaigns");
  if (finalizeErr) {
    console.error(JSON.stringify({
      tag: "CRON_ALERT",
      component: "finalize_completed_campaigns",
      message: finalizeErr.message,
      request_id: requestId,
    }));
  } else if (typeof finalizedN === "number") {
    campaignsFinalized = finalizedN;
  }

  const elapsedMs = Date.now() - startedAt;
  const logPayload = {
    tag: "process-scheduled-messages",
    request_id: requestId,
    processed: totalProcessed,
    errors: totalErrors,
    elapsed_ms: elapsedMs,
    campaigns_finalized: campaignsFinalized,
    parallel_stores: parallelStores,
    caps: { webhooks: capWebhooks, wa: capWa, email: capEmail },
    breakdown: {
      webhook_ok: webhookProcessed,
      webhook_dead_letter: webhookDeadLetter,
      wa_ok: waProcessed,
      email_ok: emailProcessed,
    },
  };
  console.log(JSON.stringify(logPayload));

  return new Response(
    JSON.stringify({ ok: true, ...logPayload }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
