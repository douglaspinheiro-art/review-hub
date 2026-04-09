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
import { persistInboundWhatsAppMessage } from "../_shared/whatsapp-inbound-persist.ts";
import { outboundSendText } from "../_shared/whatsapp-outbound.ts";

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

    // 1. Identify store by instance name (Evolution)
    const { data: connection } = await supabase
      .from("whatsapp_connections")
      .select(
        "store_id, user_id, provider, instance_name, evolution_api_url, evolution_api_key, meta_phone_number_id, meta_access_token, meta_api_version",
      )
      .eq("instance_name", instance)
      .single();

    if (!connection) return new Response("Instance not found", { status: 404, headers: corsHeaders });

    const { store_id, user_id } = connection;
    const connRow = connection as {
      provider?: string;
      instance_name: string;
      evolution_api_url: string | null;
      evolution_api_key: string | null;
      meta_phone_number_id: string | null;
      meta_access_token: string | null;
      meta_api_version: string | null;
    };

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

      if (isMe) return new Response("Self message ignored", { status: 200, headers: corsHeaders });

      const persisted = await persistInboundWhatsAppMessage(supabase, {
        user_id,
        store_id,
        phone,
        messageContent,
        messageType,
        external_id: String(data.key.id ?? ""),
        pushName: typeof (data as Record<string, unknown>).pushName === "string"
          ? (data as Record<string, unknown>).pushName as string
          : undefined,
      });

      if (!persisted) {
        return new Response("Persist failed", { status: 500, headers: corsHeaders });
      }

      const { customer_id, conversation_id } = persisted;

      // Instrument reply count on last touched campaign (up to 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: lastSend } = await (supabase as any)
        .from("message_sends")
        .select("id, campaign_id")
        .eq("customer_id", customer_id)
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

      // Chatbot auto-reply (Evolution ou Meta via outbound unificado)
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
            body: JSON.stringify({ conversation_id }),
          });
          if (suggestRes.ok) {
            const suggest = await suggestRes.json();
            const aiText = String(suggest?.suggestion ?? suggest?.reply ?? "").trim();
            if (aiText) {
              try {
                await outboundSendText(
                  {
                    provider: connRow.provider ?? "evolution",
                    instance_name: connRow.instance_name,
                    evolution_api_url: connRow.evolution_api_url,
                    evolution_api_key: connRow.evolution_api_key,
                    meta_phone_number_id: connRow.meta_phone_number_id,
                    meta_access_token: connRow.meta_access_token,
                    meta_api_version: connRow.meta_api_version,
                  },
                  phone,
                  aiText,
                  1000,
                );
              } catch (sendErr) {
                console.warn("Auto-reply send failed:", sendErr);
              }

              await supabase.from("messages").insert({
                user_id,
                conversation_id,
                content: aiText,
                direction: "outbound",
                status: "sent",
                type: "text",
              });

              await supabase
                .from("conversations")
                .update({ last_message: aiText, last_message_at: new Date().toISOString() })
                .eq("id", conversation_id);
            }
          }
        } catch (err) {
          console.warn("Auto-reply failed:", err);
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
