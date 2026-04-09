import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { verifyJwt } from "../_shared/edge-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  to: z.string().min(8).max(20),
  message: z.string().min(1).max(1000),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await verifyJwt(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { to, message } = parsed.data;

    const SMS_DEV_TOKEN = Deno.env.get("SMS_DEV_TOKEN");
    if (!SMS_DEV_TOKEN) throw new Error("SMS_DEV_TOKEN missing");

    const res = await fetch(`https://api.smsdev.com.br/v1/send?key=${SMS_DEV_TOKEN}&type=9&number=${encodeURIComponent(to)}&msg=${encodeURIComponent(message)}`);
    const data = await res.json();

    return new Response(JSON.stringify(data), { status: res.ok ? 200 : 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("send-sms error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
