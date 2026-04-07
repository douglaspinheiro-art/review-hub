// supabase/functions/dispatch-campaign/index.ts
// Deno Edge Function — dispatches a campaign to its target contacts via Evolution API.
//
// POST /functions/v1/dispatch-campaign
// Headers: Authorization: Bearer <user_jwt>
// Body: { campaign_id: string }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTI_SPAM_DELAY_MS = 1200;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

async function evolutionSendText(
  baseUrl: string,
  apiKey: string,
  instanceName: string,
  number: string,
  text: string,
): Promise<{ key?: { id?: string }; messageId?: string } | null> {
  const url = `${baseUrl.replace(/\/$/, "")}/message/sendText/${instanceName}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify({ number, text, delay: ANTI_SPAM_DELAY_MS }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Evolution API error ${res.status}: ${body}`);
  }
  return res.json();
}

// ── Contact resolution ────────────────────────────────────────────────────────

async function resolveContacts(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  storeId: string,
  campaignId: string,
): Promise<Array<{ id: string; name: string; phone: string; tags: string[]; status: string }>> {
  // Get segment rules for this campaign
  const { data: segments } = await supabase
    .from("campaign_segments")
    .select("type, filters")
    .eq("campaign_id", campaignId);

  let query = supabase
    .from("customers_v3")
    .select("id, name, phone, rfm_segment")
    .eq("store_id", storeId);

  if (segments && segments.length > 0) {
    const seg = segments[0];
    if (seg.type === "rfm" && seg.filters?.rfm_segment) {
      query = query.eq("rfm_segment", seg.filters.rfm_segment);
    } else if (seg.type === "custom" && seg.filters?.min_spent) {
      query = query.gte("rfm_monetary", seg.filters.min_spent);
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { campaign_id } = await req.json() as { campaign_id: string };
    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "campaign_id is required" }), { status: 400 });
    }

    // Use service role to bypass RLS for server-side operations
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get user from JWT
    const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    // Load campaign
    const { data: campaign, error: campError } = await supabase
      .from("campaigns")
      .select("id, name, message, status, store_id, user_id")
      .eq("id", campaign_id)
      .eq("user_id", user.id)
      .single();

    if (campError || !campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), { status: 404 });
    }

    if (campaign.status === "running" || campaign.status === "completed") {
      return new Response(JSON.stringify({ error: "Campaign already dispatched" }), { status: 409 });
    }

    // Load WhatsApp connection
    const { data: conn } = await supabase
      .from("whatsapp_connections")
      .select("instance_name, evolution_api_url, evolution_api_key, status")
      .eq("store_id", campaign.store_id)
      .eq("status", "connected")
      .limit(1)
      .single();

    if (!conn) {
      return new Response(
        JSON.stringify({ error: "No active WhatsApp connection for this store." }),
        { status: 422 },
      );
    }

    // Mark campaign as running
    await supabase
      .from("campaigns")
      .update({ status: "running" })
      .eq("id", campaign_id);

    // Resolve target contacts
    const contacts = await resolveContacts(supabase, user.id, campaign.store_id, campaign_id);

    // Update total_contacts
    await supabase
      .from("campaigns")
      .update({ total_contacts: contacts.length })
      .eq("id", campaign_id);

    let sentCount = 0;
    let failedCount = 0;

    for (const contact of contacts) {
      try {
        const phone = normalizePhone(contact.phone);
        const text = interpolate(campaign.message, {
          name: contact.name ?? "",
          phone: contact.phone ?? "",
        });

        // Send via Evolution API
        const result = await evolutionSendText(
          conn.evolution_api_url,
          conn.evolution_api_key,
          conn.instance_name,
          phone,
          text,
        );

        const externalId = result?.key?.id ?? result?.messageId ?? null;

        // Find or create conversation for this contact
        let conversationId: string | null = null;
        const { data: existingConv } = await supabase
          .from("conversations")
          .select("id")
          .eq("store_id", campaign.store_id)
          .eq("contact_id", contact.id)
          .limit(1)
          .maybeSingle();

        if (existingConv) {
          conversationId = existingConv.id;
        } else {
          const { data: newConv } = await supabase
            .from("conversations")
            .insert({
              user_id: user.id,
              store_id: campaign.store_id,
              contact_id: contact.id,
              status: "open",
              last_message: text,
              last_message_at: new Date().toISOString(),
            })
            .select("id")
            .single();
          conversationId = newConv?.id ?? null;
        }

        if (conversationId) {
          // Insert message record
          const { data: msgRecord } = await supabase
            .from("messages")
            .insert({
              user_id: user.id,
              conversation_id: conversationId,
              content: text,
              direction: "outbound",
              status: "sent",
              type: "text",
              external_id: externalId,
            })
            .select("id")
            .single();

          // Insert send log for attribution
          await supabase.from("message_sends").insert({
            user_id: user.id,
            store_id: campaign.store_id,
            campaign_id: campaign_id,
            contact_id: contact.id,
            message_id: msgRecord?.id ?? null,
            phone,
            status: "sent",
          });

          // Update conversation last_message
          await supabase
            .from("conversations")
            .update({ last_message: text, last_message_at: new Date().toISOString() })
            .eq("id", conversationId);
        }

        sentCount++;

        // Update running count periodically
        if (sentCount % 10 === 0) {
          await supabase
            .from("campaigns")
            .update({ sent_count: sentCount })
            .eq("id", campaign_id);
        }

        // Anti-spam delay between messages
        await sleep(ANTI_SPAM_DELAY_MS);
      } catch (err) {
        console.error(`Failed to send to ${contact.phone}:`, err);
        failedCount++;
      }
    }

    // Mark campaign completed
    await supabase
      .from("campaigns")
      .update({
        status: failedCount === contacts.length ? "failed" : "completed",
        sent_count: sentCount,
      })
      .eq("id", campaign_id);

    // Update daily analytics
    const today = new Date().toISOString().split("T")[0];
    const { error: rpcError } = await supabase.rpc("increment_daily_analytics_messages", {
      p_store_id: campaign.store_id,
      p_date: today,
      p_sent: sentCount,
    });

    if (rpcError) {
      // Fallback: manual upsert se RPC falhar
      console.warn("increment_daily_analytics_messages RPC failed, using fallback:", rpcError.message);
      const { data: existing } = await supabase
        .from("analytics_daily")
        .select("messages_sent")
        .eq("store_id", campaign.store_id)
        .eq("date", today)
        .maybeSingle();

      await supabase.from("analytics_daily").upsert({
        user_id: user.id,
        store_id: campaign.store_id,
        date: today,
        messages_sent: (existing?.messages_sent ?? 0) + sentCount,
      }, { onConflict: "store_id, date" });
    }

    return new Response(
      JSON.stringify({ success: true, sent: sentCount, failed: failedCount }),
      { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } },
    );
  } catch (err) {
    console.error("dispatch-campaign error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } },
    );
  }
});
