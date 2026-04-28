import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * wa-wallet-alerts (cron)
 * Verifica todas as wallets ativas e dispara alertas idempotentes:
 *   - soft_limit       : usado >= soft_limit_pct% da franquia
 *   - quota_exhausted  : franquia esgotada (mas ainda há pacote)
 *   - wallet_zero      : franquia + pacote = 0  → suspende status
 *   - hard_limit_suspended: hard_limit_brl excedido em receita do ciclo
 *
 * Auth: header `Authorization: Bearer <CRON_SECRET>`.
 * Idempotência por ciclo via wa_alert_register.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const cronSecret = Deno.env.get("CRON_SECRET");
  const provided =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    req.headers.get("x-internal-secret") ?? "";
  if (!cronSecret || !timingSafeEqual(provided, cronSecret)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: wallets, error } = await admin
    .from("wa_wallets")
    .select("store_id, included_quota, used_in_cycle, purchased_balance, soft_limit_pct, hard_limit_brl, status, cycle_start, cycle_end");
  if (error) {
    console.error("[wa-alerts] query failed:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let alerted = 0;
  let suspended = 0;
  for (const w of wallets ?? []) {
    const totalAvail = (w.included_quota ?? 0) - (w.used_in_cycle ?? 0) + (w.purchased_balance ?? 0);
    const usedPct =
      w.included_quota > 0 ? (w.used_in_cycle / w.included_quota) * 100 : 0;

    // 1) soft limit (default 80%)
    if (w.included_quota > 0 && usedPct >= (w.soft_limit_pct ?? 80) && w.used_in_cycle < w.included_quota) {
      const { data: registered } = await admin.rpc("wa_alert_register", {
        p_store_id: w.store_id, p_alert_type: "soft_limit",
      });
      if (registered) alerted++;
    }

    // 2) quota exhausted (mas ainda tem pacote)
    if (w.included_quota > 0 && w.used_in_cycle >= w.included_quota && w.purchased_balance > 0) {
      const { data: registered } = await admin.rpc("wa_alert_register", {
        p_store_id: w.store_id, p_alert_type: "quota_exhausted",
      });
      if (registered) alerted++;
    }

    // 3) wallet zero — suspende
    if (totalAvail <= 0 && w.status !== "suspended") {
      await admin.from("wa_wallets")
        .update({ status: "suspended", suspended_reason: "wallet_zero", updated_at: new Date().toISOString() })
        .eq("store_id", w.store_id);
      suspended++;
      const { data: registered } = await admin.rpc("wa_alert_register", {
        p_store_id: w.store_id, p_alert_type: "wallet_zero",
      });
      if (registered) alerted++;
    }

    // 4) hard limit BRL — soma price_brl_total do ciclo via wa_usage_daily
    if (w.hard_limit_brl && Number(w.hard_limit_brl) > 0) {
      const { data: spent } = await admin
        .from("wa_usage_daily")
        .select("price_brl_total")
        .eq("store_id", w.store_id)
        .gte("usage_date", w.cycle_start);
      const total = (spent ?? []).reduce((s, r) => s + Number(r.price_brl_total ?? 0), 0);
      if (total >= Number(w.hard_limit_brl) && w.status !== "suspended") {
        await admin.from("wa_wallets")
          .update({ status: "suspended", suspended_reason: "hard_limit_brl", updated_at: new Date().toISOString() })
          .eq("store_id", w.store_id);
        suspended++;
        const { data: registered } = await admin.rpc("wa_alert_register", {
          p_store_id: w.store_id, p_alert_type: "hard_limit_suspended",
        });
        if (registered) alerted++;
      }
    }
  }

  return new Response(JSON.stringify({
    ok: true, scanned: wallets?.length ?? 0, alerted, suspended,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});