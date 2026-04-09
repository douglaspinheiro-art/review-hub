/**
 * Webhook WhatsApp Cloud API (Meta) — verificação GET + mensagens inbound.
 * Configure no Meta Developer: URL desta função + META_WHATSAPP_VERIFY_TOKEN + assinatura com META_APP_SECRET.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { persistInboundWhatsAppMessage } from "../_shared/whatsapp-inbound-persist.ts";

import { corsHeaders as _baseCors } from "../_shared/edge-utils.ts";
const cors = { ..._baseCors, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256" };

async function verifyMetaSignature(body: string, signatureHeader: string, appSecret: string): Promise<boolean> {
  if (!appSecret || !signatureHeader.startsWith("sha256=")) return false;
  const expectedHex = signatureHeader.slice("sha256=".length);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const actualHex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return actualHex === expectedHex;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const verifyToken = Deno.env.get("META_WHATSAPP_VERIFY_TOKEN") ?? "";
  const appSecret = Deno.env.get("META_APP_SECRET") ?? "";

  if (req.method === "GET") {
    const u = new URL(req.url);
    const mode = u.searchParams.get("hub.mode");
    const token = u.searchParams.get("hub.verify_token");
    const challenge = u.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token && verifyToken && token === verifyToken && challenge) {
      return new Response(challenge, { status: 200, headers: cors });
    }
    return new Response("Forbidden", { status: 403, headers: cors });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: cors });
  }

  const rawBody = await req.text();
  const sig = req.headers.get("x-hub-signature-256") ?? "";

  if (!appSecret || !(await verifyMetaSignature(rawBody, sig, appSecret))) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    const entries = (body.entry as unknown[]) ?? [];
    for (const ent of entries) {
      const changes = ((ent as Record<string, unknown>).changes as unknown[]) ?? [];
      for (const ch of changes) {
        const change = ch as Record<string, unknown>;
        if (change.field !== "messages") continue;
        const value = change.value as Record<string, unknown> | undefined;
        if (!value) continue;
        const metadata = value.metadata as Record<string, string> | undefined;
        const phoneNumberId = metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        const { data: connection } = await supabase
          .from("whatsapp_connections")
          .select("store_id, user_id, provider")
          .eq("meta_phone_number_id", phoneNumberId)
          .eq("provider", "meta_cloud")
          .maybeSingle();

        if (!connection?.store_id || !connection?.user_id) continue;

        const messages = (value.messages as unknown[]) ?? [];
        const contacts = (value.contacts as Array<{ wa_id?: string; profile?: { name?: string } }>) ?? [];
        const contactName = contacts[0]?.profile?.name;

        for (const m of messages) {
          const msg = m as Record<string, unknown>;
          const from = String(msg.from ?? "");
          const msgId = String(msg.id ?? "");
          const msgType = String(msg.type ?? "text");

          if (!from || !msgId) continue;

          let messageContent = "";
          if (msgType === "text") {
            const t = msg.text as { body?: string } | undefined;
            messageContent = String(t?.body ?? "");
          } else if (msgType === "image") {
            const im = msg.image as { caption?: string } | undefined;
            messageContent = im?.caption?.trim() ? String(im.caption) : "[Imagem recebida]";
          } else if (msgType === "video") {
            messageContent = "[Vídeo recebido]";
          } else if (msgType === "audio") {
            messageContent = "[Audio recebido]";
          } else if (msgType === "document") {
            messageContent = "[Documento recebido]";
          } else {
            messageContent = `[${msgType}]`;
          }

          await persistInboundWhatsAppMessage(supabase, {
            user_id: connection.user_id as string,
            store_id: connection.store_id as string,
            phone: from.replace(/\D/g, ""),
            messageContent,
            messageType: msgType === "text" ? "text" : msgType,
            external_id: msgId,
            pushName: contactName,
          });
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[meta-whatsapp-webhook]", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
