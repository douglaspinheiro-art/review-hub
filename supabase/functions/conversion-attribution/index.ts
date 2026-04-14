import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

import { corsHeaders, timingSafeEqual } from "../_shared/edge-utils.ts";

const BodySchema = z.object({
  order_id: z.string().min(1),
  store_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  total_value: z.number().min(0).optional(),
});

/**
 * Janela last-touch (horas). Opcional: definir `ATTRIBUTION_WINDOW_HOURS` nas secrets da função no Supabase (mesmo valor que o frontend em `src/lib/attribution-config.ts`).
 * Eventos gravados usam `source_platform = last_touch_send` — não colidem com `integration-gateway` (ex.: shopify + UTM/cupom).
 */
const ATTRIBUTION_WINDOW_HOURS = Math.min(
  168,
  Math.max(1, Number(Deno.env.get("ATTRIBUTION_WINDOW_HOURS") ?? "72") || 72),
);

const ATTRIBUTION_SOURCE_PLATFORM = "last_touch_send";

function digitsOnly(s: string) {
  return s.replace(/\D/g, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const internalSecret = req.headers.get("x-attribution-secret") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const expectedSecret = Deno.env.get("CONVERSION_ATTRIBUTION_SECRET") ?? "";
    const authorized =
      (serviceRole && timingSafeEqual(authHeader, `Bearer ${serviceRole}`)) ||
      (expectedSecret && timingSafeEqual(internalSecret, expectedSecret));
    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }), { status: 400, headers: corsHeaders });
    }
    const { order_id, store_id, customer_id, total_value } = parsed.data;

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    const windowStart = new Date(Date.now() - ATTRIBUTION_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const { data: sends, error } = await supabase
      .from("message_sends")
      .select("id, campaign_id, automation_id, message_id, phone, sent_at, created_at, status")
      .eq("customer_id", customer_id)
      .eq("store_id", store_id)
      .in("status", ["sent", "sent_handoff_recommended"])
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

    if (sends && sends.length > 0) {
      const lastTouch = sends[0] as {
        id: string;
        campaign_id: string | null;
        automation_id: string | null;
        message_id: string | null;
        phone: string;
      };

      const { data: storeRow, error: storeErr } = await supabase.from("stores").select("user_id").eq("id", store_id).maybeSingle();
      if (storeErr || !storeRow?.user_id) {
        return new Response(JSON.stringify({ error: storeErr?.message ?? "Loja não encontrada" }), { status: 400, headers: corsHeaders });
      }
      const ownerUserId = storeRow.user_id as string;

      const { data: existingEvent } = await supabase
        .from("attribution_events")
        .select("id")
        .eq("order_id", order_id)
        .eq("user_id", ownerUserId)
        .eq("source_platform", ATTRIBUTION_SOURCE_PLATFORM)
        .maybeSingle();
      if (existingEvent?.id) {
        return new Response(JSON.stringify({ ok: true, attributed: true, deduped: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: cust } = await supabase
        .from("customers_v3")
        .select("phone")
        .eq("id", customer_id)
        .eq("store_id", store_id)
        .maybeSingle();

      const phoneFromSend = digitsOnly(lastTouch.phone ?? "");
      const phoneFromCustomer = digitsOnly((cust?.phone as string | null) ?? "");
      const customer_phone = phoneFromSend.length >= 10
        ? phoneFromSend
        : phoneFromCustomer.length >= 10
        ? phoneFromCustomer
        : "00000000000";

      const today = new Date().toISOString().split("T")[0];
      await supabase.rpc("increment_daily_revenue", { p_date: today, p_amount: Number(total_value ?? 0) }).then(
        () => {},
        async () => {
          const { data: current } = await supabase.from("analytics_daily").select("revenue_influenced").eq("store_id", store_id).eq("date", today).maybeSingle();
          await supabase.from("analytics_daily").upsert(
            {
              store_id,
              date: today,
              revenue_influenced: (Number(current?.revenue_influenced || 0) + Number(total_value ?? 0)),
            },
            { onConflict: "store_id, date" },
          );
        },
      );

      const { error: insErr } = await supabase.from("attribution_events").insert({
        user_id: ownerUserId,
        order_id,
        customer_phone,
        order_value: Number(total_value ?? 0),
        attributed_message_id: lastTouch.message_id,
        attributed_campaign_id: lastTouch.campaign_id ?? null,
        attributed_automation_id: lastTouch.automation_id ?? null,
        source_platform: ATTRIBUTION_SOURCE_PLATFORM,
        order_date: new Date().toISOString(),
      });

      if (insErr) {
        return new Response(JSON.stringify({ ok: false, error: insErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          ok: true,
          attributed_to: lastTouch.id,
          attributed_campaign_id: lastTouch.campaign_id ?? null,
          attributed_automation_id: lastTouch.automation_id ?? null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ ok: true, attributed: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
