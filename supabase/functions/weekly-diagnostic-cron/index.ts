/**
 * weekly-diagnostic-cron — re-analisa o funil GA4 de cada loja toda segunda 06:00 BRT (09:00 UTC)
 * e gera um novo `diagnostics_v3` com `trigger_source = 'weekly'`.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}
 * Chama internamente `gerar-diagnostico` com header `x-internal-secret = WEEKLY_DIAGNOSTIC_SECRET`.
 *
 * Skip se:
 *  - Loja já tem diag semanal nos últimos 5 dias
 *  - Loja tem diag manual nas últimas 24h
 *  - Não há `funil_diario` (periodo='7d') ingerido nos últimos 3 dias
 *  - Snapshot tem 0 sessões/0 pedidos (loja inativa)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Content-Type": "application/json",
};

const FRESHNESS_DAYS = 3;
const SKIP_IF_WEEKLY_WITHIN_DAYS = 5;
const SKIP_IF_MANUAL_WITHIN_HOURS = 24;
const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 1500;

type FunilDiarioRow = {
  store_id: string;
  user_id: string;
  metric_date: string;
  ingested_at: string;
  sessions: number | null;
  view_item: number | null;
  add_to_cart: number | null;
  begin_checkout: number | null;
  purchases: number | null;
  purchase_revenue: number | null;
};

type StoreContextRow = {
  id: string;
  user_id: string;
  name: string | null;
  segment: string | null;
  ticket_medio: number | null;
  meta_conversao: number | null;
};

function logAlert(payload: Record<string, unknown>) {
  console.log(JSON.stringify({ tag: "CRON_ALERT", component: "weekly-diagnostic-cron", ts: new Date().toISOString(), ...payload }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // 1. Auth
  const cronSecret = Deno.env.get("CRON_SECRET");
  const internalSecret = Deno.env.get("WEEKLY_DIAGNOSTIC_SECRET");
  if (!cronSecret || !internalSecret) {
    logAlert({ error: "missing_secrets" });
    return new Response(JSON.stringify({ ok: false, error: "Service not configured" }), { status: 503, headers: cors });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: cors });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const startedAt = new Date();

  // 2. Lojas elegíveis = quem tem ingestão recente em funil_diario (periodo=7d)
  const sinceFreshness = new Date(Date.now() - FRESHNESS_DAYS * 86400_000).toISOString();

  const { data: freshFunis, error: funisErr } = await supabase
    .from("funil_diario")
    .select("store_id,user_id,metric_date,ingested_at,sessions,view_item,add_to_cart,begin_checkout,purchases,purchase_revenue")
    .eq("periodo", "7d")
    .eq("fonte", "ga4")
    .gte("ingested_at", sinceFreshness)
    .order("ingested_at", { ascending: false })
    .limit(2000);

  if (funisErr) {
    logAlert({ phase: "list_eligible", error: funisErr.message });
    return new Response(JSON.stringify({ ok: false, error: funisErr.message }), { status: 500, headers: cors });
  }

  // Dedup por store_id (pega o mais recente)
  const latestByStore = new Map<string, FunilDiarioRow>();
  for (const r of (freshFunis ?? []) as FunilDiarioRow[]) {
    if (!latestByStore.has(r.store_id)) latestByStore.set(r.store_id, r);
  }

  if (latestByStore.size === 0) {
    return new Response(
      JSON.stringify({ ok: true, processed: 0, skipped: 0, errors: 0, message: "No eligible stores with fresh GA4 funnel" }),
      { headers: cors },
    );
  }

  const eligibleStoreIds = Array.from(latestByStore.keys());

  // 3. Skip lojas com diag recente
  const skipWeeklySince = new Date(Date.now() - SKIP_IF_WEEKLY_WITHIN_DAYS * 86400_000).toISOString();
  const skipManualSince = new Date(Date.now() - SKIP_IF_MANUAL_WITHIN_HOURS * 3600_000).toISOString();

  const { data: recentDiags } = await supabase
    .from("diagnostics_v3")
    .select("store_id,trigger_source,created_at")
    .in("store_id", eligibleStoreIds)
    .or(`and(trigger_source.eq.weekly,created_at.gte.${skipWeeklySince}),and(trigger_source.eq.manual,created_at.gte.${skipManualSince}),and(trigger_source.eq.onboarding,created_at.gte.${skipManualSince})`);

  const skipStoreIds = new Set<string>();
  for (const d of (recentDiags ?? []) as Array<{ store_id: string }>) {
    if (d.store_id) skipStoreIds.add(d.store_id);
  }

  const toProcess = eligibleStoreIds.filter((id) => !skipStoreIds.has(id));

  // 4. Carrega contexto das lojas
  const { data: storesCtx } = await supabase
    .from("stores")
    .select("id,user_id,name,segment,ticket_medio,meta_conversao")
    .in("id", toProcess);

  const storeMap = new Map<string, StoreContextRow>();
  for (const s of (storesCtx ?? []) as StoreContextRow[]) {
    storeMap.set(s.id, s);
  }

  // 5. Processa em batches
  let processed = 0;
  let skipped = skipStoreIds.size;
  let errors = 0;
  const errorSamples: Array<{ store_id: string; error: string }> = [];

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(async (storeId) => {
      const funil = latestByStore.get(storeId);
      const store = storeMap.get(storeId);
      if (!funil || !store) {
        skipped++;
        return;
      }

      const sessions = Number(funil.sessions ?? 0);
      const purchases = Number(funil.purchases ?? 0);
      // Loja inativa: 0 sessões → skip (gerar-diagnostico rejeitaria com 400)
      if (sessions <= 0) {
        skipped++;
        return;
      }

      const ticketMedio = Number(store.ticket_medio ?? 0) > 0
        ? Number(store.ticket_medio)
        : (purchases > 0 ? Number(funil.purchase_revenue ?? 0) / purchases : 250);
      const metaConversao = Number(store.meta_conversao ?? 0) > 0 ? Number(store.meta_conversao) : 2.5;

      const body = {
        loja_id: storeId,
        user_id: store.user_id,
        trigger_source: "weekly",
        visitantes: sessions,
        produto_visto: Number(funil.view_item ?? 0),
        carrinho: Number(funil.add_to_cart ?? 0),
        checkout: Number(funil.begin_checkout ?? 0),
        pedido: purchases,
        ticket_medio: ticketMedio,
        meta_conversao: metaConversao,
        segmento: store.segment ?? "Outros",
        canais_conectados: [],
        data_quality: { last_sync_at: funil.ingested_at },
      };

      const resp = await fetch(`${supabaseUrl}/functions/v1/gerar-diagnostico`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": internalSecret,
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`gerar-diagnostico ${resp.status}: ${txt.slice(0, 200)}`);
      }

      // Notificação no sino
      await supabase.from("notifications").insert({
        user_id: store.user_id,
        type: "system",
        title: "📊 Seu diagnóstico semanal está pronto",
        body: `Veja como sua conversão evoluiu em ${store.name ?? "sua loja"} esta semana.`,
        action_url: "/resultado",
      });

      // Audit
      await supabase.from("audit_logs").insert({
        user_id: store.user_id,
        store_id: storeId,
        action: "weekly_diagnostic_run",
        resource: "diagnostics_v3",
        result: "success",
        metadata: { sessions, purchases },
      });

      processed++;
    }));

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === "rejected") {
        errors++;
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        if (errorSamples.length < 8) errorSamples.push({ store_id: batch[j], error: msg });
      }
    }

    if (i + BATCH_SIZE < toProcess.length) {
      await new Promise((res) => setTimeout(res, BATCH_DELAY_MS));
    }
  }

  if (errors > 0) {
    logAlert({ phase: "batch_done", processed, skipped, errors, samples: errorSamples });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      processed,
      skipped,
      errors,
      eligible_total: eligibleStoreIds.length,
      duration_ms: Date.now() - startedAt.getTime(),
    }),
    { headers: cors },
  );
});