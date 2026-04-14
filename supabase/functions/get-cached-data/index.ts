/**
 * BFF Proxy with Redis Caching.
 * Handles expensive RPCs and caches their output in Upstash Redis.
 * POST /functions/v1/get-cached-data
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders, verifyJwt } from "../_shared/edge-utils.ts";
import { getCache, setCache } from "../_shared/redis.ts";

const BodySchema = z.object({
  rpc_name: z.enum(["get_dashboard_snapshot", "get_funil_page_data", "get_prescriptions_bundle_v2"]),
  params: z.record(z.unknown()),
  ttl_seconds: z.number().optional().default(300),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await verifyJwt(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid body", details: parsed.error.format() }), { status: 400, headers: corsHeaders });
    }

    const { rpc_name, params, ttl_seconds } = parsed.data;
    
    // Create cache key based on RPC name and stable params string
    const cacheKey = `${rpc_name}:${JSON.stringify(params)}`;
    
    // 1. Try Cache
    const cached = await getCache(cacheKey);
    if (cached) {
      console.log(`[Cache Hit] ${cacheKey}`);
      return new Response(JSON.stringify(cached), { 
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" } 
      });
    }

    // 2. Cache Miss: Call RPC
    console.log(`[Cache Miss] ${cacheKey}`);
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { data, error } = await supabase.rpc(rpc_name, params);

    if (error) {
      console.error(`RPC ${rpc_name} error:`, error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }

    // 3. Save to Cache
    if (data) {
      await setCache(cacheKey, data, ttl_seconds);
    }

    return new Response(JSON.stringify(data), { 
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" } 
    });

  } catch (err: any) {
    console.error("get-cached-data error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: corsHeaders });
  }
});
