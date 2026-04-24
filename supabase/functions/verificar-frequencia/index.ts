// @ts-nocheck — Supabase generated types narrow joined/select rows to `never`; runtime shape validated via Zod and column projection.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

import { corsHeaders, verifyJwt, errorResponse } from "../_shared/edge-utils.ts";

const BodySchema = z.object({
  customer_id: z.string().uuid(),
  store_id: z.string().uuid(),
  channel: z.string().min(1).max(50),
});

/** Resolve cap from settings_v3: prefer row scoped to store, then user-level row (UI upsert uses user_id). */
async function resolveWeeklyCap(
  supabase: ReturnType<typeof createClient>,
  storeId: string,
  channel: string
): Promise<number> {
  const { data: store, error: storeErr } = await supabase
    .from("stores")
    .select("user_id")
    .eq("id", storeId)
    .maybeSingle();
  if (storeErr || !store?.user_id) return 2;

  const userId = store.user_id as string;

  const { data: byStore } = await supabase
    .from("settings_v3")
    .select("cap_msgs_whatsapp_semana, cap_msgs_email_semana")
    .eq("user_id", userId)
    .eq("store_id", storeId)
    .maybeSingle();

  const pick = (row: { cap_msgs_whatsapp_semana?: number | null; cap_msgs_email_semana?: number | null } | null) => {
    if (!row) return null;
    const ch = channel.toLowerCase();
    if (ch.includes("email") || ch === "email") {
      return row.cap_msgs_email_semana ?? 3;
    }
    return row.cap_msgs_whatsapp_semana ?? 2;
  };

  const fromStore = pick(byStore);
  if (fromStore != null) return fromStore;

  const { data: byUser } = await supabase
    .from("settings_v3")
    .select("cap_msgs_whatsapp_semana, cap_msgs_email_semana")
    .eq("user_id", userId)
    .is("store_id", null)
    .maybeSingle();

  const fromUser = pick(byUser);
  if (fromUser != null) return fromUser;

  const { data: fallback } = await supabase
    .from("settings_v3")
    .select("cap_msgs_whatsapp_semana, cap_msgs_email_semana")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return pick(fallback) ?? 2;
}

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
    const { customer_id, store_id, channel } = parsed.data;

    // P0: Ownership check
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { error: aclErr } = await authClient.rpc("assert_store_access", { p_store_id: store_id });
    if (aclErr) return errorResponse("Forbidden: store access denied", 403);

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const cap = await resolveWeeklyCap(supabase, store_id, channel);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { count, error } = await supabase
      .from("communications_sent")
      .select("id", { count: "exact" })
      .eq("store_id", store_id)
      .eq("cliente_id", customer_id)
      .eq("canal", channel)
      .gte("enviado_em", sevenDaysAgo.toISOString());

    if (error) throw error;
    const allowed = (count || 0) < cap;

    return new Response(JSON.stringify({ allowed, current_count: count, cap }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
