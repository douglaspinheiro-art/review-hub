/**
 * LTV Boost — Webhook de Carrinho Abandonado
 *
 * Endpoint: POST /functions/v1/webhook-cart
 *
 * Recebe eventos de e-commerce (Shopify, Nuvemshop, Tray, VTEX, WooCommerce)
 * e salva na tabela abandoned_carts para processamento.
 *
 * Autenticação: header X-Webhook-Secret deve bater com a variável de ambiente
 * WEBHOOK_SECRET configurada no projeto Supabase.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  // Validate webhook secret (optional but recommended)
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
  if (webhookSecret) {
    const incomingSecret = req.headers.get("x-webhook-secret");
    if (incomingSecret !== webhookSecret) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
  }

  // Normalize payload across platforms
  const source = detectSource(req, payload);
  const normalized = normalizePayload(source, payload);

  if (!normalized.customer_phone) {
    return new Response(
      JSON.stringify({ error: "customer_phone is required" }),
      { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // Upsert to avoid duplicates (same source + external_id)
  const { data, error } = await supabase
    .from("abandoned_carts")
    .upsert(
      {
        ...normalized,
        source,
        raw_payload: payload,
        status: "pending",
      },
      { onConflict: "source,external_id", ignoreDuplicates: false }
    )
    .select("id")
    .single();

  if (error) {
    console.error("DB error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ ok: true, id: data?.id }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});

type Source = "shopify" | "nuvemshop" | "tray" | "vtex" | "woocommerce" | "custom";

function detectSource(req: Request, payload: Record<string, unknown>): Source {
  const ua = req.headers.get("user-agent") ?? "";
  if (ua.toLowerCase().includes("shopify")) return "shopify";
  if (payload["store_id"] && payload["checkout"]) return "nuvemshop";
  if (payload["idPedido"] || payload["idLoja"]) return "tray";
  if (payload["orderId"] && payload["accountId"]) return "vtex";
  if (payload["woocommerce_cart_hash"]) return "woocommerce";
  return "custom";
}

type NormalizedCart = {
  external_id?: string;
  customer_name?: string;
  customer_phone: string;
  customer_email?: string;
  cart_value: number;
  cart_items: unknown[];
  recovery_url?: string;
};

function normalizePayload(source: Source, p: Record<string, unknown>): NormalizedCart {
  switch (source) {
    case "shopify": {
      const checkout = (p["checkout"] ?? p) as Record<string, unknown>;
      const customer = (checkout["customer"] ?? {}) as Record<string, unknown>;
      const phone =
        (checkout["phone"] as string) ??
        (customer["phone"] as string) ??
        "";
      return {
        external_id: String(checkout["id"] ?? ""),
        customer_name: [customer["first_name"], customer["last_name"]].filter(Boolean).join(" "),
        customer_phone: normalizePhone(phone),
        customer_email: (checkout["email"] ?? customer["email"]) as string | undefined,
        cart_value: parseFloat(String(checkout["total_price"] ?? checkout["subtotal_price"] ?? 0)),
        cart_items: (checkout["line_items"] as unknown[]) ?? [],
        recovery_url: checkout["abandoned_checkout_url"] as string | undefined,
      };
    }

    case "nuvemshop": {
      const ch = (p["checkout"] ?? p) as Record<string, unknown>;
      const contact = (ch["contact"] ?? {}) as Record<string, unknown>;
      return {
        external_id: String(ch["id"] ?? ""),
        customer_name: contact["name"] as string | undefined,
        customer_phone: normalizePhone(String(contact["phone"] ?? "")),
        customer_email: contact["email"] as string | undefined,
        cart_value: parseFloat(String(ch["total"] ?? 0)),
        cart_items: (ch["products"] as unknown[]) ?? [],
        recovery_url: ch["checkout_url"] as string | undefined,
      };
    }

    default: {
      // Generic / custom format
      const phone =
        (p["customer_phone"] as string) ??
        (p["phone"] as string) ??
        ((p["customer"] as Record<string, unknown>)?.["phone"] as string) ??
        "";
      return {
        external_id: (p["id"] ?? p["external_id"]) as string | undefined,
        customer_name: (p["customer_name"] ?? p["name"]) as string | undefined,
        customer_phone: normalizePhone(phone),
        customer_email: (p["customer_email"] ?? p["email"]) as string | undefined,
        cart_value: parseFloat(String(p["cart_value"] ?? p["total"] ?? p["value"] ?? 0)),
        cart_items: (p["cart_items"] ?? p["items"] ?? p["products"] ?? []) as unknown[],
        recovery_url: (p["recovery_url"] ?? p["checkout_url"]) as string | undefined,
      };
    }
  }
}

/** Normalizes phone to international format (55XXXXXXXXXX) */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 11 || digits.length === 10) return `55${digits}`;
  return digits;
}
