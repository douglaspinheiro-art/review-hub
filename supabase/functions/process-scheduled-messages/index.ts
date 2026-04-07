/**
 * LTV Boost v4 — Worker: Process Scheduled Messages
 * Runs periodically to send pending messages from scheduled_messages table.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTI_SPAM_DELAY_MS = 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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
    .lte("scheduled_for", now)
    .limit(50); // Process in batches

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!pending || pending.length === 0) return new Response(JSON.stringify({ ok: true, sent: 0 }));

  let sentCount = 0;

  for (const msg of pending) {
    try {
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

      // Log for Attribution
      await supabase.from("message_sends").insert({
        user_id: msg.user_id,
        store_id: msg.store_id,
        customer_id: msg.customer_id,
        phone,
        status: "sent"
      });

      sentCount++;
      await new Promise(r => setTimeout(r, ANTI_SPAM_DELAY_MS));

    } catch (e) {
      console.error(`Failed to send msg ${msg.id}:`, e.message);
      await supabase.from("scheduled_messages").update({ status: "failed" }).eq("id", msg.id);
    }
  }

  return new Response(JSON.stringify({ ok: true, sent: sentCount }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
