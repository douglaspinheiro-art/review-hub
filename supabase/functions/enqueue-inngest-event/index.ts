/**
 * enqueue-inngest-event — Sends an event to Inngest via the connector gateway.
 *
 * POST body: { event_name: string, event_data: Record<string, unknown> }
 *
 * Requires: LOVABLE_API_KEY, INNGEST_API_KEY (from Inngest connector)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/inngest";

const BodySchema = z.object({
  event_name: z.string().min(1).max(200),
  event_data: z.record(z.unknown()),
});

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  const JSON_HDR = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    // Auth check
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", request_id: requestId }),
        { status: 401, headers: JSON_HDR }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", request_id: requestId }),
        { status: 401, headers: JSON_HDR }
      );
    }

    // Validate body
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
          request_id: requestId,
        }),
        { status: 400, headers: JSON_HDR }
      );
    }

    const { event_name, event_data } = parsed.data;

    // Send to Inngest via gateway
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const INNGEST_API_KEY = Deno.env.get("INNGEST_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }
    if (!INNGEST_API_KEY) {
      throw new Error("INNGEST_API_KEY is not configured");
    }

    const response = await fetch(`${GATEWAY_URL}/e/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": INNGEST_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: event_name,
        data: {
          ...event_data,
          user_id: authData.user.id,
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Inngest API call failed [${response.status}]: ${errorBody}`
      );
    }

    const result = await response.json();

    return new Response(
      JSON.stringify({ success: true, inngest: result, request_id: requestId }),
      { status: 200, headers: JSON_HDR }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[enqueue-inngest-event]", message);
    return new Response(
      JSON.stringify({ error: message, request_id: requestId }),
      { status: 500, headers: JSON_HDR }
    );
  }
});
