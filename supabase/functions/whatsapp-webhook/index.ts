/**
 * LTV Boost v4 — WhatsApp Webhook Handler (Evolution API)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  checkDistributedRateLimit,
  getClientIp,
  rateLimitedResponseWithRetry,
  z,
} from "../_shared/edge-utils.ts";
import { rejectIfBodyTooLarge } from "../_shared/validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const oversized = rejectIfBodyTooLarge(req, 256 * 1024);
  if (oversized) return oversized;

  const expectedSecret = Deno.env.get("WHATSAPP_WEBHOOK_SECRET");
  if (!expectedSecret) {
    return new Response(JSON.stringify({ error: "Webhook misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const providedSecret = req.headers.get("x-webhook-secret") ?? "";
  if (!providedSecret || providedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized webhook" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const ip = getClientIp(req);
    const rl = await checkDistributedRateLimit(supabase, `whatsapp-webhook:${ip}`, 120, 60_000);
    if (!rl.allowed) return rateLimitedResponseWithRetry(rl.retryAfterSeconds);

    const rawBody = await req.text();
    const signature = req.headers.get("x-webhook-signature") ?? "";
    const timestampHeader = req.headers.get("x-webhook-timestamp") ?? "";
    const webhookId = req.headers.get("x-webhook-id") ?? "";

    const timestamp = Number(timestampHeader);
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 5 * 60_000) {
      return new Response(JSON.stringify({ error: "Invalid webhook timestamp" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!signature || !webhookId) {
      return new Response(JSON.stringify({ error: "Missing webhook signature headers" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const signedPayload = `${timestamp}.${rawBody}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(expectedSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
    const expectedSig = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    if (expectedSig !== signature) {
      return new Response(JSON.stringify({ error: "Invalid webhook signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const replayKey = `webhook-id:${webhookId}`;
    const { count } = await supabase
      .from("api_request_logs")
      .select("id", { count: "exact", head: true })
      .eq("rate_key", replayKey)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString());
    if ((count ?? 0) > 0) {
      return new Response(JSON.stringify({ ok: true, duplicate: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    await supabase.from("api_request_logs").insert({ rate_key: replayKey });

    const body = JSON.parse(rawBody);
    const payloadSchema = z.object({
      event: z.string().min(1).max(80),
      instance: z.string().min(1).max(120),
      data: z.record(z.unknown()),
    });
    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid webhook payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { event, data, instance } = parsed.data;

    // 1. Identify store by instance name
    const { data: connection } = await supabase
      .from("whatsapp_connections")
      .select("store_id, user_id, evolution_api_url, evolution_api_key")
      .eq("instance_name", instance)
      .single();

    if (!connection) return new Response("Instance not found", { status: 404, headers: corsHeaders });

    const { store_id, user_id } = connection;

    // 2. Handle Message Received (Inbound)
    if (event === "messages.upsert") {
      const msg = data.message;
      if (!msg) return new Response("No message data", { status: 200, headers: corsHeaders });
      const imageMsg = data.message?.imageMessage;
      const videoMsg = data.message?.videoMessage;
      const audioMsg = data.message?.audioMessage;
      const documentMsg = data.message?.documentMessage;
      const messageType =
        imageMsg ? "image" :
        videoMsg ? "video" :
        audioMsg ? "audio" :
        documentMsg ? "document" :
        "text";
      const messageContent =
        data.message?.conversation ||
        imageMsg?.caption ||
        videoMsg?.caption ||
        documentMsg?.fileName ||
        (messageType === "audio" ? "[Audio recebido]" :
          messageType === "image" ? "[Imagem recebida]" :
          messageType === "video" ? "[Vídeo recebido]" :
          messageType === "document" ? "[Documento recebido]" :
          "");

      const remoteJid = data.key.remoteJid;
      const phone = remoteJid.replace(/\D/g, "");
      const isMe = data.key.fromMe;
      const inboundText = String(data.message?.conversation ?? "").trim().toLowerCase();
      const optOutKeywords = ["pare", "parar", "sair", "stop", "unsubscribe", "cancelar"];

      if (isMe) return new Response("Self message ignored", { status: 200, headers: corsHeaders });

      // Upsert Customer (v3)
      const { data: customer } = await supabase.from("customers_v3").upsert({
        user_id,
        store_id,
        phone,
        name: data.pushName || "Cliente WhatsApp",
      }, { onConflict: "store_id, phone" }).select("id").single();

      if (customer) {
        // Compliance: detect opt-out intent in inbound WhatsApp message.
        if (optOutKeywords.some((k) => inboundText === k || inboundText.includes(`${k} `) || inboundText.endsWith(` ${k}`))) {
          await (supabase as any)
            .from("customers_v3")
            .update({ unsubscribed_at: new Date().toISOString() })
            .eq("id", customer.id);
        }

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
            last_message: messageContent || "Mensagem recebida",
            last_message_at: new Date().toISOString(),
          }).select("id").single();
          conversation = newConv;
        }

        if (conversation) {
          // Insert Message
          await supabase.from("messages").insert({
            user_id,
            conversation_id: conversation.id,
            content: messageContent || "",
            direction: "inbound",
            status: "delivered",
            type: messageType,
            external_id: data.key.id
          });

          await supabase
            .from("conversations")
            .update({
              last_message: messageContent || "Mensagem recebida",
              last_message_at: new Date().toISOString(),
            })
            .eq("id", conversation.id);

          // Update conversation unread count
          await supabase.rpc('increment_unread_count', { conv_id: conversation.id });

          // Round-robin assignee when fila is configured and conversation has no owner yet
          const { data: convAssign } = await supabase
            .from("conversations")
            .select("assigned_to_name")
            .eq("id", conversation.id)
            .single();
          const stillEmpty = !String((convAssign as { assigned_to_name?: string | null } | null)?.assigned_to_name ?? "").trim();
          if (stillEmpty) {
            const { data: nextAgent } = await supabase.rpc("bump_inbox_round_robin", { p_user_id: user_id });
            const name = typeof nextAgent === "string" ? nextAgent.trim() : "";
            if (name) {
              await supabase
                .from("conversations")
                .update({ assigned_to_name: name })
                .eq("id", conversation.id);
            }
          }

          // Instrument reply count on last touched campaign (up to 7 days)
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const { data: lastSend } = await (supabase as any)
            .from("message_sends")
            .select("id, campaign_id")
            .eq("customer_id", customer.id)
            .eq("store_id", store_id)
            .not("campaign_id", "is", null)
            .gte("created_at", sevenDaysAgo)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (lastSend?.campaign_id) {
            await supabase
              .from("campaigns")
              .select("reply_count")
              .eq("id", lastSend.campaign_id)
              .single()
              .then(async ({ data: c }) => {
                if (!c) return;
                await supabase
                  .from("campaigns")
                  .update({ reply_count: Number((c as any).reply_count ?? 0) + 1 } as any)
                  .eq("id", lastSend.campaign_id);
              });
          }

          // Chatbot auto-reply (piloto_automatico) integrated with Inbox flow.
          const { data: aiCfg } = await (supabase as any)
            .from("ai_agent_config")
            .select("ativo,modo")
            .eq("store_id", store_id)
            .maybeSingle();

          if (aiCfg?.ativo && aiCfg?.modo === "piloto_automatico") {
            try {
              const suggestRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-reply-suggest`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
                },
                body: JSON.stringify({ conversation_id: conversation.id }),
              });
              if (suggestRes.ok) {
                const suggest = await suggestRes.json();
                const aiText = String(suggest?.suggestion ?? suggest?.reply ?? "").trim();
                if (aiText) {
                  const waUrl = `${connection.evolution_api_url.replace(/\/$/, "")}/message/sendText/${instance}`;
                  await fetch(waUrl, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      apikey: connection.evolution_api_key,
                    },
                    body: JSON.stringify({
                      number: phone,
                      text: aiText,
                      delay: 1000,
                    }),
                  }).then(() => {}, () => {});

                  await supabase.from("messages").insert({
                    user_id,
                    conversation_id: conversation.id,
                    content: aiText,
                    direction: "outbound",
                    status: "sent",
                    type: "text",
                  });

                  await supabase
                    .from("conversations")
                    .update({ last_message: aiText, last_message_at: new Date().toISOString() })
                    .eq("id", conversation.id);
                }
              }
            } catch (err) {
              console.warn("Auto-reply failed:", err);
            }
          }
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
