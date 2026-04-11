/**
 * LTV Boost v4 — Worker: Process Scheduled Messages
 * Runs periodically to send pending messages from scheduled_messages table.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { corsHeaders } from "../_shared/edge-utils.ts";

const ANTI_SPAM_DELAY_MS = 1000;

serve(async (req) => {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Only the dedicated PROCESS_SCHEDULED_MESSAGES_SECRET is accepted — not the service_role_key.
  const internalSecret = Deno.env.get("PROCESS_SCHEDULED_MESSAGES_SECRET");
  if (!internalSecret) {
    console.error("PROCESS_SCHEDULED_MESSAGES_SECRET is not configured");
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const authHeader = req.headers.get("authorization") ?? "";
  const providedSecret = req.headers.get("x-internal-secret") ?? "";
  const validInternal =
    authHeader === `Bearer ${internalSecret}` || providedSecret === internalSecret;
  if (!validInternal) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // 1. Get pending messages ready to be sent
  const now = new Date().toISOString();
  const { data: pending, error } = await supabase
    .from("scheduled_messages")
    .select("*, stores(*), customers_v3(*)")
    .eq("status", "pending")
    .is("sent_at", null)
    .lte("scheduled_for", now)
    .limit(50); // Process in batches

  if (error) return new Response(JSON.stringify({ error: error.message, request_id: requestId }), { status: 500 });

  let sentCount = 0;
  let dispatchedCampaigns = 0;

  for (const msg of (pending ?? [])) {
    try {
      // Atomic claim: only one worker can set sent_at from NULL -> timestamp.
      const claimStamp = new Date().toISOString();
      const { data: claimRow, error: claimError } = await supabase
        .from("scheduled_messages")
        .update({ sent_at: claimStamp })
        .eq("id", msg.id)
        .eq("status", "pending")
        .is("sent_at", null)
        .select("id")
        .maybeSingle();
      if (claimError) {
        console.error(`[${requestId}] claim failed for msg ${msg.id}:`, claimError.message);
        continue;
      }
      if (!claimRow) {
        continue;
      }

      // 2. Find active WhatsApp connection
      const { data: conn } = await supabase
        .from("whatsapp_connections")
        .select("*")
        .eq("store_id", msg.store_id)
        .eq("status", "connected")
        .limit(1)
        .single();

      if (!conn) {
        console.warn(`No connection for store ${msg.store_id}`);
        continue;
      }

      // 3. Send to Evolution API
      const phone = msg.customers_v3.phone;
      const evolutionUrl = `${conn.evolution_api_url.replace(/\/$/, "")}/message/sendText/${conn.instance_name}`;
      
      const res = await fetch(evolutionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: conn.evolution_api_key },
        body: JSON.stringify({ number: phone, text: msg.message_content })
      });

      if (!res.ok) throw new Error(`Evolution API Error: ${await res.text()}`);

      // 4. Update status and log
      await supabase.from("scheduled_messages").update({
        status: "sent",
        sent_at: new Date().toISOString()
      }).eq("id", msg.id);

      if (msg.journey_id) {
        const { data: jc } = await supabase.from("journeys_config").select("id, kpi_atual").eq("id", msg.journey_id).maybeSingle();
        if (jc?.id) {
          const next = Number((jc as { kpi_atual?: number | null }).kpi_atual ?? 0) + 1;
          await supabase
            .from("journeys_config")
            .update({ kpi_atual: next, updated_at: new Date().toISOString() })
            .eq("id", jc.id);
        }
      }

      // Create a conversation/message entry for UI visibility
      const { data: conv } = await supabase.from("conversations").upsert({
        user_id: msg.user_id,
        store_id: msg.store_id,
        contact_id: msg.customer_id, // mapping legacy field
        last_message: msg.message_content,
        last_message_at: new Date().toISOString()
      }, { onConflict: 'store_id, contact_id' }).select("id").single();

      if (conv) {
        await supabase.from("messages").insert({
          user_id: msg.user_id,
          conversation_id: conv.id,
          content: msg.message_content,
          direction: "outbound",
          status: "sent"
        });
      }

      // Log for Attribution + instrumentation by flow step
      const step = Number((msg.metadata as any)?.cadence_step ?? 1);
      const escalation = Boolean((msg.metadata as any)?.escalation_recommended);
      await supabase.from("message_sends").insert({
        user_id: msg.user_id,
        store_id: msg.store_id,
        customer_id: msg.customer_id,
        automation_id: msg.journey_id ?? null,
        phone,
        status: escalation && step >= 3 ? "sent_handoff_recommended" : "sent"
      });

      sentCount++;
      await new Promise(r => setTimeout(r, ANTI_SPAM_DELAY_MS));

    } catch (e: any) {
      console.error(`[${requestId}] Failed to send msg ${msg.id}:`, e?.message ?? e);
      await supabase.from("scheduled_messages").update({ status: "failed", sent_at: null }).eq("id", msg.id);
    }
  }

  // 5. Dispatch WhatsApp campaigns that were scheduled (scheduled_at <= now)
  const { data: dueCampaigns } = await supabase
    .from("campaigns")
    .select("id")
    .eq("status", "scheduled")
    .eq("channel", "whatsapp")
    .lte("scheduled_at", now)
    .limit(20);

  for (const campaign of (dueCampaigns ?? [])) {
    try {
      const dispatchRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/dispatch-campaign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ campaign_id: campaign.id }),
      });
      if (dispatchRes.ok) {
        dispatchedCampaigns += 1;
      } else {
        console.error(`[${requestId}] failed dispatch scheduled campaign ${campaign.id}: ${await dispatchRes.text()}`);
      }
    } catch (e: any) {
      console.error(`[${requestId}] scheduled campaign dispatch error ${campaign.id}:`, e?.message ?? e);
    }
  }

  // 6. Scheduled e-mail newsletters (same cron worker; segment stored on campaigns row)
  let dispatchedEmailCampaigns = 0;
  const { data: dueEmailCampaigns } = await supabase
    .from("campaigns")
    .select("id")
    .eq("status", "scheduled")
    .eq("channel", "email")
    .lte("scheduled_at", now)
    .limit(10);

  const scheduleSecret = Deno.env.get("PROCESS_SCHEDULED_MESSAGES_SECRET") ?? "";
  for (const campaign of (dueEmailCampaigns ?? [])) {
    try {
      if (!scheduleSecret) {
        console.warn(`[${requestId}] PROCESS_SCHEDULED_MESSAGES_SECRET not set; skip scheduled email ${campaign.id}`);
        break;
      }
      const dispatchRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/dispatch-newsletter`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "x-internal-secret": scheduleSecret,
        },
        body: JSON.stringify({ campaign_id: campaign.id }),
      });
      if (dispatchRes.ok) {
        dispatchedEmailCampaigns += 1;
      } else {
        console.error(
          `[${requestId}] failed dispatch scheduled newsletter ${campaign.id}: ${await dispatchRes.text()}`,
        );
      }
    } catch (e: any) {
      console.error(`[${requestId}] scheduled newsletter dispatch error ${campaign.id}:`, e?.message ?? e);
    }
  }

  console.log(
    `[${requestId}] process-scheduled-messages sent=${sentCount} scheduled_campaigns=${dispatchedCampaigns} scheduled_email_campaigns=${dispatchedEmailCampaigns} elapsed_ms=${Date.now() - startedAt}`,
  );
  return new Response(
    JSON.stringify({
      ok: true,
      sent: sentCount,
      campaigns_dispatched: dispatchedCampaigns,
      email_campaigns_dispatched: dispatchedEmailCampaigns,
      request_id: requestId,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
