import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

import { corsHeaders, verifyJwt, errorResponse } from "../_shared/edge-utils.ts";

const BodySchema = z.object({ store_id: z.string().uuid() });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // P0: JWT auth
    const auth = await verifyJwt(req);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }), { status: 400, headers: corsHeaders });
    }
    const { store_id } = parsed.data;

    // P0: Ownership check via assert_store_access RPC (owner OR active team member)
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { error: aclErr } = await authClient.rpc("assert_store_access", { p_store_id: store_id });
    if (aclErr) return errorResponse("Forbidden: store access denied", 403);

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const MARKET_AVERAGES: Record<string, { cvr: number; chs: number; ticket: number }> = {
      "Moda": { cvr: 2.1, chs: 65, ticket: 180 },
      "Beleza & Cosméticos": { cvr: 2.8, chs: 72, ticket: 150 },
      "Eletrônicos": { cvr: 1.2, chs: 58, ticket: 450 },
      "Pets": { cvr: 3.2, chs: 78, ticket: 220 },
      "Outros": { cvr: 1.8, chs: 60, ticket: 200 },
    };

    const { data: store } = await supabase.from("stores").select("segment, conversion_health_score").eq("id", store_id).single();
    if (!store) throw new Error("Store not found");

    const segment = (store as { segment?: string }).segment || "Outros";
    const market = MARKET_AVERAGES[segment] || MARKET_AVERAGES["Outros"];
    const chs = (store as { conversion_health_score?: number }).conversion_health_score ?? 0;
    const comparison = {
      segment,
      store_chs: chs,
      market_chs: market.chs,
      gap: chs - market.chs,
      status: chs >= market.chs ? "Acima da média" : "Abaixo da média",
    };

    return new Response(JSON.stringify(comparison), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
