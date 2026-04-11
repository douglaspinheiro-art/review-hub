import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

import { corsHeaders, checkRateLimit, rateLimitedResponse } from "../_shared/edge-utils.ts";

const BodySchema = z.object({ store_id: z.string().uuid() });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "store_id (UUID) is required" }), { status: 400, headers: corsHeaders });
    }
    const { store_id } = parsed.data;

    if (!checkRateLimit(`relatorio-semanal:${store_id}`, 10, 60_000)) {
      return rateLimitedResponse();
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const { data: analytics } = await supabase.from("analytics_daily").select("*").eq("store_id", store_id).gte("date", sevenDaysAgo);
    if (!analytics || analytics.length === 0) {
      return new Response(JSON.stringify({ ok: true, status: "no_data_for_period" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const totals = {
      sent: analytics.reduce((s, d) => s + d.messages_sent, 0),
      revenue: analytics.reduce((s, d) => s + Number(d.revenue_influenced), 0),
      new_contacts: analytics.reduce((s, d) => s + d.new_contacts, 0),
    };

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");

    const system = `Você é um consultor de e-commerce sênior. Resuma o desempenho semanal em 3-4 frases impactantes. Destaque o faturamento influenciado e o engajamento com os contatos. Seja encorajador e profissional.`;
    const user = `Dados da semana:\n- Mensagens enviadas: ${totals.sent}\n- Receita influenciada: R$ ${totals.revenue.toFixed(2)}\n- Novos contatos: ${totals.new_contacts}\n\nEscreva o resumo semanal para o lojista:`;

    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-3-5-sonnet-20241022", max_tokens: 500, system, messages: [{ role: "user", content: user }] }),
    });

    const aiData = await aiResponse.json();
    const summary = aiData.content[0].text;

    return new Response(JSON.stringify({ totals, summary }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
