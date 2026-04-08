/**
 * unsubscribe-contact — Marca um contato como descadastrado
 *
 * POST /functions/v1/unsubscribe-contact
 * Body: { user_id: string; contact_id: string; ts: string; sig: string }
 * Público com assinatura HMAC e expiração curta
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z, errorResponse } from "../_shared/edge-utils.ts";
import { uuidSchema, validateRequest } from "../_shared/validation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const encoder = new TextEncoder();
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const BodySchema = z.object({
  user_id: uuidSchema,
  contact_id: uuidSchema,
  ts: z.string().min(1).max(30),
  sig: z.string().regex(/^[a-f0-9]{64}$/i),
});

async function hmacSha256(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const parsedReq = await validateRequest(req, { method: "POST", maxBytes: 16 * 1024, schema: BodySchema });
    if (!parsedReq.ok) return parsedReq.response;
    const { user_id, contact_id, ts, sig } = parsedReq.data;

    const tokenSecret = Deno.env.get("UNSUBSCRIBE_TOKEN_SECRET") ?? "";
    if (!tokenSecret) throw new Error("UNSUBSCRIBE_TOKEN_SECRET não configurado");

    const tsNumber = Number(ts);
    if (!Number.isFinite(tsNumber)) throw new Error("Token inválido");
    if (Math.abs(Date.now() - tsNumber) > TOKEN_TTL_MS) throw new Error("Link expirado");

    const expected = await hmacSha256(tokenSecret, `${user_id}:${contact_id}:${ts}`);
    if (expected !== sig) throw new Error("Assinatura inválida");

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Try customers_v3 first, fallback to contacts
    const { error: e1 } = await sb
      .from("customers_v3")
      .update({ unsubscribed_at: new Date().toISOString() } as any)
      .eq("id", contact_id)
      .eq("user_id", user_id);

    if (e1) {
      // Fallback: contacts table
      await sb
        .from("contacts")
        .update({ unsubscribed_at: new Date().toISOString() } as any)
        .eq("id", contact_id)
        .eq("user_id", user_id);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("unsubscribe-contact error", err);
    return errorResponse("Invalid unsubscribe request", 400);
  }
});
