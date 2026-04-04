// supabase/functions/whatsapp-webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const STATUS_MAP: Record<string, string> = {
  PENDING: "sent",
  SERVER_ACK: "sent",
  DELIVERY_ACK: "delivered",
  READ: "read",
  PLAYED: "read",
  ERROR: "failed",
};

function normalizePhone(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "").replace(/^@.*/, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

async function handleInboundMessage(
  supabase: ReturnType<typeof createClient>,
  event: Record<string, unknown>,
): Promise<void> {
  const data = event.data as Record<string, unknown>;
  if (!data) return;

  const key = data.key as Record<string, unknown> | null;
  const fromMe = key?.fromMe as boolean;
  if (fromMe) return;

  const rawPhone = (key?.remoteJid as string ?? "").split("@")[0];
  const phone = normalizePhone(rawPhone);
  if (!phone) return;

  const messageContent = (data.message as Record<string, unknown>)?.conversation as string
    ?? (data.message as Record<string, unknown>)?.extendedTextMessage?.text as string
    ?? null;

  if (!messageContent) return;

  const externalId = key?.id as string | null;
  const instanceName = event.instance as string | null;

  if (!instanceName) return;
  const { data: conn } = await supabase
    .from("whatsapp_connections")
    .select("*")
    .eq("instance_name", instanceName)
    .maybeSingle();

  if (!conn) return;

  // Find contact
  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("user_id", conn.user_id)
    .eq("phone", phone)
    .maybeSingle();

  let contactId = contact?.id;
  if (!contactId) {
    const { data: newContact } = await supabase
      .from("contacts")
      .insert({ user_id: conn.user_id, name: phone, phone, status: "active" })
      .select("id")
      .single();
    contactId = newContact?.id;
  }
  if (!contactId) return;

  // Conversation
  let conversationId: string;
  const { data: existingConv } = await supabase
    .from("conversations")
    .select("id, unread_count")
    .eq("contact_id", contactId)
    .eq("status", "open")
    .maybeSingle();

  if (existingConv) {
    conversationId = existingConv.id;
    await supabase
      .from("conversations")
      .update({
        last_message: messageContent,
        last_message_at: new Date().toISOString(),
        unread_count: (existingConv.unread_count ?? 0) + 1,
      })
      .eq("id", conversationId);
  } else {
    const { data: newConv } = await supabase
      .from("conversations")
      .insert({ contact_id: contactId, status: "open", last_message: messageContent, last_message_at: new Date().toISOString(), unread_count: 1 })
      .select("id")
      .single();
    conversationId = newConv!.id;
  }

  // Save message
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    content: messageContent,
    direction: "inbound",
    status: "read",
    type: "text",
    external_id: externalId,
  });

  // --- IA AGENT LOGIC ---
  const { data: loja } = await supabase
    .from("lojas")
    .select("id")
    .eq("user_id", conn.user_id)
    .maybeSingle();

  if (loja) {
    const { data: aiConfig } = await supabase
      .from("agente_ia_config")
      .select("*")
      .eq("loja_id", loja.id)
      .maybeSingle();

    if (aiConfig?.ativo && aiConfig.modo === 'piloto_automatico') {
      // Call ai-agent function
      const aiResponse = await fetch(`${SUPABASE_URL}/functions/v1/ai-agent`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: messageContent,
          contact_phone: phone,
          loja_id: loja.id
        }),
      });

      const aiResult = await aiResponse.json();
      if (aiResult.success && aiResult.response) {
        // Send reply via Evolution
        await fetch(`${conn.evolution_api_url}/message/sendText/${instanceName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": conn.evolution_api_key },
          body: JSON.stringify({
            number: phone,
            text: aiResult.response,
            delay: 1500
          }),
        });

        // Save outbound message
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          content: aiResult.response,
          direction: "outbound",
          status: "sent",
          type: "text",
        });
      }
    }
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type" } });
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const body = await req.json();
    const event = body.event;
    if (event === "messages.upsert" || event === "MESSAGES_UPSERT") {
      await handleInboundMessage(supabase, body);
    }
    return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
