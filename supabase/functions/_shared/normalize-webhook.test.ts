import {
  getVerifierSecretForStore,
  verifyNuvemshopToken,
  verifyShopifyHmac,
  verifyWooCommerceHmac,
} from "./normalize-webhook.ts";

async function signHmacBase64(secret: string, body: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, body.buffer as ArrayBuffer);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

function buildSupabaseMock(responses: Array<{ data: unknown; error: { message: string } | null }>) {
  let index = 0;
  const nextResponse = () => responses[Math.min(index++, responses.length - 1)];

  const from = () => ({
    select: () => ({
      eq: () => ({
        eq: () => Promise.resolve(nextResponse()),
      }),
    }),
  });

  return { from } as unknown;
}

Deno.test("verifyShopifyHmac aceita assinatura válida", async () => {
  const secret = "shopify-secret";
  const body = new TextEncoder().encode('{"ok":true}');
  const signature = await signHmacBase64(secret, body);
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { "x-shopify-hmac-sha256": signature },
    body,
  });

  const ok = await verifyShopifyHmac(req, body, secret);
  if (!ok) throw new Error("expected signature verification to pass");
});

Deno.test("verifyWooCommerceHmac rejeita assinatura inválida", async () => {
  const secret = "woo-secret";
  const body = new TextEncoder().encode('{"order":1}');
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { "x-wc-webhook-signature": "invalid-signature" },
    body,
  });

  const ok = await verifyWooCommerceHmac(req, body, secret);
  if (ok) throw new Error("expected signature verification to fail");
});

Deno.test("verifyNuvemshopToken rejeita token ausente", () => {
  const req = new Request("https://example.com", { method: "POST" });
  const ok = verifyNuvemshopToken(req, "nuvemshop-token");
  if (ok) throw new Error("expected missing token header to fail");
});

Deno.test("getVerifierSecretForStore resolve secret por loja e plataforma", async () => {
  const supabase = buildSupabaseMock([
    {
      data: [{
        id: "i-1",
        type: "shopify",
        name: "Shopify App",
        config: {},
        config_json: {},
        webhook_secret: "per-store-secret",
        webhook_token: null,
      }],
      error: null,
    },
  ]);

  const result = await getVerifierSecretForStore(supabase as never, "store-1", "shopify");
  if (!result.ok || result.secret !== "per-store-secret") {
    throw new Error("expected to resolve per-store webhook secret");
  }
});

Deno.test("getVerifierSecretForStore falha quando integração não tem credencial", async () => {
  const supabase = buildSupabaseMock([
    {
      data: [{
        id: "i-2",
        type: "woocommerce",
        name: "Woo",
        config: {},
        config_json: {},
        webhook_secret: null,
        webhook_token: null,
      }],
      error: null,
    },
  ]);

  const result = await getVerifierSecretForStore(supabase as never, "store-2", "woocommerce");
  if (result.ok) throw new Error("expected missing secret to fail");
});
