import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * mercadopago-public-key
 * Returns the Mercado Pago PUBLIC KEY (safe to expose to the browser, just like Supabase anon key).
 * Stored as MERCADOPAGO_PUBLIC_KEY secret because Lovable forbids VITE_* secrets.
 */
serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const key = Deno.env.get("MERCADOPAGO_PUBLIC_KEY") ?? "";
  return new Response(JSON.stringify({ public_key: key }), {
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
  });
});