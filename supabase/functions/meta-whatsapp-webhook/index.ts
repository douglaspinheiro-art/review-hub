/**
 * Meta WhatsApp Cloud API Webhook
 * Handles:
 *  - GET: Webhook verification (hub.verify_token challenge)
 *  - POST: Incoming messages & status updates from Meta
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  const VERIFY_TOKEN = Deno.env.get("META_WHATSAPP_VERIFY_TOKEN") ?? "";
  const APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";

  // --- GET: Webhook Verification ---
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Meta webhook verified");
      return new Response(challenge ?? "", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // --- POST: Incoming events ---
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Validate signature (x-hub-signature-256)
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256") ?? "";

  if (APP_SECRET && signature) {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(APP_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const digest = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(rawBody)
    );
    const expected =
      "sha256=" +
      Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    if (expected !== signature) {
      console.error("Invalid Meta webhook signature");
      return new Response("Invalid signature", { status: 401, headers: corsHeaders });
    }
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const body = JSON.parse(rawBody);

    // Meta sends: { object: "whatsapp_business_account", entry: [...] }
    if (body.object !== "whatsapp_business_account") {
      return new Response("Not a WhatsApp event", {
        status: 200,
        headers: corsHeaders,
      });
    }

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "messages") continue;
        const value = change.value;
        const phoneNumberId = value?.metadata?.phone_number_id;

        if (!phoneNumberId) continue;

        // Look up connection by meta_phone_number_id
        const { data: connection } = await supabase
          .from("whatsapp_connections")
          .select("store_id, user_id, id")
          .eq("meta_phone_number_id", phoneNumberId)
          .eq("api_provider", "meta")
          .maybeSingle();

        if (!connection) {
          console.warn(`No connection found for phone_number_id: ${phoneNumberId}`);
          continue;
        }

        const { store_id, user_id } = connection;

        // Handle incoming messages
        for (const msg of value.messages ?? []) {
          const phone = msg.from; // sender phone in E.164 without +
          const messageType = msg.type ?? "text";
          const messageContent =
            msg.text?.body ??
            msg.image?.caption ??
            msg.video?.caption ??
            msg.document?.filename ??
            (messageType === "audio"
              ? "[Audio recebido]"
              : messageType === "image"
              ? "[Imagem recebida]"
              : messageType === "video"
              ? "[Vídeo recebido]"
              : messageType === "document"
              ? "[Documento recebido]"
              : "");

          const contactName =
            (value.contacts ?? []).find(
              (c: { wa_id: string; profile?: { name?: string } }) =>
                c.wa_id === phone
            )?.profile?.name ?? "Cliente WhatsApp";

          // Upsert customer
          const { data: customer } = await supabase
            .from("customers_v3")
            .upsert(
              { user_id, store_id, phone, name: contactName },
              { onConflict: "store_id, phone" }
            )
            .select("id")
            .single();

          if (!customer) continue;

          // Find or create conversation
          let { data: conversation } = await supabase
            .from("conversations")
            .select("id")
            .eq("store_id", store_id)
            .eq("contact_id", customer.id)
            .maybeSingle();

          if (!conversation) {
            const { data: newConv } = await supabase
              .from("conversations")
              .insert({
                user_id,
                store_id,
                contact_id: customer.id,
                status: "open",
                last_message: messageContent || "Mensagem recebida",
                last_message_at: new Date().toISOString(),
              })
              .select("id")
              .single();
            conversation = newConv;
          }

          if (conversation) {
            await supabase.from("messages").insert({
              user_id,
              conversation_id: conversation.id,
              content: messageContent || "",
              direction: "inbound",
              status: "delivered",
              type: messageType === "text" ? "text" : messageType,
              external_id: msg.id,
            });

            await supabase
              .from("conversations")
              .update({
                last_message: messageContent || "Mensagem recebida",
                last_message_at: new Date().toISOString(),
              })
              .eq("id", conversation.id);

            await supabase.rpc("increment_unread_count", {
              conv_id: conversation.id,
            });
          }
        }

        // Handle status updates
        for (const status of value.statuses ?? []) {
          const externalId = status.id;
          const newStatus = status.status; // sent, delivered, read, failed

          if (externalId && newStatus) {
            await supabase
              .from("messages")
              .update({ status: newStatus })
              .eq("external_id", externalId);
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Meta webhook error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
