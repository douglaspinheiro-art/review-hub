/**
 * BFF Proxy with Redis Caching.
 * Executes RPCs with the **caller's JWT** (not service-role) so RLS + RPC
 * tenant guards apply. Cache key is scoped per user to prevent cross-tenant
 * contamination even if params are manipulated.
 *
 * POST /functions/v1/get-cached-data
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders } from "../_shared/edge-utils.ts";
import { getCache, setCache } from "../_shared/redis.ts";

const BodySchema = z.object({
  rpc_name: z.enum([
    "get_dashboard_snapshot",
    "get_funil_page_data",
    "get_prescriptions_bundle_v2",
  ]),
  params: z.record(z.unknown()),
  ttl_seconds: z.number().optional().default(300),
});

function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((obj as Record<string, unknown>)[k])}`).join(",")}}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Caller-scoped client (RLS + tenant guards apply).
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = userData.user.id;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return new Response(
        JSON.stringify({ error: "Invalid body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid body", details: parsed.error.format() }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { rpc_name, params, ttl_seconds } = parsed.data;

    // User-scoped + stable cache key. Never cross tenants.
    const cacheKey = `u:${userId}:${rpc_name}:${stableStringify(params)}`;

    const cached = await getCache(cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    const { data, error } = await supabase.rpc(rpc_name, params);

    if (error) {
      // Tenant guard or other RPC failure — surface 403 vs 500 distinctly.
      const isForbidden =
        error.code === "42501" ||
        /forbidden|permission denied|insufficient privilege/i.test(error.message ?? "");
      const isBadRequest =
        error.code === "22P02" || /invalid input|invalid uuid|malformed/i.test(error.message ?? "");
      console.error(`RPC ${rpc_name} error for user ${userId}:`, error);
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: isForbidden ? 403 : (isBadRequest ? 400 : 500),
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (data) {
      await setCache(cacheKey, data, ttl_seconds);
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (err) {
    console.error("get-cached-data error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
