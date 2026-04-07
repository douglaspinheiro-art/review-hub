/**
 * LTV Boost v4 — SMS Dispatcher
 * Sends transactional SMS messages via SMS Dev / Twilio API
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { to, message } = await req.json();

    const SMS_DEV_TOKEN = Deno.env.get("SMS_DEV_TOKEN");
    if (!SMS_DEV_TOKEN) throw new Error("SMS_DEV_TOKEN missing");

    // Simple SMS Dev API implementation
    const res = await fetch(`https://api.smsdev.com.br/v1/send?key=${SMS_DEV_TOKEN}&type=9&number=${to}&msg=${encodeURIComponent(message)}`);

    const data = await res.json();

    return new Response(JSON.stringify(data), {
      status: res.ok ? 200 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
