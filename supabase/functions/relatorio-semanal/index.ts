/**
 * LTV Boost v4 — Weekly Pulse Report
 * Aggregates performance data and generates an executive summary
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { store_id } = await req.json();

    if (!store_id) throw new Error("store_id missing");

    // 1. Fetch last 7 days of analytics
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dateStr = sevenDaysAgo.toISOString().split('T')[0];

    const { data: analytics } = await supabase
      .from("analytics_daily")
      .select("*")
      .eq("store_id", store_id)
      .gte("date", dateStr);

    if (!analytics || analytics.length === 0) {
      return new Response(JSON.stringify({ ok: true, status: "no_data_for_period" }), { headers: corsHeaders });
    }

    // 2. Aggregate metrics
    const totals = {
      sent: analytics.reduce((s, d) => s + d.messages_sent, 0),
      revenue: analytics.reduce((s, d) => s + Number(d.revenue_influenced), 0),
      new_contacts: analytics.reduce((s, d) => s + d.new_contacts, 0),
    };

    // 3. Generate summary with AI (Claude)
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");

    const system = `Você é um consultor de e-commerce sênior.
Sua missão é resumir o desempenho semanal da loja em 3-4 frases impactantes.
Destaque o faturamento influenciado e o engajamento com os contatos.
Seja encorajador e profissional.`;

    const user = `Dados da semana:
- Mensagens enviadas: ${totals.sent}
- Receita influenciada: R$ ${totals.revenue.toFixed(2)}
- Novos contatos: ${totals.new_contacts}

Escreva o resumo semanal para o lojista:`;

    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 500,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    const aiData = await aiResponse.json();
    const summary = aiData.content[0].text;

    return new Response(JSON.stringify({ totals, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
