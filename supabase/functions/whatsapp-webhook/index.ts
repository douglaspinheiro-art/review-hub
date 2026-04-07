/**
 * LTV Boost v4 — WhatsApp Webhook Handler (Evolution API)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const body = await req.json();
    const { event, data, instance } = body;

    // 1. Identify store by instance name
    const { data: connection } = await supabase
      .from("whatsapp_connections")
      .select("store_id, user_id")
      .eq("instance_name", instance)
      .single();

    if (!connection) return new Response("Instance not found", { status: 404, headers: corsHeaders });

    const { store_id, user_id } = connection;

    // 2. Handle Message Received (Inbound)
    if (event === "messages.upsert") {
      const msg = data.message;
      if (!msg) return new Response("No message data", { status: 200, headers: corsHeaders });

      const remoteJid = data.key.remoteJid;
      const phone = remoteJid.replace(/\D/g, "");
      const isMe = data.key.fromMe;

      if (isMe) return new Response("Self message ignored", { status: 200, headers: corsHeaders });

      // Upsert Customer (v3)
      const { data: customer } = await supabase.from("customers_v3").upsert({
        user_id,
        store_id,
        phone,
        name: data.pushName || "Cliente WhatsApp",
      }, { onConflict: "store_id, phone" }).select("id").single();

      if (customer) {
        // Find or create conversation
        let { data: conversation } = await supabase
          .from("conversations")
          .select("id")
          .eq("store_id", store_id)
          .eq("contact_id", customer.id)
          .maybeSingle();

        if (!conversation) {
          const { data: newConv } = await supabase.from("conversations").insert({
            user_id,
            store_id,
            contact_id: customer.id,
            status: "open",
            last_message: data.message?.conversation || "Mensagem de mídia",
            last_message_at: new Date().toISOString(),
          }).select("id").single();
          conversation = newConv;
        }

        if (conversation) {
          // Insert Message
          await supabase.from("messages").insert({
            user_id,
            conversation_id: conversation.id,
            content: data.message?.conversation || "",
            direction: "inbound",
            status: "delivered",
            type: "text",
            external_id: data.key.id
          });

          // Update conversation unread count
          await supabase.rpc('increment_unread_count', { conv_id: conversation.id });
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
  } catch (err: any) {
    console.error("Webhook error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
