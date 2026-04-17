import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

import { corsHeaders, verifyJwt, errorResponse } from "../_shared/edge-utils.ts";

const BodySchema = z.object({ store_id: z.string().uuid() });

const GRAPH = "https://graph.facebook.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // P0: JWT auth
    const auth = await verifyJwt(req);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "store_id (UUID) is required" }), { status: 400, headers: corsHeaders });
    }
    const { store_id } = parsed.data;

    // P0: Ownership check
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { error: aclErr } = await authClient.rpc("assert_store_access", { p_store_id: store_id });
    if (aclErr) return errorResponse("Forbidden: store access denied", 403);

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { data: connections } = await supabase
      .from("whatsapp_connections")
      .select("id, provider, meta_phone_number_id, meta_access_token, meta_api_version")
      .eq("store_id", store_id);

    for (const conn of connections || []) {
      if ((conn as { provider?: string }).provider !== "meta_cloud") continue;
      const phoneId = (conn as { meta_phone_number_id?: string | null }).meta_phone_number_id;
      const token = (conn as { meta_access_token?: string | null }).meta_access_token;
      const ver = (conn as { meta_api_version?: string | null }).meta_api_version ?? "v21.0";
      const v = ver.replace(/^v/, "v");
      if (!phoneId?.trim() || !token?.trim()) continue;
      try {
        const res = await fetch(`${GRAPH}/${v}/${phoneId}?fields=id`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const status = res.ok ? "connected" : "disconnected";
        await supabase.from("whatsapp_connections").update({ status, updated_at: new Date().toISOString() }).eq(
          "id",
          (conn as { id: string }).id,
        );
      } catch (e) {
        console.error(`Error syncing Meta connection ${(conn as { id: string }).id}:`, e);
      }
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
