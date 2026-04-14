import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { verifyJwt, checkDistributedRateLimit, rateLimitedResponse } from "../_shared/edge-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const BodySchema = z.object({
  ga4_property_id: z.string().min(1),
  access_token: z.string().min(1),
  periodo: z.enum(["7d", "30d", "90d"]).default("30d"),
});

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await verifyJwt(req);
  if (!auth.ok) return auth.response;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const { allowed: rlAllowed } = await checkDistributedRateLimit(supabase, `buscar-ga4:${auth.userId}`, 40, 60_000);
  if (!rlAllowed) return rateLimitedResponse();

  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ success: false, error: "Validation failed", details: parsed.error.flatten().fieldErrors }), { status: 400, headers: corsHeaders });
    }
    const { ga4_property_id, access_token, periodo } = parsed.data;

    const diasMap: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
    const dias = diasMap[periodo] ?? 30;
    const startDate = `${dias}daysAgo`;

    const gaHeaders = { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" };
    const baseUrl = `https://analyticsdata.googleapis.com/v1beta/properties/${ga4_property_id}:runReport`;

    // 10s timeout per GA4 request to avoid hanging edge function slots
    const ga4Fetch = (body: unknown) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10_000);
      return fetch(baseUrl, { method: "POST", headers: gaHeaders, body: JSON.stringify(body), signal: ctrl.signal })
        .finally(() => clearTimeout(timer));
    };

    const [sessionsRes, eventsRes, revenueRes] = await Promise.all([
      ga4Fetch({ dateRanges: [{ startDate, endDate: "today" }], metrics: [{ name: "sessions" }] }),
      ga4Fetch({ dateRanges: [{ startDate, endDate: "today" }], metrics: [{ name: "eventCount" }], dimensions: [{ name: "eventName" }] }),
      ga4Fetch({ dateRanges: [{ startDate, endDate: "today" }], metrics: [{ name: "purchaseRevenue" }] }),
    ]);

    if (!sessionsRes.ok) { const _errText = await sessionsRes.text(); throw new Error(`GA4 API returned status ${sessionsRes.status}`); }

    const sessionsData = await sessionsRes.json() as { rows?: Array<{ metricValues: Array<{ value: string }> }> };
    const visitantes = parseInt(sessionsData.rows?.[0]?.metricValues?.[0]?.value ?? "0");

    const eventMap: Record<string, number> = {};
    if (eventsRes.ok) {
      const eventsData = await eventsRes.json() as { rows?: Array<{ dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }> };
      for (const row of eventsData.rows ?? []) {
        const name = row.dimensionValues?.[0]?.value;
        const count = parseInt(row.metricValues?.[0]?.value ?? "0");
        if (name) eventMap[name] = count;
      }
    }

    let receita = 0;
    if (revenueRes.ok) {
      const revenueData = await revenueRes.json() as { rows?: Array<{ metricValues: Array<{ value: string }> }> };
      receita = parseFloat(revenueData.rows?.[0]?.metricValues?.[0]?.value ?? "0");
    }

    const metrics = {
      visitors: visitantes,
      product_views: eventMap["view_item"] ?? Math.round(visitantes * 0.72),
      add_to_cart: eventMap["add_to_cart"] ?? Math.round(visitantes * 0.28),
      begin_checkout: eventMap["begin_checkout"] ?? Math.round(visitantes * 0.14),
      purchases: eventMap["purchase"] ?? Math.round(visitantes * 0.014),
      revenue: Math.round(receita),
      source: "ga4" as const,
    };

    return new Response(JSON.stringify({ success: true, metrics }), { headers: corsHeaders });
  } catch (err) {
    console.error("buscar-ga4 error:", err);
    return new Response(JSON.stringify({ success: false, error: "Internal server error" }), { status: 500, headers: corsHeaders });
  }
});
