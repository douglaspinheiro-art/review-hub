/**
 * Persistência canônica de mensagem inbound (Evolution ou Meta) → customers_v3, conversations, messages.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type InboundPersistInput = {
  user_id: string;
  store_id: string;
  phone: string;
  messageContent: string;
  messageType: string;
  external_id: string;
  pushName?: string;
};

const optOutKeywords = ["pare", "parar", "sair", "stop", "unsubscribe", "cancelar"];

export async function persistInboundWhatsAppMessage(
  supabase: SupabaseClient,
  input: InboundPersistInput,
): Promise<{ conversation_id: string; customer_id: string } | null> {
  const { user_id, store_id, phone, messageContent, messageType, external_id, pushName } = input;
  const inboundText = String(messageContent ?? "").trim().toLowerCase();

  const { data: customer } = await supabase.from("customers_v3").upsert({
    user_id,
    store_id,
    phone,
    name: pushName || "Cliente WhatsApp",
  }, { onConflict: "store_id, phone" }).select("id").single();

  if (!customer?.id) return null;

  if (optOutKeywords.some((k) => inboundText === k || inboundText.includes(`${k} `) || inboundText.endsWith(` ${k}`))) {
    await (supabase as any)
      .from("customers_v3")
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq("id", customer.id);
  }

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

  if (!conversation?.id) return null;

  await supabase.from("messages").insert({
    user_id,
    conversation_id: conversation.id,
    content: messageContent || "",
    direction: "inbound",
    status: "delivered",
    type: messageType,
    external_id,
  });

  await supabase
    .from("conversations")
    .update({
      last_message: messageContent || "Mensagem recebida",
      last_message_at: new Date().toISOString(),
    })
    .eq("id", conversation.id);

  await supabase.rpc("increment_unread_count", { conv_id: conversation.id });

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

  return { conversation_id: conversation.id, customer_id: customer.id };
}
