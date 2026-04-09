/**
 * generate-api-key — generates a cryptographically random API key server-side.
 * The full key is returned once and never stored. Only a SHA-256 hash is persisted.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { verifyJwt } from "../_shared/edge-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  name: z.string().min(1).max(100),
  environment: z.enum(["production", "sandbox"]),
});

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await verifyJwt(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { name, environment } = parsed.data;
    const prefix = environment === "production" ? "chb_live_" : "chb_test_";

    // Generate 24 random bytes = 48 hex chars, take first 32 for the key body
    const randomBytes = new Uint8Array(24);
    crypto.getRandomValues(randomBytes);
    const random = Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 32);

    const fullKey = `${prefix}${random}`;
    const preview = `${prefix}${"•".repeat(20)}${random.slice(-6)}`;
    const keyHash = await sha256hex(fullKey);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error } = await supabase.from("api_keys").insert({
      user_id: auth.userId,
      name,
      key_prefix: prefix,
      key_hash: keyHash,
      key_preview: preview,
      environment,
      scopes: ["read", "write"],
      is_active: true,
    });

    if (error) {
      console.error("generate-api-key DB insert error:", error.code);
      return new Response(
        JSON.stringify({ error: "Failed to save API key" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return the full key only once — it is never stored and cannot be retrieved again
    return new Response(
      JSON.stringify({ fullKey, preview }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("generate-api-key error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
