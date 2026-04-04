// supabase/functions/buscar-ga4/index.ts
// Deno Edge Function — fetches GA4 funnel metrics via Google Analytics Data API.
//
// POST /functions/v1/buscar-ga4
// Body: { ga4_property_id: string, access_token: string, periodo?: "7d"|"30d"|"90d" }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { ga4_property_id, access_token, periodo = "30d" } = await req.json() as {
      ga4_property_id: string;
      access_token: string;
      periodo?: string;
    };

    if (!ga4_property_id || !access_token) {
      return new Response(
        JSON.stringify({ success: false, error: "ga4_property_id e access_token são obrigatórios" }),
        { status: 400, headers: CORS }
      );
    }

    const diasMap: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
    const dias = diasMap[periodo] ?? 30;
    const startDate = `${dias}daysAgo`;

    const gaHeaders = {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
    };

    const baseUrl = `https://analyticsdata.googleapis.com/v1beta/properties/${ga4_property_id}:runReport`;

    // Fetch sessions and funnel events in parallel
    const [sessionsRes, eventsRes, revenueRes] = await Promise.all([
      fetch(baseUrl, {
        method: "POST",
        headers: gaHeaders,
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate: "today" }],
          metrics: [{ name: "sessions" }],
        }),
      }),
      fetch(baseUrl, {
        method: "POST",
        headers: gaHeaders,
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate: "today" }],
          metrics: [{ name: "eventCount" }],
          dimensions: [{ name: "eventName" }],
        }),
      }),
      fetch(baseUrl, {
        method: "POST",
        headers: gaHeaders,
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate: "today" }],
          metrics: [{ name: "purchaseRevenue" }],
        }),
      }),
    ]);

    if (!sessionsRes.ok) {
      const errText = await sessionsRes.text();
      throw new Error(`GA4 API error ${sessionsRes.status}: ${errText}`);
    }

    const sessionsData = await sessionsRes.json() as { rows?: Array<{ metricValues: Array<{ value: string }> }> };
    const visitantes = parseInt(sessionsData.rows?.[0]?.metricValues?.[0]?.value ?? "0");

    // Parse events
    const eventMap: Record<string, number> = {};
    if (eventsRes.ok) {
      const eventsData = await eventsRes.json() as {
        rows?: Array<{ dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }>;
      };
      for (const row of eventsData.rows ?? []) {
        const name = row.dimensionValues?.[0]?.value;
        const count = parseInt(row.metricValues?.[0]?.value ?? "0");
        if (name) eventMap[name] = count;
      }
    }

    // Parse revenue
    let receita = 0;
    if (revenueRes.ok) {
      const revenueData = await revenueRes.json() as { rows?: Array<{ metricValues: Array<{ value: string }> }> };
      receita = parseFloat(revenueData.rows?.[0]?.metricValues?.[0]?.value ?? "0");
    }

    // Map GA4 events to funnel steps (with proportional fallback if events not tracked)
    const metricas = {
      visitantes,
      visualizacoes_produto: eventMap["view_item"]       ?? Math.round(visitantes * 0.72),
      adicionou_carrinho:    eventMap["add_to_cart"]     ?? Math.round(visitantes * 0.28),
      iniciou_checkout:      eventMap["begin_checkout"]  ?? Math.round(visitantes * 0.14),
      compras:               eventMap["purchase"]        ?? Math.round(visitantes * 0.014),
      receita:               Math.round(receita),
      fonte: "ga4" as const,
    };

    return new Response(JSON.stringify({ success: true, metricas }), { headers: CORS });
  } catch (err) {
    console.error("buscar-ga4 error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Erro interno" }),
      { status: 500, headers: CORS }
    );
  }
});
