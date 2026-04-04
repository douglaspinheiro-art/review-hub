// supabase/functions/trigger-automations/index.ts
// Deno Edge Function — processes pending automation triggers.
//
// Invoked by Supabase cron (pg_cron) or manually:
//   POST /functions/v1/trigger-automations
//   Headers: Authorization: Bearer <service_role_key>  (server-to-server)
//
// Handles:
//   1. cart_abandoned  — send recovery message to carts pending > delay_minutes
//   2. customer_inactive — send win-back message to contacts inactive > delay_minutes

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ number, text, delay: 1200 }),
  });
  if (!res.ok) throw new Error(`Evolution API ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Process cart_abandoned automations ─────────────────────────────────────────

async function processCartAbandoned(
  supabase: ReturnType<typeof createClient>,
): Promise<{ processed: number; sent: number }> {
  // Get all active cart_abandoned automations with their user's WhatsApp connection
  const { data: automations } = await supabase
    .from("automations")
    .select(`
      id, user_id, message_template, delay_minutes,
      whatsapp_connections!inner(instance_name, evolution_api_url, evolution_api_key, status)
    `)
    .eq("trigger", "cart_abandoned")
    .eq("is_active", true);

  if (!automations?.length) return { processed: 0, sent: 0 };

  let processed = 0;
  let sent = 0;

  for (const auto of automations) {
    const conn = (auto as Record<string, unknown>).whatsapp_connections as {
      instance_name: string;
      evolution_api_url: string;
      evolution_api_key: string;
      status: string;
    } | null;

    if (!conn || conn.status !== "connected") continue;

    const delayMs = (auto.delay_minutes ?? 60) * 60 * 1000;
    const cutoff = new Date(Date.now() - delayMs).toISOString();

    // Find pending carts older than the automation delay
    const { data: carts } = await supabase
      .from("abandoned_carts")
      .select("id, customer_name, customer_phone, cart_value, recovery_url, cart_items")
      .eq("user_id", auto.user_id)
      .eq("status", "pending")
      .lt("created_at", cutoff)
      .limit(50);

    if (!carts?.length) continue;

    for (const cart of carts) {
      try {
        const phone = normalizePhone(cart.customer_phone ?? "");
        if (!phone || phone.length < 12) {
          processed++;
          continue;
        }

        const items = (cart.cart_items as Array<{ name?: string }> | null) ?? [];
        const itemNames = items.slice(0, 2).map((i) => i.name ?? "produto").join(", ");
        const valueStr = Number(cart.cart_value ?? 0).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });

        const text = interpolate(auto.message_template, {
          name: cart.customer_name ?? "cliente",
          value: valueStr,
          items: itemNames,
          recovery_url: cart.recovery_url ?? "",
        });

        const result = await evolutionSendText(
          conn.evolution_api_url,
          conn.evolution_api_key,
          conn.instance_name,
          phone,
          text,
        );

        const externalId = result?.key?.id ?? result?.messageId ?? null;

        // Update cart status
        await supabase
          .from("abandoned_carts")
          .update({
            status: "message_sent",
            message_sent_at: new Date().toISOString(),
            automation_id: auto.id,
          })
          .eq("id", cart.id);

        // Log the send
        await supabase.from("message_sends").insert({
          user_id: auto.user_id,
          automation_id: auto.id,
          phone,
          status: "sent",
        });

        // Increment automation sent_count
        await supabase
          .from("automations")
          .update({ sent_count: (auto.sent_count ?? 0) + 1 })
          .eq("id", auto.id);

        sent++;
        await sleep(1200);
      } catch (err) {
        console.error(`Cart ${cart.id} send failed:`, err);
      }
      processed++;
    }
  }

  return { processed, sent };
}

// ── Process customer_inactive automations ──────────────────────────────────────

async function processCustomerInactive(
  supabase: ReturnType<typeof createClient>,
): Promise<{ processed: number; sent: number }> {
  const { data: automations } = await supabase
    .from("automations")
    .select("id, user_id, message_template, delay_minutes")
    .eq("trigger", "customer_inactive")
    .eq("is_active", true);

  if (!automations?.length) return { processed: 0, sent: 0 };

  let processed = 0;
  let sent = 0;

  for (const auto of automations) {
    const { data: conn } = await supabase
      .from("whatsapp_connections")
      .select("instance_name, evolution_api_url, evolution_api_key, status")
      .eq("user_id", auto.user_id)
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();

    if (!conn) continue;

    const inactiveDays = Math.round((auto.delay_minutes ?? 4320) / 1440); // default 3 days
    const cutoff = new Date(Date.now() - inactiveDays * 86400000).toISOString();
    const recentCutoff = new Date(Date.now() - 1 * 86400000).toISOString(); // don't re-send within 24h

    // Contacts with no purchase in X days who haven't received this automation recently
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, name, phone")
      .eq("user_id", auto.user_id)
      .eq("status", "active")
      .lt("updated_at", cutoff)
      .limit(100);

    if (!contacts?.length) continue;

    for (const contact of contacts) {
      try {
        // Check if we already sent to this contact recently
        const { data: recentSend } = await supabase
          .from("message_sends")
          .select("id")
          .eq("automation_id", auto.id)
          .eq("contact_id", contact.id)
          .gt("sent_at", recentCutoff)
          .limit(1)
          .maybeSingle();

        if (recentSend) continue;

        const phone = normalizePhone(contact.phone ?? "");
        if (!phone || phone.length < 12) { processed++; continue; }

        const text = interpolate(auto.message_template, {
          name: contact.name ?? "cliente",
          days: String(inactiveDays),
        });

        await evolutionSendText(
          conn.evolution_api_url,
          conn.evolution_api_key,
          conn.instance_name,
          phone,
          text,
        );

        await supabase.from("message_sends").insert({
          user_id: auto.user_id,
          automation_id: auto.id,
          contact_id: contact.id,
          phone,
          status: "sent",
        });

        sent++;
        await sleep(1200);
      } catch (err) {
        console.error(`Inactive contact ${contact.id} send failed:`, err);
      }
      processed++;
    }
  }

  return { processed, sent };
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization" },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const [cartResult, inactiveResult] = await Promise.all([
      processCartAbandoned(supabase),
      processCustomerInactive(supabase),
    ]);

    const summary = {
      cart_abandoned: cartResult,
      customer_inactive: inactiveResult,
      total_sent: cartResult.sent + inactiveResult.sent,
      total_processed: cartResult.processed + inactiveResult.processed,
    };

    console.log("trigger-automations summary:", JSON.stringify(summary));

    return new Response(JSON.stringify({ success: true, ...summary }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    console.error("trigger-automations error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
