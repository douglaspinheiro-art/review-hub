import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

import { corsHeaders } from "../_shared/edge-utils.ts";
import {
  CUSTOMERS_V3_FLOW_SELECT,
  JOURNEYS_CONFIG_FLOW_SELECT,
  STORES_FLOW_SELECT,
} from "../_shared/db-select-fragments.ts";

/**
 * `event` === `journeys_config.tipo_jornada` ativo para a loja.
 * Disparos conhecidos no repo:
 * - `cart_abandoned` / `payment_pending` — `webhook-cart` (carrinho vs etapa/falha de pagamento)
 * - `loyalty_points` — `integration-gateway` em pedido novo já pago (`paid_or_processing`)
 * - Outros tipos seedados: welcome, reactivation, birthday, post_purchase, review_request, winback
 * - Custom: prefixo `custom_*` (modal / API)
 */
const BodySchema = z.object({
  event: z.string().min(1).max(100),
  store_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  payload: z.record(z.unknown()).optional(),
});

serve(async (req) => {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // Only the dedicated FLOW_ENGINE_SECRET is accepted — not the service_role_key.
    const internalSecret = Deno.env.get("FLOW_ENGINE_SECRET");
    if (!internalSecret) {
      console.error("FLOW_ENGINE_SECRET is not configured");
      return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const authHeader = req.headers.get("authorization") ?? "";
    const providedSecret = req.headers.get("x-internal-secret") ?? "";
    const validInternal =
      authHeader === `Bearer ${internalSecret}` || providedSecret === internalSecret;
    if (!validInternal) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }), { status: 400, headers: corsHeaders });
    }
    const { event, store_id, customer_id, payload } = parsed.data;

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { data: store } = await supabase.from("stores").select(STORES_FLOW_SELECT).eq("id", store_id).single();
    if (!store) throw new Error("Store not found");

    const { data: journeys } = await supabase
      .from("journeys_config")
      .select(JOURNEYS_CONFIG_FLOW_SELECT)
      .eq("store_id", store_id)
      .eq("tipo_jornada", event)
      .eq("ativa", true);
    if (!journeys || journeys.length === 0) {
      return new Response(JSON.stringify({ ok: true, status: "no_active_journeys" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const processed = [];
    for (const journey of journeys) {
      const { data: customer } = await supabase
        .from("customers_v3")
        .select(CUSTOMERS_V3_FLOW_SELECT)
        .eq("id", customer_id)
        .single();
      if (!customer) continue;

      const config = (journey.config_json || {}) as Record<string, any>;
      let message = config.message_template || "Olá {{nome}}, temos uma oferta especial para você!";
      const val = Number((payload as any)?.cart_value || 0);
      const ship = Number((payload as any)?.shipping_value || 0);

      if (val > 0 && ship / val > 0.15) {
        message = `Oi {{nome}}! Vimos que o frete ficou um pouco alto. Liberamos FRETE GRÁTIS para você finalizar agora: {{link}}`;
      } else if (customer.rfm_segment === "champions" || customer.rfm_segment === "campeao") {
        message = `Oi {{nome}}, nosso cliente VIP! Separamos seu carrinho com carinho. Use o cupom VIP10 para um mimo extra: {{link}}`;
      }

      const delay = config.delay_minutes || 20;
      const scheduledFor = new Date(Date.now() + delay * 60 * 1000).toISOString();
      const finalMessage = message
        .replace("{{nome}}", customer.name || "você")
        .replace("{{link}}", (payload as any)?.recovery_url || "");

      const { data: sched, error: schedErr } = await (supabase as any).from("scheduled_messages").insert({
        user_id: store.user_id, store_id, customer_id: customer.id, journey_id: journey.id,
        message_content: finalMessage, scheduled_for: scheduledFor, status: "pending",
      }).select("id").single();

      if (!schedErr && sched) processed.push(sched.id);
    }

    console.log(
      `[${requestId}] flow-engine ok event=${event} store=${store_id} scheduled=${processed.length} elapsed_ms=${Date.now() - startedAt}`,
    );
    return new Response(JSON.stringify({ ok: true, scheduled_messages: processed.length, request_id: requestId }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error(`[${requestId}] flow-engine error:`, err?.message ?? err);
    return new Response(JSON.stringify({ error: err.message, request_id: requestId }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
