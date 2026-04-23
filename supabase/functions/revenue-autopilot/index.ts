// Cron semanal: para lojas com revenue_goals.autopilot_enabled = true,
// avalia progresso vs meta e dispara automaticamente a próxima prescrição
// aprovada da fila se estiver < 50% da meta passada metade do mês.
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

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const dayOfMonth = now.getUTCDate();
  const monthProgress = dayOfMonth / 30;

  const { data: goals } = await supabase
    .from("revenue_goals")
    .select("id,store_id,user_id,goal_brl,autopilot_enabled")
    .eq("month_start", monthStart)
    .eq("autopilot_enabled", true);

  const goalList = (goals ?? []) as Array<{ id: string; store_id: string; user_id: string; goal_brl: number }>;
  const triggered: Array<{ store_id: string; reason: string }> = [];

  for (const g of goalList) {
    // soma receita atual do mês via analytics_daily
    const { data: rev } = await supabase
      .from("analytics_daily")
      .select("revenue_influenced")
      .eq("store_id", g.store_id)
      .gte("date", monthStart);

    const totalRevenue = (rev ?? []).reduce((s: number, r: { revenue_influenced: number }) => s + Number(r.revenue_influenced ?? 0), 0);
    const goalProgress = totalRevenue / Number(g.goal_brl);

    // só age se progresso < (progresso do mês × 0.7) — já está atrás
    if (goalProgress >= monthProgress * 0.7) continue;

    // próxima prescrição aprovada e não executada
    const { data: rx } = await supabase
      .from("prescriptions")
      .select("id,title")
      .eq("store_id", g.store_id)
      .eq("status", "aprovada")
      .order("estimated_impact", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (!rx) continue;

    // marca como em execução
    await supabase
      .from("prescriptions")
      .update({ status: "em_execucao", autopilot_triggered_at: new Date().toISOString() })
      .eq("id", (rx as { id: string }).id);

    triggered.push({ store_id: g.store_id, reason: `progress ${Math.round(goalProgress * 100)}% vs expected ${Math.round(monthProgress * 70)}%` });
  }

  return new Response(JSON.stringify({ ok: true, evaluated: goalList.length, triggered: triggered.length, details: triggered }), { headers: cors });
});