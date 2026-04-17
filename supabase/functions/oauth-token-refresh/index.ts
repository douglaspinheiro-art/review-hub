/**
 * oauth-token-refresh — cron job para refresh de tokens OAuth.
 *
 * Plataformas:
 *  - Shopify: tokens long-lived, não expiram (skip)
 *  - Nuvemshop: tokens não expiram (skip)
 *  - WooCommerce: Application Passwords (sem refresh; valida via ping; marca token_expired se falhar 3x)
 *  - Tray: refresh_token (~24h) — TODO quando reativar Tray
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface IntegrationRow {
  id: string;
  user_id: string;
  store_id: string;
  type: string;
  config: Record<string, unknown> | null;
  connection_status: string | null;
}

function log(phase: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ fn: "oauth-token-refresh", phase, ...fields }));
}

async function pingWoocommerce(cfg: Record<string, unknown>): Promise<boolean> {
  const siteUrl = String(cfg.site_url ?? "").replace(/\/$/, "");
  const ck = String(cfg.consumer_key ?? "");
  const cs = String(cfg.consumer_secret ?? "");
  if (!siteUrl || !ck || !cs) return false;
  try {
    const res = await fetch(
      `${siteUrl}/wp-json/wc/v3/system_status?consumer_key=${encodeURIComponent(ck)}&consumer_secret=${encodeURIComponent(cs)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    return res.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: integrations, error } = await admin
    .from("integrations")
    .select("id,user_id,store_id,type,config,connection_status")
    .in("type", ["woocommerce"]) // Tray adicionar quando reativar
    .eq("is_active", true);

  if (error) {
    log("query_error", { error: error.message });
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let checked = 0;
  let healthy = 0;
  let degraded = 0;
  let expired = 0;

  for (const row of (integrations ?? []) as IntegrationRow[]) {
    checked++;
    const cfg = (row.config ?? {}) as Record<string, unknown>;
    let ok = false;

    if (row.type === "woocommerce") {
      ok = await pingWoocommerce(cfg);
    }

    const failures = Number(cfg.refresh_failures ?? 0);
    const newFailures = ok ? 0 : failures + 1;
    let nextStatus = row.connection_status ?? "connected";

    if (ok) {
      nextStatus = "connected";
      healthy++;
    } else if (newFailures >= 3) {
      nextStatus = "token_expired";
      expired++;
    } else {
      nextStatus = "degraded";
      degraded++;
    }

    await admin
      .from("integrations")
      .update({
        connection_status: nextStatus,
        config: { ...cfg, refresh_failures: newFailures, last_refresh_check: new Date().toISOString() },
      })
      .eq("id", row.id);
  }

  log("done", { checked, healthy, degraded, expired });

  return new Response(
    JSON.stringify({ ok: true, checked, healthy, degraded, expired }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
