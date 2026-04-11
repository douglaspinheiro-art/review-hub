/**
 * LTV Boost v4 — Worker: Process Queued Messages (WhatsApp & Email)
 * Runs periodically to send pending messages from:
 * 1. scheduled_messages (WhatsApp - Campaigns & Journeys)
 * 2. newsletter_send_recipients (Email - Newsletter campaigns)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/edge-utils.ts";
import { outboundSendText, outboundSendEvolution, outboundSendMetaTemplate } from "../_shared/whatsapp-outbound.ts";
import { sendEmail } from "../_shared/resend-email.ts";
import { renderBlocksToHTML } from "../_shared/newsletter-html.ts";
import { invokeFlowEngine } from "../_shared/flow-engine-invoke.ts";

const ANTI_SPAM_DELAY_MS = 1200;
const BATCH_SIZE = 100;

serve(async (req) => {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const internalSecret = Deno.env.get("PROCESS_SCHEDULED_MESSAGES_SECRET");
  const providedSecret = req.headers.get("x-internal-secret") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (!internalSecret || providedSecret !== internalSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const APP_URL = Deno.env.get("APP_URL") || "https://app.ltvboost.com.br";

  const now = new Date().toISOString();
  let totalProcessed = 0;
  let totalErrors = 0;

  // ── 1. WEBHOOK QUEUE (webhook_queue) ────────────────────────────────────────
  const { data: pendingWebhooks } = await supabase
    .from("webhook_queue")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  for (const job of (pendingWebhooks ?? [])) {
    try {
      // Atomic claim
      const { data: claim } = await supabase.from("webhook_queue")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", job.id).eq("status", "pending").select("id").maybeSingle();
      if (!claim) continue;

      const normalized = job.payload_normalized;
      const storeId = job.store_id;
      const userId = job.user_id;

      // 1. Upsert Customer (v3 model)
      const { data: customer } = await supabase.from("customers_v3").upsert({
        user_id: userId,
        store_id: storeId,
        phone: normalized.customer_phone,
        email: normalized.customer_email,
        name: normalized.customer_name,
      }, { onConflict: "store_id, phone" }).select("id").single();

      if (!customer) throw new Error("Failed to upsert customer");

      // 2. Save Abandoned Cart
      const { error: cartError } = await supabase.from("abandoned_carts").upsert({
        user_id: userId,
        store_id: storeId,
        customer_id: customer.id,
        external_id: normalized.external_id,
        source: job.platform,
        cart_value: normalized.cart_value,
        cart_items: normalized.cart_items,
        recovery_url: normalized.recovery_url,
        status: "pending",
        raw_payload: normalized, // In the queue we store normalized, but we can store raw too if needed
        utm_source: normalized.utm_source,
        utm_medium: normalized.utm_medium,
        utm_campaign: normalized.utm_campaign,
        shipping_value: normalized.shipping_value,
        shipping_zip_code: normalized.shipping_zip_code,
        payment_failure_reason: normalized.payment_failure_reason,
        inventory_status: normalized.inventory_status,
        abandon_step: normalized.abandon_step ?? null,
      }, { onConflict: "store_id, external_id" });

      if (cartError) throw cartError;

      // 3. Trigger Flow Engine
      const paymentLike =
        normalized.abandon_step === "payment" ||
        (typeof normalized.payment_failure_reason === "string" &&
          normalized.payment_failure_reason.trim().length > 0);
      const event = paymentLike ? "payment_pending" : "cart_abandoned";
      
      await invokeFlowEngine(APP_URL, {
        event,
        store_id: storeId,
        customer_id: customer.id,
        payload: {
          recovery_url: normalized.recovery_url ?? "",
          cart_value: normalized.cart_value,
          shipping_value: normalized.shipping_value,
        },
      });

      await supabase.from("webhook_queue").update({ 
        status: "completed", 
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString() 
      }).eq("id", job.id);

      totalProcessed++;
    } catch (e) {
      const err = e as Error;
      console.error(`Webhook job ${job.id} error:`, err.message);
      await supabase.from("webhook_queue").update({ 
        status: "failed", 
        error_message: err.message,
        updated_at: new Date().toISOString() 
      }).eq("id", job.id);
      totalErrors++;
    }
  }

  // ── 2. WHATSAPP QUEUE (scheduled_messages) ──────────────────────────────────
  const { data: pendingWA } = await supabase
    .from("scheduled_messages")
    .select("*, stores(*), customers_v3(*)")
    .eq("status", "pending")
    .is("sent_at", null)
    .lte("scheduled_for", now)
    .limit(BATCH_SIZE);

  for (const msg of (pendingWA ?? [])) {
    try {
      // Atomic claim
      const { data: claim } = await supabase.from("scheduled_messages")
        .update({ status: "processing", processed_at: new Date().toISOString() })
        .eq("id", msg.id).eq("status", "pending").select("id").maybeSingle();
      if (!claim) continue;

      const { data: conn } = await supabase.from("whatsapp_connections")
        .select("*").eq("store_id", msg.store_id).eq("status", "connected").limit(1).maybeSingle();

      if (!conn) throw new Error("No active connection");

      const phone = (msg.customers_v3.phone || "").replace(/\D/g, "");
      const e164 = phone.startsWith("55") ? phone : `55${phone}`;
      const waRow = {
        provider: "meta_cloud",
        instance_name: conn.instance_name,
        meta_phone_number_id: conn.meta_phone_number_id,
        meta_access_token: conn.meta_access_token,
        meta_api_version: conn.meta_api_version,
      };

      let result: unknown = null;
      const metadata = (msg.metadata || {}) as Record<string, unknown>;
      if (metadata.content_type === "template" && metadata.meta_template_name) {
        result = await outboundSendMetaTemplate(waRow, e164, String(metadata.meta_template_name), "pt_BR", [msg.message_content]);
      } else {
        result = await outboundSendText(waRow, e164, msg.message_content);
      }

      await supabase.from("scheduled_messages").update({ status: "sent", sent_at: new Date().toISOString(), processed_at: new Date().toISOString() }).eq("id", msg.id);

      
      // Update Campaign Counter
      if (msg.campaign_id) {
        await supabase.rpc("increment_campaign_sent_count", { p_campaign_id: msg.campaign_id });
      }

      totalProcessed++;
      await new Promise(r => setTimeout(r, ANTI_SPAM_DELAY_MS));
    } catch (e) {
      const err = e as Error;
      console.error(`WA msg ${msg.id} error:`, err.message);
      await supabase.from("scheduled_messages").update({ status: "failed", error_message: err.message }).eq("id", msg.id);
      totalErrors++;
    }
  }

  // ── 2. EMAIL QUEUE (newsletter_send_recipients) ──────────────────────────────
  const { data: pendingEmail } = await supabase
    .from("newsletter_send_recipients")
    .select("*, customers_v3(*), campaigns(*)")
    .eq("status", "pending")
    .limit(BATCH_SIZE);

  for (const row of (pendingEmail ?? [])) {
    try {
      // Atomic claim
      const { data: claim } = await supabase.from("newsletter_send_recipients")
        .update({ status: "processing", processed_at: new Date().toISOString() })
        .eq("id", row.id).eq("status", "pending").select("id").maybeSingle();
      if (!claim) continue;

      const campaign = row.campaigns;
      const customer = row.customers_v3;
      const { data: store } = await supabase.from("stores").select("*").eq("id", campaign.store_id).single();

      const unsubscribeUrl = `https://app.ltvboost.com.br/unsubscribe?sid=${row.id}`;
      const html = renderBlocksToHTML(campaign.blocks || [], {
        unsubscribeUrl,
        mergeVars: { nome: customer.name || "Cliente", loja: store.name }
      });

      await sendEmail({
        from: `${store.name} <${store.email_from_address || "contato@ltvboost.com.br"}>`,
        to: customer.email,
        subject: row.subject_variant === "b" ? campaign.subject_variant_b : campaign.subject,
        html,
        reply_to: store.email_reply_to,
        tags: [{ name: "campaign_id", value: campaign.id }]
      });

      await supabase.from("newsletter_send_recipients").update({ status: "sent", processed_at: new Date().toISOString() }).eq("id", row.id);
      await supabase.rpc("increment_campaign_sent_count", { p_campaign_id: campaign.id });

      totalProcessed++;
    } catch (e) {
      const err = e as Error;
      console.error(`Email row ${row.id} error:`, err.message);
      await supabase.from("newsletter_send_recipients").update({ status: "failed", error_message: err.message }).eq("id", row.id);
      totalErrors++;
    }
  }

  // ── 3. POST-PROCESSING (Campaign Cleanup) ──────────────────────────────────
  // Check campaigns that are 'running' but have no more 'pending' or 'processing' rows
  const { data: activeCampaigns } = await supabase.from("campaigns").select("id").eq("status", "running");
  for (const c of (activeCampaigns ?? [])) {
    const { count: pending } = await supabase.from("scheduled_messages").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).in("status", ["pending", "processing"]);
    const { count: pendingEmail } = await supabase.from("newsletter_send_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).in("status", ["pending", "processing"]);
    
    if ((pending ?? 0) === 0 && (pendingEmail ?? 0) === 0) {
      await supabase.from("campaigns").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", c.id);
      // Trigger A/B winner logic if needed (can be a separate RPC)
    }
  }

  return new Response(JSON.stringify({ 
    ok: true, 
    processed: totalProcessed, 
    errors: totalErrors, 
    elapsed: Date.now() - startedAt 
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
