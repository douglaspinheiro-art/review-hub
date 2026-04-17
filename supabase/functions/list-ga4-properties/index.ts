/**
 * Lists GA4 properties available to the connected Google account for a given store.
 *
 * POST { store_id: string } → { properties: [{ id, name, account_name }] }
 */
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureFreshGa4AccessToken } from "../_shared/refresh-ga4-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }
  const userId = claims.claims.sub;

  try {
    const { store_id } = await req.json() as { store_id?: string };
    if (!store_id) {
      return new Response(JSON.stringify({ error: "store_id required" }), { status: 400, headers: corsHeaders });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Verify ownership
    const { data: store } = await serviceClient
      .from("stores")
      .select("user_id")
      .eq("id", store_id)
      .maybeSingle();
    if (!store || store.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const accessToken = await ensureFreshGa4AccessToken(serviceClient, store_id);

    const res = await fetch(
      "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: `GA4 Admin API ${res.status}`, detail: text.slice(0, 300) }), {
        status: 502, headers: corsHeaders,
      });
    }
    const json = await res.json() as {
      accountSummaries?: Array<{
        displayName?: string;
        propertySummaries?: Array<{ property?: string; displayName?: string }>;
      }>;
    };

    const properties: Array<{ id: string; name: string; account_name: string }> = [];
    for (const acc of json.accountSummaries ?? []) {
      for (const prop of acc.propertySummaries ?? []) {
        const id = prop.property?.replace("properties/", "") ?? "";
        if (!id) continue;
        properties.push({
          id,
          name: prop.displayName ?? `Property ${id}`,
          account_name: acc.displayName ?? "",
        });
      }
    }

    return new Response(JSON.stringify({ success: true, properties }), { headers: corsHeaders });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("list-ga4-properties error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers: corsHeaders });
  }
});
