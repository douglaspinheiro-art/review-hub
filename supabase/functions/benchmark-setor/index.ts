/**
 * LTV Boost v4 — Sector Benchmark Engine
 * Compares store health with Brazilian market averages
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MARKET_AVERAGES: Record<string, any> = {
  "Moda": { cvr: 2.1, chs: 65, ticket: 180 },
  "Beleza & Cosméticos": { cvr: 2.8, chs: 72, ticket: 150 },
  "Eletrônicos": { cvr: 1.2, chs: 58, ticket: 450 },
  "Pets": { cvr: 3.2, chs: 78, ticket: 220 },
  "Outros": { cvr: 1.8, chs: 60, ticket: 200 }
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { store_id } = await req.json();

    // 1. Get Store CHS and Segment
    const { data: store } = await supabase.from("stores").select("segment, conversion_health_score").eq("id", store_id).single();
    if (!store) throw new Error("Store not found");

    const segment = store.segment || "Outros";
    const market = MARKET_AVERAGES[segment] || MARKET_AVERAGES["Outros"];

    // 2. Calculate Comparison
    const comparison = {
      segment,
      store_chs: store.conversion_health_score,
      market_chs: market.chs,
      gap: store.conversion_health_score - market.chs,
      status: store.conversion_health_score >= market.chs ? 'Acima da média' : 'Abaixo da média'
    };

    return new Response(JSON.stringify(comparison), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
