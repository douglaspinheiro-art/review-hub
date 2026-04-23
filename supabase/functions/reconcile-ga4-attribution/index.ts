// Cron diário: cruza attribution_events com campaigns via utm_campaign
// (gerados pela Fase 1.1) e atualiza campaigns.ga4_attributed_revenue.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCronSecret } from "../_shared/edge-utils.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Content-Type": "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const guard = verifyCronSecret(req);
  if (!guard.ok) return guard.response;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // 1. Buscar campanhas com utm_source=ltvboost pelos últimos 30 dias
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: campaigns, error: cErr } = await supabase
    .from("campaigns")
    .select("id,user_id,store_id,name,created_at")
    .gte("created_at", since)
    .in("status", ["enviada", "scheduled", "ativo", "encerrado"]);
  if (cErr) throw cErr;

  const list = (campaigns ?? []) as Array<{ id: string; user_id: string; store_id: string; created_at: string }>;
  const updates: Array<{ campaign_id: string; revenue: number; orders: number }> = [];

  for (const c of list) {
    // soma order_value de attribution_events com utm_campaign = c.id
    const { data: events } = await supabase
      .from("attribution_events")
      .select("order_value")
      .eq("user_id", c.user_id)
      .eq("utm_campaign", c.id)
      .eq("utm_source", "ltvboost");

    const evList = (events ?? []) as Array<{ order_value: number }>;
    if (evList.length === 0) continue;

    const revenue = evList.reduce((sum, e) => sum + Number(e.order_value ?? 0), 0);
    const { error: uErr } = await supabase
      .from("campaigns")
      .update({
        ga4_attributed_revenue: revenue,
        ga4_attributed_at: new Date().toISOString(),
      })
      .eq("id", c.id);

    if (!uErr) updates.push({ campaign_id: c.id, revenue, orders: evList.length });
  }

  return new Response(
    JSON.stringify({ ok: true, scanned: list.length, updated: updates.length, total_revenue_ga4: updates.reduce((s, u) => s + u.revenue, 0) }),
    { headers: cors },
  );
});