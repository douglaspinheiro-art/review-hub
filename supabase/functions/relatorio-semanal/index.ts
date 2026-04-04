// supabase/functions/relatorio-semanal/index.ts
// Deno Edge Function — sends a weekly WhatsApp summary report to each store owner.
// Designed to be triggered by a Supabase cron job every Sunday at 08:00 BRT.
//
// POST /functions/v1/relatorio-semanal
// No auth required for cron invocations (uses service role internally).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Content-Type": "application/json",
};

interface EvolutionSendPayload {
  number: string;
  text: string;
}

async function sendWhatsApp(
  evolutionUrl: string,
  evolutionKey: string,
  instanceName: string,
  phone: string,
  message: string
): Promise<void> {
  const payload: EvolutionSendPayload = { number: phone, text: message };
  const res = await fetch(`${evolutionUrl}/message/sendText/${instanceName}`, {
    method: "POST",
    headers: {
      apikey: evolutionKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Evolution API error ${res.status}: ${err}`);
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Date range: last 7 days
  const now   = new Date();
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  // Get all users with a connected WhatsApp and their phone number
  const { data: connections } = await supabase
    .from("whatsapp_connections")
    .select("user_id, instance_name, evolution_api_url, evolution_api_key")
    .eq("status", "connected");

  if (!connections?.length) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: CORS });
  }

  let sent = 0;
  const errors: string[] = [];

  for (const conn of connections) {
    try {
      const uid = conn.user_id as string;

      // Fetch profile for phone number & name
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, phone")
        .eq("id", uid)
        .maybeSingle();

      if (!profile?.phone) continue; // can't send without phone

      // Fetch weekly metrics in parallel
      const [analyticsRes, cartsRes, campaignsRes] = await Promise.all([
        supabase
          .from("analytics_daily")
          .select("messages_sent, messages_delivered, revenue_influenced, new_contacts")
          .eq("user_id", uid)
          .gte("date", since),
        supabase
          .from("abandoned_carts")
          .select("id, cart_value, recovered_at")
          .eq("user_id", uid)
          .eq("status", "recovered")
          .gte("recovered_at", since),
        supabase
          .from("campaigns")
          .select("id, sent_count, delivered_count, read_count")
          .eq("user_id", uid)
          .gte("created_at", since),
      ]);

      const analytics  = analyticsRes.data  ?? [];
      const carts      = cartsRes.data       ?? [];
      const campaigns  = campaignsRes.data   ?? [];

      const totalSent       = analytics.reduce((s, d) => s + (d.messages_sent ?? 0), 0);
      const totalDelivered  = analytics.reduce((s, d) => s + (d.messages_delivered ?? 0), 0);
      const revenueInfluenced = analytics.reduce((s, d) => s + Number(d.revenue_influenced ?? 0), 0);
      const newContacts     = analytics.reduce((s, d) => s + (d.new_contacts ?? 0), 0);
      const recoveredValue  = carts.reduce((s, c) => s + Number(c.cart_value ?? 0), 0);
      const deliveryRate    = totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0;
      const campaignsSent   = campaigns.reduce((s, c) => s + (c.sent_count ?? 0), 0);

      const firstName = (profile.full_name ?? "Lojista").split(" ")[0];
      const weekLabel = `${now.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;

      const message = `📊 *Relatório semanal — LTV Boost*
Semana até ${weekLabel}

Olá, ${firstName}! Aqui está o resumo da sua semana:

💬 *Mensagens enviadas:* ${totalSent.toLocaleString("pt-BR")}
✅ *Taxa de entrega:* ${deliveryRate}%
🛒 *Carrinhos recuperados:* R$ ${recoveredValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
💰 *Receita influenciada:* R$ ${revenueInfluenced.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
👥 *Novos contatos:* ${newContacts}
📣 *Campanhas enviadas:* ${campaignsSent.toLocaleString("pt-BR")}

${revenueInfluenced > 0 ? `🚀 O LTV Boost gerou *R$ ${revenueInfluenced.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}* para você essa semana!` : "💡 Ative mais automações para aumentar sua receita."}

Acesse o dashboard: ltvboost.com.br/dashboard`;

      await sendWhatsApp(
        conn.evolution_api_url as string,
        conn.evolution_api_key as string,
        conn.instance_name as string,
        profile.phone as string,
        message
      );

      sent++;
    } catch (err) {
      errors.push(`${conn.user_id}: ${(err as Error).message}`);
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, errors }), { headers: CORS });
});
