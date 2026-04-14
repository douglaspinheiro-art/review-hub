import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { verifyJwt, checkDistributedRateLimit, rateLimitedResponse } from "../_shared/edge-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  to: z.union([z.string().email(), z.array(z.string().email())]),
  subject: z.string().min(1).max(500),
  html: z.string().min(1).max(100000),
  from_name: z.string().max(100).default("LTV Boost"),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await verifyJwt(req);
  if (!auth.ok) return auth.response;

  // Distributed rate limit — enforced across all instances, not per-instance.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const { allowed } = await checkDistributedRateLimit(supabase, `send-email:${auth.userId}`, 30, 60_000);
  if (!allowed) return rateLimitedResponse();

  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { to, subject, html, from_name } = parsed.data;

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY missing");

    // 15s timeout — prevents Edge Function from hanging if Resend is slow/unresponsive.
    const resendCtrl = new AbortController();
    const resendTimer = setTimeout(() => resendCtrl.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({ from: `${from_name} <notificacoes@ltvboost.com.br>`, to: Array.isArray(to) ? to : [to], subject, html }),
        signal: resendCtrl.signal,
      });
    } catch (fetchErr) {
      const isTimeout = (fetchErr as Error)?.name === "AbortError";
      throw new Error(isTimeout ? "Resend API timeout (15s) — tente novamente em instantes" : String(fetchErr));
    } finally {
      clearTimeout(resendTimer);
    }

    const data = await res.json();
    return new Response(JSON.stringify(data), { status: res.ok ? 200 : 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("send-email error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
